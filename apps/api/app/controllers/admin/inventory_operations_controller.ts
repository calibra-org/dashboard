import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { inventoryOperationsService } from "#services/inventory_operations_service";
import { inventoryAdjustmentValidator, inventoryMovementListValidator } from "#validators/admin/phase5_operations_validator";

export default class InventoryOperationsController {
    async movements(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(inventoryMovementListValidator);
        return inventoryOperationsService.movements(payload.inventory_item_id, payload.limit ?? 100);
    }

    async adjust(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(inventoryAdjustmentValidator);
        const user = await ctx.auth.authenticate();
        const result = await inventoryOperationsService.adjust(
            payload.inventory_item_id,
            payload.quantity_delta,
            payload.reason,
            Number(user.id),
        );
        await recordAudit({
            ctx,
            action: "inventory.adjust",
            entityKind: "inventory_item",
            entityId: payload.inventory_item_id,
            payload: { quantity_delta: payload.quantity_delta, reason: payload.reason },
        });
        return result;
    }
}
