import { Exception } from "@adonisjs/core/exceptions";

import { currentTrx } from "#services/tenant_context";

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export class CampaignTemplateReviewService {
    async review(campaignId: number, input: { expected_version: number; decision: "approved" | "rejected" }) {
        const trx = currentTrx();
        const campaign = await trx.from("support_campaigns").where("id", campaignId).forUpdate().first();
        if (!campaign) {
            throw new Exception("Support campaign not found", {
                status: 404,
                code: "E_SUPPORT_CAMPAIGN_NOT_FOUND",
            });
        }
        if (numberValue(campaign.version) !== input.expected_version) {
            throw new Exception("Support campaign changed", {
                status: 409,
                code: "E_SUPPORT_CAMPAIGN_VERSION",
            });
        }
        if (!["draft", "scheduled", "paused"].includes(String(campaign.status))) {
            throw new Exception("Campaign template cannot be reviewed after delivery starts", {
                status: 409,
                code: "E_SUPPORT_CAMPAIGN_TEMPLATE_IMMUTABLE",
            });
        }

        const nextVersion = input.expected_version + 1;
        const [updated] = await trx
            .from("support_campaigns")
            .where("id", campaignId)
            .where("version", input.expected_version)
            .update({
                template_status: input.decision,
                version: nextVersion,
                updated_at: new Date(),
            })
            .returning("*");
        if (!updated) {
            throw new Exception("Support campaign changed", {
                status: 409,
                code: "E_SUPPORT_CAMPAIGN_VERSION",
            });
        }

        return {
            data: {
                ...updated,
                id: numberValue(updated.id),
                version: numberValue(updated.version),
                estimated_cost_minor: numberValue(updated.estimated_cost_minor),
            },
            before: {
                template_status: campaign.template_status,
                version: numberValue(campaign.version),
            },
        };
    }
}

export const campaignTemplateReviewService = new CampaignTemplateReviewService();
