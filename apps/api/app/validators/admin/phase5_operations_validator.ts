import vine from "@vinejs/vine";

export const FULFILLMENT_STATUSES = ["pending", "packed", "shipped", "delivered", "cancelled"] as const;
export const SHIPMENT_STATUSES = [
    "label_created",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "exception",
    "returned",
] as const;
export const RETURN_STATUSES = ["requested", "approved", "in_transit", "received", "completed", "cancelled"] as const;
export const SHIPPING_LOCATION_TYPES = ["continent", "country", "state", "postcode"] as const;

const positiveInteger = () => vine.number().withoutDecimals().positive();
const nonNegativeInteger = () => vine.number().withoutDecimals().min(0);

const fulfillmentItem = vine.object({
    order_line_item_id: positiveInteger(),
    quantity: positiveInteger().max(10_000),
});

export const createFulfillmentValidator = vine.compile(
    vine.object({
        items: vine.array(fulfillmentItem).minLength(1),
        note: vine.string().trim().maxLength(2000).optional().nullable(),
    }),
);

export const transitionFulfillmentValidator = vine.compile(
    vine.object({
        status: vine.enum(FULFILLMENT_STATUSES),
        expected_version: positiveInteger(),
    }),
);

export const createShipmentValidator = vine.compile(
    vine.object({
        carrier: vine.string().trim().maxLength(120).optional().nullable(),
        service: vine.string().trim().maxLength(120).optional().nullable(),
        tracking_number: vine.string().trim().maxLength(190).optional().nullable(),
        tracking_url: vine
            .string()
            .trim()
            .url({ require_protocol: true, protocols: ["http", "https"] })
            .maxLength(1000)
            .optional()
            .nullable(),
    }),
);

export const shipmentEventValidator = vine.compile(
    vine.object({
        status: vine.enum(SHIPMENT_STATUSES),
        expected_version: positiveInteger(),
        occurred_at: vine.string().trim().optional(),
        location: vine.string().trim().maxLength(190).optional().nullable(),
        message: vine.string().trim().maxLength(2000).optional().nullable(),
        evidence: vine.record(vine.any()).optional(),
    }),
);

const returnItem = vine.object({
    order_line_item_id: positiveInteger(),
    quantity: positiveInteger().max(10_000),
    reason: vine.string().trim().maxLength(190).optional().nullable(),
    refund_amount_minor: nonNegativeInteger().max(Number.MAX_SAFE_INTEGER).optional().nullable(),
});

export const createReturnValidator = vine.compile(
    vine.object({
        items: vine.array(returnItem).minLength(1),
        reason: vine.string().trim().maxLength(190).optional().nullable(),
        customer_note: vine.string().trim().maxLength(2000).optional().nullable(),
        internal_note: vine.string().trim().maxLength(4000).optional().nullable(),
        carrier: vine.string().trim().maxLength(120).optional().nullable(),
        tracking_number: vine.string().trim().maxLength(190).optional().nullable(),
    }),
);

export const approveReturnValidator = vine.compile(
    vine.object({
        expected_version: positiveInteger(),
        items: vine
            .array(
                vine.object({
                    order_line_item_id: positiveInteger(),
                    approved_quantity: nonNegativeInteger().max(10_000),
                }),
            )
            .minLength(1),
    }),
);

export const receiveReturnValidator = vine.compile(
    vine.object({
        expected_version: positiveInteger(),
        items: vine
            .array(
                vine.object({
                    order_line_item_id: positiveInteger(),
                    received_quantity: nonNegativeInteger().max(10_000),
                    damaged_quantity: nonNegativeInteger().max(10_000),
                    restock_quantity: nonNegativeInteger().max(10_000),
                }),
            )
            .minLength(1),
    }),
);

export const transitionReturnValidator = vine.compile(
    vine.object({
        status: vine.enum(RETURN_STATUSES),
        expected_version: positiveInteger(),
    }),
);

export const refundReturnValidator = vine.compile(
    vine.object({
        expected_version: positiveInteger(),
        reason: vine.string().trim().maxLength(1000).optional().nullable(),
    }),
);

export const inventoryMovementListValidator = vine.compile(
    vine.object({
        inventory_item_id: positiveInteger(),
        limit: positiveInteger().max(200).optional(),
    }),
);

export const inventoryAdjustmentValidator = vine.compile(
    vine.object({
        inventory_item_id: positiveInteger(),
        quantity_delta: vine.number().withoutDecimals().min(-1_000_000).max(1_000_000),
        reason: vine.string().trim().minLength(3).maxLength(1000),
    }),
);

const shippingLocation = vine.object({
    type: vine.enum(SHIPPING_LOCATION_TYPES),
    code: vine.string().trim().minLength(1).maxLength(120),
});

export const shippingZoneCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120),
        is_fallback: vine.boolean().optional(),
        locations: vine.array(shippingLocation).optional(),
    }),
);

export const shippingZoneUpdateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(1).maxLength(120).optional(),
        is_fallback: vine.boolean().optional(),
    }),
);

export const shippingZoneLocationsValidator = vine.compile(vine.object({ locations: vine.array(shippingLocation) }));

export const shippingZoneMethodCreateValidator = vine.compile(
    vine.object({
        method_id: positiveInteger(),
        title_override: vine.string().trim().maxLength(160).optional().nullable(),
        enabled: vine.boolean().optional(),
        ordering: nonNegativeInteger().max(100_000).optional(),
        settings: vine.record(vine.any()).optional(),
    }),
);

export const shippingZoneMethodUpdateValidator = vine.compile(
    vine.object({
        title_override: vine.string().trim().maxLength(160).optional().nullable(),
        enabled: vine.boolean().optional(),
        ordering: nonNegativeInteger().max(100_000).optional(),
        settings: vine.record(vine.any()).optional(),
    }),
);

export const taxRateCreateValidator = vine.compile(
    vine.object({
        tax_class_id: positiveInteger(),
        country: vine.string().trim().maxLength(2).optional().nullable(),
        region_id: positiveInteger().optional().nullable(),
        postcodes: vine.array(vine.string().trim().maxLength(32)).optional(),
        cities: vine.array(vine.string().trim().maxLength(120)).optional(),
        rate: vine.number().min(0).max(100),
        label: vine.string().trim().minLength(1).maxLength(120),
        priority: nonNegativeInteger().max(1000).optional(),
        compound: vine.boolean().optional(),
        applies_to_shipping: vine.boolean().optional(),
        ordering: nonNegativeInteger().max(100_000).optional(),
    }),
);

export const taxRateUpdateValidator = vine.compile(
    vine.object({
        tax_class_id: positiveInteger().optional(),
        country: vine.string().trim().maxLength(2).optional().nullable(),
        region_id: positiveInteger().optional().nullable(),
        postcodes: vine.array(vine.string().trim().maxLength(32)).optional(),
        cities: vine.array(vine.string().trim().maxLength(120)).optional(),
        rate: vine.number().min(0).max(100).optional(),
        label: vine.string().trim().minLength(1).maxLength(120).optional(),
        priority: nonNegativeInteger().max(1000).optional(),
        compound: vine.boolean().optional(),
        applies_to_shipping: vine.boolean().optional(),
        ordering: nonNegativeInteger().max(100_000).optional(),
    }),
);
