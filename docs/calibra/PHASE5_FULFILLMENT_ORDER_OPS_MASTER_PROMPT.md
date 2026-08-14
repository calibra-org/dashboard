# Calibra Phase 5 — Fulfillment & Order Operations Master Handoff

Date: 2026-08-14
Repository: `calibra-org/dashboard`
Branch: `agent/phase5-fulfillment-order-ops-20260814`
Base: `main@77595a2f8948bbdbfd2b6e0ca1af5a17a16304c9`
Roadmap: `docs/calibra/ADMIN_OPERATIONS_ROADMAP_2026-08-14.md`

This file is the execution contract for Phase 5. Live repository state always outranks this document. Re-read root/app `AGENTS.md` and verify the branch/PR/CI before every release claim.

## Mission

Turn the already-built Calibra Orders, Inventory, Shipping, Tax, Revenue/Analytics, Refund, Factor and Ticket systems into one production-grade post-payment operations workflow without inventing parallel domains or a new top-level Admin menu.

An operator must be able to answer, from the existing areas of the Admin:

- what remains to be fulfilled on an order;
- what was packed/shipped/delivered, in which partial fulfillment, and with which tracking evidence;
- which shipment event happened when;
- whether inventory is available and which ledger movements explain stock changes;
- whether a return was requested/approved/received, which units are sellable/damaged, and whether a canonical refund was issued;
- which paid orders or returns need intervention;
- whether Shipping/Tax settings shown in the Admin are real persisted configuration rather than fixtures.

## Menu and information-architecture rule

Phase 5 must not add a new top-level Sidebar group or top-level menu item.

Place work only in existing destinations:

- Fulfillment / shipments / returns / order exceptions: **Orders** and order detail.
- Stock ledger / adjustment / risk visibility: existing **Analytics → Stock**, with product inventory links where useful.
- Shipping configuration: existing **Settings → Shipping**.
- Tax configuration: existing **Settings → Tax**.
- Revenue/order reporting: existing **Analytics** or **Reports**.
- Refund money movement: existing canonical `RefundService` / order refunds / Transaction Center.
- Support escalation: existing **Tickets**.

Do not create a second inventory, tax, shipping, refund, invoice, report, ticket or payment subsystem.

## Repository audit — 2026-08-14

### Orders — ALREADY COMPLETE FOUNDATION, OPERATIONS INCOMPLETE

Existing:

- TableView-backed Admin order list/counts/detail/create/update/delete/status/batch.
- Order state machine with legal transitions and stock side effects.
- Admin order detail with items, addresses, customer, refunds, notes/timeline, invoice/packing slip and shipping card.
- `POST /api/v1/admin/orders/:id/mark-shipped` saves carrier/tracking metadata and transitions `processing → completed`.

Gap:

- `mark-shipped` is a single order-level shipping blob; there is no line-aware full/partial fulfillment domain, shipment history, multiple packages, delivery lifecycle or shipment event ledger.
- `mark-shipped` notification is currently a structured-log stub.
- No first-class post-payment exception summary exists.

Decision: preserve endpoint compatibility, but make the new fulfillment domain the canonical operational history. Existing `mark-shipped` may become a compatibility wrapper that fulfills all remaining line quantities and creates one shipment when safe.

### Inventory — BACKEND COMPLETE FOUNDATION, ADMIN OPERATIONS INCOMPLETE

Existing:

- `inventory_items` + append-only `inventory_movements`.
- `InventoryService` owns reserve/release/decrement/increment with row locking and tenant transaction semantics.
- Movement kinds include sale, return, restock, adjustment, reservation, release.
- Existing Analytics → Stock report shows stock state and low-stock risk.

Critical Calibra invariant:

`InventoryService.reserve()` already reduces `stock_quantity` when checkout is finalized. A later fulfillment must **not decrement stock again**. Fulfillment quantity is an operational fact, not another stock mutation in Calibra's current accounting model.

Gap:

- no Admin movement-ledger view;
- no controlled manual adjustment action;
- no direct operational evidence showing why an item changed.

Decision: extend the existing Analytics → Stock surface with movement history and safe manual adjustment, reusing `InventoryService` as the only mutation path.

### Shipping settings — DOMAIN EXISTS, ADMIN IS FIXTURE-ONLY

Existing database/domain:

- `shipping_zones`
- `shipping_zone_locations`
- `shipping_methods`
- `shipping_zone_methods`
- `shipping_zone_match.ts`
- `shipping_rate_service.ts`
- shipping classes API
- tenant scoping/RLS applied by existing tenant migration.

Gap:

- `apps/admin/src/views/store-config/shipping/shipping-zones-view.tsx` reads fixture `SHIPPING_ZONES`.
- `shipping-methods-view.tsx` reads fixture `SHIPPING_METHODS`.
- no first-party Admin CRUD endpoints were found for zones, locations, method catalog/configuration or zone-method instances.

Decision: make the existing Settings → Shipping views real; do not add another page/category.

### Tax settings — TAX CLASS API EXISTS, UI + RATE API INCOMPLETE

Existing:

- tax classes/rates schemas and runtime tax calculation;
- real Admin tax-class CRUD under `/api/v1/admin/tax-classes`;
- tax report in Analytics → Taxes.

Gap:

- Tax Classes Admin view still reads a fixture even though a real API exists.
- Tax Rates Admin view is fixture-only.
- no first-party Admin Tax Rate CRUD controller was found.

Decision: wire existing Tax Classes UI to the existing API and add Tax Rate CRUD to the existing Settings → Tax surface.

### Revenue / reports — ALREADY REAL

Existing canonical report service calculates gross/net sales, returns, taxes, shipping and order/product/category/coupon/stock reporting from server-side data in canonical integer minor units. Phase 4 removed browser-side/fixture report regressions.

Decision: do not create a revenue subsystem. Only add fulfillment/return exception metrics where they answer a new operational question.

### Refunds — ALREADY CANONICAL

`RefundService` already owns:

- order distributed lock + DB `FOR UPDATE`;
- payload-bound idempotency;
- amount/line validation;
- optional restock through `InventoryService`;
- PSP refund hook + safe gateway evidence;
- status transition, internal note and post-commit event.

Decision: RMA must never create an independent financial refund record. A received return that needs money back calls `RefundService` with `restockRequested=false` if stock disposition was already handled by the RMA receipt.

### Returns/RMA — MISSING

No first-class Return/RMA domain was found.

Decision: add it inside existing Orders/order detail with requested → approved → received → completed/cancelled state, line quantities and inspected disposition.

### Notifications — PARTIAL / STUBBED FOR SHIPPING

Order shipping and resend-confirmation controller paths currently log intended notifications rather than proving delivery through a durable notification transport.

Decision: Phase 5 must first audit the repository's actual mail/queue primitives. If a real transport already exists, reuse it. If not, keep notification state truthful (`queued=false`/not configured) instead of claiming delivery; do not add a new dependency without approval.

## Primary-source design research

The implementation should borrow durable concepts, not copy another platform's internal model blindly.

### Shopify Admin GraphQL

Sources:

- https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrder
- https://shopify.dev/docs/api/admin-graphql/latest/objects/Fulfillment
- https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentEvent

Useful concepts:

- separate the **work to fulfill** from the **fulfillment/shipment record**;
- a single order may have multiple fulfillments/partial shipments;
- tracking belongs to shipment/fulfillment evidence, not a single mutable order blob;
- delivery milestones are an ordered event history with timestamp/status/location/message.

Calibra adaptation: keep one fulfillment aggregate per operator-created fulfillment and child shipment/events; infer remaining work from order line quantity minus non-cancelled fulfillment-item quantities instead of introducing Shopify's routing/location model before Calibra needs it.

### Medusa

Sources:

- https://docs.medusajs.com/user-guide/orders/fulfillments
- https://docs.medusajs.com/user-guide/orders/returns
- https://docs.medusajs.com/resources/commerce-modules/order/return
- https://docs.medusajs.com/resources/commerce-modules/inventory/inventory-in-flows

Useful concepts:

- full and partial fulfillments are first-class;
- fulfillment and shipment are separate lifecycle steps;
- return receipt records received quantity and damaged quantity;
- damaged items must not silently return to sellable inventory;
- returns connect operational receipt to financial refund rather than conflating both.

Calibra adaptation: because Calibra reserves by directly reducing stock, shipment must not decrement stock again. Only sellable received return quantity increments inventory.

### WooCommerce REST API

Sources:

- https://developer.woocommerce.com/docs/apis/rest-api/v3/shipping-zones/
- https://developer.woocommerce.com/docs/apis/rest-api/v3/shipping-zone-locations
- https://developer.woocommerce.com/docs/apis/rest-api/v3/shipping-zone-methods
- https://developer.woocommerce.com/docs/apis/rest-api/v3/taxes/

Useful concepts that already match Calibra's schema:

- shipping zones are CRUD resources;
- a zone owns locations and configured method instances;
- tax rates expose country/state/postcode/city, percentage, label, priority, compound and shipping applicability;
- the settings UI should manage those persisted resources directly.

Calibra adaptation: preserve Calibra's existing tenant RLS and `shipping_method.settings_schema` capability contract rather than importing WooCommerce APIs or code.

## Phase 5 domain design

### Fulfillment

Tables:

- `order_fulfillments`
- `order_fulfillment_items`
- `order_shipments`
- `order_shipment_events`

Fulfillment statuses:

- `pending`
- `packed`
- `shipped`
- `delivered`
- `cancelled`

Shipment statuses:

- `label_created`
- `in_transit`
- `out_for_delivery`
- `delivered`
- `exception`
- `returned`

Rules:

1. Every row is tenant-scoped at creation and protected by forced RLS.
2. Fulfillment line quantity must be positive and may never make the sum of non-cancelled fulfilled quantities exceed the original order-line quantity.
3. Creation/transition writes run under an order-scoped distributed lock + DB order row lock where the existing lock primitive is available.
4. Fulfillment mutation endpoints use payload-bound idempotency for creation and optimistic `version` guards for mutable state.
5. Shipment events are append-only evidence.
6. Shipment `delivered` is projection + event; it is never inferred merely because tracking exists.
7. Completing all fulfillment quantities may transition `processing → completed`; a partial shipment may not.
8. No fulfillment operation decrements stock under the current Calibra reserve accounting.
9. Cancelling an operational fulfillment must not restore stock by itself because order reservation/accounting is owned by the Order state machine. If order cancellation is desired, use the legal Order transition.

### Returns / RMA

Tables:

- `order_returns`
- `order_return_items`

Return statuses:

- `requested`
- `approved`
- `in_transit`
- `received`
- `completed`
- `cancelled`

Rules:

1. Requested/approved quantities cannot exceed the sold quantity minus previously completed/active non-cancelled return quantities.
2. `received_quantity <= approved_quantity`.
3. `damaged_quantity <= received_quantity`.
4. `restock_quantity <= received_quantity - damaged_quantity`.
5. Receiving a return is an inspected inventory operation. Only `restock_quantity` increments inventory through `InventoryService`.
6. Refund issuance is a separate explicit action that calls canonical `RefundService`; it never inserts a competing refund row.
7. If receipt already restocked sellable units, the refund call uses `restockRequested=false` to prevent a double increment.
8. Return-refund uses a stable idempotency key derived from return identity so an ambiguous retry cannot double-book a refund.
9. If the refund succeeds but attaching `refund_id` to the return fails, replay must resolve the same RefundService idempotency result and safely attach it.
10. Damage/reason/internal notes are operational evidence and must not expose provider secrets.

### Inventory operations

Add only to the existing inventory service/controller surface:

- list movement ledger for an inventory item;
- manual signed adjustment with reason and actor;
- useful stock risk metadata.

Rules:

- adjustment requires a non-empty operator reason;
- no direct `stock_quantity` update outside `InventoryService`;
- all writes are serialized with the inventory row lock;
- every adjustment appends movement evidence with `ref_kind=manual` and actor evidence in notes/metadata permitted by the existing schema.

Do not claim a mathematical ledger reconciliation against current stock unless a trustworthy opening-balance event exists. Existing historical inventory may predate movement history.

### Operational exceptions

Expose a compact Orders operations summary rather than a new menu:

- paid/processing order with no fulfillment after a configurable/default age;
- partially fulfilled order waiting beyond threshold;
- shipment with `exception` status;
- return awaiting approval;
- received return awaiting refund/completion;
- low/negative stock remains sourced from existing stock analytics.

Every count must be a backend query over canonical state, never client-derived from the first page of orders.

## Shipping settings contract

Add real Admin endpoints for the existing domain:

- list/create/read/update/delete shipping zones;
- replace/list zone locations;
- list available shipping method definitions;
- list/add/update/delete a zone's method instances;
- validate `settings` against each method's existing server-owned `settings_schema` at least for supported core method keys; never trust a client-supplied capability schema.

Fallback-zone uniqueness remains enforced by the database.

Admin UI requirements:

- existing Settings → Shipping routes only;
- real loading/error/empty/retry states;
- zone create/edit/delete;
- location type/code editor;
- zone method enable/order/title/settings editor;
- no fixture import;
- Persian-first next-intl copy and logical RTL.

## Tax settings contract

Add real Admin Tax Rate CRUD and wire existing Tax Class CRUD.

Tax-rate fields follow the existing schema:

- tax class
- country
- region
- postcode list
- city list
- rate decimal percentage
- label
- priority
- compound
- applies-to-shipping
- ordering

Rules:

- country is validated as blank/global or ISO-2 uppercase according to existing calculator semantics;
- rate stays decimal in tax configuration but all calculated money remains integer canonical minor units;
- no client-only tax arithmetic as source of truth;
- use existing tax calculator/runtime behavior rather than a new engine.

## API implementation standards

- AdonisJS 7 patterns already in repo.
- `auth` + `admin` middleware for every Admin endpoint.
- tenant context/RLS fail closed.
- TableView for new paginated Admin list endpoints.
- validators before service/controller mutation.
- transformers own response envelopes.
- no raw provider/secret leakage.
- use existing rate limiting where comparable Admin write endpoints already do.
- money is integer canonical minor units.
- comments are documentation comments; no explanatory `//` comments.

## Admin implementation standards

- Reuse `apiGet` / `apiMutate` same-origin proxy.
- React Query keys include tenant-relevant resource identity; financial/order/inventory operational state should refetch/invalidates aggressively rather than become stale truth.
- Use existing shadcn/panel primitives.
- Use next-intl; no local `{fa,en}` copy objects for new surfaces.
- Logical CSS properties for RTL.
- Loading/error/retry/empty/disabled states for every meaningful operation.
- Settle-then-persist for exploratory/toggle edits where repository rules require it.
- Keyboard/focus-visible semantics for operator actions.

## OpenAPI / SDK / generated artifacts

Phase 5 endpoints must be described by Admin OpenAPI and represented in `@calibra/sdk`.

Preferred release path in a runnable workspace:

1. edit authoritative OpenAPI source;
2. run official OpenAPI build/lint;
3. run official SDK codegen;
4. run schema/migration generation;
5. commit generated diffs;
6. run codegen drift checks.

If the available environment cannot execute official generators, do not claim they ran. A scoped generated projection/typed overlay may be used only as an explicit integration bridge, following the Phase 4 precedent, and must remain easy to compare/replace with official output later.

## Test matrix

### Shipping/tax settings

- non-admin denied;
- tenant A cannot read/write tenant B;
- zone fallback uniqueness;
- location replacement validation;
- method instance uniqueness and settings validation;
- tax class existing CRUD regression;
- tax-rate create/update/delete/list/filter;
- tax calculator consumes persisted rate as before;
- Admin UI no fixture imports.

### Fulfillment

- create full fulfillment;
- create partial fulfillment;
- two partial fulfillments sum exactly to sold quantity;
- over-fulfillment conflict;
- payload-bound idempotency replay and mismatch conflict;
- invalid order state denied;
- pack/ship/deliver legal transitions;
- multiple shipments/tracking events;
- shipment event append-only timeline;
- all lines fulfilled may complete a processing order;
- partial fulfillment must not complete order;
- fulfillment must not double-decrement inventory;
- tenant/auth/admin isolation;
- stale optimistic version conflict.

### Returns

- request/approve/receive normal return;
- over-return denied;
- damaged received quantity does not restock;
- sellable restock increments exactly once;
- refund uses RefundService and cannot double-book on retry;
- return refund never double-restocks;
- cancel legal transitions;
- tenant/auth/admin isolation;
- stale optimistic version conflict.

### Inventory operations

- ledger list tenant-scoped;
- manual positive and negative adjustment;
- reason required;
- backorder/insufficient-stock invariant remains intact;
- concurrent adjustment is serialized;
- Analytics → Stock invalidation after adjustment.

### Existing regressions

- checkout stock reservation;
- order cancellation release;
- payment callbacks/idempotency;
- refund/reconciliation;
- Factor;
- reports/taxes/shipping rate calculation;
- Tickets.

## 100-point release rubric

Phase 5 must score at least 99/100 **and** have no critical safety failure.

- Domain correctness / invariants: 20
- Tenant/auth/security: 15
- Concurrency/idempotency/version safety: 15
- Existing-system reuse / no duplicate subsystem: 10
- Admin UX / RTL / accessibility / responsive states: 10
- Shipping/Tax real-data completion: 10
- OpenAPI/SDK/schema synchronization: 8
- Automated tests/regression evidence: 8
- Runtime/browser evidence: 4

Scoring rules:

- Never award points for a test/build/runtime check that did not actually execute.
- Any cross-tenant leak, double-refund, double-restock, over-fulfillment, secret leak or unbounded duplicate mutation caps the score below release threshold.
- External GitHub Actions billing/runner allocation is not a code pass or code fail; record it separately.

## Execution order

1. Freeze roadmap/handoff documents; do not alter historical phase files.
2. Finish source audit for notification/mail, order relations, inventory movement UI and OpenAPI patterns.
3. Make Settings → Shipping real.
4. Make Settings → Tax real.
5. Add fulfillment DB/service/API/tests.
6. Add order-detail fulfillment/shipment UI and compatibility handling for `mark-shipped`.
7. Add RMA DB/service/API/tests and order-detail UI.
8. Add inventory movement/adjustment operations to Analytics → Stock.
9. Add Orders operational exception summary without a new menu.
10. Add truthful notification integration using existing transport if available.
11. Update OpenAPI/SDK/generated projections and release verifiers.
12. Run every available static/automated check; fix until no known deterministic defect remains.
13. Run full official codegen/test/build/runtime/browser matrix when an executable runner/workspace is available.
14. Score against the 100-point rubric. Continue until >=99/100 with actual evidence.
15. Create/update PR, inspect full diff and mergeability, merge normally to `main` only after release criteria are satisfied or the user explicitly accepts a clearly identified external gate limitation.
16. Verify `main` contains the final tree and record exact merge SHA.

## First unfinished action

Complete the remaining source audit, then implement the real Shipping and Tax settings APIs/UI first because those existing Admin pages currently present fixture-backed operational configuration. This removes false-state risk before introducing new fulfillment/RMA operations.