# Phase 16 — Product Discovery, Search & Opportunity Intelligence

## Authority boundary

Phase 16 owns on-site query intelligence, search retrieval/ranking policy, deterministic merchandising, product compatibility edges, and evidence-backed assortment opportunities. It does **not** become a second authority for Catalog, customer identity, recommendations, inventory, procurement, or pricing.

## Runtime architecture

`Storefront query -> normalize/redact -> Meilisearch tenant+locale projection -> PostgreSQL fallback -> canonical Product hydration -> hard eligibility -> merchandising -> response -> outcome events -> opportunity detection`

### Safety invariants

- Catalog/PostgreSQL is canonical; the search index is a projection.
- Search falls back to PostgreSQL when Meilisearch is not configured or unavailable.
- Candidate IDs are re-hydrated from PostgreSQL before response, preventing stale/unpublished/hidden indexed rows from being served.
- Search analytics masks email/mobile/long numeric identifiers and hashes session keys before persistence.
- Public analytics ingestion has an idempotent tenant+event UUID key and does not accept arbitrary metadata or caller-supplied customer IDs.
- Compatibility is tri-state (`compatible`, `not_compatible`, `unknown`); absence of a positive edge is never interpreted as compatible.
- Every Phase 16 table is tenant-scoped with `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- Merchandising only exposes implemented v1 actions: `boost`, `bury`, `pin`, `hide`.
- Search policies are versioned; activation/rollback is serialized with a tenant-scoped transaction advisory lock.
- Opportunity detection differentiates a missing product from a relevance/index gap by re-running canonical retrieval.

## Admin information architecture

One collapsible workspace under Sales, after SEO and before Support:

1. مرکز فرمان کشف
2. هوش جست‌وجو
3. بدون نتیجه‌ها
4. شبیه‌ساز جست‌وجو
5. Merchandising
6. سازگاری محصولات
7. فرصت‌های محصول
8. حاکمیت و تنظیمات

The workspace is sectioned into analysis, presentation control, knowledge/opportunity, and system governance. It does not create eight new top-level sidebar entries.

## UI contract

- Persian RTL by default; English is secondary.
- Panel Kit / shadcn primitives and existing design tokens only.
- Logical spacing classes only (`ms/me/ps/pe`, not direction-specific physical spacing).
- Every specialized card/field/table header carries an accessible `HelperTooltip` (`i`) that explains purpose and semantics.
- No fake AI confidence score, fake revenue, mock runtime data, dead toggle, or icon-only action without accessible naming.
- Empty/loading/error/degraded states are explicit.

## Search indexing

Indexes are split by tenant and locale: `calibra_products_<tenant>_fa` and `calibra_products_<tenant>_en`.

Rebuild uses a temporary index, waits for asynchronous Meilisearch tasks, then swaps indexes when a canonical index exists. Cleanup is best-effort. First build creates the canonical index directly after preparing the temporary projection. Product cache invalidation is reused as the catalog-write projection seam; errors from the external search projection never break the canonical catalog write, and canonical re-hydration protects storefront truth until the next rebuild.

## Data model

- `discovery_search_events`
- `discovery_synonym_rules`
- `discovery_search_policies`
- `discovery_search_policy_versions`
- `discovery_merchandising_rules`
- `discovery_product_relationships`
- `discovery_opportunities`
- `discovery_opportunity_evidence`

## Release gate

Before merge:

- migrations + generated schema committed on the finalized source branch
- OpenAPI merge + lint
- SDK codegen + sync check
- API typecheck
- Admin typecheck/build
- Phase 16 unit tests
- existing RLS audit tests
- repository Biome formatting normalized on the finalized source branch
- `git diff --check`
- no prototype assets or previous Phase 16 mock UI

## Projection reliability hardening

Catalog writes enqueue a tenant-scoped `discovery_index_operations` ledger row before queue dispatch. The worker is replay-safe, records attempts, retry eligibility, terminal success and dead-letter failure. Meilisearch asynchronous tasks are considered successful only when their terminal status is explicitly `succeeded`; `failed` and `canceled` are not treated as success. Admin index health reports configured/reachable separately, queue state and last successful projection; authorized operators can retry failed operations or run a full rebuild. PostgreSQL remains canonical throughout degraded operation.
