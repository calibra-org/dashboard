# Phase 34 — lite cash

## Mission
Build **lite cash** as Calibra's first-class cache, delivery, optimization and performance-control workspace. The visible product name is exactly **lite cash**. Do not ship `LiteSpeed`, `LiteSpeed Cache`, `Lite Cache`, `Cache OS`, `Calibra Cache`, `Performance Cache`, or any other product title in the product UI.

The goal is not to clone a WordPress plugin. The goal is to take the strongest proven ideas from mature caching, CDN and web-performance systems and implement a safer, more observable, tenant-aware control plane that fits Calibra's existing Next.js + AdonisJS + Bentocache + Redis architecture.

## Research baseline
Use the current official behavior of these systems as product research only, never copy their code or branding into the UI:

- LiteSpeed Cache for WordPress: page cache controls, TTL, purge-by-scope, ESI/object cache concepts, crawler/preload, database tools, image/page optimization, toolbox/report/debug flows, heartbeat controls and environment reporting.
- WP Rocket: preload, Remove Unused CSS, JavaScript delay/defer, critical-image/LCP treatment, CDN integration and asynchronous optimization jobs.
- FlyingPress: browser-rendered preload analysis, automatic cache refresh, separate cache dimensions, unused-CSS generation, interaction-delayed scripts, lazy rendering, image/font optimization and Core Web Vitals tracking.
- Cloudflare: Cache Rules, custom cache keys, purge by URL/tag/hostname/prefix, Tiered Cache, persistent reserve concepts, origin shielding, Early Hints/priority delivery, cache analytics and speculative navigation.
- QUIC.cloud: CDN-backed page cache, image optimization, WebP/AVIF, Critical CSS, Unique CSS, LQIP and viewport-image detection.
- Redis/object-cache tooling: connection health, persistent object cache, hit/miss ratios, key namespaces, TTL visibility and safe flush boundaries.

## Existing Calibra truth
Do not invent a second cache engine.

Calibra already uses `@adonisjs/cache` / Bentocache with:

- in-process L1 memory cache;
- Redis L2 in production;
- Redis bus invalidation across API/worker replicas;
- global defaults of 5m TTL, 24h grace, 30s grace backoff, 200ms soft timeout and 2s hard timeout;
- tenant-prefixed keys/tags in `apps/api/app/services/cache_keys.ts`;
- domain invalidation in `cache_invalidation.ts`;
- Prometheus cache hit/miss/invalidate metrics;
- a Grafana cache-and-queue dashboard.

Phase 34 extends and governs this architecture. It does not replace it and does not add a dependency.

## Senior-engineering safety boundary
1. Never expose Redis passwords, CDN API tokens, origin credentials or environment secrets in the browser, API responses, logs, exports or database rows.
2. Never allow arbitrary Redis commands, shell execution, arbitrary HTTP fetches, arbitrary file paths, wildcard SQL, direct `.htaccess` editing or arbitrary code execution from this workspace.
3. Never implement cross-tenant `flushall`, `flushdb`, global cache clear or wildcard key deletion. Every purge must resolve to an allow-listed tenant-scoped tag set.
4. Full-tenant purge is a controlled blast-radius action, not a routine button. It requires explicit reason, recent identity step-up, admin permission, rate limiting and immutable audit evidence.
5. Correctness-sensitive surfaces remain non-cacheable. Never add cart, inventory stock state, order/payment/refund state, authenticated account data, customer notes/timeline or other financial/legal state to a cache policy merely to improve hit rate.
6. Cache-key variation must be explicit. Locale, tenant and any configured dimensions that can change response bytes must be represented; do not permit a policy that can collapse user-private or tenant-private variants.
7. `grace`/stale serving is an availability feature, never a license to serve stale stock, price, payment or order state.
8. Optimization features are governed configuration artifacts for trusted storefront/build/CDN adapters. Do not execute arbitrary transformation source from the admin request path.
9. Telemetry is evidence only. Never fabricate hit rate, Core Web Vitals, CDN state, warm progress, bytes saved or origin savings.
10. Same-value settings and policy writes are no-ops to prevent history/audit pollution.

## Architecture
Use the existing stack only.

- Admin: Next.js 16 App Router, React, TypeScript, Tailwind v4, shadcn New York primitives, TanStack Query, Persian-first RTL.
- API: AdonisJS 7 TypeScript ESM, PostgreSQL 17, VineJS, `@adonisjs/cache`, tenant context, admin write limiter, identity step-up, strict admin audit log.
- Cache runtime: existing Bentocache L1/L2/bus; no replacement cache package.
- API docs: Phase 34 OpenAPI overlay merged into canonical admin contract and generated SDK.
- CI: dedicated `Phase 34 lite cash Integrity` workflow plus all normal repository gates.

## Product shape
Route: `/lite-cash`

Main menu label: **lite cash** only.

The workspace is a dense premium operator surface, not a long WordPress settings form. Use cards, status matrices, compact tables, explicit health states, progressive disclosure and safe action drawers/dialogs. Persian is the default content language while the title stays exactly `lite cash`.

### Tabs
1. **Overview**
   - topology card: active driver, L1, L2, bus and tenant namespace;
   - KPIs: configured policies, enabled policies, observation samples, hit rate, miss rate, stale rate, p95 origin/cache latency when evidence exists;
   - risk banner for debug mode, broad stale policy or disabled cache;
   - policy health matrix by kind;
   - recent purge events;
   - recent warm jobs;
   - optimization profile summary;
   - evidence freshness timestamp and explicit `No evidence` state.

2. **Cache policies**
   - searchable/filterable inventory;
   - policy kinds: `api | page | asset | query`;
   - controlled route/resource pattern;
   - TTL, grace, stale-if-error, soft/hard timeout metadata;
   - cache tags;
   - vary dimensions;
   - risk tier;
   - enabled/disabled lifecycle;
   - immutable version number and updated actor/time;
   - policy validator that blocks unsafe private/correctness-sensitive patterns.

3. **Purge center**
   - safe presets backed by the existing `CacheTags` registry;
   - tenant catalog products, product-by-id, taxonomy, categories, shipping zones, settings group, currency, storefront tenant, admin reports, admin customers, customer-by-id, regional data and controlled full-tenant broad-tag purge;
   - dry run before execution;
   - resolved tags shown before confirmation;
   - reason required;
   - idempotency key;
   - full-tenant purge requires step-up;
   - immutable event history with status and blast radius;
   - never expose arbitrary key deletion.

4. **Warm / preload**
   - create governed warm plans, never arbitrary URLs;
   - scopes: `catalog | taxonomy | storefront | reports | custom_registered`;
   - strategy: `cold_fill | refresh | verify`;
   - priority and bounded concurrency;
   - deterministic plan JSON and fingerprint;
   - queued/running/succeeded/partial/failed/cancelled lifecycle;
   - Phase 34 records work plans/evidence; a trusted worker/adapter performs actual origin requests when wired;
   - no fake progress. Progress changes only from trusted observation API.

5. **Optimization**
   - versioned profiles: `safe | balanced | aggressive | custom`;
   - CSS: minify, critical-CSS mode, remove-unused-CSS mode, async CSS, exclusions;
   - JavaScript: minify, defer, interaction-delay, exclusions;
   - images: lazy load, LCP exclusion/priority, responsive sizing, WebP/AVIF preference, placeholder strategy;
   - fonts: preload, self-host preference, swap strategy, preconnect;
   - navigation: conservative speculation/prefetch setting;
   - edge: early hints and cache-control profile metadata;
   - all advanced knobs include compatibility warnings and safe defaults;
   - profile activation creates a versioned snapshot and audit evidence.

6. **Edge & object cache**
   - runtime topology and driver state;
   - provider-neutral edge adapter status: `none | cloudflare | quic | custom` is metadata only;
   - no provider secrets in database;
   - object-cache mode and L1/L2 intent;
   - cache-key variation guidance;
   - origin shielding/tiered-cache intent metadata;
   - purge capabilities matrix;
   - readiness checks based on trusted observations, not assumptions.

7. **Diagnostics**
   - environment report with only non-secret fields;
   - cache runtime configuration summary;
   - registered tag/purge matrix;
   - observation log with source, metric, unit, labels and time;
   - debug mode toggle with expiry timestamp, not an indefinite boolean;
   - debug mode never lowers auth/tenant boundaries;
   - import/export of Phase 34 configuration only, never secrets;
   - snapshot fingerprint and diff-ready JSON.

8. **Settings**
   - master enable;
   - default TTL/grace/stale-if-error;
   - max policy TTL;
   - max warm concurrency;
   - broad purge requires step-up;
   - debug mode expiry;
   - default optimization profile;
   - default edge provider metadata;
   - same-value PATCH is a no-op;
   - settings changes are audit logged.

## Domain model
All Phase 34 tables are tenant-isolated with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.

### `lite_cash_settings`
One row per tenant.
- id, tenant_id
- enabled
- default_ttl_seconds
- default_grace_seconds
- default_stale_if_error_seconds
- max_policy_ttl_seconds
- max_warm_concurrency
- broad_purge_requires_step_up
- debug_until nullable timestamptz
- default_profile: `safe | balanced | aggressive | custom`
- edge_provider: `none | cloudflare | quic | custom`
- updated_by_user_id, timestamps

### `lite_cash_policies`
- id, tenant_id, public_id
- policy_key unique per tenant
- name, description
- kind: `api | page | asset | query`
- route_pattern
- status: `enabled | disabled | archived`
- risk_tier: `low | medium | high | critical`
- ttl_seconds, grace_seconds, stale_if_error_seconds
- soft_timeout_ms, hard_timeout_ms
- tags JSONB
- vary JSONB
- conditions JSONB
- version
- validation JSONB
- created_by_user_id, updated_by_user_id, timestamps

### `lite_cash_purge_events`
Immutable purge evidence.
- id, tenant_id, public_id
- scope, target
- mode: `dry_run | execute`
- status: `planned | succeeded | failed | rejected`
- resolved_tags JSONB
- blast_radius: `narrow | medium | broad`
- idempotency_key unique per tenant
- reason
- actor_user_id
- evidence JSONB
- created_at/completed_at

### `lite_cash_warm_jobs`
- id, tenant_id, public_id
- scope
- target_key
- strategy: `cold_fill | refresh | verify`
- status: `queued | running | succeeded | partial | failed | cancelled`
- priority: `low | normal | high`
- concurrency
- plan JSONB
- plan_sha256
- discovered_count, processed_count, success_count, failure_count
- actor_user_id
- started_at/completed_at/timestamps

### `lite_cash_optimization_profiles`
- id, tenant_id, public_id
- profile_key unique per tenant
- name
- mode: `safe | balanced | aggressive | custom`
- status: `draft | active | archived`
- css JSONB
- javascript JSONB
- images JSONB
- fonts JSONB
- navigation JSONB
- edge JSONB
- version
- fingerprint_sha256
- created_by_user_id, updated_by_user_id, timestamps

Only one active optimization profile per tenant is allowed by service invariant.

### `lite_cash_observations`
Trusted telemetry evidence.
- id, tenant_id
- source: `api | redis | edge | storefront | synthetic | worker`
- metric_key
- value numeric nullable
- unit
- outcome nullable
- labels JSONB
- request_id nullable
- observed_at
- index by tenant/metric/time and tenant/source/time

### `lite_cash_snapshots`
Immutable configuration snapshots for export/audit/rollback reference.
- id, tenant_id, public_id
- snapshot_kind: `manual | profile_activation | settings_change | import`
- document JSONB
- fingerprint_sha256
- reason
- actor_user_id
- created_at

## Cache policy validation
Validation must be deterministic and explainable. Return `valid`, `publishable`, `errors`, `warnings`, normalized policy and fingerprint.

Reject:
- empty/unknown route patterns;
- patterns matching carts, checkout mutation surfaces, inventory stock state, orders, payment attempts, refunds, authenticated account/customer notes/timeline;
- TTL <= 0 or above tenant maximum;
- negative grace/stale windows/timeouts;
- hard timeout below soft timeout;
- user/session/auth/cookie variation values that attempt to make private responses broadly shareable;
- missing tenant/locale variation when required by managed pattern type;
- unregistered tags;
- wildcard/global tags;
- empty reasoning for high/critical-risk activation.

Warn:
- grace greater than TTL by large multiples;
- long TTL on rapidly changing catalog/listing resources;
- aggressive optimization profile settings;
- excessive vary dimensions that destroy hit rate;
- debug mode enabled;
- broad purge plan.

## Registered purge scopes
Use existing builders from `CacheTags`; never duplicate tag string logic.

- `catalog_products`
- `product` with numeric id
- `catalog_categories`
- `catalog_taxonomy`
- `shipping_zones`
- `settings_group` with controlled group slug
- `currency`
- `storefront_tenant`
- `admin_reports`
- `admin_customers`
- `customer` with numeric id
- `regional_provinces`
- `full_tenant` resolving only to the known broad tenant tags

A full-tenant purge must never touch `CacheTags.tenants` because that registry is global.

## Permissions
- `lite_cash.view`
- `lite_cash.policy.manage`
- `lite_cash.purge.execute`
- `lite_cash.purge.broad`
- `lite_cash.warm.manage`
- `lite_cash.profile.manage`
- `lite_cash.settings.manage`
- `lite_cash.observation.write`
- `lite_cash.snapshot.manage`

Admin is the baseline principal; explicit denied `admin_permissions` rows win.

## API contract
All routes live under `/api/v1/admin/lite-cash`, require API auth + admin middleware, and every mutation uses `adminWriteLimiter`.

### Read
- `GET /overview`
- `GET /topology`
- `GET /policies`
- `GET /policies/:publicId`
- `GET /purges`
- `GET /warm-jobs`
- `GET /warm-jobs/:publicId`
- `GET /profiles`
- `GET /profiles/:publicId`
- `GET /observations`
- `GET /settings`
- `GET /snapshots`
- `GET /export`
- `GET /registry/purge-scopes`

### Mutations
- `POST /policies`
- `PATCH /policies/:publicId`
- `POST /policies/:publicId/validate`
- `POST /purge/plan`
- `POST /purge/execute`
- `POST /warm-jobs`
- `POST /warm-jobs/:publicId/cancel`
- `POST /warm-jobs/:publicId/observe`
- `POST /profiles`
- `PATCH /profiles/:publicId`
- `POST /profiles/:publicId/activate`
- `POST /observations`
- `PATCH /settings`
- `POST /snapshots`
- `POST /import/validate`
- `POST /import/apply`

## API behavior and idempotency
- Purge execution requires an idempotency key; duplicate retries return the original event.
- Warm-job creation fingerprints its plan and supports retry-safe idempotency.
- Observation writes are trusted/capability-gated and never accepted from anonymous storefront clients.
- Broad purge and optimization-profile activation require recent identity step-up.
- Settings/profile/policy mutations use same-value no-op behavior.
- Import validates the full document first, creates a snapshot, then applies in one tenant transaction. Never partially apply a configuration import.

## Runtime topology endpoint
Return only safe facts:
- cache driver (`memory` or `redis`);
- L1 enabled yes/no;
- L2 enabled yes/no;
- bus enabled yes/no;
- tenant namespace sample format, never real secret/key contents;
- default TTL/grace/timeout values documented by Phase 34 settings and static runtime baseline;
- registered purge scope count;
- last trusted observation time.

Do not return Redis host, port, username, password, TLS secrets or internal service URLs.

## Optimization profiles
Profiles are configuration artifacts for trusted adapters. Phase 34 does not perform arbitrary HTML/CSS/JS rewriting inside the Adonis admin request.

Safe defaults:
- CSS minify on; critical/unused CSS off until a trusted analyzer exists;
- JS minify on, defer on, interaction-delay off;
- lazy-load non-critical images on, never lazy-load explicit LCP candidates;
- WebP/AVIF preference enabled as intent, actual generation requires trusted media adapter;
- font-display swap intent on, preload only discovered/declared critical fonts;
- conservative speculation/prefetch only;
- Early Hints intent may be enabled but requires an edge adapter to report applied evidence.

## UI requirements
- Title: `lite cash` only.
- RTL-first and responsive down to operator tablet widths.
- No horizontal page overflow; dense tables may use contained overflow regions.
- Token-only styling: no raw hex/HSL/RGB and no hardcoded named Tailwind colors.
- Use existing panel primitives (`PageHeader`, Card, Button, Input, Textarea, Select, Switch, Badge, Table where appropriate).
- Every async card has loading, empty, error and stale/evidence-age states.
- Every destructive action states blast radius before execution.
- Purge buttons cannot execute directly from Overview; they open/route to a plan flow.
- Broad purge uses a danger confirmation phrase and step-up.
- Debug mode shows an expiry countdown, not a permanent green switch.
- Metrics with no evidence render `—`, never zero.
- All write actions explain whether they change live runtime immediately, create a plan, or only change an adapter profile.

## Pixel-level composition
- 12-column responsive grid on desktop, single-column stack on narrow screens.
- Header contains product title, runtime health badge, evidence freshness, primary `Purge plan` and secondary `Warm plan` actions.
- KPI cards use consistent heights and numeric tabular figures.
- Status chips use semantic tokens only.
- Overview topology diagram uses compact connected cards, not decorative canvas.
- Tables use sticky headers inside their own scrolling surface when rows exceed the viewport.
- Long JSON/evidence appears in monospaced contained panels with wrapping and copy control.
- Forms keep labels and controls aligned in RTL using logical spacing.
- No empty white expanses like legacy WordPress settings pages; information density should match current Calibra analytics screens.

## Diagnostics and observability
- Integrate with existing cache metric conventions rather than building a parallel metric stack.
- Trusted observations can ingest aggregate evidence from API/Redis/edge/storefront/worker adapters.
- Overview computes hit/miss/stale ratios only when relevant observation rows exist.
- Keep observation retention bounded at query level; UI defaults to recent samples.
- Debug mode is time-boxed and never turns off auth, RLS, rate limits or validation.
- Environment report redacts anything whose key suggests secret/token/password/key/dsn/url with credentials.

## Import/export
Export only Phase 34 configuration tables:
- settings;
- policies;
- optimization profiles;
- no purges, warm-job execution history or raw observations by default;
- no secrets.

Document envelope:
```json
{
  "schema": "calibra.lite-cash.v1",
  "exported_at": "ISO-8601",
  "settings": {},
  "policies": [],
  "profiles": []
}
```

Import validation checks schema version, limits, enums, unsafe policies, duplicate keys and profile uniqueness before any write.

## Tests
At minimum add Japa unit coverage for:
- registered purge scope resolution is tenant-scoped;
- full-tenant purge never includes global tenant registry tag;
- product/customer scoped purge requires numeric id;
- unsafe policy patterns are rejected;
- safe catalog policy validates;
- excessive TTL is rejected against settings;
- hard timeout < soft timeout is rejected;
- duplicate policy tags/vary dimensions normalize deterministically;
- profile fingerprint is stable for equivalent JSON order;
- import rejects unknown schema and unsafe policies;
- overview ratio helpers return null without evidence and correct values with evidence.

Dedicated Phase 34 integrity verifier must assert:
- migration tables + FORCE RLS;
- no secret columns;
- permissions exist;
- every mutation route uses adminWriteLimiter;
- broad purge controller path requires step-up;
- service uses `CacheTags` builders and never Redis `flushall`/`flushdb` or wildcard delete;
- Sidebar contains exactly `lite cash` and `/lite-cash`;
- admin page and query boundary exist;
- token-only UI;
- Phase 34 OpenAPI overlay is merged into canonical admin build;
- generated SDK contains `adminLiteCashOverview` and `/api/v1/admin/lite-cash/overview`;
- master prompt and conformance posture exist.

## Integration steps
1. Read repo-wide `AGENTS.md`, `apps/api/AGENTS.md`, `apps/admin/AGENTS.md` and current cache implementation.
2. Research current official LiteSpeed, WP Rocket, FlyingPress, Cloudflare, QUIC.cloud and Redis cache-management capabilities.
3. Create Phase 34 branch from current `main` only after Phase 33 is merged.
4. Add Phase 34 master prompt and conformance posture.
5. Add migration with constraints, indexes and FORCE RLS.
6. Add permission boundary and VineJS validators.
7. Add service functions for settings, topology, policy validation, purge planning/execution, warm jobs, optimization profiles, observations, snapshots and import/export.
8. Use existing `CacheTags`/Bentocache for real tenant-scoped invalidation; do not add a second cache engine.
9. Add controller with permission checks, audit logs, step-up on broad purge/profile activation and no-op semantics.
10. Register versioned routes; every mutation gets `adminWriteLimiter`.
11. Add TanStack Query boundary through same-origin admin proxy.
12. Build `/lite-cash` premium RTL workspace with all eight tabs.
13. Add `lite cash` to the main Sidebar exactly once.
14. Add Phase 34 OpenAPI overlay and merge order.
15. Regenerate canonical SDK types from OpenAPI.
16. Add Japa unit tests, Phase 34 verifier and dedicated workflow.
17. Run formatter, lint, API typecheck, Admin typecheck, production builds, OpenAPI build/lint/codegen, Japa tests, migration smoke and browser audit.
18. Fix every failure without weakening a gate or bypassing a check.
19. Verify all required workflows are green on one exact final head SHA.
20. Merge PR only after the exact final SHA is green.
21. Verify PR state `merged` and verify `main` points to the merge commit.

## Definition of done
Phase 34 is complete only when **lite cash** is reachable from the main admin menu, its real API/cache operations are tenant-safe, policy and purge guardrails are enforced, settings/profile/import state is persisted with FORCE RLS, the admin UI is connected to real APIs, OpenAPI and generated SDK are synchronized, dedicated Phase 34 and repository-wide checks are green on the exact final SHA, browser audit is green, and the PR is merged to `main`.