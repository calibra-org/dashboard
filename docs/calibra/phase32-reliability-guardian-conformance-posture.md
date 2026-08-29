# Phase 32 — Reliability Guardian & Self-Healing OS conformance posture

## Scope

Phase 32 is a reliability control plane. It does not create a second observability, experimentation, configuration, fulfillment, or commerce truth store. It evaluates explicit invariants against evidence owned by existing Calibra domains, opens incidents only after configured consecutive failures, and permits bounded remediation with audit, verification, and rollback evidence.

## Canonical boundaries

- **Synthetic commerce evidence:** Phase 24 `synthetic_commerce_runs` and scenarios remain authoritative for synthetic journey outcomes.
- **Fulfillment evidence:** Phase 31 `fulfillment_promise_outcomes` remains authoritative for measured promise accuracy.
- **Configuration rollback:** `ConfigurationRevisionService` remains authoritative for configuration revision history and rollback.
- **Experiment lifecycle:** Phase 17 experimentation service remains authoritative for experiment transitions.
- **Reliability Guardian:** owns invariant definitions, incident state, remediation policy/run evidence, and reliability scorecards only.

## Evidence rules

- Missing samples produce `no_evidence`; absence of evidence never becomes a perfect reliability score.
- Invariant failures must be consecutive; a passing evaluation breaks the failure streak.
- Recovery also requires consecutive passing evaluations according to the invariant policy.
- Scorecards are persisted only when the evaluation window contains evidence.
- Raw synthetic or fulfillment data is referenced/aggregated, not copied into a competing canonical ledger.

## Remediation safety

- Autonomous remediation is database-constrained to `risk_level = low`.
- Medium, high, and critical actions require explicit operator execution.
- Sensitive policy creation, execution, and rollback require recent identity step-up.
- Every admin mutation is rate-limited and audit logged.
- Policies have cooldown and per-hour execution budgets.
- Remediation runs are idempotent per incident/policy/hour execution bucket.
- Before/after snapshots and verification evidence are retained.
- Configuration rollback and experiment pause use canonical services rather than direct shadow state.
- A remediation remains `verifying` until a later invariant cycle provides evidence; it does not self-declare success.

## Incident lifecycle

`open -> mitigating -> monitoring -> resolved`

A new failure during monitoring reopens the incident. Recovery requires the configured number of consecutive passes. Resolved incidents retain their evidence and remediation history.

## Tenant and access isolation

All Phase 32 persistence is tenant-scoped with PostgreSQL `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. The admin API is authenticated, admin-only, capability-gated, mutation-rate-limited, and audited.

## UI posture

The admin workspace is Persian RTL and exposes evidence-backed overview metrics, invariants, incidents, remediation runs, and reliability scorecards. It explicitly shows the canonical evidence boundaries and the low-risk-only autonomous action rule. No demo reliability KPI is synthesized.

## Merge gate

Phase 32 is mergeable only after:

1. Phase 31 is merged and the Phase 32 branch is retargeted/synchronized to `main`.
2. Static contract checks pass.
3. Repository formatting passes without writes in the integrity workflow.
4. API and admin TypeScript checks pass.
5. Admin and storefront production builds pass.
6. The final branch contains no one-shot patch/formatter workflows or helper scripts.
7. The exact reviewed head SHA is used for merge.
