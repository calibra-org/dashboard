export type FulfillmentStatus = "pending" | "packed" | "shipped" | "delivered" | "cancelled";
export type ShipmentStatus = "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "returned";
export type ReturnStatus = "requested" | "approved" | "in_transit" | "received" | "completed" | "cancelled";

export interface OrderOperationsLine {
    id: number;
    product_id: number | null;
    variation_id: number | null;
    name: string;
    sku: string | null;
    quantity: number;
    fulfilled_quantity: number;
    remaining_quantity: number;
    delivered_quantity: number;
    returned_quantity: number;
    returnable_quantity: number;
}

export interface ShipmentEvent {
    id: number;
    shipment_id: number;
    status: ShipmentStatus;
    location: string | null;
    message: string | null;
    evidence: Record<string, unknown>;
    occurred_at: string;
    created_by_user_id: number | null;
}

export interface OrderShipment {
    id: number;
    fulfillment_id: number;
    status: ShipmentStatus;
    carrier: string | null;
    service: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    version: number;
    shipped_at: string | null;
    delivered_at: string | null;
    created_at: string;
    updated_at: string;
    events: ShipmentEvent[];
}

export interface OrderFulfillmentItem {
    id: number;
    fulfillment_id: number;
    order_line_item_id: number;
    quantity: number;
}

export interface OrderFulfillment {
    id: number;
    order_id: number;
    status: FulfillmentStatus;
    note: string | null;
    created_by_user_id: number | null;
    version: number;
    packed_at: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
    created_at: string;
    updated_at: string;
    items: OrderFulfillmentItem[];
    shipments: OrderShipment[];
}

export interface OrderReturnItem {
    id: number;
    return_id: number;
    order_line_item_id: number;
    requested_quantity: number;
    approved_quantity: number;
    received_quantity: number;
    damaged_quantity: number;
    restock_quantity: number;
    refund_amount_minor: number | null;
    reason: string | null;
}

export interface OrderReturn {
    id: number;
    order_id: number;
    status: ReturnStatus;
    reason: string | null;
    customer_note: string | null;
    internal_note: string | null;
    carrier: string | null;
    tracking_number: string | null;
    refund_id: number | null;
    created_by_user_id: number | null;
    approved_by_user_id: number | null;
    version: number;
    approved_at: string | null;
    received_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    created_at: string;
    updated_at: string;
    items: OrderReturnItem[];
}

export interface OrderOperations {
    order_id: number;
    order_status: string;
    lines: OrderOperationsLine[];
    fulfillments: OrderFulfillment[];
    returns: OrderReturn[];
}

export interface OrderOperationsSummary {
    paid_unfulfilled_over_24h: number;
    shipment_exceptions: number;
    returns_awaiting_approval: number;
    returns_awaiting_refund: number;
}

export interface ShippingZoneLocation {
    id: number;
    zone_id: number;
    type: "continent" | "country" | "state" | "postcode";
    code: string;
}

export interface ShippingMethodDefinition {
    id: number;
    code: string;
    title_default: string;
    description_default: string | null;
    settings_schema: Record<string, { type?: string; required?: boolean }>;
}

export interface ShippingZoneMethod {
    id: number;
    zone_id: number;
    method_id: number;
    method_code?: string;
    method_title_default?: string;
    method_description_default?: string | null;
    title_override: string | null;
    enabled: boolean;
    ordering: number;
    settings: Record<string, unknown>;
    settings_schema?: Record<string, { type?: string; required?: boolean }>;
}

export interface ShippingZone {
    id: number;
    name: string;
    is_fallback: boolean;
    locations: ShippingZoneLocation[];
    methods: ShippingZoneMethod[];
}

export interface TaxClass {
    id: number;
    slug: string;
    name: string;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface TaxRate {
    id: number;
    tax_class_id: number;
    tax_class_slug: string;
    tax_class_name: string;
    country: string | null;
    region_id: number | null;
    postcodes: string[];
    cities: string[];
    rate: number;
    label: string;
    priority: number;
    compound: boolean;
    applies_to_shipping: boolean;
    ordering: number;
}

export interface InventoryMovement {
    id: number;
    inventory_item_id: number;
    kind: "sale" | "return" | "restock" | "adjustment" | "reservation" | "release";
    quantity_delta: number;
    ref_kind: "order" | "refund" | "return" | "manual" | null;
    ref_id: number | null;
    occurred_at: string;
    notes: string | null;
}

export interface InventoryOperations {
    item: {
        id: number;
        product_id: number;
        variation_id: number | null;
        stock_quantity: number;
        stock_status: string;
        manage_stock: boolean;
        backorders: string;
        low_stock_threshold: number | null;
        product_slug: string | null;
        variation_sku: string | null;
    };
    movements: InventoryMovement[];
}
