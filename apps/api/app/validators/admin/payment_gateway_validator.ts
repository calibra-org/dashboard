import vine from "@vinejs/vine";

import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import { adminPaymentGatewaysView } from "#table_views/admin/payment_gateways";

/** Admin `GET /api/v1/admin/payment-gateways` list query. */
export const adminPaymentGatewayListValidator = adminPaymentGatewaysView.compileStrict({ defaultLimit: 100 });

/**
 * Admin `PATCH /api/v1/admin/payment-gateways/:id`. Credential keys are provider-specific and
 * validated again by the catalog/service boundary; this wire schema intentionally accepts a free
 * record so adding a provider does not require a second central switch statement.
 */
export const adminPaymentGatewayUpdateValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
        ordering: vine.number().min(0).max(10_000).optional(),
        settings: vine.record(vine.any()).optional(),
        supports: vine.record(vine.any()).optional(),
    }),
);

/** Bulk enable/disable is all-or-nothing at the controller transaction boundary. */
export const adminPaymentGatewayBulkValidator = vine.compile(
    vine.object({
        ids: vine.array(vine.number().positive()).minLength(1).maxLength(50),
        enabled: vine.boolean(),
    }),
);

/** All filters move to the TableView `filter[]` grammar. */
export const adminPaymentAttemptListValidator = adminPaymentAttemptsView.compileStrict();
