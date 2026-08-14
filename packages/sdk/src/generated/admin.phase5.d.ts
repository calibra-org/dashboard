/**
 * Generated Admin Phase 5 operations overlay.
 * Source: docs/api/reference/openapi/admin.phase5.v1.yaml
 *
 * This scoped declaration is intentionally composable with the historical Admin contract until
 * the repository's official full OpenAPI generator can run in a healthy CI/workspace.
 */
export interface components {
    schemas: {
        FulfillmentStatus: "pending" | "packed" | "shipped" | "delivered" | "cancelled";
        ShipmentStatus: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "returned";
        ReturnStatus: "requested" | "approved" | "in_transit" | "received" | "completed" | "cancelled";
        OrderOperationsSummary: {
            paid_unfulfilled_over_24h: number;
            shipment_exceptions: number;
            returns_awaiting_approval: number;
            returns_awaiting_refund: number;
        };
        OrderOperationsSummaryEnvelope: { data: components["schemas"]["OrderOperationsSummary"] };
        FulfillmentItemInput: { order_line_item_id: number; quantity: number };
        CreateFulfillmentInput: { items: components["schemas"]["FulfillmentItemInput"][]; note?: string | null };
        FulfillmentTransitionInput: { status: components["schemas"]["FulfillmentStatus"]; expected_version: number };
        CreateShipmentInput: { carrier?: string | null; service?: string | null; tracking_number?: string | null; tracking_url?: string | null };
        ShipmentEventInput: {
            status: components["schemas"]["ShipmentStatus"];
            expected_version: number;
            occurred_at?: string;
            location?: string | null;
            message?: string | null;
            evidence?: Record<string, unknown>;
        };
        ReturnItemInput: { order_line_item_id: number; quantity: number; reason?: string | null; refund_amount_minor?: number | null };
        CreateReturnInput: {
            items: components["schemas"]["ReturnItemInput"][];
            reason?: string | null;
            customer_note?: string | null;
            internal_note?: string | null;
            carrier?: string | null;
            tracking_number?: string | null;
        };
        ApproveReturnInput: { expected_version: number; items: Array<{ order_line_item_id: number; approved_quantity: number }> };
        ReceiveReturnInput: { expected_version: number; items: Array<{ order_line_item_id: number; received_quantity: number; damaged_quantity: number; restock_quantity: number }> };
        ReturnTransitionInput: { status: components["schemas"]["ReturnStatus"]; expected_version: number };
        ReturnRefundInput: { expected_version: number; reason?: string | null };
        InventoryAdjustmentInput: { inventory_item_id: number; quantity_delta: number; reason: string };
        ShippingLocationWrite: { type: "continent" | "country" | "state" | "postcode"; code: string };
        ShippingZoneWrite: { name?: string; is_fallback?: boolean; locations?: components["schemas"]["ShippingLocationWrite"][] };
        ShippingLocationsWrite: { locations: components["schemas"]["ShippingLocationWrite"][] };
        ShippingZoneMethodWrite: { method_id?: number; title_override?: string | null; enabled?: boolean; ordering?: number; settings?: Record<string, unknown> };
        TaxRateWrite: {
            tax_class_id?: number;
            country?: string | null;
            region_id?: number | null;
            postcodes?: string[];
            cities?: string[];
            rate?: number;
            label?: string;
            priority?: number;
            compound?: boolean;
            applies_to_shipping?: boolean;
            ordering?: number;
        };
        OrderOperationsEnvelope: { data: Record<string, unknown> };
        FulfillmentEnvelope: { data: Record<string, unknown> };
        ShipmentEnvelope: { data: Record<string, unknown> };
        ShipmentEventEnvelope: { data: Record<string, unknown> };
        ReturnEnvelope: { data: Record<string, unknown> };
        InventoryOperationsEnvelope: { data: Record<string, unknown> };
        ShippingZonesEnvelope: { data: Record<string, unknown>[] };
        ShippingMethodsEnvelope: { data: Record<string, unknown>[] };
        TaxRatesEnvelope: { data: Record<string, unknown>[] };
    };
}

interface JsonResponse<T, Status extends number = 200> { content: { "application/json": T }; headers: Record<string, unknown>; status?: Status }
interface JsonBody<T> { content: { "application/json": T } }
interface IdPath { id: number }
interface OrderPath { orderId: number }

export interface operations {
    adminPhase5OrderOperationsSummary: { responses: { 200: JsonResponse<components["schemas"]["OrderOperationsSummaryEnvelope"]> } };
    adminPhase5OrderOperationsShow: { parameters: { path: OrderPath }; responses: { 200: JsonResponse<components["schemas"]["OrderOperationsEnvelope"]> } };
    adminPhase5FulfillmentCreate: { parameters: { path: OrderPath; header?: { "Idempotency-Key"?: string } }; requestBody: JsonBody<components["schemas"]["CreateFulfillmentInput"]>; responses: { 201: JsonResponse<components["schemas"]["FulfillmentEnvelope"], 201>; 409: unknown } };
    adminPhase5FulfillmentTransition: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["FulfillmentTransitionInput"]>; responses: { 200: JsonResponse<components["schemas"]["FulfillmentEnvelope"]>; 409: unknown } };
    adminPhase5ShipmentCreate: { parameters: { path: { fulfillmentId: number } }; requestBody: JsonBody<components["schemas"]["CreateShipmentInput"]>; responses: { 201: JsonResponse<components["schemas"]["ShipmentEnvelope"], 201> } };
    adminPhase5ShipmentEventCreate: { parameters: { path: { shipmentId: number } }; requestBody: JsonBody<components["schemas"]["ShipmentEventInput"]>; responses: { 201: JsonResponse<components["schemas"]["ShipmentEventEnvelope"], 201>; 409: unknown } };
    adminPhase5ReturnCreate: { parameters: { path: OrderPath; header?: { "Idempotency-Key"?: string } }; requestBody: JsonBody<components["schemas"]["CreateReturnInput"]>; responses: { 201: JsonResponse<components["schemas"]["ReturnEnvelope"], 201>; 409: unknown } };
    adminPhase5ReturnApprove: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ApproveReturnInput"]>; responses: { 200: JsonResponse<components["schemas"]["ReturnEnvelope"]> } };
    adminPhase5ReturnReceive: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ReceiveReturnInput"]>; responses: { 200: JsonResponse<components["schemas"]["ReturnEnvelope"]> } };
    adminPhase5ReturnTransition: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ReturnTransitionInput"]>; responses: { 200: JsonResponse<components["schemas"]["ReturnEnvelope"]> } };
    adminPhase5ReturnRefund: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ReturnRefundInput"]>; responses: { 200: JsonResponse<components["schemas"]["ReturnEnvelope"]> } };
    adminPhase5InventoryMovements: { parameters: { query: { inventory_item_id: number; limit?: number } }; responses: { 200: JsonResponse<components["schemas"]["InventoryOperationsEnvelope"]> } };
    adminPhase5InventoryAdjustment: { requestBody: JsonBody<components["schemas"]["InventoryAdjustmentInput"]>; responses: { 200: JsonResponse<components["schemas"]["InventoryOperationsEnvelope"]> } };
    adminPhase5ShippingZonesList: { responses: { 200: JsonResponse<components["schemas"]["ShippingZonesEnvelope"]> } };
    adminPhase5ShippingZoneCreate: { requestBody: JsonBody<components["schemas"]["ShippingZoneWrite"]>; responses: { 201: unknown } };
    adminPhase5ShippingZoneUpdate: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ShippingZoneWrite"]>; responses: { 200: unknown } };
    adminPhase5ShippingZoneDelete: { parameters: { path: IdPath }; responses: { 204: unknown } };
    adminPhase5ShippingZoneLocationsReplace: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["ShippingLocationsWrite"]>; responses: { 200: unknown } };
    adminPhase5ShippingMethodsList: { responses: { 200: JsonResponse<components["schemas"]["ShippingMethodsEnvelope"]> } };
    adminPhase5ShippingZoneMethodCreate: { parameters: { path: { zoneId: number } }; requestBody: JsonBody<components["schemas"]["ShippingZoneMethodWrite"]>; responses: { 201: unknown } };
    adminPhase5ShippingZoneMethodUpdate: { parameters: { path: { zoneId: number; id: number } }; requestBody: JsonBody<components["schemas"]["ShippingZoneMethodWrite"]>; responses: { 200: unknown } };
    adminPhase5ShippingZoneMethodDelete: { parameters: { path: { zoneId: number; id: number } }; responses: { 204: unknown } };
    adminPhase5TaxRatesList: { responses: { 200: JsonResponse<components["schemas"]["TaxRatesEnvelope"]> } };
    adminPhase5TaxRateCreate: { requestBody: JsonBody<components["schemas"]["TaxRateWrite"]>; responses: { 201: unknown } };
    adminPhase5TaxRateUpdate: { parameters: { path: IdPath }; requestBody: JsonBody<components["schemas"]["TaxRateWrite"]>; responses: { 200: unknown } };
    adminPhase5TaxRateDelete: { parameters: { path: IdPath }; responses: { 204: unknown } };
}

export interface paths {
    "/api/v1/admin/orders/operations/summary": { get: operations["adminPhase5OrderOperationsSummary"] };
    "/api/v1/admin/orders/{orderId}/operations": { get: operations["adminPhase5OrderOperationsShow"] };
    "/api/v1/admin/orders/{orderId}/fulfillments": { post: operations["adminPhase5FulfillmentCreate"] };
    "/api/v1/admin/fulfillments/{id}/transition": { post: operations["adminPhase5FulfillmentTransition"] };
    "/api/v1/admin/fulfillments/{fulfillmentId}/shipments": { post: operations["adminPhase5ShipmentCreate"] };
    "/api/v1/admin/shipments/{shipmentId}/events": { post: operations["adminPhase5ShipmentEventCreate"] };
    "/api/v1/admin/orders/{orderId}/returns": { post: operations["adminPhase5ReturnCreate"] };
    "/api/v1/admin/returns/{id}/approve": { post: operations["adminPhase5ReturnApprove"] };
    "/api/v1/admin/returns/{id}/receive": { post: operations["adminPhase5ReturnReceive"] };
    "/api/v1/admin/returns/{id}/transition": { post: operations["adminPhase5ReturnTransition"] };
    "/api/v1/admin/returns/{id}/refund": { post: operations["adminPhase5ReturnRefund"] };
    "/api/v1/admin/inventory/movements": { get: operations["adminPhase5InventoryMovements"] };
    "/api/v1/admin/inventory/adjustments": { post: operations["adminPhase5InventoryAdjustment"] };
    "/api/v1/admin/shipping/zones": { get: operations["adminPhase5ShippingZonesList"]; post: operations["adminPhase5ShippingZoneCreate"] };
    "/api/v1/admin/shipping/zones/{id}": { patch: operations["adminPhase5ShippingZoneUpdate"]; delete: operations["adminPhase5ShippingZoneDelete"] };
    "/api/v1/admin/shipping/zones/{id}/locations": { put: operations["adminPhase5ShippingZoneLocationsReplace"] };
    "/api/v1/admin/shipping/methods": { get: operations["adminPhase5ShippingMethodsList"] };
    "/api/v1/admin/shipping/zones/{zoneId}/methods": { post: operations["adminPhase5ShippingZoneMethodCreate"] };
    "/api/v1/admin/shipping/zones/{zoneId}/methods/{id}": { patch: operations["adminPhase5ShippingZoneMethodUpdate"]; delete: operations["adminPhase5ShippingZoneMethodDelete"] };
    "/api/v1/admin/tax/rates": { get: operations["adminPhase5TaxRatesList"]; post: operations["adminPhase5TaxRateCreate"] };
    "/api/v1/admin/tax/rates/{id}": { patch: operations["adminPhase5TaxRateUpdate"]; delete: operations["adminPhase5TaxRateDelete"] };
}
