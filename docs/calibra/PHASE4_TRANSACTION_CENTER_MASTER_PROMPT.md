# Calibra Phase 4 — Transaction Center Master Handoff

Repository: `calibra-org/dashboard`  
Route: `/transactions`  
Historical branch: `agent/payment-phase4-transaction-center`  
Historical PR: `#12`

This file is durable project memory. Never trust it instead of live GitHub state: verify `main`, the feature branch, PR, changed files, mergeability, reviews and CI before making repository claims.

## Mission

Build a production payment operations center, not a mock dashboard. Every control must terminate in real backend/domain behavior with admin auth, tenant isolation, validation, failure/loading/empty states, RTL, responsive behavior and auditability.

Operators must be able to answer which payment attempt succeeded/failed/is pending, which order and gateway own it, its authority/reference IDs, provider error/payload, whether Calibra agrees with provider evidence, and who reconciled/refunded it and when.

## Non-negotiable rules

1. Read root `AGENTS.md` and relevant app `AGENTS.md` before changing code.
2. Reuse existing primitives/services; do not create parallel payment/refund/audit systems.
3. Keep money in integer canonical minor units until formatting at the UI edge.
4. Payment attempts/refunds are financial state; never cache them as stale truth.
5. Transaction endpoints remain behind API authentication plus admin middleware.
6. Tenant isolation/RLS stays fail-closed.
7. Never expose credentials or idempotency secrets.
8. Never fake CI, runtime tests, provider responses or screenshots.
9. Do not bypass required checks or force merge.

## Existing systems Phase 4 reuses

- `payment_attempts` is the canonical per-attempt ledger.
- TableView owns `filter[]`, `filterOr[]`, `sort[]`, `page`, `limit`.
- Date filtering uses `dateFilterValueToTableViewFilter`; Jalali/Gregorian UI becomes UTC TableView bounds.
- Amount filtering uses `amount_minor` gte/lte.
- Refunds reuse `RefundService` and the existing admin order-refund endpoint. RefundService already has order locking, `FOR UPDATE`, idempotency, amount/line validation, restock, provider hook, order transition, evidence and internal note.
- Operator history reuses `admin_audit_log` / `recordAudit()`.

## Reconciliation design

Reconciliation is provider-evidence-driven, never inferred from UI state.

- Adapters may expose optional `reconcile()` only when the provider offers an idempotent/read-like check that cannot create a second capture/settlement.
- Providers without a safe probe are recorded as `unsupported`; Calibra must not invent provider state.
- Projection: `unchecked | matched | mismatch | unsupported | error`.
- Provider state: `pending | verified | failed | cancelled | refunded | unknown`.
- Every check updates the latest attempt projection and appends immutable `payment.reconciliation.checked` audit evidence with actor/time/IP.
- Reconcile serializes on the existing order lock so callback/refund/reconcile work cannot race.
- ZarinPal is the initial safe implementation because existing verify behavior treats 100/101 as successful/idempotent evidence. Do not replay Mellat `verify + settle` as an operator poll without separate safe provider documentation.
- ZarinPal verify does not provide an independent provider-reported amount in the current adapter; do not falsely treat the request amount as external amount evidence.
- Any later mutation of payment facts (`status`, transaction id, amount) invalidates a prior reconciliation projection back to `unchecked`.

## Transaction Center definition

The workbench includes KPI cards, backend search, status/live-gateway/reconciliation filters, Jalali/Gregorian date filter, canonical amount range, backend sorting/pagination, responsive desktop table and mobile cards, detail Sheet, lifecycle/identifiers/errors/raw payload, provider reconciliation action/evidence/history, order deep-link, and order-level RefundService workflow with prior refund history.

Accessibility requirements: keyboard-reachable transaction details, focus-visible state, semantic action labels, aria-hidden decorative icons, labelled copy buttons and Sheet focus handling.

## Refund semantics

Refund is an **order-level** operation. `PaymentService.refund` chooses the latest verified attempt for that order. The historical attempt currently open in Transaction Center is not necessarily the attempt used for provider settlement. UI copy must state that and must not claim provider refund capability from the selected historical row.

## Contract/test requirements

Admin OpenAPI must describe list search/filter fields, reconciliation fields, summary, reconciliation history and reconcile operation. Then regenerate Admin SDK types with the repository's official codegen; do not hand-maintain generated types as final truth.

Minimum coverage: authority/order search, amount filter/sort, KPI aggregation, admin-only access, ZarinPal matched reconciliation, transaction-id mismatch, unsupported provider, audit actor/history, refund regression, existing payment lifecycle regression.

## Final verification gate

Phase 4 is **not Closed** until all actually pass: OpenAPI lint/build, SDK codegen sync, typecheck, formatting/lint, frontend tests, API tests, build, runtime admin login/tenant resolution, browser QA for `/transactions`, keyboard/a11y/RTL/responsive audit, and a real screenshot from the running Admin app. Only then mark PR ready and merge without bypassing failures.

## Historical external blocker

On 12–13 Aug 2026, GitHub-hosted Actions for PR #12 were never assigned a runner (`steps: []`, `runner_id: 0`). GitHub annotated that recent account payments had failed or the Actions spending limit needed to be increased. Treat this only as historical context; re-check latest runs every time.

## Current verified checkpoint — 2026-08-13

### GitHub state

- PR `#12` is Open, Draft and currently mergeable.
- Base: `main` at `878103e7c2f9745eab3addd2386cf39a725b279c`.
- Phase 4 branch verified at `ab32ce5de48f1c0abfb9d9fc59734935b4d8061f` before this checkpoint commit.
- Main feature implementation commit: `d219769cdb0dad6d0a99aa0c8e83439f4a2dbb33` (`feat(payments): complete transaction operations center`).

### Implemented on the Phase 4 branch

- Provider-safe reconciliation contract on payment adapters.
- ZarinPal reconciliation using the existing idempotent verify semantics; no fake provider amount evidence.
- Current reconciliation projection on `payment_attempts` plus invalidation when payment facts change.
- Order-scoped reconciliation locking and DB row lock.
- Immutable reconciliation history through the existing `admin_audit_log` surface.
- Admin list search, reconciliation filters, status/reconciliation KPI aggregation and detail/history/reconcile endpoints.
- Admin refund creation now appends `order.refund.created` to admin audit log while preserving existing `RefundService` behavior.
- Transaction Center now has live gateway filtering, status/reconciliation filters, Jalali/Gregorian date filter, min/max canonical minor-unit amount filters, backend sort/pagination, mobile cards, keyboard-accessible rows, focus-visible states, accessible copy actions, reconciliation evidence/history/action and order-level refund UI.
- Functional test source expanded for search, amount filters/sort, KPI/reconciliation aggregate, matched/mismatch/unsupported reconciliation, audit history/actor and non-admin denial.
- OpenAPI component/list fragments updated; new summary, reconcile and reconciliation-history operation fragments created.

### OpenAPI commits after the main feature commit

- `d3e50d2bc3ba9dcf183acc7e42031f7574ee17ff` — reconciliation fields on `AdminPaymentAttempt`.
- `67c22d0eabc4f2df5b2b0d8aa3160dd5eee045a0` — transaction-center list/search/filter contract.
- `ad73b16e2e441fd2eaa30bab9b5c3da5b72b2ac6` — summary operation fragment.
- `2a3fc1ee6a7e6c9d4163916a402c986ec224b3a7` — reconcile operation fragment.
- `ab32ce5de48f1c0abfb9d9fc59734935b4d8061f` — reconciliation-history operation fragment.

### Verification truth

- Authored TypeScript/TSX files received syntax/transpile checks with the available global TypeScript compiler; no syntax diagnostics were observed in those checks.
- This is **not** a full repository typecheck, build or test run.
- No API/frontend test suite has actually executed in this environment.
- No migration has actually run against Postgres in this environment.
- No runtime browser verification or real application screenshot has been produced in this checkpoint.
- Never convert the above syntax checks into a claim that Phase 4 passed quality gates.

### Latest CI blocker re-verified on the new feature commit

The Check workflow for `d219769c…` created all expected jobs, including `format-lint`, `build`, `typecheck`, `test-frontend`, API test shards, `api-docs-sync`, `sdk-codegen-sync` and aggregate `test`; every job had zero executed steps and `runner_id: 0`. GitHub's annotation again stated that the job was not started because recent account payments had failed or the spending limit needed to be increased. This is an external Billing/Actions allocation blocker, not evidence that the code passed or failed its actual commands.

### Known unfinished Phase 4 gates

1. `docs/api/reference/openapi/admin.v1.yaml` still needs root path references for:
   - `GET /api/v1/admin/payment-attempts/summary`
   - `GET /api/v1/admin/payment-attempts/{id}/reconciliation`
   - `POST /api/v1/admin/payment-attempts/{id}/reconcile`
   The operation fragments already exist. Do not truncate or replace the large root file unsafely; patch it in a real workspace.
2. Regenerate `packages/sdk/src/generated/admin.d.ts` with the repository's official OpenAPI codegen after the root spec is patched, then migrate Transaction Center wire types toward `AdminSchemas` where appropriate.
3. Move Transaction Center local bilingual copy into Admin `messages/fa.json` and `messages/en.json`; add `Nav.transactions` and simplify Sidebar to a minimal navigation diff instead of retaining the broad Phase 4 sidebar refactor.
4. Run migration/schema generation and verify the reconciliation columns/FK/index in Postgres.
5. Run official OpenAPI lint/build and route synchronization checks.
6. Run full format/lint/typecheck/frontend/API tests/build once a real workspace/runner is available.
7. Runtime QA: admin login + tenant resolution, `/transactions`, search/filters/sort/pagination/drawer/reconcile/refund/order navigation/error/empty/loading, RTL/LTR, mobile/desktop, keyboard/focus/accessibility.
8. Capture a real screenshot from the running Admin app.
9. Re-audit PR; only then mark Ready and merge without bypassing required checks.

### First unfinished action

Patch the three missing payment-attempt paths into `docs/api/reference/openapi/admin.v1.yaml` in a real repository workspace, run official OpenAPI build/codegen, and commit the generated SDK diff. After that, perform the i18n/sidebar hardening before final CI/runtime QA.

## Exact startup prompt for a new chat/agent

> Continue Calibra Phase 4 Transaction Center in `calibra-org/dashboard`. Read root `AGENTS.md`, relevant app `AGENTS.md`, and `docs/calibra/PHASE4_TRANSACTION_CENTER_MASTER_PROMPT.md`. Do not restart Phases 1–3. First verify live GitHub state: `main` HEAD, active Phase 4 branch, PR #12 if it still exists, compare ahead/behind, changed files, mergeability, reviews, workflow runs/jobs/annotations/checks. Inspect the current diff and continue from the first unfinished Phase 4 requirement. Reuse TableView, RefundService and `admin_audit_log`; do not create parallel mock systems. Never claim test/build/runtime/screenshot success unless it actually ran. Finish OpenAPI/SDK sync, tests, CI, runtime/browser QA, real screenshot and merge in that order, and write every durable architectural decision and actual verification result back into this handoff.

## Memory discipline

After each meaningful Calibra change, update this handoff (or a linked status file) with verified HEAD/PR state, implemented behavior/source files, architectural decisions, tests that actually ran, blockers, and the first unfinished action. Repository handoff is durable cross-chat memory; conversation memory is supplemental only.
