import { Exception } from "@adonisjs/core/exceptions";

import { supportChannelAdapterRegistry } from "#services/support/channel_adapter_registry";
import type { ProviderContext } from "#services/support/channel_adapters/adapter";
import type { SupportChannel } from "#services/support/channel_catalog";
import { supportChannelCredentialsService } from "#services/support/support_channel_credentials_service";
import { currentTrx } from "#services/tenant_context";

type Row = Record<string, unknown>;
function objectValue(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {}
    }
    return {};
}

export class SupportCampaignDispatchService {
    private context(integration: Row): ProviderContext {
        return {
            channel: String(integration.channel) as SupportChannel,
            providerKey: String(integration.provider_key),
            configuration: objectValue(integration.configuration),
            credentials: supportChannelCredentialsService.runtimeCredentials(integration),
        };
    }

    async verifyProviderTemplate(
        campaignId: number,
        input: { name: string; language_code: string; components?: Array<Record<string, unknown>> },
    ) {
        const campaign = (await currentTrx().from("support_campaigns").where("id", campaignId).forUpdate().first()) as
            | Row
            | undefined;
        if (!campaign) throw new Exception("Support campaign not found", { status: 404, code: "E_SUPPORT_CAMPAIGN_NOT_FOUND" });
        if (String(campaign.channel) !== "whatsapp")
            throw new Exception("Provider templates are only required for WhatsApp campaigns", {
                status: 422,
                code: "E_SUPPORT_CAMPAIGN_PROVIDER_TEMPLATE_CHANNEL",
            });
        const integration = (await currentTrx().from("support_channel_integrations").where("channel", "whatsapp").first()) as
            | Row
            | undefined;
        if (!integration?.enabled || String(integration.status) !== "connected")
            throw new Exception("WhatsApp is not verified as connected", {
                status: 422,
                code: "E_SUPPORT_CHANNEL_NOT_CONNECTED",
            });
        const adapter = supportChannelAdapterRegistry.require(String(integration.provider_key));
        if (!adapter.verifyTemplate)
            throw new Exception("Provider does not support template verification", {
                status: 422,
                code: "E_SUPPORT_CAMPAIGN_PROVIDER_TEMPLATE_UNAVAILABLE",
            });
        const result = await adapter.verifyTemplate(this.context(integration), {
            name: input.name,
            languageCode: input.language_code,
        });
        const status = result.approved ? "approved" : result.status === "REJECTED" ? "rejected" : "pending";
        const config = {
            language_code: input.language_code,
            components: input.components ?? [],
            provider_template_id: result.providerTemplateId ?? null,
            provider_status: result.status,
        };
        const [updated] = await currentTrx()
            .from("support_campaigns")
            .where("id", campaignId)
            .update({
                provider_template_key: input.name,
                provider_template_status: status,
                provider_template_config: JSON.stringify(config),
                updated_at: new Date(),
            })
            .returning("*");
        return {
            data: {
                campaign_id: campaignId,
                provider_template_key: updated.provider_template_key,
                provider_template_status: updated.provider_template_status,
                provider_template_config: objectValue(updated.provider_template_config),
            },
        };
    }

    async dispatch(campaignId: number, limit = 250) {
        const campaign = (await currentTrx().from("support_campaigns").where("id", campaignId).forUpdate().first()) as
            | Row
            | undefined;
        if (!campaign) throw new Exception("Support campaign not found", { status: 404, code: "E_SUPPORT_CAMPAIGN_NOT_FOUND" });
        if (!(["scheduled", "running"] as string[]).includes(String(campaign.status)))
            throw new Exception("Campaign is not scheduled for delivery", { status: 409, code: "E_SUPPORT_CAMPAIGN_STATE" });
        if (campaign.scheduled_at && new Date(String(campaign.scheduled_at)).getTime() > Date.now())
            throw new Exception("Campaign is not due yet", { status: 409, code: "E_SUPPORT_CAMPAIGN_NOT_DUE" });
        if (String(campaign.template_status) !== "approved")
            throw new Exception("Campaign template is not approved", { status: 422, code: "E_SUPPORT_CAMPAIGN_TEMPLATE" });
        const integration = (await currentTrx()
            .from("support_channel_integrations")
            .where("channel", String(campaign.channel))
            .first()) as Row | undefined;
        if (!integration?.enabled || String(integration.status) !== "connected")
            throw new Exception("Campaign channel is not verified as connected", {
                status: 422,
                code: "E_SUPPORT_CHANNEL_NOT_CONNECTED",
            });
        const adapter = supportChannelAdapterRegistry.require(String(integration.provider_key));
        const ctx = this.context(integration);
        await adapter.validateConfiguration(ctx);

        if (String(campaign.channel) === "whatsapp") {
            const providerTemplateConfig = objectValue(campaign.provider_template_config);
            if (
                !adapter.sendTemplate ||
                String(campaign.provider_template_status) !== "approved" ||
                !campaign.provider_template_key ||
                !String(providerTemplateConfig.language_code ?? "").trim()
            ) {
                throw new Exception("WhatsApp campaign requires an approved provider template and language", {
                    status: 422,
                    code: "E_SUPPORT_CAMPAIGN_PROVIDER_TEMPLATE",
                });
            }
        }

        await currentTrx()
            .from("support_campaigns")
            .where("id", campaignId)
            .update({
                status: "running",
                started_at: campaign.started_at ?? new Date(),
                last_dispatch_at: new Date(),
                updated_at: new Date(),
            });
        const recipients = await currentTrx()
            .from("support_campaign_recipients")
            .where("campaign_id", campaignId)
            .where("status", "pending")
            .where("opted_out", false)
            .orderBy("id", "asc")
            .limit(Math.min(1000, Math.max(1, limit)));
        const providerTemplateConfig = objectValue(campaign.provider_template_config);
        let sent = 0;
        let failed = 0;
        for (const recipient of recipients) {
            const recipientKey = String(recipient.recipient_key ?? "").trim();
            if (!recipientKey) {
                await currentTrx()
                    .from("support_campaign_recipients")
                    .where("id", recipient.id)
                    .update({ status: "skipped", last_error: "Recipient is empty", updated_at: new Date() });
                continue;
            }
            await currentTrx()
                .from("support_campaign_recipients")
                .where("id", recipient.id)
                .update({ status: "queued", last_error: null, updated_at: new Date() });
            try {
                const result =
                    String(campaign.channel) === "whatsapp"
                        ? await adapter.sendTemplate!(ctx, {
                              conversationId: recipientKey,
                              recipientExternalId: recipientKey,
                              name: String(campaign.provider_template_key),
                              languageCode: String(providerTemplateConfig.language_code ?? ""),
                              components: Array.isArray(providerTemplateConfig.components)
                                  ? (providerTemplateConfig.components as Array<Record<string, unknown>>)
                                  : undefined,
                          })
                        : await adapter.sendMessage(ctx, {
                              conversationId: recipientKey,
                              recipientExternalId: recipientKey,
                              text: String(campaign.template_body),
                          });
                await currentTrx().from("support_campaign_recipients").where("id", recipient.id).update({
                    status: result.state,
                    provider_message_id: result.providerMessageId,
                    sent_at: new Date(),
                    last_error: null,
                    updated_at: new Date(),
                });
                sent += 1;
            } catch (error) {
                const code =
                    error && typeof error === "object" && "safeCode" in error
                        ? String((error as { safeCode?: unknown }).safeCode ?? "E_PROVIDER")
                        : "E_PROVIDER";
                await currentTrx()
                    .from("support_campaign_recipients")
                    .where("id", recipient.id)
                    .update({ status: "failed", last_error: code.slice(0, 1000), updated_at: new Date() });
                failed += 1;
            }
        }
        const remaining = await currentTrx()
            .from("support_campaign_recipients")
            .where("campaign_id", campaignId)
            .whereIn("status", ["pending", "queued"])
            .count("id as total")
            .first();
        if (Number(remaining?.total ?? 0) === 0)
            await currentTrx()
                .from("support_campaigns")
                .where("id", campaignId)
                .update({ status: "completed", completed_at: new Date(), updated_at: new Date() });
        return {
            data: {
                campaign_id: campaignId,
                attempted: recipients.length,
                sent,
                failed,
                remaining: Number(remaining?.total ?? 0),
            },
        };
    }
}

export const supportCampaignDispatchService = new SupportCampaignDispatchService();
