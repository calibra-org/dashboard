# Phase 31 — Hyperlocal Promise & Fulfillment Network Optimizer — Conformance Posture

Phase 31 is a promise/allocation intelligence layer. It does **not** become the fulfillment, inventory, order, shipment, or shipping-rate source of truth.

## Canonical authority

- Sellable quantity remains `inventory_items` + `inventory_movements` and `InventoryService`.
- Shipping eligibility/cost remains `shipping_zones`, `shipping_zone_methods`, `shipping_methods`, `shipping_zone_match` and `shipping_rate_service`.
- Fulfillment execution remains Phase 5 `order_fulfillments`, `order_fulfillment_items`, `order_shipments`, `order_shipment_events`.
- A Phase 31 allocation row is a recommendation/evidence snapshot only. It cannot mark an order fulfilled or mutate shipment state.

## Promise safety invariants

1. A visible promise requires canonical inventory sufficient for every managed-stock line.
2. Every canonical inventory row used by the promise maps to exactly one active source node; Phase 31 stores no duplicate stock balance.
3. `inventory_items.updated_at` must be inside the node freshness budget. Stale/unknown stock returns no promise.
4. Shipping cost and eligibility come from the canonical rate resolver.
5. A service profile is not promise-eligible until its evidence sample floor is met and its calibration is not expired.
6. Pick/pack capacity must exist before a promise is emitted.
7. A selected quote is revalidated after Phase 20 checkout trust gates and before order finalization. Canonical stock reservation in the finalizer remains the race-safe last authority.
8. Promise quote expiry is bounded by both a short quote TTL and inventory freshness.
9. Customer address is not persisted by Phase 31 analytics; only a one-way destination fingerprint and coarse source-node metadata are stored.
10. Delivery outcomes come from canonical delivered shipment events and remain evidence, not carrier claims.

## Split shipments and transfers

Split shipment is permitted only when every source group independently has fresh canonical inventory, calibrated service evidence and capacity for the same eligible shipping method. Source nodes are recorded in the decision trace. Transfer lanes are configuration/evidence for optimizer expansion; a lane is never interpreted as inventory movement and cannot create stock at the destination.

## Checkout ordering

`Phase 20 reviewed trust guard → Phase 20 deterministic trust scorer → Phase 31 promise revalidation → canonical OrderFinalizer → Phase 31 promise evidence consumption`.

If no promise was selected, existing checkout remains available. Phase 31 must never globally block checkout merely because operators have not configured calibration data. If a promise **was** selected, stale inventory, expired calibration, cart/address/source drift, or an expired quote must fail closed and require a new quote.

## Accuracy

Predicted window versus actual delivery is measured from `order_shipment_events.status = delivered`. Phase 31 may report on-time rate and lateness distributions. It must not invent ETA confidence, transit statistics, carbon values, weather effects, or route performance without an explicit evidence source.
