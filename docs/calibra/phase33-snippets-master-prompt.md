# Phase 33 — Snippets

## Mission
Build **Snippets** as a first-class Calibra operator surface for safely authoring, validating, reviewing, publishing, rolling back, observing, and governing small code/configuration extensions without editing core application files for every operational tweak.

The visible product name is exactly **Snippets**. Do not ship `Calibra Snippets`, `Code Snippets`, `Snippet Manager`, or any WordPress-specific brand string in the product UI.

## Product benchmark
The UX should combine the strongest proven ideas from mature snippet tooling while conforming to Calibra's architecture:

- fast searchable snippet inventory;
- explicit draft/published/paused/archived lifecycle;
- revisions and one-click rollback;
- conditional targeting with AND groups;
- environment/surface/runtime targeting;
- validation before publish;
- Safe Mode / kill switch;
- automatic quarantine after repeated failures;
- deployment history and immutable fingerprints;
- health, failure-rate and latency observability;
- capability-based permissions;
- audit trail for every mutation;
- import/export-ready data model;
- library/templates without coupling templates to runtime state;
- preview/simulation that evaluates targeting but never executes arbitrary code;
- staging-first workflow and guarded production rollout.

## Senior-engineering safety boundary
Snippets is a **management plane**, not an `eval()` console.

1. Never use `eval`, `new Function`, `vm.runIn*`, shell execution, dynamic package installation, direct process spawning, or arbitrary server-side execution of user-entered source.
2. TypeScript/JavaScript source may be authored, validated, versioned, reviewed and deployed as a governed artifact, but production execution must remain build/registry-gated by a trusted adapter outside the request path.
3. JSON/config snippets may be parsed structurally. CSS/HTML/JS/TS remain source artifacts unless an explicitly registered trusted consumer interprets them.
4. Publishing means "approved active artifact available to trusted consumers", not "execute arbitrary source inside AdonisJS".
5. Safe Mode must make active artifacts unavailable to consumers without deleting revisions.
6. High-risk publication, rollback and Safe Mode changes require recent identity step-up.
7. Every mutation is tenant-scoped, rate-limited and audited.

## Architecture
Use the existing stack only; add no dependency.

- Admin: Next.js 16 App Router, React, TypeScript, Tailwind v4, shadcn primitives, TanStack Query.
- API: AdonisJS 7, TypeScript ESM, PostgreSQL 17, VineJS, tenant context, admin write limiter, identity step-up, audit log service.
- API docs: Phase 33 OpenAPI overlay merged into canonical admin spec.
- CI: dedicated read-only Phase 33 integrity workflow plus normal repository Check/Admin UI gates.

## Domain model
Create tenant-isolated tables with forced RLS:

### `snippets`
Canonical mutable snippet head.
- id, tenant_id, public_id
- key, name, description
- language: `typescript | javascript | css | html | json`
- runtime: `storefront | admin | server | worker | build`
- placement: free controlled slug (header/footer/catalog/product/checkout/admin/etc.)
- status: `draft | published | paused | quarantined | archived`
- risk_level: `low | medium | high | critical`
- source
- conditions JSONB
- capabilities JSONB
- active_revision_id nullable
- version integer
- last_validation JSONB
- consecutive_failures
- created_by_user_id, updated_by_user_id
- timestamps

### `snippet_revisions`
Immutable revision history.
- snippet_id, revision number
- source, conditions, capabilities
- source_sha256
- validation JSONB
- created_by_user_id, reason, created_at
- unique tenant/snippet/revision and tenant/source checksum evidence.

### `snippet_deployments`
Publication/rollback evidence.
- public_id, snippet_id, revision_id
- environment: `preview | staging | production`
- action: `publish | rollback | pause | resume | quarantine | safe_mode`
- status: `planned | active | superseded | failed | rolled_back`
- rollout_percent 0..100
- idempotency_key
- metadata JSONB
- actor + timestamps

### `snippet_executions`
Trusted-consumer health evidence only.
- snippet_id/revision_id
- consumer_key
- outcome: `success | failure | skipped | blocked`
- duration_ms
- request_id/evidence JSONB
- observed_at
Never fabricate execution rows from the admin UI.

### `snippet_settings`
One row per tenant.
- safe_mode
- production_publish_requires_step_up
- auto_quarantine_threshold
- default_environment
- max_rollout_percent
- updated_by_user_id + timestamp

## Validation policy
Validation is deterministic and explainable. It must return errors, warnings, source checksum and normalized metadata.

Block or warn on:
- `eval(` / `new Function(` / Node VM dynamic evaluation;
- `child_process`, shell/process spawn, direct filesystem mutation;
- obvious secret access (`process.env`) in browser-targeted snippets;
- server/worker JavaScript/TypeScript trying to publish as dynamic request-path code;
- empty source;
- malformed JSON for JSON snippets;
- malformed condition groups;
- high/critical risk production publish without step-up;
- production rollout above tenant maximum;
- publish while Safe Mode is enabled.

Validation must never claim a source is safe merely because syntax is valid. Return `publishable`, `errors`, `warnings`, `checksum`, and `boundary`.

## Condition grammar
Use declarative condition groups only. No executable expressions.

```json
{
  "operator": "and",
  "rules": [
    { "field": "surface", "op": "eq", "value": "product" },
    { "field": "locale", "op": "in", "value": ["fa", "en"] },
    { "field": "path", "op": "starts_with", "value": "/products" }
  ]
}
```

Supported fields: surface, locale, path, environment, user_role, tenant_channel, product_id, category_id, date_after, date_before.
Supported operators: eq, neq, in, not_in, contains, starts_with, ends_with.
Unknown fields/operators are rejected.

## API contract
All routes live below `/api/v1/admin/snippets`, require API auth + admin middleware, and all mutations use `adminWriteLimiter`.

- `GET /overview`
- `GET /`
- `POST /`
- `GET /:publicId`
- `PATCH /:publicId`
- `POST /:publicId/validate`
- `POST /:publicId/simulate`
- `POST /:publicId/publish`
- `POST /:publicId/pause`
- `POST /:publicId/resume`
- `POST /:publicId/rollback`
- `GET /:publicId/revisions`
- `GET /:publicId/deployments`
- `GET /executions`
- `POST /executions/observe` for trusted/admin test evidence only and capability-guarded
- `GET /settings`
- `PATCH /settings`
- `POST /safe-mode/enable`
- `POST /safe-mode/disable`
- `GET /library`

## Permissions
- `snippets.view`
- `snippets.create`
- `snippets.edit`
- `snippets.validate`
- `snippets.publish`
- `snippets.rollback`
- `snippets.settings.manage`
- `snippets.safe_mode.manage`
- `snippets.execution.observe`

Admin is the baseline principal, but explicit denied rows in `admin_permissions` must win.

## UI
Add one top-level main navigation item named exactly **Snippets**.

Route: `/snippets`

The workspace is RTL-first, dense, premium, token-only and visually native to the current admin. No raw hex colors and no raw Tailwind named palette classes.

### Tabs
1. Overview
   - KPI tiles: total, published, drafts, quarantined, success rate, p95 duration
   - Safe Mode banner
   - health matrix by runtime
   - recent deployments
   - recent failures
2. Snippets
   - searchable/filterable inventory
   - status/risk/language/runtime chips
   - select row to edit
3. Editor
   - name/key/description
   - language/runtime/placement/risk
   - monospaced source editor
   - condition JSON editor
   - validate/save/publish/pause/resume/rollback actions
   - validation panel with checksum and guardrail findings
4. Library
   - vetted starter templates that create drafts only
5. Revisions
   - immutable revision timeline and deployment history
6. Health
   - execution outcomes, duration, consumer, evidence; never fabricate telemetry
7. Settings
   - Safe Mode
   - production step-up requirement
   - auto-quarantine threshold
   - default environment
   - rollout ceiling

### UX details
- Persian is default; use correct RTL logical spacing.
- Title text is `Snippets` only.
- Use `PageHeader`, `Card`, `Button`, `Input`, `Textarea`, `Select`, `Switch`, existing token-driven primitives.
- Use optimistic/refetchable TanStack Query boundaries through `/api/admin/...` only.
- Never expose bearer token to browser code.
- Mutations use CSRF-protected same-origin proxy.
- Destructive/sensitive actions clearly state consequence.
- Empty/loading/error states must be explicit.
- Safe Mode must remain editable while artifacts are disabled.

## Backend invariants
- forced tenant RLS on every Phase 33 table;
- unique snippet key per tenant;
- revision source checksum stored using SHA-256;
- immutable revision rows;
- no publication without a successful current validation matching current source checksum;
- Safe Mode blocks publish/resume and registry resolution;
- published active revision belongs to the same snippet;
- rollback creates a new deployment event and moves active revision; it never mutates old revisions;
- same-value settings PATCH is a no-op for audit/history pollution prevention;
- repeated trusted failure evidence may quarantine only when threshold is reached; never infer failures without observations;
- high/critical production publication and any Safe Mode change require identity step-up;
- every mutation writes strict audit evidence;
- create/publish/rollback observe idempotency where repeated retries could duplicate history.

## Integration steps
1. Read repo-wide and scoped AGENTS contracts.
2. Create Phase 33 branch from current `main`.
3. Add migration with constraints, indexes, forced RLS and safe defaults.
4. Add permissions and validators.
5. Add Snippets service with validation, conditions simulation, revisioning, publishing, rollback, settings and health aggregation.
6. Add controller with permission checks, step-up on sensitive actions, strict audit records.
7. Register versioned admin routes with `adminWriteLimiter` on every mutation.
8. Add admin query boundary through existing same-origin proxy.
9. Build `/snippets` workspace with token-only RTL UI.
10. Add main Sidebar entry exactly `Snippets`.
11. Add Phase 33 OpenAPI overlay and merge it into canonical admin spec.
12. Add conformance posture and integrity verifier.
13. Add dedicated GitHub Actions gate.
14. Run format, lint, typecheck, build, API tests, frontend tests, OpenAPI build/codegen check and Phase 33 verifier.
15. Fix every discovered regression without bypassing checks.
16. Ensure all required PR workflows are green on the exact final SHA.
17. Merge only after the exact final SHA is green.
18. Verify PR state is merged and record merge commit SHA.

## Definition of done
Phase 33 is done only when Snippets is reachable from the main admin menu, backend persistence and APIs exist, revision/publish/rollback/safe-mode guardrails work, UI is connected to real APIs, OpenAPI and SDK drift gates pass, dedicated Phase 33 integrity checks pass, normal repository checks pass, and the PR is merged to `main`.