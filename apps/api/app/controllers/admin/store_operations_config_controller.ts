import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { CacheInvalidation } from "#services/cache_invalidation";
import { storeOperationsConfigService } from "#services/store_operations_config_service";
import { currentTenantId } from "#services/tenant_context";
import {
    shippingZoneCreateValidator,
    shippingZoneLocationsValidator,
    shippingZoneMethodCreateValidator,
    shippingZoneMethodUpdateValidator,
    shippingZoneUpdateValidator,
    taxRateCreateValidator,
    taxRateUpdateValidator,
} from "#validators/admin/phase5_operations_validator";

function positiveId(value: unknown, code: string): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new Exception("Invalid identifier", { status: 422, code });
    return id;
}

async function invalidateShippingRates(): Promise<void> {
    await CacheInvalidation.shippingZonesChanged(currentTenantId());
}

export default class StoreOperationsConfigController {
    async shippingZones() {
        return storeOperationsConfigService.shippingZones();
    }

    async shippingZone(ctx: HttpContext) {
        return storeOperationsConfigService.shippingZone(positiveId(ctx.params.id, "E_SHIPPING_ZONE_ID"));
    }

    async createShippingZone(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(shippingZoneCreateValidator);
        const result = await storeOperationsConfigService.createShippingZone(payload);
        await invalidateShippingRates();
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "shipping.zone.create",
            entityKind: "shipping_zone",
            entityId: Number(result.data.id),
            payload: { name: payload.name, is_fallback: result.data.is_fallback },
        });
        return result;
    }

    async updateShippingZone(ctx: HttpContext) {
        const id = positiveId(ctx.params.id, "E_SHIPPING_ZONE_ID");
        const payload = await ctx.request.validateUsing(shippingZoneUpdateValidator);
        const result = await storeOperationsConfigService.updateShippingZone(id, payload);
        await invalidateShippingRates();
        await recordAudit({ ctx, action: "shipping.zone.update", entityKind: "shipping_zone", entityId: id, payload });
        return result;
    }

    async replaceShippingZoneLocations(ctx: HttpContext) {
        const id = positiveId(ctx.params.id, "E_SHIPPING_ZONE_ID");
        const payload = await ctx.request.validateUsing(shippingZoneLocationsValidator);
        const result = await storeOperationsConfigService.replaceShippingZoneLocations(id, payload.locations);
        await invalidateShippingRates();
        await recordAudit({
            ctx,
            action: "shipping.zone.locations.replace",
            entityKind: "shipping_zone",
            entityId: id,
            payload: { count: payload.locations.length },
        });
        return result;
    }

    async deleteShippingZone(ctx: HttpContext) {
        const id = positiveId(ctx.params.id, "E_SHIPPING_ZONE_ID");
        await storeOperationsConfigService.deleteShippingZone(id);
        await invalidateShippingRates();
        await recordAudit({ ctx, action: "shipping.zone.delete", entityKind: "shipping_zone", entityId: id, payload: {} });
        return ctx.response.status(204);
    }

    async shippingMethods() {
        return storeOperationsConfigService.shippingMethods();
    }

    async addShippingZoneMethod(ctx: HttpContext) {
        const zoneId = positiveId(ctx.params.zoneId, "E_SHIPPING_ZONE_ID");
        const payload = await ctx.request.validateUsing(shippingZoneMethodCreateValidator);
        const result = await storeOperationsConfigService.addShippingZoneMethod(zoneId, payload);
        await invalidateShippingRates();
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "shipping.zone_method.create",
            entityKind: "shipping_zone_method",
            entityId: Number(result.data.id),
            payload: { zone_id: zoneId, method_id: payload.method_id },
        });
        return result;
    }

    async updateShippingZoneMethod(ctx: HttpContext) {
        const zoneId = positiveId(ctx.params.zoneId, "E_SHIPPING_ZONE_ID");
        const id = positiveId(ctx.params.id, "E_SHIPPING_ZONE_METHOD_ID");
        const payload = await ctx.request.validateUsing(shippingZoneMethodUpdateValidator);
        const result = await storeOperationsConfigService.updateShippingZoneMethod(zoneId, id, payload);
        await invalidateShippingRates();
        await recordAudit({
            ctx,
            action: "shipping.zone_method.update",
            entityKind: "shipping_zone_method",
            entityId: id,
            payload: { zone_id: zoneId },
        });
        return result;
    }

    async deleteShippingZoneMethod(ctx: HttpContext) {
        const zoneId = positiveId(ctx.params.zoneId, "E_SHIPPING_ZONE_ID");
        const id = positiveId(ctx.params.id, "E_SHIPPING_ZONE_METHOD_ID");
        await storeOperationsConfigService.deleteShippingZoneMethod(zoneId, id);
        await invalidateShippingRates();
        await recordAudit({
            ctx,
            action: "shipping.zone_method.delete",
            entityKind: "shipping_zone_method",
            entityId: id,
            payload: { zone_id: zoneId },
        });
        return ctx.response.status(204);
    }

    async taxRates() {
        return storeOperationsConfigService.taxRates();
    }

    async createTaxRate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(taxRateCreateValidator);
        const result = await storeOperationsConfigService.createTaxRate(payload);
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "tax.rate.create",
            entityKind: "tax_rate",
            entityId: Number(result.data.id),
            payload: { tax_class_id: payload.tax_class_id, country: payload.country ?? null, rate: payload.rate },
        });
        return result;
    }

    async updateTaxRate(ctx: HttpContext) {
        const id = positiveId(ctx.params.id, "E_TAX_RATE_ID");
        const payload = await ctx.request.validateUsing(taxRateUpdateValidator);
        const result = await storeOperationsConfigService.updateTaxRate(id, payload);
        await recordAudit({ ctx, action: "tax.rate.update", entityKind: "tax_rate", entityId: id, payload });
        return result;
    }

    async deleteTaxRate(ctx: HttpContext) {
        const id = positiveId(ctx.params.id, "E_TAX_RATE_ID");
        await storeOperationsConfigService.deleteTaxRate(id);
        await recordAudit({ ctx, action: "tax.rate.delete", entityKind: "tax_rate", entityId: id, payload: {} });
        return ctx.response.status(204);
    }
}
