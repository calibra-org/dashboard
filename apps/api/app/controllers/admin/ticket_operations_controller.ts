import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { ticketOperationsService } from "#services/support/ticket_operations_service";
import {
    ticketAttachmentScanValidator,
    ticketAttachmentValidator,
    ticketAutomationCreateValidator,
    ticketAutomationUpdateValidator,
    ticketBulkOperationValidator,
    ticketCampaignCreateValidator,
    ticketCampaignRecipientsValidator,
    ticketCampaignTransitionValidator,
    ticketChannelUpdateValidator,
    ticketMergeValidator,
    ticketPresenceValidator,
    ticketRuleCreateValidator,
    ticketRuleUpdateValidator,
    ticketSavedViewCreateValidator,
    ticketSavedViewUpdateValidator,
    ticketWorkflowStatusValidator,
} from "#validators/admin/ticket_operations_validator";

function paramId(ctx: HttpContext, name = "id"): number {
    const value = Number(ctx.params[name]);
    if (!Number.isSafeInteger(value) || value < 1) throw new Exception("Invalid support operation identifier", { status: 422, code: "E_SUPPORT_INVALID_ID" });
    return value;
}

async function actor(ctx: HttpContext): Promise<number> {
    const user = await ctx.auth.authenticate();
    return Number(user.id);
}

async function audit(ctx: HttpContext, action: string, entityKind: string, entityId: number | null, payload: Record<string, unknown> = {}) {
    await recordAudit({ ctx, action, entityKind, entityId, payload });
}

export default class TicketOperationsController {
    async workflowStatuses() {
        return ticketOperationsService.workflowStatuses();
    }

    async workflowStatusStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketWorkflowStatusValidator);
        const result = await ticketOperationsService.createWorkflowStatus(payload);
        ctx.response.status(201);
        await audit(ctx, "support.workflow_status.create", "support_ticket_workflow_status", Number(result.data.id), { code: payload.code });
        return result;
    }

    async savedViews(ctx: HttpContext) {
        return ticketOperationsService.savedViews(await actor(ctx));
    }

    async savedViewStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketSavedViewCreateValidator);
        const result = await ticketOperationsService.createSavedView(await actor(ctx), payload);
        ctx.response.status(201);
        await audit(ctx, "support.saved_view.create", "support_ticket_saved_view", Number(result.data.id));
        return result;
    }

    async savedViewUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketSavedViewUpdateValidator);
        const result = await ticketOperationsService.updateSavedView(paramId(ctx), await actor(ctx), payload);
        await audit(ctx, "support.saved_view.update", "support_ticket_saved_view", paramId(ctx));
        return result;
    }

    async savedViewDestroy(ctx: HttpContext) {
        const id = paramId(ctx);
        await ticketOperationsService.deleteSavedView(id, await actor(ctx));
        await audit(ctx, "support.saved_view.delete", "support_ticket_saved_view", id);
        return ctx.response.status(204);
    }

    async bulk(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketBulkOperationValidator);
        const result = await ticketOperationsService.bulk(payload, await actor(ctx));
        await audit(ctx, "support.ticket.bulk", "support_ticket", null, { operation: payload.operation, requested: payload.tickets.length, succeeded: result.meta.succeeded, failed: result.meta.failed });
        return result;
    }

    async attachments(ctx: HttpContext) {
        return ticketOperationsService.attachments(paramId(ctx, "ticketId"));
    }

    async attachmentStore(ctx: HttpContext) {
        const ticketId = paramId(ctx, "ticketId");
        const payload = await ctx.request.validateUsing(ticketAttachmentValidator);
        const result = await ticketOperationsService.addAttachment(ticketId, payload, await actor(ctx));
        ctx.response.status(201);
        await audit(ctx, "support.ticket.attachment.create", "support_ticket_attachment", Number(result.data.id), { ticket_id: ticketId, media_id: payload.media_id });
        return result;
    }

    async attachmentScan(ctx: HttpContext) {
        const attachmentId = paramId(ctx, "attachmentId");
        const payload = await ctx.request.validateUsing(ticketAttachmentScanValidator);
        const result = await ticketOperationsService.updateAttachmentScan(attachmentId, payload, await actor(ctx));
        await audit(ctx, "support.ticket.attachment.scan", "support_ticket_attachment", attachmentId, { status: payload.status });
        return result;
    }

    async merge(ctx: HttpContext) {
        const sourceId = paramId(ctx, "ticketId");
        const payload = await ctx.request.validateUsing(ticketMergeValidator);
        const result = await ticketOperationsService.merge(sourceId, payload, await actor(ctx));
        await audit(ctx, "support.ticket.merge", "support_ticket", sourceId, { target_ticket_id: payload.target_ticket_id, merge_id: result.data.id });
        return result;
    }

    async presence() {
        return ticketOperationsService.presence();
    }

    async heartbeat(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketPresenceValidator);
        return ticketOperationsService.heartbeat(await actor(ctx), payload);
    }

    async channels() {
        return ticketOperationsService.channels();
    }

    async channelUpdate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketChannelUpdateValidator);
        const result = await ticketOperationsService.configureChannel(payload);
        await audit(ctx, "support.channel.configure", "support_channel_integration", Number(result.data.id), { channel: payload.channel, enabled: payload.enabled, credential_env_ref: payload.credential_env_ref ?? null });
        return result;
    }

    async routingRules() {
        return ticketOperationsService.routingRules();
    }

    async routingRuleStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketRuleCreateValidator);
        const result = await ticketOperationsService.createRoutingRule(payload);
        ctx.response.status(201);
        await audit(ctx, "support.routing_rule.create", "support_routing_rule", Number(result.data.id));
        return result;
    }

    async routingRuleUpdate(ctx: HttpContext) {
        const id = paramId(ctx);
        const payload = await ctx.request.validateUsing(ticketRuleUpdateValidator);
        const result = await ticketOperationsService.updateRoutingRule(id, payload);
        await audit(ctx, "support.routing_rule.update", "support_routing_rule", id, { expected_version: payload.expected_version });
        return result;
    }

    async automationRules() {
        return ticketOperationsService.automationRules();
    }

    async automationRuleStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketAutomationCreateValidator);
        const result = await ticketOperationsService.createAutomationRule(payload);
        ctx.response.status(201);
        await audit(ctx, "support.automation_rule.create", "support_automation_rule", Number(result.data.id));
        return result;
    }

    async automationRuleUpdate(ctx: HttpContext) {
        const id = paramId(ctx);
        const payload = await ctx.request.validateUsing(ticketAutomationUpdateValidator);
        const result = await ticketOperationsService.updateAutomationRule(id, payload);
        await audit(ctx, "support.automation_rule.update", "support_automation_rule", id, { expected_version: payload.expected_version });
        return result;
    }

    async campaigns() {
        return ticketOperationsService.campaigns();
    }

    async campaignStore(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(ticketCampaignCreateValidator);
        const result = await ticketOperationsService.createCampaign(payload);
        ctx.response.status(201);
        await audit(ctx, "support.campaign.create", "support_campaign", Number(result.data.id), { channel: payload.channel });
        return result;
    }

    async campaignRecipients(ctx: HttpContext) {
        const id = paramId(ctx);
        const payload = await ctx.request.validateUsing(ticketCampaignRecipientsValidator);
        const result = await ticketOperationsService.addCampaignRecipients(id, payload.expected_version, payload.recipients);
        await audit(ctx, "support.campaign.recipients", "support_campaign", id, { count: payload.recipients.length, expected_version: payload.expected_version });
        return result;
    }

    async campaignTransition(ctx: HttpContext) {
        const id = paramId(ctx);
        const payload = await ctx.request.validateUsing(ticketCampaignTransitionValidator);
        const result = await ticketOperationsService.transitionCampaign(id, payload.expected_version, payload.status);
        await audit(ctx, "support.campaign.transition", "support_campaign", id, { status: payload.status, expected_version: payload.expected_version });
        return result;
    }

    async reports() {
        return ticketOperationsService.reports();
    }
}
