import vine from "@vinejs/vine";

import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import { adminPaymentGatewaysView } from "#table_views/admin/payment_gateways";

/** Admin `GET /api/v1/admin/payment-gateways` list query. */
export const adminPaymentGatewayListValidator = adminPaymentGatewaysView.compileStrict({ defaultLimit: 100 });

/**
 * Admin `PATCH /api/v1/admin/payment-gateways/:id`. Provider capabilities are server-owned and
 * therefore intentionally absent from the mutation schema.
 */
export const adminPaymentGatewayUpdateValidator = vine.compile(
    vine.object({
        enabled: vine.boolean().optional(),
        ordering: vine.number().min(0).max(10_000).optional(),
        settings: vine.record(vine.any()).optional(),
    }),
);

/**
 * Transaction-center list query. All structured dimensions stay in TableView's filter/sort
 * grammar. `q` is the one endpoint extra because operators need a single search box that can
 * match an attempt id, order id, PSP authority, PSP transaction id, or gateway snapshot.
 */
export const adminPaymentAttemptListValidator = adminPaymentAttemptsView.compileStrict({
    extras: {
        q: vine.string().trim().minLength(1).maxLength(120).optional(),
    },
});