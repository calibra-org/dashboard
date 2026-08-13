import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import PaymentAttempt from "#models/payment_attempt";

/** Transaction-center list view. */
export const adminPaymentAttemptsView = createTableView({
    model: PaymentAttempt,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        order_id: { type: "bigint", filterable: true, orderable: false },
        gateway_id: { type: "bigint", filterable: true, orderable: false },
        gateway_code_snapshot: { type: "string", filterable: true, orderable: false },
        status: { type: "string", filterable: true, orderable: true },
        amount_minor: { type: "bigint", filterable: true, orderable: true },
        reconciliation_status: { type: "string", filterable: true, orderable: true },
        reconciliation_provider_status: { type: "string", filterable: true, orderable: false },
        created_at: { type: "datetime", filterable: true, orderable: true },
        initiated_at: { type: "datetime", filterable: true, orderable: true },
        verified_at: { type: "datetime", filterable: true, orderable: true },
        reconciliation_checked_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["id", "desc"]],
});

export type AdminPaymentAttemptsViewQuery = InferTableViewQuery<typeof adminPaymentAttemptsView>;
