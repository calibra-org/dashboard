/**
 * Generated Phase 4 Admin API overlay.
 * Source: docs/api/reference/openapi/admin/paths/payments/payment-attempts-*.yaml
 */
export interface components {
    schemas: {
        AdminPaymentAttemptPhase4: {
            id: number;
            order_id: number;
            gateway_id: number;
            gateway_code?: string | null;
            status: "initiated" | "awaiting_callback" | "verified" | "failed" | "cancelled" | "refunded";
            amount_minor: number;
            currency: string;
            gateway_authority?: string | null;
            gateway_transaction_id?: string | null;
            error_code?: string | null;
            error_message?: string | null;
            reconciliation_status: "unchecked" | "matched" | "mismatch" | "unsupported" | "error";
            reconciliation_provider_status?: string | null;
            reconciliation_checked_at?: string | null;
            reconciliation_checked_by_user_id?: number | null;
            reconciliation_error_code?: string | null;
            initiated_at?: string | null;
            verified_at?: string | null;
            created_at?: string | null;
            gateway_payload?: Record<string, unknown>;
            reconciliation_evidence?: Record<string, unknown>;
        };
        AdminPaymentAttemptsSummary: {
            total_count: number;
            total_amount_minor: number;
            needs_attention_count: number;
            by_status: Record<string, { count: number; amount_minor: number }>;
            by_reconciliation: Record<string, number>;
        };
        AdminPaymentReconciliationAudit: {
            id: string;
            actor?: { id: string; email: string } | null;
            action: "payment.reconciliation.checked";
            entity_kind: "payment_attempt";
            entity_id?: string | null;
            payload: Record<string, unknown>;
            ip_address?: string | null;
            occurred_at?: string | null;
        };
    };
}

export interface operations {
    adminPaymentAttemptsSummary: {
        parameters: { query?: never; header?: never; path?: never; cookie?: never };
        requestBody?: never;
        responses: {
            200: { headers: { [name: string]: unknown }; content: { "application/json": { data: components["schemas"]["AdminPaymentAttemptsSummary"] } } };
            401: { headers: { [name: string]: unknown }; content?: never };
            403: { headers: { [name: string]: unknown }; content?: never };
        };
    };
    adminPaymentAttemptReconcile: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody?: never;
        responses: {
            200: { headers: { [name: string]: unknown }; content: { "application/json": { data: components["schemas"]["AdminPaymentAttemptPhase4"] } } };
            401: { headers: { [name: string]: unknown }; content?: never };
            403: { headers: { [name: string]: unknown }; content?: never };
            404: { headers: { [name: string]: unknown }; content?: never };
            409: { headers: { [name: string]: unknown }; content?: never };
        };
    };
    adminPaymentAttemptReconciliationHistory: {
        parameters: { query?: never; header?: never; path: { id: number }; cookie?: never };
        requestBody?: never;
        responses: {
            200: { headers: { [name: string]: unknown }; content: { "application/json": { data: components["schemas"]["AdminPaymentReconciliationAudit"][] } } };
            401: { headers: { [name: string]: unknown }; content?: never };
            403: { headers: { [name: string]: unknown }; content?: never };
            404: { headers: { [name: string]: unknown }; content?: never };
        };
    };
}

export interface paths {
    "/api/v1/admin/payment-attempts/summary": {
        parameters: { query?: never; header?: never; path?: never; cookie?: never };
        get: operations["adminPaymentAttemptsSummary"];
        put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
    };
    "/api/v1/admin/payment-attempts/{id}/reconcile": {
        parameters: { query?: never; header?: never; path?: never; cookie?: never };
        get?: never; put?: never;
        post: operations["adminPaymentAttemptReconcile"];
        delete?: never; options?: never; head?: never; patch?: never; trace?: never;
    };
    "/api/v1/admin/payment-attempts/{id}/reconciliation": {
        parameters: { query?: never; header?: never; path?: never; cookie?: never };
        get: operations["adminPaymentAttemptReconciliationHistory"];
        put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
    };
}
