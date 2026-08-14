# Calibra Dashboard — Phase 1–4 Main Release Audit Runbook

Repository: `calibra-org/dashboard`  
Admin target: `http://localhost:3001`  
API target: AdonisJS admin API through the existing same-origin Admin proxy  
Release target: `main`  
Working branch at creation: `agent/payment-phase4-transaction-center`  
Historical PR: `#12`

This is the durable release-control prompt and checklist for taking Calibra Dashboard Phases 1–4 to `main`. It must be updated as facts change. Live GitHub state always outranks this document.

## Mission

Act as Calibra's senior release manager, staff frontend/backend engineer, payments engineer and QA owner. Finish, audit, verify and only then merge Phases 1–4 to `main`. The release is not complete because a page renders; every visible control must terminate in real behavior and every backend route must have a real caller or a deliberate documented purpose.

Never mark a gate green because code looks plausible. Green means the relevant command, API request or browser flow actually ran and passed in the target environment.

## Global non-negotiable rules

1. Read root `AGENTS.md` and the relevant workspace `AGENTS.md` before changing code.
2. Verify live `main`, active branch, PR, reviews, changed files, mergeability and CI before every release claim.
3. Never force-push over another contributor's work, bypass required checks, disable failing tests or merge with known blockers.
4. Do not add dependencies without explicit approval.
5. Reuse existing domain services, TableView, same-origin proxy, `@calibra/sdk`, `panel-kit`, audit and lock systems. Do not create parallel mock subsystems.
6. Persian is the default Admin locale and English is secondary. Use `next-intl`; no ordinary hard-coded bilingual UI copy.
7. RTL uses logical CSS utilities. Mobile, keyboard and focus-visible behavior are release requirements.
8. Financial values stay in canonical integer minor units until the formatting/UI edge.
9. Financial state is not treated as stale-cache truth. Payment/refund/reconciliation mutations require locking, idempotency where applicable and auditability.
10. Never expose payment credentials, idempotency secrets, internal auth tokens or unsafe raw secrets in UI/logs/API schemas.
11. Never claim runtime, screenshot, build, typecheck, lint, test, OpenAPI or SDK success unless it actually ran.
12. Every meaningful change updates the Calibra durable handoff with verified HEAD, changes, tests run, blockers and next unfinished action.

## Release workstreams

### Workstream 1 — Source-control baseline and release inventory

Verify and record:

- `main` HEAD and latest merged Phase 1–3 commits.
- active Phase 4 branch HEAD and compare against `main` (`ahead_by`, `behind_by`, merge base, conflicts).
- PR #12 state, draft/readiness, reviews, review threads, checks and annotations.
- exact changed files and unexpectedly large diffs.
- no unrelated generated/binary/noise changes.
- no direct writes to `main` until the full release gate is green.

Exit criterion: release branch is conflict-free, scoped, understood and no contributor work is being overwritten.

### Workstream 2 — Contract, API, database and generated-code audit

For every Admin feature in scope, trace this chain:

`Page → UI control → query/mutation hook → same-origin Admin proxy → API route → validator → controller → service/domain → model/table → auth/tenant policy → transformer → OpenAPI → SDK type → tests`

Check all of the following:

- registered Adonis routes exactly match Admin OpenAPI paths/methods.
- HEAD companions exist where repository conventions require them.
- validators reject unsupported query/body keys and enforce sane bounds.
- transformers own response shape; controllers do not leak credentials or internal-only fields.
- migrations are reversible and consistent with tenant/RLS conventions.
- generated DB schema is synchronized through the repository's official process.
- `docs/api/reference/openapi/admin.v1.yaml` registers every new operation.
- OpenAPI component schemas match runtime transformer envelopes.
- Admin SDK is regenerated with the official codegen and `codegen:check` has no drift.
- browser code does not call the Adonis origin directly.
- no API route exists as a fake stub while UI presents it as operational.

Exit criterion: route inventory, OpenAPI, SDK, DB schema and runtime response contracts agree.

### Workstream 3 — Admin shell, navigation, icons, i18n and accessibility

Audit every sidebar/header/deep link added or touched by Phases 1–4:

- every navigation href resolves to a real Next route.
- active-state matching does not collide with sibling routes.
- navigation changes are minimal; no large unrelated Sidebar refactor for a single item.
- every label uses `messages/fa.json` first and matching English key.
- all visible feature copy uses `useTranslations` unless it is data returned by the backend.
- every icon import resolves from the approved icon surface/package.
- decorative icons have `aria-hidden="true"`.
- icon-only buttons have accessible names.
- rows/cards that open details are keyboard reachable with Enter/Space or expose a proper button/link.
- focus-visible, Sheet/Dialog focus trapping, escape/close, loading/empty/error and disabled states work.
- RTL/LTR layout uses logical margins/paddings/borders and does not mirror semantic data incorrectly.

Exit criterion: no dead navigation, missing icon, hard-coded ordinary bilingual copy, inaccessible interactive row or RTL regression.

### Workstream 4 — Payments and Transactions (Phases 1–4)

Audit the entire payment path, not only `/transactions`:

#### Gateway catalog/admin
- gateway catalog rows, implementation status, health, enable/disable and credential validation.
- credentials encrypted at rest and masked in Admin responses.
- enabling a provider requires the real required credentials/verification rules.
- stub gateways cannot route customer money or be presented as live.
- disable blocks new init but does not strand historical callbacks/refunds.

#### Payment lifecycle
- init → redirect → callback parse → verify → order transition.
- callback/retry idempotency and order lock behavior.
- amount mismatch handling and observability.
- historical attempts remain immutable ledger evidence except defined lifecycle/projection fields.

#### Transaction Center
- KPI summary uses backend canonical data.
- search: attempt/order/authority/transaction/reference identifiers.
- filters: status, live gateway, date, canonical amount, reconciliation.
- backend sort/pagination and no frontend-only fake filtering.
- desktop table + mobile cards.
- detail Sheet: lifecycle, identifiers, PSP error, raw safe payload, order deep link.
- reconciliation: safe provider evidence only; unsupported providers return `unsupported`, not fabricated state.
- reconciliation history is immutable operator audit evidence.
- payment fact mutation invalidates stale reconciliation projection.
- refund is clearly order-level and reuses `RefundService`; selected historical attempt is not falsely promised as settlement source.
- refund prior history, outstanding amount, validation, idempotency, actor and audit are visible/traceable.

#### Reconciliation automation
- audit existing `payments:reconcile` command against the new per-attempt reconciliation service.
- avoid duplicate reconciliation algorithms. If safe, make background/CLI reconciliation reuse the same domain service.
- never replay a provider capture/settle sequence as a read-only status probe.

Exit criterion: all payment operations are real, safe, audited, tenant-scoped and tested.

### Workstream 5 — Reports, Factor, Content/Posts and SEO byte-level wiring audit

For every route under these surfaces, build a matrix with one row per page/control:

| Surface | Page/Route | Control | Hook | API route | Backend owner | DB/data source | Auth/Tenant | Loading/Error/Empty | Test | Runtime |
|---|---|---|---|---|---|---|---|---|---|---|

#### Reports
Check dashboard reports and analytics endpoints for real aggregation, date/range filters, currency semantics, pagination where applicable, empty datasets and export/download controls. Verify every report menu item resolves and every metric has a backend source.

#### Factor
Check documents, payments, reports, records and settings. Verify create/edit/delete/status actions, payment links, collection state, numbering/settings, deep links, validation, typed API contracts and tenant isolation. No display-only controls.

#### Content / Posts
Check posts, Market Radar, agents, studio, calendar, media, taxonomy, reports and settings. Every button/menu/action must either work end-to-end or be intentionally disabled/removed with no misleading affordance. Verify publishing/scheduling, resource lookup, editor actions and API error states.

#### SEO
Check overview/control tower/products/categories-links/images-alt/schema-preview/keywords-content/content-refresh/live-editor/market-radar/technical-health/crawl-monitoring/rank-tracking/competitors-serp/reports/settings. Verify each screen has a real data path, mutations are persisted, background-state controls report truthful status and no placeholder card is presented as a live capability.

Exit criterion: no dead page, dead button, missing API connection, fake metric, unresolved icon or orphan backend endpoint in the specified surfaces.

### Workstream 6 — Static quality gates

Run from the repository root with the pinned Node/pnpm versions:

1. install with frozen lockfile.
2. migration/schema synchronization as required by the repo.
3. OpenAPI lint and Admin spec bundle.
4. registered-route ↔ OpenAPI check.
5. SDK codegen and `codegen:check`.
6. formatter.
7. lint including Admin token lint.
8. typecheck.
9. focused frontend tests for touched features.
10. focused API tests for payments/reports/factor/content/SEO changes.
11. full frontend test set.
12. full API Japa suite/shards.
13. full monorepo test aggregation.
14. production build.

Any failure reopens the owning workstream. Do not change the test to hide a product bug.

Exit criterion: every static gate actually exits zero.

### Workstream 7 — Runtime/Admin:3001 and browser QA

Bring up the real stack with the repository-supported environment. Resolve tenant/shop selection before UI QA; do not accept `Unknown Shop` as a usable runtime.

Required browser smoke matrix for Persian and representative English checks:

- login/logout and authenticated shell.
- dashboard.
- orders and transaction center.
- payment gateway settings including credential error/success paths against safe test configuration.
- all Reports pages.
- Factor pages: documents, payments, reports, records, settings.
- Content pages: posts, market radar, agents, studio, calendar, media, taxonomy, reports, settings.
- all SEO pages in navigation.

For each page:

- HTTP/navigation success and no React/Next console error.
- no failed API request except deliberately tested failure states.
- loading → data/empty/error transitions.
- every primary button, menu, row action, filter, search, pagination, dialog/sheet and deep link.
- keyboard-only navigation for core workflows.
- 360–430px mobile, tablet and desktop widths.
- Persian RTL and English LTR.
- no clipped Sheet/Dialog/table, horizontal overflow regression or unreadable code/payload blocks.
- real screenshot evidence from the running Admin app for release-critical screens.

Exit criterion: runtime smoke is green on port 3001 and browser evidence exists.

### Workstream 8 — Release to main and post-merge verification

Only after Workstreams 1–7 are green:

- update the PR body with actual architecture and verification results.
- resolve all review threads.
- mark PR ready for review if still draft.
- verify branch is still current with `main` and required checks are green.
- merge through normal GitHub flow; no force/bypass.
- verify `main` contains the merged commit.
- run/observe post-merge CI on `main`.
- repeat minimal production-build/runtime smoke if release policy requires it.
- update durable handoff with final main SHA and release evidence.

Exit criterion: Phase 1–4 code is on `main`, post-merge checks are green and no known release blocker remains.

## Definition of a connected control

A control is connected only when all applicable links are verified:

1. visible UI element exists and is enabled only when action is valid.
2. event handler calls a typed query/mutation hook.
3. hook uses the approved proxy/client.
4. route exists with auth/admin middleware.
5. input is validated.
6. controller delegates to real domain logic rather than a mock response.
7. persistence/external call occurs safely.
8. response transformer/OpenAPI/SDK agree.
9. query invalidation/refetch makes the UI converge on server truth.
10. success and failure states are both tested.

## Icon audit definition

For every icon in the audited surfaces:

- import resolves in the Admin build.
- use the repository icon facade when required by local conventions.
- no duplicate visual control caused by both icon and text being independently clickable.
- decorative icon: `aria-hidden`.
- semantic icon: accessible text/label nearby.
- icon-only button: `aria-label` or equivalent accessible name.
- size aligns with the design system and does not cause layout shift.

## Current verified checkpoint at runbook creation — 13 Aug 2026

- `main` HEAD: `878103e7c2f9745eab3addd2386cf39a725b279c` (`feat(payments): harden Phase 3 payment lifecycle reliability`).
- Phase 4 branch HEAD before this runbook: `349adb309b7c1c961bbd5ddfedd5268c8dacfc2e`.
- PR #12: open, draft, mergeable, no reviews or review threads at the latest check.
- Phase 4 includes Transaction Center, real backend search/summary, reconciliation projection/audit, ZarinPal safe reconciliation, date/amount filters, responsive UI, and RefundService integration.
- Known unfinished contract gate: root Admin OpenAPI registration and official SDK/schema generation/verification must be completed and run.
- GitHub Actions is currently an external blocker: the latest jobs were assigned no runner (`steps: []`, `runner_id: 0`) and GitHub annotated failed account payments / spending limit. This is not a product-code green or red result because the jobs never executed.
- The current assistant environment has GitHub repository access but no connected Codespaces/runtime execution surface. Therefore Admin port 3001/runtime checks must remain unverified until a real runnable workspace is available.

## Exact prompt for continuation in any new Calibra chat

> Continue the Calibra Phase 1–4 main release in `calibra-org/dashboard`. Read root/relevant `AGENTS.md`, `docs/calibra/PHASE1_4_MAIN_RELEASE_AUDIT_RUNBOOK.md`, and `docs/calibra/PHASE4_TRANSACTION_CENTER_MASTER_PROMPT.md`. Do not restart completed work. First verify live `main`, current Phase 4/release branch, PR #12, compare/mergeability/reviews/checks/annotations. Then continue from the first unfinished workstream. For every audited page use `Page → control → hook → proxy → API route → validator → controller/service → DB → transformer → OpenAPI → SDK → test → runtime evidence`. Audit Reports, Payment Gateways/Transactions, SEO, Factor and Content/Posts including every icon/action. Reuse existing domain systems and never fabricate provider state, passing CI, runtime checks or screenshots. Do not merge to `main` until OpenAPI/SDK/schema sync, format/lint/typecheck/tests/build and real Admin:3001 browser QA are green. After each meaningful change, update the durable handoff with verified SHA, tests actually run, blockers and the next action.
