# Phase 22 — Multi-Agent Commerce Orchestrator

## Architecture
- Agent identity is tenant-scoped and separate from human identity.
- Plans persist the full planning envelope: goal, context, constraints, evidence, options, expected outcomes, risk, policy, approval, verification and learning.
- Tool Registry is the only execution boundary. `handler_key` must map to a compiled allowlist; arbitrary SQL, shell, eval and filesystem handlers are rejected.
- High/critical tools require explicit approval; non-dry-run execution uses Phase 7 step-up.
- Order mutations reuse `orderStateMachine`.
- Tool runs are idempotent and verify state by readback.
- Kill switch prevents new execution while preserving history.

## Admin IA
Channels → Agentic Commerce → Orchestration. Agent Council is contextual, not a global giant Agent menu.

## Release gates
RLS, authz, step-up, rate limit, audit, registry confinement, approval, idempotency, verification, kill switch, RTL/a11y, no no-op UI.

## Production integration note (2026-08-22)

The original source pack is an implementation input only. Production merge requires current-main migration ordering, generated Lucid schema, OpenAPI/Admin SDK synchronization, repository typecheck/build/tests, Migration Smoke, RLS validation, and exact-head CI.

The production candidate uses migration `1775000000000_create_multi_agent_orchestrator.ts`. Its repository formatting gate is normalized before the final exact-head CI run; no release gate is waived or bypassed.
