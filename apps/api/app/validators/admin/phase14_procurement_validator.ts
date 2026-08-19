import vine from "@vinejs/vine";

const purchaseOrderLine = vine.object({
    product_id: vine.number().positive(),
    variation_id: vine.number().positive().optional(),
    sku: vine.string().trim().maxLength(190).optional(),
    name: vine.string().trim().minLength(1).maxLength(255),
    quantity: vine.number().positive(),
    unit_cost: vine.number().min(0),
    expected_date: vine.string().trim().optional(),
});

export const createSupplierValidator = vine.compile(
    vine.object({
        code: vine.string().trim().minLength(2).maxLength(64),
        legal_name: vine.string().trim().minLength(2).maxLength(220),
        display_name: vine.string().trim().minLength(2).maxLength(220),
        email: vine.string().trim().email().optional(),
        phone: vine.string().trim().maxLength(64).optional(),
        currency: vine.string().trim().fixedLength(3).optional(),
        payment_terms: vine.string().trim().maxLength(120).optional(),
        default_lead_time_days: vine.number().min(0).max(365).optional(),
        criticality: vine.enum(["low", "normal", "high", "critical"] as const).optional(),
    }),
);

export const createPurchaseOrderValidator = vine.compile(
    vine.object({
        supplier_id: vine.number().positive(),
        currency: vine.string().trim().fixedLength(3).optional(),
        expected_date: vine.string().trim().optional(),
        payment_terms: vine.string().trim().maxLength(120).optional(),
        planning_recommendation_id: vine.number().positive().optional(),
        lines: vine.array(purchaseOrderLine).minLength(1).maxLength(200),
    }),
);

export const transitionPurchaseOrderValidator = vine.compile(
    vine.object({
        status: vine.enum(["approval", "sent", "acknowledged", "partially_shipped", "closed", "cancelled"] as const),
        expected_version: vine.number().positive(),
    }),
);

export const receivePurchaseOrderValidator = vine.compile(
    vine.object({
        notes: vine.string().trim().maxLength(1000).optional(),
        lines: vine
            .array(
                vine.object({
                    purchase_order_line_id: vine.number().positive(),
                    received_quantity: vine.number().positive(),
                    accepted_quantity: vine.number().min(0),
                    rejected_quantity: vine.number().min(0).optional(),
                    quarantine_quantity: vine.number().min(0).optional(),
                    quality_reason: vine.string().trim().maxLength(240).optional(),
                    lot_code: vine.string().trim().maxLength(120).optional(),
                    batch_code: vine.string().trim().maxLength(120).optional(),
                }),
            )
            .minLength(1)
            .maxLength(200),
    }),
);
