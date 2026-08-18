import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { phase14ProcurementService } from "#services/phase14_procurement_service";
import {
    createPurchaseOrderValidator,
    createSupplierValidator,
    receivePurchaseOrderValidator,
    transitionPurchaseOrderValidator,
} from "#validators/admin/phase14_procurement_validator";

function id(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Exception("Invalid identifier", { status: 422, code: "E_PROCUREMENT_ID" });
    return parsed;
}

function actor(user: { id: unknown }) {
    return { id: String(user.id) };
}

function idempotencyKey(ctx: HttpContext): string | null {
    const value = ctx.request.header("Idempotency-Key")?.trim();
    return value ? value.slice(0, 160) : null;
}

export default class ProcurementController {
    overview() { return phase14ProcurementService.overview(); }
    suppliers() { return phase14ProcurementService.suppliers(); }
    purchaseOrders() { return phase14ProcurementService.purchaseOrders(); }
    recommendations() { return phase14ProcurementService.recommendations(); }
    health() { return phase14ProcurementService.health(); }

    async createSupplier(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createSupplierValidator);
        const result = await phase14ProcurementService.createSupplier(payload);
        ctx.response.status(201);
        await recordAudit({ ctx, action: "procurement.supplier.create", entityKind: "supplier", entityId: result.data.id, payload: { code: payload.code } });
        return result;
    }

    async createPurchaseOrder(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createPurchaseOrderValidator);
        const result = await phase14ProcurementService.createPurchaseOrder(payload, actor(await ctx.auth.authenticate()), idempotencyKey(ctx));
        ctx.response.status(result.replayed ? 200 : 201);
        if (!result.replayed) await recordAudit({ ctx, action: "procurement.po.create", entityKind: "purchase_order", entityId: result.data.id, payload: { supplier_id: payload.supplier_id, line_count: payload.lines.length } });
        return result;
    }

    async transition(ctx: HttpContext) {
        const purchaseOrderId = id(ctx.params.id);
        const payload = await ctx.request.validateUsing(transitionPurchaseOrderValidator);
        const result = await phase14ProcurementService.transition(purchaseOrderId, payload, actor(await ctx.auth.authenticate()));
        await recordAudit({ ctx, action: `procurement.po.${payload.status}`, entityKind: "purchase_order", entityId: purchaseOrderId, payload: { expected_version: payload.expected_version } });
        return result;
    }

    async receive(ctx: HttpContext) {
        const purchaseOrderId = id(ctx.params.id);
        const payload = await ctx.request.validateUsing(receivePurchaseOrderValidator);
        const result = await phase14ProcurementService.receive(purchaseOrderId, payload, actor(await ctx.auth.authenticate()), idempotencyKey(ctx));
        ctx.response.status(result.replayed ? 200 : 201);
        if (!result.replayed) await recordAudit({ ctx, action: "procurement.po.receive", entityKind: "purchase_order_receipt", entityId: result.data.id, payload: { purchase_order_id: purchaseOrderId, line_count: payload.lines.length } });
        return result;
    }
}
