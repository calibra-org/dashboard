# Phase 11 — Governance OS

Phase 11 adds the governance control plane for sensitive human, service, and agent actions. It composes with the existing Configuration OS and Identity & Verification OS instead of creating parallel authentication or configuration systems.

## Control model

Every governed action is evaluated against a registered action contract and active policy versions. Policy evaluation is contextual and deterministic: explicit deny wins, approval and recent identity step-up requirements are accumulated, limits reduce the permitted envelope, and autonomy is bounded per action rather than granted globally.

The action registry defines the maximum autonomy and reversibility characteristics for protected operations such as configuration changes, content publishing, SEO application, inventory adjustment, order cancellation, refunds, policy mutation, agent control, break-glass, and ledger verification.

## Agent principals

Governed agents have explicit identities with allowlisted and prohibited actions, data-access classes, autonomy ceilings, monetary budgets, currency, owner metadata, and a kill switch. Unknown or prohibited actions fail closed. The kill switch immediately prevents execution eligibility for that principal.

## Approval Center

Approval requests bind an action, resource scope, request hash, reason, expiry, workflow type, and separation-of-duties policy. Workflows support single-stage, sequential, and quorum decisions, plus assignment, delegation, expiry, and audited break-glass handling. Approval decisions are append-only records.

Critical Configuration OS writes are validated again at the database boundary. A supplied governance approval must belong to the same tenant, be approved and unexpired, target `configuration.apply`, and match the exact configuration group/definition resource. Successful application consumes the approval so it cannot be replayed.

## Identity step-up

Sensitive governance mutations reuse Phase 7 recent identity step-up. Policy version creation, agent changes, kill-switch operations, and break-glass therefore depend on the established identity assurance layer rather than a second authentication mechanism.

## Action Ledger

The governance ledger is tenant-scoped, append-only, and hash chained. Each entry records sequence, previous hash, entry hash, actor/action/resource context, correlation and causation identifiers, policy/approval evidence, before/after hashes, result metadata, and compensation context without duplicating secrets. Evidence is recursively redacted before persistence.

Each entry persists the canonical normalized ledger material as an immutable text `hash_payload`; `entry_hash` is computed from those exact bytes and verification hashes the same persisted payload. This removes runtime/PostgreSQL JSONB, bigint, or timestamp representation differences from integrity verification while keeping the chain bound to the stored governance evidence.

Database triggers reject updates or deletes to immutable governance records. Tenant tables use forced PostgreSQL row-level security and fail closed when tenant context is absent.

## Shadow Mode and autonomy

Shadow observations capture what an agent would have done without executing the action. Human review and outcome fields support measured promotion readiness. Autonomy levels are configured per action and constrained by policy, principal, budget, and action ceilings; they are not a global agent privilege.

## Admin workspace

The admin application exposes Governance OS from the Configuration navigation group. The workspace includes Overview, Policies, Approvals, Agents, Ledger, and Shadow/Autonomy views backed by live APIs rather than fixture data.

## API and contracts

Admin endpoints are mounted under `/api/v1/admin/governance`. The Phase 11 OpenAPI overlay is merged into the admin specification and the generated SDK is kept in sync by repository CI.

## Release invariants

Phase 11 is release-ready only when repository checks confirm formatting/linting, TypeScript type safety, production build, OpenAPI route synchronization, generated SDK synchronization, existing phase integration invariants, frontend tests, and the sharded API test suite. Governance regression coverage includes policy conflict behavior, agent boundaries and kill switch, separation of duties, append-only ledger behavior, secret redaction, forced RLS, fail-closed tenant context, cross-tenant rejection, and critical Configuration OS approval binding.