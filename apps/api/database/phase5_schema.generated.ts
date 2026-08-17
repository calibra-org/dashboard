/**
 * Generated Phase 5 database projection.
 * Source: 1762000000000_create_phase5_order_operations.ts
 *
 * Kept scoped until the repository's official migration/schema generator can run in an executable workspace.
 */

import { BaseModel, column } from "@adonisjs/lucid/orm";
import type { DateTime } from "luxon";

export class OrderFulfillmentSchema extends BaseModel {
    static $columns = [
        "id",
        "tenantId",
        "orderId",
        "status",
        "idempotencyKey",
        "idempotencyFingerprint",
        "note",
        "createdByUserId",
        "version",
        "packedAt",
        "shippedAt",
        "deliveredAt",
        "cancelledAt",
        "createdAt",
        "updatedAt",
    ] as const;
    $columns = OrderFulfillmentSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare orderId: bigint | number;
    @column() declare status: string;
    @column() declare idempotencyKey: string | null;
    @column() declare idempotencyFingerprint: string | null;
    @column() declare note: string | null;
    @column() declare createdByUserId: bigint | number | null;
    @column() declare version: number;
    @column.dateTime() declare packedAt: DateTime | null;
    @column.dateTime() declare shippedAt: DateTime | null;
    @column.dateTime() declare deliveredAt: DateTime | null;
    @column.dateTime() declare cancelledAt: DateTime | null;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
    @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime;
}

export class OrderFulfillmentItemSchema extends BaseModel {
    static $columns = ["id", "tenantId", "fulfillmentId", "orderLineItemId", "quantity", "createdAt", "updatedAt"] as const;
    $columns = OrderFulfillmentItemSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare fulfillmentId: bigint | number;
    @column() declare orderLineItemId: bigint | number;
    @column() declare quantity: number;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
    @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime;
}

export class OrderShipmentSchema extends BaseModel {
    static $columns = [
        "id",
        "tenantId",
        "fulfillmentId",
        "status",
        "carrier",
        "service",
        "trackingNumber",
        "trackingUrl",
        "version",
        "shippedAt",
        "deliveredAt",
        "createdAt",
        "updatedAt",
    ] as const;
    $columns = OrderShipmentSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare fulfillmentId: bigint | number;
    @column() declare status: string;
    @column() declare carrier: string | null;
    @column() declare service: string | null;
    @column() declare trackingNumber: string | null;
    @column() declare trackingUrl: string | null;
    @column() declare version: number;
    @column.dateTime() declare shippedAt: DateTime | null;
    @column.dateTime() declare deliveredAt: DateTime | null;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
    @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime;
}

export class OrderShipmentEventSchema extends BaseModel {
    static $columns = [
        "id",
        "tenantId",
        "shipmentId",
        "status",
        "location",
        "message",
        "evidence",
        "occurredAt",
        "createdByUserId",
        "createdAt",
    ] as const;
    $columns = OrderShipmentEventSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare shipmentId: bigint | number;
    @column() declare status: string;
    @column() declare location: string | null;
    @column() declare message: string | null;
    @column() declare evidence: Record<string, unknown>;
    @column.dateTime() declare occurredAt: DateTime;
    @column() declare createdByUserId: bigint | number | null;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
}

export class OrderReturnSchema extends BaseModel {
    static $columns = [
        "id",
        "tenantId",
        "orderId",
        "status",
        "idempotencyKey",
        "idempotencyFingerprint",
        "reason",
        "customerNote",
        "internalNote",
        "carrier",
        "trackingNumber",
        "refundId",
        "createdByUserId",
        "approvedByUserId",
        "version",
        "approvedAt",
        "receivedAt",
        "completedAt",
        "cancelledAt",
        "createdAt",
        "updatedAt",
    ] as const;
    $columns = OrderReturnSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare orderId: bigint | number;
    @column() declare status: string;
    @column() declare idempotencyKey: string | null;
    @column() declare idempotencyFingerprint: string | null;
    @column() declare reason: string | null;
    @column() declare customerNote: string | null;
    @column() declare internalNote: string | null;
    @column() declare carrier: string | null;
    @column() declare trackingNumber: string | null;
    @column() declare refundId: bigint | number | null;
    @column() declare createdByUserId: bigint | number | null;
    @column() declare approvedByUserId: bigint | number | null;
    @column() declare version: number;
    @column.dateTime() declare approvedAt: DateTime | null;
    @column.dateTime() declare receivedAt: DateTime | null;
    @column.dateTime() declare completedAt: DateTime | null;
    @column.dateTime() declare cancelledAt: DateTime | null;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
    @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime;
}

export class OrderReturnItemSchema extends BaseModel {
    static $columns = [
        "id",
        "tenantId",
        "returnId",
        "orderLineItemId",
        "requestedQuantity",
        "approvedQuantity",
        "receivedQuantity",
        "damagedQuantity",
        "restockQuantity",
        "refundAmountMinor",
        "reason",
        "createdAt",
        "updatedAt",
    ] as const;
    $columns = OrderReturnItemSchema.$columns;
    @column({ isPrimary: true }) declare id: bigint | number;
    @column() declare tenantId: bigint | number;
    @column() declare returnId: bigint | number;
    @column() declare orderLineItemId: bigint | number;
    @column() declare requestedQuantity: number;
    @column() declare approvedQuantity: number;
    @column() declare receivedQuantity: number;
    @column() declare damagedQuantity: number;
    @column() declare restockQuantity: number;
    @column() declare refundAmountMinor: bigint | number | null;
    @column() declare reason: string | null;
    @column.dateTime({ autoCreate: true }) declare createdAt: DateTime;
    @column.dateTime({ autoCreate: true, autoUpdate: true }) declare updatedAt: DateTime;
}
