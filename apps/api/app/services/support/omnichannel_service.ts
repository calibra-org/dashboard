import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Exception } from "@adonisjs/core/exceptions";

import { MEDIA_PUBLIC_PATH_PREFIX, resolveServePath } from "#services/media_storage";
import { supportChannelAdapterRegistry } from "#services/support/channel_adapter_registry";
import type { ProviderContext, WebhookRequest } from "#services/support/channel_adapters/adapter";
import { ProviderAdapterError } from "#services/support/channel_adapters/adapter";
import { providerDefinition, publicProviderCatalog, type SupportChannel } from "#services/support/channel_catalog";
import { supportChannelCredentialsService } from "#services/support/support_channel_credentials_service";
import { supportTicketService } from "#services/support/ticket_service";
import { currentTrx } from "#services/tenant_context";

type Row = Record<string, unknown>;

function numberValue(value: unknown): number {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : 0;
}
function objectValue(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function arrayValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed : [];
        } catch {}
    }
    return [];
}
function payloadHash(rawBody: string) {
    return createHash("sha256").update(rawBody).digest("hex");
}
function safeError(error: unknown) {
    if (error instanceof ProviderAdapterError) return { code: error.safeCode, message: error.safeMessage };
    const candidate = error as { code?: unknown; message?: unknown };
    return {
        code: typeof candidate?.code === "string" ? candidate.code : "E_SUPPORT_PROVIDER",
        message: "Provider operation failed",
    };
}

export class OmnichannelService {
    catalog() {
        return { data: publicProviderCatalog() };
    }

    async integrations() {
        const [existing, unreadRows] = await Promise.all([
            currentTrx().from("support_channel_integrations").orderBy("channel", "asc").orderBy("provider_key", "asc"),
            currentTrx().from("support_tickets").select("channel").sum("unread_count as unread").groupBy("channel"),
        ]);
        const byKey = new Map(
            existing.map((row) => [`${String(row.channel)}:${String(row.provider_key ?? row.channel)}`, row as Row]),
        );
        const unread = new Map(unreadRows.map((row) => [String(row.channel), Number(row.unread ?? 0)]));
        const data = publicProviderCatalog().map((definition) => {
            const row = byKey.get(`${definition.channel}:${definition.provider_key}`);
            return {
                ...this.serializeIntegration(
                    row ?? {
                        channel: definition.channel,
                        provider_key: definition.provider_key,
                        status: "disabled",
                        enabled: false,
                        configuration: {},
                        capabilities: definition.capabilities,
                    },
                    definition.provider_key,
                ),
                unread_count: unread.get(definition.channel) ?? 0,
            };
        });
        return { data };
    }

    private serializeIntegration(row: Row, providerKey?: string) {
        const definition = providerDefinition(String(row.channel ?? ""), providerKey ?? String(row.provider_key ?? ""));
        const credentialSummary = supportChannelCredentialsService.summary(row);
        return {
            id: row.id ? numberValue(row.id) : null,
            channel: String(row.channel ?? definition?.channel ?? ""),
            provider_key: String(row.provider_key ?? definition?.provider_key ?? ""),
            status: String(row.status ?? "disabled"),
            enabled: Boolean(row.enabled),
            configuration: objectValue(row.configuration),
            capabilities: arrayValue(row.capabilities).length ? arrayValue(row.capabilities) : (definition?.capabilities ?? []),
            account_identifier: row.account_identifier ?? null,
            credential_health: credentialSummary,
            token_expires_at: row.token_expires_at ?? null,
            last_verified_at: row.last_verified_at ?? null,
            last_rotated_at: row.last_rotated_at ?? null,
            last_inbound_at: row.last_inbound_at ?? null,
            last_outbound_at: row.last_outbound_at ?? null,
            last_webhook_at: row.last_webhook_at ?? null,
            last_successful_api_at: row.last_successful_api_at ?? null,
            webhook_status: String(row.webhook_status ?? "unconfigured"),
            webhook_verified_at: row.webhook_verified_at ?? null,
            granted_scopes: arrayValue(row.granted_scopes),
            failed_verification_attempts: numberValue(row.failed_verification_attempts),
            last_error: row.last_error ?? null,
            production_available: Boolean(
                definition?.production_available &&
                    supportChannelAdapterRegistry.get(String(row.provider_key ?? definition?.provider_key ?? "")),
            ),
            availability_note_fa: definition?.availability_note_fa ?? null,
            availability_note_en: definition?.availability_note_en ?? null,
        };
    }

    private validateConfiguration(
        definition: NonNullable<ReturnType<typeof providerDefinition>>,
        configuration: Record<string, unknown>,
    ) {
        const missing = definition.configuration_fields
            .filter(
                (field) =>
                    field.required &&
                    (configuration[field.key] === undefined ||
                        configuration[field.key] === null ||
                        String(configuration[field.key]).trim() === ""),
            )
            .map((field) => field.key);
        if (missing.length)
            throw new Exception(`Missing provider configuration: ${missing.join(", ")}`, {
                status: 422,
                code: "E_SUPPORT_PROVIDER_CONFIGURATION",
            });
    }

    private async ensureRow(channel: SupportChannel, providerKey: string) {
        const definition = providerDefinition(channel, providerKey);
        if (!definition)
            throw new Exception("Unsupported support provider", { status: 422, code: "E_SUPPORT_PROVIDER_UNSUPPORTED" });
        await currentTrx()
            .table("support_channel_integrations")
            .insert({
                channel,
                provider_key: providerKey,
                status: "disabled",
                enabled: false,
                configuration: JSON.stringify({}),
                capabilities: JSON.stringify(definition.capabilities),
                webhook_status: definition.capabilities.includes("webhook") ? "unconfigured" : "not_applicable",
            })
            .onConflict(["tenant_id", "channel"])
            .ignore();
        const row = await currentTrx().from("support_channel_integrations").where("channel", channel).first();
        if (!row)
            throw new Exception("Support integration could not be initialized", { status: 500, code: "E_SUPPORT_PROVIDER_INIT" });
        if (String(row.provider_key ?? channel) !== providerKey) {
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    provider_key: providerKey,
                    credentials_ciphertext: null,
                    credential_keys: JSON.stringify([]),
                    status: "disabled",
                    enabled: false,
                    account_identifier: null,
                    last_error: null,
                    capabilities: JSON.stringify(definition.capabilities),
                    webhook_status: definition.capabilities.includes("webhook") ? "unconfigured" : "not_applicable",
                    updated_at: new Date(),
                });
            return (await currentTrx().from("support_channel_integrations").where("id", numberValue(row.id)).first()) as Row;
        }
        return row as Row;
    }

    async configure(
        input: {
            channel: SupportChannel;
            provider_key: string;
            enabled?: boolean;
            configuration?: Record<string, unknown>;
            credentials?: Record<string, unknown>;
        },
        actorUserId: number,
    ) {
        const definition = providerDefinition(input.channel, input.provider_key);
        if (!definition)
            throw new Exception("Unsupported support provider", { status: 422, code: "E_SUPPORT_PROVIDER_UNSUPPORTED" });
        if (!definition.production_available)
            throw new Exception(definition.availability_note_en ?? "Official production integration unavailable", {
                status: 422,
                code: "E_SUPPORT_PROVIDER_UNAVAILABLE",
            });
        const adapter = supportChannelAdapterRegistry.require(input.provider_key);
        const row = await this.ensureRow(input.channel, input.provider_key);
        const configuration = { ...objectValue(row.configuration), ...(input.configuration ?? {}) };
        this.validateConfiguration(definition, configuration);
        const credentialPatch = supportChannelCredentialsService.applyPatch(
            { ...row, provider_key: input.provider_key },
            input.credentials,
        );
        const nextRow = {
            ...row,
            provider_key: input.provider_key,
            credentials_ciphertext: credentialPatch.ciphertext,
            configuration,
        };
        const credentials = credentialPatch.changed
            ? supportChannelCredentialsService.runtimeCredentials(nextRow)
            : supportChannelCredentialsService.runtimeCredentials(row);
        const missing = supportChannelCredentialsService.missingRequired(nextRow, credentials);
        if (missing.length)
            throw new Exception(`Missing provider credentials: ${missing.join(", ")}`, {
                status: 422,
                code: "E_SUPPORT_PROVIDER_CREDENTIALS",
            });
        const waitingForOAuth = definition.auth_model === "oauth2" && !credentials.refresh_token;
        if (!waitingForOAuth)
            await adapter.validateConfiguration({
                channel: input.channel,
                providerKey: input.provider_key,
                configuration,
                credentials,
            });
        const nextEnabled = input.enabled ?? Boolean(row.enabled);
        const status = nextEnabled ? "configured" : "disabled";
        const [updated] = await currentTrx()
            .from("support_channel_integrations")
            .where("id", numberValue(row.id))
            .update({
                provider_key: input.provider_key,
                enabled: nextEnabled,
                configuration: JSON.stringify(configuration),
                credentials_ciphertext: credentialPatch.ciphertext,
                credential_keys: JSON.stringify(credentialPatch.keys),
                capabilities: JSON.stringify(adapter.capabilities),
                status,
                account_identifier: credentialPatch.changed ? null : row.account_identifier,
                last_rotated_at: credentialPatch.changed ? new Date() : row.last_rotated_at,
                updated_by_user_id: actorUserId,
                last_error: null,
                updated_at: new Date(),
            })
            .returning("*");
        await this.connectionEvent(
            updated as Row,
            credentialPatch.changed ? "credentials.rotated" : "configuration.updated",
            String(row.status ?? "disabled"),
            status,
            null,
            actorUserId,
        );
        return { data: this.serializeIntegration(updated as Row, input.provider_key) };
    }

    private context(row: Row): ProviderContext {
        const channel = String(row.channel) as SupportChannel;
        const providerKey = String(row.provider_key ?? row.channel);
        return {
            channel,
            providerKey,
            configuration: objectValue(row.configuration),
            credentials: supportChannelCredentialsService.runtimeCredentials(row),
        };
    }

    async verify(channel: SupportChannel, actorUserId: number) {
        const row = (await currentTrx().from("support_channel_integrations").where("channel", channel).first()) as
            | Row
            | undefined;
        if (!row) throw new Exception("Support channel is not configured", { status: 404, code: "E_SUPPORT_CHANNEL_NOT_FOUND" });
        const adapter = supportChannelAdapterRegistry.require(String(row.provider_key ?? channel));
        try {
            const health = await adapter.verifyConnection(this.context(row));
            const nextStatus = health.ok
                ? health.webhookOk || !adapter.capabilities.includes("webhook")
                    ? "connected"
                    : "configured"
                : "degraded";
            const [updated] = await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    status: row.enabled ? nextStatus : "disabled",
                    account_identifier: health.account?.id ?? row.account_identifier,
                    granted_scopes: JSON.stringify(health.scopes ?? []),
                    token_expires_at: health.tokenExpiresAt ?? row.token_expires_at,
                    last_verified_at: new Date(),
                    last_successful_api_at: new Date(),
                    webhook_status: health.webhookOk ? "verified" : row.webhook_status,
                    webhook_verified_at: health.webhookOk ? new Date() : row.webhook_verified_at,
                    failed_verification_attempts: 0,
                    last_error: null,
                    updated_by_user_id: actorUserId,
                    updated_at: new Date(),
                })
                .returning("*");
            await this.connectionEvent(
                updated as Row,
                "verification.succeeded",
                String(row.status),
                String(updated.status),
                null,
                actorUserId,
            );
            return { data: this.serializeIntegration(updated as Row) };
        } catch (error) {
            const safe = safeError(error);
            const [updated] = await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    status: row.enabled ? (safe.code === "E_PROVIDER_AUTH" ? "expired" : "error") : "disabled",
                    failed_verification_attempts: numberValue(row.failed_verification_attempts) + 1,
                    last_error: safe.message,
                    updated_by_user_id: actorUserId,
                    updated_at: new Date(),
                })
                .returning("*");
            await this.connectionEvent(
                updated as Row,
                "verification.failed",
                String(row.status),
                String(updated.status),
                safe.code,
                actorUserId,
                safe.message,
            );
            return { data: this.serializeIntegration(updated as Row), error: safe };
        }
    }

    async connect(channel: SupportChannel, actorUserId: number, publicOrigin: string) {
        const row = (await currentTrx().from("support_channel_integrations").where("channel", channel).first()) as
            | Row
            | undefined;
        if (!row) throw new Exception("Support channel is not configured", { status: 404, code: "E_SUPPORT_CHANNEL_NOT_FOUND" });
        if (!row.enabled)
            throw new Exception("Enable the channel before connecting", { status: 422, code: "E_SUPPORT_CHANNEL_DISABLED" });
        const adapter = supportChannelAdapterRegistry.require(String(row.provider_key ?? channel));
        const pathSecret = supportChannelCredentialsService.runtimeCredentials(row).webhook_path_secret;
        const suffix = pathSecret ? `/${encodeURIComponent(pathSecret)}` : "";
        const webhookUrl = `${publicOrigin.replace(/\/$/, "")}/api/v1/support/channels/${encodeURIComponent(channel)}/${numberValue(row.id)}${suffix}`;
        await currentTrx()
            .from("support_channel_integrations")
            .where("id", numberValue(row.id))
            .update({ status: "connecting", last_error: null, updated_at: new Date() });
        try {
            const health = adapter.connect
                ? await adapter.connect(this.context(row), webhookUrl)
                : await adapter.verifyConnection(this.context(row));
            const webhookRequired = adapter.capabilities.includes("webhook");
            const status = health.ok && (!webhookRequired || health.webhookOk) ? "connected" : "connecting";
            const providerState = objectValue(objectValue(row.configuration)._provider_state);
            const healthMetadata = health.account?.metadata ?? {};
            if (healthMetadata.history_id) providerState.gmail_history_id = String(healthMetadata.history_id);
            const nextConfiguration = { ...objectValue(row.configuration), _provider_state: providerState };
            const [updated] = await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    status,
                    account_identifier: health.account?.id ?? row.account_identifier,
                    configuration: JSON.stringify(nextConfiguration),
                    last_verified_at: new Date(),
                    last_successful_api_at: new Date(),
                    webhook_status: health.webhookOk ? "verified" : webhookRequired ? "pending" : "not_applicable",
                    webhook_verified_at: health.webhookOk ? new Date() : null,
                    granted_scopes: JSON.stringify(health.scopes ?? []),
                    last_error: null,
                    updated_by_user_id: actorUserId,
                    updated_at: new Date(),
                })
                .returning("*");
            await this.connectionEvent(updated as Row, "connection.connect", String(row.status), status, null, actorUserId);
            return { data: this.serializeIntegration(updated as Row) };
        } catch (error) {
            const safe = safeError(error);
            const [updated] = await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({ status: "error", last_error: safe.message, updated_by_user_id: actorUserId, updated_at: new Date() })
                .returning("*");
            await this.connectionEvent(
                updated as Row,
                "connection.failed",
                "connecting",
                "error",
                safe.code,
                actorUserId,
                safe.message,
            );
            return { data: this.serializeIntegration(updated as Row), error: safe };
        }
    }

    async disconnect(channel: SupportChannel, actorUserId: number, revoke = false) {
        const row = (await currentTrx().from("support_channel_integrations").where("channel", channel).first()) as
            | Row
            | undefined;
        if (!row) throw new Exception("Support channel is not configured", { status: 404, code: "E_SUPPORT_CHANNEL_NOT_FOUND" });
        const adapter = supportChannelAdapterRegistry.get(String(row.provider_key ?? channel));
        if (adapter?.disconnect) {
            try {
                await adapter.disconnect(this.context(row));
            } catch {
                /* local revoke must still be possible if provider is unavailable */
            }
        }
        const patch: Row = {
            enabled: false,
            status: "disabled",
            webhook_status: adapter?.capabilities.includes("webhook") ? "unconfigured" : "not_applicable",
            webhook_verified_at: null,
            last_error: null,
            updated_by_user_id: actorUserId,
            updated_at: new Date(),
        };
        if (revoke) {
            patch.credentials_ciphertext = null;
            patch.credential_keys = JSON.stringify([]);
            patch.account_identifier = null;
            patch.token_expires_at = null;
        }
        const [updated] = await currentTrx()
            .from("support_channel_integrations")
            .where("id", numberValue(row.id))
            .update(patch)
            .returning("*");
        await this.connectionEvent(
            updated as Row,
            revoke ? "connection.revoked" : "connection.disconnected",
            String(row.status),
            "disabled",
            null,
            actorUserId,
        );
        return { data: this.serializeIntegration(updated as Row) };
    }

    async conversations(channel?: SupportChannel, page = 1, limit = 40, q = "") {
        const offset = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
        let query = currentTrx().from("support_tickets").whereNotNull("provider_conversation_id");
        if (channel) query = query.where("channel", channel);
        if (q.trim()) {
            const term = `%${q.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
            query = query.where((builder) =>
                builder
                    .whereILike("requester_name", term)
                    .orWhereILike("subject", term)
                    .orWhereILike("requester_email", term)
                    .orWhereILike("requester_phone", term),
            );
        }
        const rows = await query
            .orderBy("last_message_at", "desc")
            .limit(Math.min(100, Math.max(1, limit)))
            .offset(offset);
        return {
            data: rows.map((row) => ({
                id: numberValue(row.id),
                reference: row.reference,
                requester_name: row.requester_name,
                requester_email: row.requester_email,
                requester_phone: row.requester_phone,
                subject: row.subject,
                channel: row.channel,
                provider_account_id: row.provider_account_id,
                provider_conversation_id: row.provider_conversation_id,
                unread_count: numberValue(row.unread_count),
                status: row.status,
                priority: row.priority,
                assigned_user_id: row.assigned_user_id ? numberValue(row.assigned_user_id) : null,
                last_message_at: row.last_message_at,
                first_response_due_at: row.first_response_due_at,
                resolution_due_at: row.resolution_due_at,
            })),
        };
    }

    async sendReply(
        ticketId: number,
        body: string,
        expectedVersion: number,
        actorUserId: number | null,
        replyToExternalId?: string | null,
    ) {
        const ticket = (await supportTicketService.find(ticketId)).data as unknown as Row & { version: number };
        if (!ticket.provider_conversation_id)
            throw new Exception("Ticket is not linked to an external conversation", {
                status: 422,
                code: "E_SUPPORT_EXTERNAL_CONVERSATION",
            });
        const row = (await currentTrx().from("support_channel_integrations").where("channel", String(ticket.channel)).first()) as
            | Row
            | undefined;
        if (!row || String(row.status) !== "connected" || !row.enabled)
            throw new Exception("Channel is not connected", { status: 409, code: "E_SUPPORT_CHANNEL_NOT_CONNECTED" });
        const adapter = supportChannelAdapterRegistry.require(String(row.provider_key ?? ticket.channel));
        const local = await supportTicketService.addMessage(ticketId, "reply", body, expectedVersion, actorUserId);
        const messageId = numberValue((local.data as Row).id);
        await currentTrx()
            .from("support_ticket_messages")
            .where("id", messageId)
            .update({
                provider: ticket.channel,
                provider_account_id: ticket.provider_account_id,
                provider_conversation_id: ticket.provider_conversation_id,
                direction: "outbound",
                message_type: "text",
                delivery_state: "sending",
                reply_to_external_id: replyToExternalId ?? null,
            });
        try {
            const sent = await adapter.sendMessage(this.context(row), {
                conversationId: String(ticket.provider_conversation_id),
                recipientExternalId: ticket.external_identity_key ? String(ticket.external_identity_key) : null,
                text: body,
                replyToExternalId: replyToExternalId ?? null,
            });
            await currentTrx()
                .from("support_ticket_messages")
                .where("id", messageId)
                .update({
                    provider_message_id: sent.providerMessageId,
                    delivery_state: sent.state,
                    sent_at: sent.providerTimestamp ?? new Date(),
                    provider_timestamp: sent.providerTimestamp ?? null,
                    provider_metadata: JSON.stringify(sent.metadata ?? {}),
                });
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({ last_outbound_at: new Date(), last_successful_api_at: new Date(), last_error: null });
            return {
                ok: true,
                data: { ...(local.data as Row), provider_message_id: sent.providerMessageId, delivery_state: sent.state },
                ticket: local.ticket,
            };
        } catch (error) {
            const safe = safeError(error);
            await currentTrx()
                .from("support_ticket_messages")
                .where("id", messageId)
                .update({ delivery_state: "failed", provider_metadata: JSON.stringify({ error_code: safe.code }) });
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({ last_error: safe.message, updated_at: new Date() });
            return { ok: false, data: { ...(local.data as Row), delivery_state: "failed" }, ticket: local.ticket, error: safe };
        }
    }

    async sendAttachment(
        ticketId: number,
        attachmentId: number,
        caption: string,
        expectedVersion: number,
        actorUserId: number | null,
        replyToExternalId?: string | null,
    ) {
        const ticket = (await supportTicketService.find(ticketId)).data as unknown as Row & { version: number };
        if (!ticket.provider_conversation_id)
            throw new Exception("Ticket is not linked to an external conversation", {
                status: 422,
                code: "E_SUPPORT_EXTERNAL_CONVERSATION",
            });
        const row = (await currentTrx().from("support_channel_integrations").where("channel", String(ticket.channel)).first()) as
            | Row
            | undefined;
        if (!row || String(row.status) !== "connected" || !row.enabled)
            throw new Exception("Channel is not connected", { status: 409, code: "E_SUPPORT_CHANNEL_NOT_CONNECTED" });
        const adapter = supportChannelAdapterRegistry.require(String(row.provider_key));
        if (!adapter.sendMedia)
            throw new Exception("This provider does not support outbound media in Calibra", {
                status: 422,
                code: "E_SUPPORT_MEDIA_UNSUPPORTED",
            });
        const attachment = await currentTrx()
            .from("support_ticket_attachments as a")
            .join("media as m", "m.id", "a.media_id")
            .where("a.id", attachmentId)
            .where("a.ticket_id", ticketId)
            .select("a.*", "m.url as media_url")
            .first();
        if (!attachment)
            throw new Exception("Ticket attachment not found", { status: 404, code: "E_TICKET_ATTACHMENT_NOT_FOUND" });
        if (String(attachment.scan_status) !== "clean")
            throw new Exception("Attachment must pass the security scan before provider delivery", {
                status: 409,
                code: "E_TICKET_ATTACHMENT_SCAN_REQUIRED",
            });
        const url = String(attachment.media_url ?? "");
        const marker = `${MEDIA_PUBLIC_PATH_PREFIX.replace(/\/+$/, "")}/`;
        const index = url.indexOf(marker);
        if (index < 0)
            throw new Exception("Attachment is not available from managed media storage", {
                status: 422,
                code: "E_SUPPORT_MEDIA_STORAGE",
            });
        const relative = url.slice(index + marker.length);
        const absolute = resolveServePath(relative.split("/"));
        if (!absolute) throw new Exception("Attachment path is invalid", { status: 422, code: "E_SUPPORT_MEDIA_STORAGE" });
        const bytes = await readFile(absolute);
        if (Number(attachment.size_bytes ?? bytes.length) !== bytes.length && Number(attachment.size_bytes ?? 0) > 0)
            throw new Exception("Attachment size changed after security scan", {
                status: 409,
                code: "E_TICKET_ATTACHMENT_CHANGED",
            });
        const body = caption.trim() || String(attachment.filename ?? "Attachment");
        const local = await supportTicketService.addMessage(ticketId, "reply", body, expectedVersion, actorUserId);
        const messageId = numberValue((local.data.message as Record<string, unknown>).id);
        const mime = String(attachment.mime ?? "application/octet-stream");
        const messageType = mime.startsWith("image/")
            ? "image"
            : mime.startsWith("audio/")
              ? "audio"
              : mime.startsWith("video/")
                ? "video"
                : "document";
        await currentTrx()
            .from("support_ticket_messages")
            .where("id", messageId)
            .update({
                provider: ticket.channel,
                provider_account_id: ticket.provider_account_id ?? row.account_identifier,
                provider_conversation_id: ticket.provider_conversation_id,
                direction: "outbound",
                message_type: messageType,
                media_reference: JSON.stringify({
                    attachment_id: attachmentId,
                    media_id: Number(attachment.media_id),
                    filename: attachment.filename,
                    mime,
                }),
                reply_to_external_id: replyToExternalId ?? null,
                delivery_state: "sending",
                sent_at: new Date(),
            });
        try {
            const result = await adapter.sendMedia(this.context(row), {
                conversationId: String(ticket.provider_conversation_id),
                recipientExternalId: ticket.requester_phone
                    ? String(ticket.requester_phone)
                    : ticket.requester_email
                      ? String(ticket.requester_email)
                      : null,
                caption: caption.trim() || null,
                replyToExternalId,
                file: { filename: String(attachment.filename), mime, size: bytes.length, bytes },
            });
            await currentTrx()
                .from("support_ticket_messages")
                .where("id", messageId)
                .update({
                    provider_message_id: result.providerMessageId,
                    delivery_state: result.state,
                    provider_timestamp: result.providerTimestamp ?? null,
                    provider_metadata: JSON.stringify(result.metadata ?? {}),
                    updated_at: new Date(),
                });
            await currentTrx().from("support_ticket_attachments").where("id", attachmentId).update({ message_id: messageId });
            await currentTrx().from("support_channel_integrations").where("id", numberValue(row.id)).update({
                last_outbound_at: new Date(),
                last_successful_api_at: new Date(),
                last_error: null,
                updated_at: new Date(),
            });
            return {
                ok: true as const,
                data: {
                    ...local.data,
                    provider_message_id: result.providerMessageId,
                    delivery_state: result.state,
                    attachment_id: attachmentId,
                },
            };
        } catch (error) {
            const safe = safeError(error);
            await currentTrx()
                .from("support_ticket_messages")
                .where("id", messageId)
                .update({
                    delivery_state: "failed",
                    provider_metadata: JSON.stringify({ error_code: safe.code }),
                    updated_at: new Date(),
                });
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({ last_error: safe.message, updated_at: new Date() });
            return {
                ok: false as const,
                data: { ...local.data, delivery_state: "failed", attachment_id: attachmentId },
                error: safe,
            };
        }
    }

    async markRead(ticketId: number) {
        const ticket = (await supportTicketService.find(ticketId)).data as unknown as Row;
        const latestInbound = await currentTrx()
            .from("support_ticket_messages")
            .where("ticket_id", ticketId)
            .where("direction", "inbound")
            .whereNotNull("provider_message_id")
            .orderBy("created_at", "desc")
            .first();
        if (latestInbound) {
            const integration = (await currentTrx()
                .from("support_channel_integrations")
                .where("channel", String(ticket.channel))
                .first()) as Row | undefined;
            const adapter = integration
                ? supportChannelAdapterRegistry.get(String(integration.provider_key ?? ticket.channel))
                : null;
            if (integration && adapter?.markRead)
                await adapter.markRead(this.context(integration), String(latestInbound.provider_message_id));
        }
        await currentTrx()
            .from("support_tickets")
            .where("id", ticketId)
            .update({ unread_count: 0, last_read_at: new Date(), updated_at: new Date() });
        return { data: { ticket_id: ticketId, unread_count: 0 } };
    }

    async webhook(channel: SupportChannel, integrationId: number, request: WebhookRequest) {
        const row = (await currentTrx()
            .from("support_channel_integrations")
            .where("id", integrationId)
            .where("channel", channel)
            .first()) as Row | undefined;
        if (!row)
            throw new Exception("Support channel integration not found", { status: 404, code: "E_SUPPORT_CHANNEL_NOT_FOUND" });
        const adapter = supportChannelAdapterRegistry.require(String(row.provider_key ?? channel));
        if (!(await adapter.verifyWebhook(this.context(row), request))) {
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .increment("failed_verification_attempts", 1)
                .update({ webhook_status: "error", last_error: "Webhook verification failed", updated_at: new Date() });
            throw new Exception("Webhook verification failed", { status: 401, code: "E_SUPPORT_WEBHOOK_SIGNATURE" });
        }
        const hash = payloadHash(request.rawBody);
        const duplicate = await currentTrx()
            .from("support_channel_webhook_events")
            .where("provider", channel)
            .where("payload_hash", hash)
            .first();
        if (duplicate) return { duplicate: true, ticketIds: [] as number[] };
        const [eventRow] = await currentTrx()
            .table("support_channel_webhook_events")
            .insert({
                provider: channel,
                provider_account_id: row.account_identifier ?? null,
                payload_hash: hash,
                processing_state: "received",
            })
            .returning("*");
        const initial = await adapter.normalizeWebhook(this.context(row), request);
        const normalized = adapter.expandWebhook ? await adapter.expandWebhook(this.context(row), initial) : initial;
        const ticketIds = new Set<number>();
        try {
            for (const message of normalized.messages) {
                const ticketId = await this.ingestInbound(channel, row, message);
                ticketIds.add(ticketId);
            }
            for (const delivery of normalized.deliveries) {
                const message = await currentTrx()
                    .from("support_ticket_messages")
                    .where("provider", channel)
                    .where("provider_message_id", delivery.providerMessageId)
                    .first();
                const campaignRecipient = await currentTrx()
                    .from("support_campaign_recipients")
                    .where("provider_message_id", delivery.providerMessageId)
                    .first();
                if (message) {
                    const patch: Row = {
                        delivery_state: delivery.state,
                        provider_metadata: JSON.stringify({
                            ...objectValue(message.provider_metadata),
                            last_delivery_error_code: delivery.safeCode ?? null,
                            last_delivery_error: delivery.safeMessage ?? null,
                        }),
                    };
                    if (delivery.state === "delivered") patch.delivered_at = delivery.occurredAt ?? new Date();
                    if (delivery.state === "read") {
                        patch.delivered_at = message.delivered_at ?? delivery.occurredAt ?? new Date();
                        patch.read_at = delivery.occurredAt ?? new Date();
                    }
                    await currentTrx().from("support_ticket_messages").where("id", numberValue(message.id)).update(patch);
                    ticketIds.add(numberValue(message.ticket_id));
                }
                if (campaignRecipient) {
                    const campaignPatch: Row = { updated_at: new Date() };
                    if (delivery.state === "delivered" || delivery.state === "read") {
                        campaignPatch.status = "delivered";
                        campaignPatch.delivered_at = campaignRecipient.delivered_at ?? delivery.occurredAt ?? new Date();
                    } else if (delivery.state === "failed") {
                        campaignPatch.status = "failed";
                        campaignPatch.last_error = delivery.safeCode ?? "Provider delivery failed";
                    } else if (delivery.state === "sent") campaignPatch.status = "sent";
                    await currentTrx()
                        .from("support_campaign_recipients")
                        .where("id", numberValue(campaignRecipient.id))
                        .update(campaignPatch);
                }
            }
            await currentTrx()
                .from("support_channel_webhook_events")
                .where("id", numberValue(eventRow.id))
                .update({
                    processing_state: "processed",
                    processed_at: new Date(),
                    provider_event_id:
                        normalized.messages[0]?.providerEventId ?? normalized.deliveries[0]?.providerEventId ?? null,
                    event_type: normalized.messages.length
                        ? "message"
                        : normalized.deliveries.length
                          ? "delivery"
                          : normalized.cursor
                            ? "cursor"
                            : "ignored",
                });
            const configuration = objectValue(row.configuration);
            if (normalized.cursor)
                configuration._provider_state = {
                    ...objectValue(configuration._provider_state),
                    gmail_history_id: normalized.cursor,
                };
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    configuration: JSON.stringify(configuration),
                    webhook_status: "verified",
                    webhook_verified_at: new Date(),
                    last_webhook_at: new Date(),
                    last_inbound_at: normalized.messages.length ? new Date() : row.last_inbound_at,
                    status: row.enabled ? "connected" : "disabled",
                    last_error: null,
                    failed_verification_attempts: 0,
                    updated_at: new Date(),
                });
            return { duplicate: false, ticketIds: [...ticketIds], normalized };
        } catch (error) {
            const safe = safeError(error);
            await currentTrx()
                .from("support_channel_webhook_events")
                .where("id", numberValue(eventRow.id))
                .update({ processing_state: "failed", processed_at: new Date(), error_code: safe.code });
            throw error;
        }
    }

    private async ingestInbound(
        channel: SupportChannel,
        integration: Row,
        message: import("#services/support/channel_adapters/adapter").InboundMessage,
    ) {
        const providerAccountId =
            message.providerAccountId ??
            (integration.account_identifier ? String(integration.account_identifier) : String(integration.id));
        let ticket = await currentTrx()
            .from("support_tickets")
            .where("channel", channel)
            .where("provider_account_id", providerAccountId)
            .where("provider_conversation_id", message.providerConversationId)
            .first();
        if (!ticket) {
            const customer = message.senderEmail
                ? await currentTrx()
                      .from("customers")
                      .whereRaw("lower(email) = lower(?)", [message.senderEmail])
                      .whereNull("deleted_at")
                      .first()
                : message.senderPhone
                  ? await currentTrx().from("customers").where("phone", message.senderPhone).whereNull("deleted_at").first()
                  : null;
            const created = await supportTicketService.create(
                {
                    customer_id: customer ? numberValue(customer.id) : null,
                    requester_name:
                        message.senderName?.trim() || message.senderEmail || message.senderPhone || message.senderExternalId,
                    requester_email: message.senderEmail ?? null,
                    requester_phone: message.senderPhone ?? null,
                    subject: `${channel}: ${message.senderName?.trim() || message.senderExternalId}`,
                    message: message.text || `[${message.messageType}]`,
                    channel,
                    priority: "normal",
                },
                null,
            );
            const createdTicket = created.data as unknown as Row;
            ticket = (
                await currentTrx()
                    .from("support_tickets")
                    .where("id", numberValue(createdTicket.id))
                    .update({
                        provider_account_id: providerAccountId,
                        provider_conversation_id: message.providerConversationId,
                        external_identity_key: message.senderExternalId,
                        unread_count: 1,
                        last_message_at: message.providerTimestamp ?? new Date(),
                        updated_at: new Date(),
                    })
                    .returning("*")
            )[0];
            const firstMessage = await currentTrx()
                .from("support_ticket_messages")
                .where("ticket_id", ticket.id)
                .orderBy("id", "asc")
                .first();
            if (firstMessage)
                await currentTrx()
                    .from("support_ticket_messages")
                    .where("id", numberValue(firstMessage.id))
                    .update({
                        provider: channel,
                        provider_account_id: providerAccountId,
                        provider_conversation_id: message.providerConversationId,
                        provider_message_id: message.providerMessageId,
                        direction: "inbound",
                        sender_external_id: message.senderExternalId,
                        recipient_external_id: message.recipientExternalId ?? null,
                        message_type: message.messageType,
                        media_reference: message.mediaReference ? JSON.stringify(message.mediaReference) : null,
                        reply_to_external_id: message.replyToExternalId ?? null,
                        delivery_state: "received",
                        provider_timestamp: message.providerTimestamp ?? null,
                        provider_metadata: JSON.stringify(message.metadata ?? {}),
                    });
            return numberValue(ticket.id);
        }
        const duplicate = await currentTrx()
            .from("support_ticket_messages")
            .where("provider", channel)
            .where("provider_account_id", providerAccountId)
            .where("provider_message_id", message.providerMessageId)
            .first();
        if (duplicate) return numberValue(ticket.id);
        await currentTrx()
            .table("support_ticket_messages")
            .insert({
                ticket_id: numberValue(ticket.id),
                author_user_id: null,
                author_customer_id: ticket.customer_id ? numberValue(ticket.customer_id) : null,
                kind: "requester_message",
                body: message.text || `[${message.messageType}]`,
                provider: channel,
                provider_account_id: providerAccountId,
                provider_conversation_id: message.providerConversationId,
                provider_message_id: message.providerMessageId,
                direction: "inbound",
                sender_external_id: message.senderExternalId,
                recipient_external_id: message.recipientExternalId ?? null,
                message_type: message.messageType,
                media_reference: message.mediaReference ? JSON.stringify(message.mediaReference) : null,
                reply_to_external_id: message.replyToExternalId ?? null,
                delivery_state: "received",
                provider_timestamp: message.providerTimestamp ?? null,
                provider_metadata: JSON.stringify(message.metadata ?? {}),
            });
        await currentTrx()
            .from("support_tickets")
            .where("id", numberValue(ticket.id))
            .update({
                unread_count: numberValue(ticket.unread_count) + 1,
                last_message_at: message.providerTimestamp ?? new Date(),
                updated_at: new Date(),
            });
        await currentTrx()
            .table("support_ticket_events")
            .insert({
                ticket_id: numberValue(ticket.id),
                actor_user_id: null,
                event_type: "message.received",
                payload: JSON.stringify({ provider: channel, provider_message_id: message.providerMessageId }),
            });
        return numberValue(ticket.id);
    }

    async verifyChallenge(channel: SupportChannel, integrationId: number, query: Record<string, string | undefined>) {
        const row = (await currentTrx()
            .from("support_channel_integrations")
            .where("id", integrationId)
            .where("channel", channel)
            .first()) as Row | undefined;
        if (!row) return null;
        const adapter = supportChannelAdapterRegistry.get(String(row.provider_key ?? channel));
        if (!adapter?.verifyChallenge) return null;
        const challenge = adapter.verifyChallenge(this.context(row), query);
        if (challenge)
            await currentTrx()
                .from("support_channel_integrations")
                .where("id", numberValue(row.id))
                .update({
                    webhook_status: "verified",
                    webhook_verified_at: new Date(),
                    status: row.enabled ? "connected" : "disabled",
                    last_error: null,
                    updated_at: new Date(),
                });
        return challenge;
    }

    async connectionLogs(channel: SupportChannel, limit = 100) {
        const rows = await currentTrx()
            .from("support_channel_connection_events")
            .where("channel", channel)
            .orderBy("created_at", "desc")
            .limit(Math.min(200, Math.max(1, limit)));
        return {
            data: rows.map((row) => ({
                ...row,
                id: numberValue(row.id),
                actor_user_id: row.actor_user_id ? numberValue(row.actor_user_id) : null,
            })),
        };
    }

    private async connectionEvent(
        row: Row,
        eventType: string,
        fromState: string | null,
        toState: string | null,
        reasonCode: string | null,
        actorUserId: number | null,
        safeMessage: string | null = null,
    ) {
        await currentTrx()
            .table("support_channel_connection_events")
            .insert({
                channel: row.channel,
                provider_key: row.provider_key ?? row.channel,
                event_type: eventType,
                from_state: fromState,
                to_state: toState,
                reason_code: reasonCode,
                safe_message: safeMessage,
                actor_user_id: actorUserId,
            });
    }
}

export const omnichannelService = new OmnichannelService();
