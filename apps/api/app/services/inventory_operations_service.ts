import { Exception } from "@adonisjs/core/exceptions";

import InventoryService from "#services/inventory_service";
import { currentTrx } from "#services/tenant_context";

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}

export class InventoryOperationsService {
    constructor(private readonly inventory = new InventoryService()) {}

    async movements(inventoryItemId: number, limit = 100) {
        const trx = currentTrx();
        const item = await trx
            .from("inventory_items as ii")
            .leftJoin("products as p", "p.id", "ii.product_id")
            .leftJoin("product_variations as pv", "pv.id", "ii.variation_id")
            .where("ii.id", inventoryItemId)
            .select("ii.*", "p.slug as product_slug", "pv.sku as variation_sku")
            .first();
        if (!item) throw new Exception("Inventory item not found", { status: 404, code: "E_INVENTORY_ITEM_NOT_FOUND" });
        const rows = await trx
            .from("inventory_movements")
            .where("inventory_item_id", inventoryItemId)
            .orderBy("occurred_at", "desc")
            .limit(Math.min(200, Math.max(1, limit)));
        return {
            data: {
                item: {
                    id: numberValue(item.id),
                    product_id: numberValue(item.product_id),
                    variation_id: numberOrNull(item.variation_id),
                    stock_quantity: numberValue(item.stock_quantity),
                    stock_status: item.stock_status,
                    manage_stock: Boolean(item.manage_stock),
                    backorders: item.backorders,
                    low_stock_threshold: numberOrNull(item.low_stock_threshold),
                    product_slug: item.product_slug ?? null,
                    variation_sku: item.variation_sku ?? null,
                },
                movements: rows.map((row) => ({
                    ...row,
                    id: numberValue(row.id),
                    inventory_item_id: numberValue(row.inventory_item_id),
                    quantity_delta: numberValue(row.quantity_delta),
                    ref_id: numberOrNull(row.ref_id),
                })),
            },
        };
    }

    async adjust(inventoryItemId: number, quantityDelta: number, reason: string, actorUserId: number) {
        if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
            throw new Exception("Inventory adjustment must be a non-zero integer", {
                status: 422,
                code: "E_INVENTORY_ADJUSTMENT_DELTA",
            });
        }
        const trx = currentTrx();
        const item = await trx.from("inventory_items").where("id", inventoryItemId).forUpdate().first();
        if (!item) throw new Exception("Inventory item not found", { status: 404, code: "E_INVENTORY_ITEM_NOT_FOUND" });
        await this.inventory.adjust(
            { productId: item.product_id, variationId: item.variation_id ?? null },
            quantityDelta,
            { kind: "manual", id: actorUserId },
            reason,
            trx,
        );
        return this.movements(inventoryItemId, 100);
    }
}

export const inventoryOperationsService = new InventoryOperationsService();
