# Calibra Admin Operations Roadmap — Current Checkpoint

Date: 2026-08-14
Repository: `calibra-org/dashboard`
Base at checkpoint: `main@77595a2f8948bbdbfd2b6e0ca1af5a17a16304c9`

## Preservation rule

This is a new, append-only roadmap for the Admin operations program. It does not replace, rewrite, renumber, or reinterpret the historical backend implementation roadmap under `docs/phases/*`, nor the existing Phase 1–4 release/audit documents under `docs/calibra/*`.

The older backend roadmap remains authoritative for its original backend slices. This document records the newer Admin/payment/operations program that was completed afterward and defines its next phase.

## Completed program

### Phase 1 — Payment Gateway Control Center — CLOSED

Landed capabilities include:

- Admin payment-gateway configuration surface inside the existing Settings area.
- Curated online/offline gateway catalog with capability-aware configuration.
- Encrypted merchant credentials with masked Admin reads.
- Real adapters for reviewed providers, fail-closed stubs for providers without sufficient official integration evidence, and offline methods kept distinct from PSP adapters.
- Provider-aware credential validation, connection-health projection, checkout ordering, activation/deactivation controls, and safe redirect handling.
- Storefront/Admin API + OpenAPI/SDK wiring and regression coverage.

Principal landed work includes PR #9 and its follow-up hardening.

### Phase 2 — Verified Gateway Activation and Operational Hardening — CLOSED

Landed capabilities include:

- Real provider-backed activation checks for implemented online gateways.
- Anti-fake activation gate: an online gateway cannot become enabled merely because credentials were typed into the UI.
- Health status and last-verification evidence without returning stored secrets.
- Provider/network rejection recorded as bounded operational evidence.
- Offline payment methods verified locally and unsupported/stub gateways kept locked.
- Admin audit coverage for verification and enable/disable actions.
- Subsequent Phase 2 implementation steps landed on the same payment foundation and are present on `main`.

Principal landed work includes PR #10 and follow-up commits now contained by `main`.

### Phase 3 — Payment Lifecycle Reliability — CLOSED

Landed capabilities include:

- Payment-init idempotency and same-order serialization.
- Duplicate live-session protection and non-payable-order guards.
- Callback replay protection and callback-ledger identity rules.
- Safe public callback errors while preserving private provider/DB diagnostics server-side.
- Callback/refund distributed locking plus DB row locking.
- Late successful callback recovery for recoverable order states.
- Replay/change detection and payment lifecycle regression coverage.

Merged through PR #11.

### Phase 4 — Transaction Operations Center — CLOSED

Landed capabilities include:

- Real `/transactions` operations workbench with backend search/filter/sort/pagination and responsive Admin UI.
- Live transaction KPIs and attempt detail surfaces.
- Provider-safe reconciliation state/evidence/history with order-scoped locking and immutable audit records.
- Refund workflow reuse through the canonical `RefundService`, authoritative outstanding-balance checks, and payload-bound idempotency.
- Safe gateway-refund outcome projection.
- Reports hardening, including canonical backend sales data and inclusive date-only end ranges.
- next-intl navigation/content integration.
- Payment reconciliation generated schema projection and typed Phase 4 Admin SDK overlay consumed through the composed Admin contract.

Merged through PR #12. Merge commit: `5b04ca0f62bba814b225ca3f8b5e0220a3aada34`.

### Ticket Operations Center — CLOSED

Landed capabilities include:

- Tenant-scoped ticket queue, detail, conversation, replies, internal notes, assignment, customer resources, settings, SLA KPIs and trends.
- Backend storage/API with tenant RLS, per-tenant numbering, optimistic-version guards, legal status transitions, write limiting and TableView queue filtering.
- Literal operator search, explicit-unassigned semantics, settle-mutation rollback safety, RTL-aware navigation and next-intl catalogs.
- Typed Tickets OpenAPI overlay and generated `admin.tickets.d.ts` composed with Core + Payment Phase 4 in the Admin SDK.
- Functional coverage for authentication/authorization, creation/search/detail, SLA, defaults, concurrency and TableView grammar.

Merged through PR #13. Merge commit: `77595a2f8948bbdbfd2b6e0ca1af5a17a16304c9`.

## Existing systems that Phase 5 must extend rather than duplicate

The following capabilities already exist on `main` and must be audited before any new Phase 5 surface is introduced:

- Orders and order state machine.
- Product inventory items, inventory movements and `InventoryService`.
- Tax classes/rates and tax calculation.
- Revenue/order/product/category/coupon/tax/stock analytics.
- Shipping zones, shipping methods, shipping classes and shipping-rate matching.
- Settings navigation with existing Tax, Shipping and Payment sections.
- Order-detail shipping capture with tracking number/carrier and a `mark-shipped` API.
- Refunds, notes, order status history and Transaction Center financial operations.
- Factor/invoice domain, Tickets, Content and SEO.

Phase 5 must complete or extend these existing systems in their current menu/category. It must not create a parallel inventory, tax, shipping, revenue, order, refund or settings subsystem.

## Phase 5 — Fulfillment & Order Operations — IN PROGRESS

### Mission

Complete the post-payment operational lifecycle inside the existing Orders, Analytics and Settings surfaces: allocation/reservation visibility, fulfillment, partial shipment, tracking, delivery evidence, exception handling, returns/RMA and inventory reconciliation. Reuse the canonical Order, Inventory, Shipping, Refund, Factor, Ticket and audit systems.

### Placement rule

No new top-level Sidebar group or menu is allowed for Phase 5.

- Fulfillment, shipment, return/RMA and order exceptions belong under the existing **Orders** experience.
- Inventory reconciliation/availability belongs in the existing **Products / Inventory-adjacent** and **Analytics → Stock** surfaces, extending what is already present.
- Shipping configuration belongs in **Settings → Shipping**.
- Tax-related gaps belong in **Settings → Tax** and **Analytics → Taxes**.
- Revenue/order operational reporting belongs in the existing **Analytics** or **Reports** surfaces.
- Refund settlement remains in the canonical Refund/Transaction workflow.
- Customer-service escalation links into existing **Tickets** rather than adding a support subsystem.

### Workstreams

1. Order Operations Center hardening and fulfillment summary.
2. Fulfillment domain with full/partial fulfillment and idempotent line allocation.
3. Shipment lifecycle and tracking history, extending existing `mark-shipped` behavior rather than replacing it.
4. Inventory reservation/release/reconciliation visibility using `InventoryService` as the only stock mutation path.
5. Returns/RMA lifecycle with inspected disposition and safe handoff to `RefundService`/restock.
6. Operational exceptions/SLA for paid-not-fulfilled, stale fulfillment, inventory mismatch, return awaiting action and delivery issues.
7. Shipping-settings completion where current Shipping UI is fixture-only or contract-incomplete.
8. Tax/inventory/revenue/order surfaces audited and completed only where a real gap exists.
9. Customer notifications and immutable operator audit for fulfillment/shipment/return events, reusing existing mail/event infrastructure where available.
10. OpenAPI/SDK/codegen, migration/schema generation, verification scripts, tests, runtime QA and release evidence.

### Phase 5 release gate

Phase 5 is not Closed until all of the following are true in a runnable environment:

- Fresh migrations/schema generation complete without generated drift.
- Admin OpenAPI build/lint and official SDK codegen are synchronized.
- Format/lint/typecheck pass.
- Focused Admin/API tests and the full relevant regression suite pass.
- Existing payment/refund/order/inventory/shipping/tax/report behavior remains green.
- Real Admin runtime QA covers Persian RTL + English LTR, mobile/tablet/desktop, loading/error/empty/permission/concurrency paths.
- Accessibility checks cover keyboard/focus/action semantics for fulfillment and return workflows.
- No fixture/mock is presented as real operational state.
- A final self-audit scores the implementation at least 99/100 against the Phase 5 quality rubric documented in the Phase 5 master handoff.

## Current first action

Audit the current Admin/API/DB/OpenAPI/SDK surfaces for Orders, Inventory, Shipping, Tax, Analytics/Revenue, Refunds and notifications. For each Phase 5 workstream classify every requirement as `already complete`, `exists but incomplete`, or `missing`; then research primary-source patterns from leading commerce/fulfillment systems before writing the Phase 5 master implementation prompt and code.

---

## Phase 5 implementation checkpoint — appended 2026-08-14

The first-action audit above has now been performed against the current Phase 5 branch. This section is intentionally appended; no historical roadmap text above is rewritten.

### Audit result

- **Orders:** existing order CRUD/state machine/history were reused. Phase 5 adds line-aware full/partial fulfillment, shipment lifecycle, tracking evidence, operational summary and RMA inside the existing Orders experience.
- **Inventory:** existing `InventoryService`, inventory items and immutable movement ledger were reused. Phase 5 adds Admin movement visibility and reasoned manual adjustment without creating a second stock engine. Fulfillment does not decrement stock a second time because checkout reservation already owns that mutation.
- **Shipping:** existing zones, methods and checkout rate matcher were present. The previously incomplete Admin settings surface is now backed by persisted zone/location/method CRUD in Settings → Shipping; configuration writes invalidate the tenant shipping-rate cache.
- **Tax:** existing classes, rates and calculator were present. The Admin settings gap is filled with persisted class/rate management in Settings → Tax; no parallel tax engine was created.
- **Revenue / reports:** existing revenue and reports remain authoritative. Phase 5 does not create a new revenue subsystem.
- **Refunds:** canonical `RefundService` remains the only financial refund engine. RMA receipt/restock is separated from financial refund and the RMA refund handoff derives money from immutable order-line snapshots when the operator has not supplied a lower explicit amount.
- **Tickets:** the existing Ticket Operations Center remains the escalation/support system; Phase 5 does not add a support menu.
- **Navigation:** no new top-level menu was introduced. New controls stay under Orders, Analytics → Stock, Settings → Shipping and Settings → Tax.

### Integrity hardening completed during implementation audit

- Phase 5 Admin mutation endpoints now use the existing `adminWriteLimiter` rather than introducing an unbounded write surface.
- Processing-order cancellation is blocked while non-cancelled fulfillment activity exists, preventing blanket stock restoration after fulfillment has begun.
- Return creation is bounded by delivered quantity. Historical completed/refunded orders with no fulfillment ledger retain a compatibility path so pre-Phase-5 deliveries can still be returned.
- RMA refund defaults are server-derived from persisted order-line totals/tax; client UI is not treated as a source of money truth.
- Shipping configuration mutations invalidate the existing tenant shipping-rate cache.
- Existing Shipping zone-method assignments can now be removed from the existing Settings → Shipping editor, closing the CRUD gap without adding a new page group.

### Remaining release work

Phase 5 remains **IN PROGRESS** until executable evidence exists for the release gate above. The GitHub-hosted workflow attempts observed for this branch have failed before runner steps execute under the repository/org runner allocation/billing condition; that infrastructure state is neither a code-test failure nor green evidence. The branch must remain unmerged until format/lint/typecheck/build, focused API/Admin tests, migration/codegen drift checks, runtime smoke, RTL/LTR visual QA and the final evidence-based 99/100 audit have actually executed.

---

## Phase 5 hardening checkpoint — appended 2026-08-14

A second append-only audit pass found and closed additional integration and edge-case gaps without changing the menu architecture or creating parallel subsystems.

### Cross-layer correctness added

- The existing Admin same-origin proxy now forwards `Idempotency-Key` on mutation requests. Phase 5 browser retries therefore reach the API with the stable logical-operation key produced by the existing React Query mutation layer instead of silently losing that safety boundary at the proxy.
- New and legacy shipment tracking URLs are restricted to explicit `http`/`https` protocols before they can be persisted or rendered as external Admin links.
- Phase 5 quantity and identifier validators remain integer-bounded; fractional fulfillment quantities are rejected before domain allocation logic.

### RMA policy hardening added

- The current v1 RMA state machine has no partially-received status, so final receipt now requires every approved line and approved unit to be accounted for before moving the return to `received`. This prevents approved units from becoming stranded in a terminal physical-receipt step.
- An explicitly requested zero refund is no longer interpreted as “use the default full line value.” Zero remains zero and the refund action rejects it as non-positive, preventing a surprising financial escalation.
- When an operator intentionally chooses a lower positive RMA refund than the full line value, the tax component is reduced proportionally rather than retaining the full default tax allocation.
- Dedicated functional hardening coverage was added for fractional fulfillment rejection, non-web tracking URLs, complete final RMA receipt coverage and explicit-zero refund behavior.
- The Phase 5 static verifier now checks the Admin proxy idempotency boundary, URL-protocol restriction, final-receipt invariant and new hardening regression source.

### Release status after this checkpoint

Phase 5 is still **IN PROGRESS**. Source-level hardening is ahead of the executable release evidence because GitHub-hosted runners are still failing before job steps execute. No 99/100 release claim and no merge are allowed until the existing release gate actually runs successfully.
