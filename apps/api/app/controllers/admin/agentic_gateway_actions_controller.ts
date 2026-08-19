import type { HttpContext } from "@adonisjs/core/http";

import { listAgenticActionLedger } from "#services/agentic_gateway/admin_read_service";
import { requireAgenticGatewayPermission } from "#services/agentic_gateway/permissions";

export default class AdminAgenticGatewayActionsController {
    async index(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireAgenticGatewayPermission(user, "agentic_gateway.view");
        const limit = Math.max(1, Math.min(Number(ctx.request.input("limit", 100)) || 100, 200));
        return { data: await listAgenticActionLedger(limit) };
    }
}
