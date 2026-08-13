# Calibra Phase 1–4 Release Audit — Verified Checkpoint

Date: 2026-08-13  
Repository: `calibra-org/dashboard`  
Release target: `main`  
Working branch: `agent/payment-phase4-transaction-center`  
PR: `#12`

Read this after `PHASE1_4_MAIN_RELEASE_AUDIT_RUNBOOK.md`. Live GitHub state always outranks this checkpoint.

## What was completed in this audit pass

### Release control

- Added `docs/calibra/PHASE1_4_MAIN_RELEASE_AUDIT_RUNBOOK.md` with eight release workstreams and the required `Page → control → hook → proxy → API → validator → controller/service → DB → transformer → OpenAPI → SDK → test → runtime` trace.
- Added root `pnpm run verify:phase1-4` aggregating existing Factor/Content/SEO verifiers plus new Admin navigation, Reports, Payments Phase 4 and financial-invariant verifiers.
- Added a dedicated `phase1-4-integration` job to `.github/workflows/check.yml`.

### Reports defects fixed

1. `apps/admin/src/lib/queries/reports.ts` no longer builds the Sales report by downloading only the first 100 orders and aggregating in the browser. It now consumes canonical `GET /api/v1/admin/reports/sales-stats` data for gross/net sales, refunds, average order value, order count and daily series.
2. `/reports/top-sellers` no longer renders `getTopSellersFixture()`. `useTopSellersReport()` now consumes `GET /api/v1/admin/reports/top-products`, and the view has real loading/error/retry/empty behavior.
3. Added `scripts/verify-reports-integration.mjs` so the fixture, 100-order cap and hard-coded zero-refund regressions fail the release verifier.
4. Existing backend `apps/api/tests/functional/admin/analytics_reports.spec.ts` was inspected and already covers auth, report arithmetic, taxes/shipping, coupons, refunds, excluded statuses, comparison windows, invalid ranges, cache invalidation and report table endpoints with API-spec assertions. No duplicate report test suite was added.

### Financial-state hardening

- `useTransactionSummary()` now has `staleTime: 0`.
- `useFactorPaymentAttempts()` now has `staleTime: 0`.
- Added `scripts/verify-financial-invariants.mjs` to guard those freshness rules plus refund locking/idempotency and reconciliation audit behavior.
- `recordAudit()` now supports opt-in `strict: true`; existing callers remain best-effort by default.
- Payment reconciliation now uses `strict: true` inside the same tenant transaction as the attempt projection, so an audit persistence failure rolls back the reconciliation projection rather than committing an unaudited financial-control action.

### Navigation/icons release gate

- Added `scripts/verify-admin-navigation.mjs`.
- It checks every static Sidebar href resolves to a real authenticated Next page, Sidebar icons are imported through `#/icons` and exported by panel-kit, aliases such as `Tags as TagsIcon` are understood, navigation labels have matching `fa/en` `Nav` keys, and local bilingual Sidebar copy is forbidden.

### Phase 4 payment gate

- Added `scripts/verify-payments-phase4-integration.mjs`.
- It validates Phase 4 routes/auth, Transaction Center hooks, TableView filters, safe reconciliation invariants, locks, migration/model/transformer fields, RefundService reuse, OpenAPI root registrations, generated DB schema and SDK synchronization, and Phase 4 test coverage.
- The verifier is intentionally red until known generated/contract/i18n drift is actually fixed.

## Important audits completed without new fixes

### Content

`apps/admin/src/features/content/queries.ts` was traced. Post CRUD/transitions, attribution, taxonomy, sources/signals, agent runs/review/apply, reports/calendar/settings/resources use the approved same-origin `apiGet/apiMutate` layer and invalidate React Query state after writes. The existing `verify-content-integration.mjs` remains the deep release verifier.

### Factor

`apps/admin/src/features/factor/queries.ts` was traced. Documents, summary, detail, create/update/transition/convert, payment links, manual payments, reports/settings/resources and payment-attempts are connected through the approved Admin proxy. The financial stale-cache issue on payment attempts was fixed. Existing `verify-factor-integration.mjs` already validates routes, public payment flow, lifecycle invariants, migrations/RLS, payment reconciliation fallback, OpenAPI and tests.

### SEO

The full authenticated SEO route inventory exists for the Sidebar surfaces and `verify-seo-integration.mjs` already checks the 16 SEO modes, routes, sidebar ordering/collapse, real-data claims, migrations/RLS, service table connections, storefront wiring, OpenAPI and syntax/domain invariants. `verify-seo-search-engines.mjs` remains in the aggregate gate.

### Refund semantics

RefundService correctly books refunds under an order lock + DB `FOR UPDATE`, supports idempotency keys, validates outstanding/line quantities, records actor on the refund, writes an internal OrderNote in the transaction, calls PSP refund best-effort and stores the PSP outcome in `attributes.gateway_refund`. The Transaction Center copy correctly states that refund routing is order-level and the selected historical attempt may not be the settlement attempt.

A remaining operations UX issue is that previous-refund rows do not yet expose/display `attributes.gateway_refund`, so operators cannot directly distinguish a Calibra booking from a PSP settlement failure in Transaction Center. Do not solve this by returning an error after booking; that can create unsafe retries. Preferred future fix: add an admin-only refund transformer/envelope with safe gateway-refund outcome and render it explicitly.

## Known release blockers still open

### Blocker A — Admin OpenAPI root registration

`docs/api/reference/openapi/admin.v1.yaml` still needs root path registrations for:

- `/api/v1/admin/payment-attempts/summary`
- `/api/v1/admin/payment-attempts/{id}/reconciliation`
- `/api/v1/admin/payment-attempts/{id}/reconcile`

Operation fragment files already exist. This must be fixed before `check:api-docs` can be trusted.

### Blocker B — generated database schema

The reconciliation migration exists, but generated `apps/api/database/schema.ts` still lacks the new PaymentAttempt reconciliation columns. Run the repository's official migration/schema generation flow; do not hand-edit the generated file as final truth.

### Blocker C — generated Admin SDK

After Admin OpenAPI is fixed/bundled, run official SDK codegen. `packages/sdk/src/generated/admin.d.ts` must contain the new reconciliation/summary paths and schemas and `codegen:check` must pass.

### Blocker D — Transaction Center i18n + Sidebar scope

- `apps/admin/messages/fa.json` and `en.json` still lack `Nav.transactions` and a proper `Transactions` namespace.
- `transactions-center.tsx` still carries its bilingual COPY/status/reconciliation labels locally instead of using `next-intl` catalogs.
- Phase 4 Sidebar still contains a large unrelated refactor and local `{fa,en}` transaction label. Restore the `main` Sidebar structure and make the Phase 4 delta minimal: one `labelKey: "transactions"` item plus the translation keys.

### Blocker E — PSP refund outcome visibility

Admin Transaction Center previous-refund history currently shows booking amount/number but not safe PSP settlement outcome. Add an admin-only response shape and UI treatment without exposing secrets or turning a completed booking into an unsafe retry error.

### Blocker F — executable quality/runtime environment

The current assistant environment has private GitHub read/write access but no connected Codespaces/runtime terminal. It cannot honestly run pnpm, migrations, codegen, Japa/Vitest, production build, or Admin port 3001 browser QA.

GitHub Actions is also externally blocked. On commit `fdd8ff2a42b35a3597e5b40fc049c7cf76bae15f`, the new `phase1-4-integration` job and all other Check jobs had `steps: []`, `runner_id: 0`; GitHub annotated: recent account payments failed or Actions spending limit must be increased. This is not a code test result because no job step ran.

## First unfinished action in a runnable workspace

1. Checkout the current Phase 4 branch and verify it has not diverged from `main`.
2. Patch `admin.v1.yaml` root payment-attempt paths.
3. Run migrations / official schema generation and inspect the generated PaymentAttempt schema.
4. Run Admin SDK codegen and codegen check.
5. Restore Sidebar from `main` and add only the Transactions nav entry; add `Nav.transactions` and `Transactions` to `fa/en` messages; refactor Transaction Center to `useTranslations`.
6. Implement safe admin-only refund PSP-outcome projection/display.
7. Run `pnpm run verify:phase1-4`, format/lint/token lint, typecheck, focused tests, full tests, API docs sync, SDK sync and build.
8. Bring up the real stack, resolve tenant/shop selection, run Admin on port 3001 and perform the full Persian RTL/English LTR mobile/tablet/desktop browser matrix for Reports, Payments/Transactions, Factor, Content and SEO.
9. Capture real screenshots, update PR #12, mark ready only after all evidence is green, merge normally to `main`, and verify post-merge CI.

## Merge rule

Do not merge or write Phase 1–4 to `main` while any blocker above remains or any required gate is unexecuted. "Looks correct" is not a green release gate.
