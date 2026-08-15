import type { HttpContext } from "@adonisjs/core/http";

import { publicSupportService } from "#services/support/public_support_service";
import { scheduleTicketRealtime } from "#services/support/ticket_realtime";
import {
    publicTicketCreateValidator,
    publicTicketCsatValidator,
    publicTicketReplyValidator,
} from "#validators/support_public_validator";

export default class SupportPublicController {
    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicTicketCreateValidator);
        const result = await publicSupportService.create(payload);
        ctx.response.status(201);
        await scheduleTicketRealtime(ctx, { type: "created", ticketId: Number(result.data.ticket.id) });
        return result;
    }

    async show(ctx: HttpContext) {
        return publicSupportService.show(String(ctx.params.token));
    }

    async reply(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicTicketReplyValidator);
        const result = await publicSupportService.reply(String(ctx.params.token), payload);
        await scheduleTicketRealtime(ctx, { type: "public_message", ticketId: Number(result.data.id) });
        return result;
    }

    async csat(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(publicTicketCsatValidator);
        const result = await publicSupportService.csat(String(ctx.params.token), payload);
        ctx.response.status(201);
        await scheduleTicketRealtime(ctx, { type: "csat", ticketId: Number(result.data.ticket_id) });
        return result;
    }
}
