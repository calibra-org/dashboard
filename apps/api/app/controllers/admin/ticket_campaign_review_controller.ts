import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { campaignTemplateReviewService } from "#services/support/campaign_template_review_service";
import { ticketCampaignTemplateReviewValidator } from "#validators/admin/ticket_campaign_review_validator";

function campaignId(ctx: HttpContext): number {
    const value = Number(ctx.params.id);
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Exception("Invalid support campaign identifier", {
            status: 422,
            code: "E_SUPPORT_CAMPAIGN_ID",
        });
    }
    return value;
}

export default class TicketCampaignReviewController {
    async review(ctx: HttpContext) {
        const id = campaignId(ctx);
        const payload = await ctx.request.validateUsing(ticketCampaignTemplateReviewValidator);
        const result = await campaignTemplateReviewService.review(id, payload);
        await recordAudit({
            ctx,
            action: "support.campaign.template_review",
            entityKind: "support_campaign",
            entityId: id,
            payload: {
                decision: payload.decision,
                note: payload.note ?? null,
                expected_version: payload.expected_version,
                before: result.before,
                after: {
                    template_status: result.data.template_status,
                    version: result.data.version,
                },
            },
        });
        return { data: result.data };
    }
}
