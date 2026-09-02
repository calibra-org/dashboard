# Phase 34 — lite cash conformance posture

## Product boundary
The visible product name is **lite cash** only. The implementation is a Calibra-native cache/performance control plane and does not embed or redistribute code from LiteSpeed Cache, WP Rocket, FlyingPress, Cloudflare, QUIC.cloud, Redis plugins or other third-party products.

## Research translated into Calibra primitives
- Manual purge tooling becomes tenant-scoped, allow-listed `CacheTags` planning and audited invalidation.
- WordPress cache TTL panels become versioned cache policies over Calibra's existing Bentocache runtime.
- Crawler/preload concepts become governed warm plans with trusted-worker evidence rather than arbitrary URL fetching from an admin request.
- CSS/JS/image/font optimization concepts become versioned trusted-adapter profiles; the admin API never evaluates or rewrites arbitrary source.
- CDN controls become provider-neutral edge metadata and evidence. Provider credentials are deliberately outside the Phase 34 data model.
- Debug/report tooling becomes redacted diagnostics plus time-boxed debug state.
- Import/export becomes a versioned non-secret configuration envelope with deterministic validation.

## Cache-runtime truth
Phase 34 does not create a second cache. Calibra's runtime remains `@adonisjs/cache` / Bentocache with L1 memory, optional Redis L2, Redis bus invalidation, tenant-prefixed keys/tags and existing cache metrics. Phase 34 controls safe policy metadata, executes only allow-listed tag invalidation, and exposes safe topology facts.

## Data isolation
All Phase 34 persistence is tenant-scoped and uses PostgreSQL `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`. No table contains a Redis password, CDN token, secret, DSN or arbitrary credential payload.

## Destructive-action posture
- Arbitrary Redis commands are not supported.
- `FLUSHALL`, `FLUSHDB`, wildcard key deletion and global cache clear are not supported.
- The broadest available purge resolves to known tenant-scoped broad tags only and never includes the global tenant registry tag.
- Broad purge requires an explicit reason, dedicated permission, recent identity step-up, admin write rate limiting, idempotency and strict audit evidence.
- Narrow purge plans are previewable before execution.

## Correctness posture
The validator rejects policies that attempt to cache correctness-sensitive/private areas such as cart, checkout mutation flows, inventory stock state, orders, payments, refunds, authenticated accounts, customer notes or customer timeline. Long stale windows and excessive vary dimensions surface warnings.

## Optimization posture
Optimization profiles are configuration artifacts. Phase 34 does not run arbitrary CSS/JS source, install packages, execute shell commands or perform arbitrary remote fetches. A future trusted storefront/build/edge adapter may consume an active profile and report observed evidence back through the capability-gated observation API.

## Evidence posture
Hit rate, miss rate, stale rate, latency, edge state and warm progress are computed only from trusted observation rows. Missing evidence is represented as `null`/`—`; it is never synthesized from settings or assumptions.

## Import/export posture
Exports contain settings, policies and optimization profiles only. They do not contain secrets, raw runtime credentials, purge execution history or observation evidence by default. Imports are validated completely before any state is applied and generate an immutable fingerprinted snapshot.

## UI posture
The workspace is Persian-first RTL, responsive, dense and token-only. It preserves Calibra's current admin design language instead of reproducing the legacy WordPress forms shown in the research screenshots. The screenshots inform capability coverage, not visual cloning.

## Release posture
The branch cannot be merged until migration smoke, normal Check, Admin UI Audit, CodeQL, prior phase integrity gates and the dedicated `Phase 34 lite cash Integrity` workflow are green on the exact final head SHA. OpenAPI and generated SDK drift are release blockers.