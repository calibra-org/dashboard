/**
 * Generated projection for `payment_attempts` after migration
 * `1750006000000_add_payment_reconciliation_state.ts`.
 *
 * Kept separate from the historical monolithic schema snapshot so the reconciliation migration can
 * be synchronized without rewriting unrelated generated classes.
 */
import { BaseModel, column } from "@adonisjs/lucid/orm";
import type { DateTime } from "luxon";

export class PaymentAttemptSchema extends BaseModel {
    static $columns = [
        "amountMinor",
        "createdAt",
        "currency",
        "errorCode",
        "errorMessage",
        "gatewayAuthority",
        "gatewayCodeSnapshot",
        "gatewayId",
        "gatewayPayload",
        "gatewayTransactionId",
        "id",
        "idempotencyKey",
        "initiatedAt",
        "orderId",
        "reconciliationCheckedAt",
        "reconciliationCheckedByUserId",
        "reconciliationErrorCode",
        "reconciliationEvidence",
        "reconciliationProviderStatus",
        "reconciliationStatus",
        "status",
        "tenantId",
        "updatedAt",
        "verifiedAt",
    ] as const;
    $columns = PaymentAttemptSchema.$columns;

    @column()
    declare amountMinor: bigint | number;
    @column.dateTime({ autoCreate: true })
    declare createdAt: DateTime;
    @column()
    declare currency: string;
    @column()
    declare errorCode: string | null;
    @column()
    declare errorMessage: string | null;
    @column()
    declare gatewayAuthority: string | null;
    @column()
    declare gatewayCodeSnapshot: string;
    @column()
    declare gatewayId: bigint | number;
    @column()
    declare gatewayPayload: any;
    @column()
    declare gatewayTransactionId: string | null;
    @column({ isPrimary: true })
    declare id: bigint | number;
    @column()
    declare idempotencyKey: string | null;
    @column.dateTime()
    declare initiatedAt: DateTime;
    @column()
    declare orderId: bigint | number;
    @column.dateTime()
    declare reconciliationCheckedAt: DateTime | null;
    @column()
    declare reconciliationCheckedByUserId: bigint | number | null;
    @column()
    declare reconciliationErrorCode: string | null;
    @column()
    declare reconciliationEvidence: any;
    @column()
    declare reconciliationProviderStatus: string | null;
    @column()
    declare reconciliationStatus: string;
    @column()
    declare status: any;
    @column()
    declare tenantId: bigint | number;
    @column.dateTime({ autoCreate: true, autoUpdate: true })
    declare updatedAt: DateTime;
    @column.dateTime()
    declare verifiedAt: DateTime | null;
}
