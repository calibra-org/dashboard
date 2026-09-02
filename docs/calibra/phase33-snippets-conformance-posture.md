# Phase 33 — Snippets conformance posture

## Product boundary

Snippets is Calibra's governed extension-management plane. It stores source artifacts, revisions, targeting, validation evidence, deployments, settings and trusted-consumer observations. It is **not** a production `eval()` surface and it never executes arbitrary user-entered JavaScript/TypeScript inside an API request.

The visible product name is exactly **Snippets**.

## Security posture

- No `eval`, `new Function`, Node VM execution, shell execution or dynamic package installation.
- TypeScript/JavaScript are governed build/registry artifacts. Publishing makes an approved revision available to trusted consumers; it does not interpret source in AdonisJS.
- Every Phase 33 table has forced tenant RLS.
- Every mutation is authenticated, admin-scoped, permission-checked, rate-limited and strictly audited.
- High/critical production publication, rollback and Safe Mode changes require recent identity step-up.
- Browser calls use the existing same-origin admin proxy; bearer tokens remain server-only and mutations are CSRF protected.
- Explicit deny rows in `admin_permissions` override the baseline admin role.

## Recovery posture

Safe Mode is a first-class kill switch. When enabled, registry resolution returns no active artifacts, publish/resume is blocked, revisions remain editable, and operators can repair or roll back without deleting history. Safe Mode is tenant-local and its mutation requires recent identity step-up.

Automatic quarantine only follows real trusted-consumer failure observations. Missing observations produce **no execution evidence** and never synthesize a failure or success rate.

## Revision and deployment posture

- Revisions are immutable.
- Each revision stores SHA-256 of its exact source.
- Publish requires a validation record whose checksum matches the current source.
- Rollback points the snippet head at a previous immutable revision and records a new deployment event.
- Deployments are append-only operational evidence.
- Retry-prone publication/rollback actions use idempotency evidence so a client retry cannot duplicate the same deployment history.

## Validation posture

Validation is deterministic and explainable. A passing syntax/structure check is not a claim that arbitrary source is safe.

Hard boundaries include dynamic evaluation, process spawning, shell/child-process access, filesystem mutation patterns, malformed JSON, malformed targeting grammar and unsafe dynamic server/worker publication. Browser-targeted source that reads `process.env` is rejected.

## Targeting posture

Conditions are declarative JSON only. No user-authored expression is evaluated. The service supports a fixed field/operator registry and rejects unknown fields/operators. Simulation evaluates the condition tree against supplied context but never executes source.

## UI posture

The admin workspace is RTL-first and uses the existing token-driven shadcn/Tailwind system. No raw hex values and no raw named Tailwind color palette classes are introduced. The main navigation label and workspace title are `Snippets`.

## Observability posture

Health metrics are derived only from rows in `snippet_executions` written by an authorized trusted consumer/admin test path. Empty samples return `null` success rate/p95 instead of inventing perfect health. Failure streaks may trigger quarantine only after the configured tenant threshold.

## Compatibility posture

Phase 33 adds no third-party dependency. It uses existing AdonisJS, VineJS, PostgreSQL, TanStack Query, Next.js, Tailwind and shadcn infrastructure. The OpenAPI overlay is merged into the canonical admin spec and guarded by SDK codegen drift checks.