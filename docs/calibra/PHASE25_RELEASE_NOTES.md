# Phase 25 — Autonomous Growth Portfolio Engine

## Release scope

Phase 25 turns the Phase 10 opportunity stream into an explainable, resource-constrained action portfolio. It does not replace Decision Intelligence, execution governance, orders, inventory, payments, or other canonical truth stores.

## Source authority

- Opportunity and recommendation truth: `intelligence_cases` from Phase 10.
- Realized action outcome truth: `intelligence_outcome_records` from Phase 10.
- Phase 25 stores candidate snapshots, portfolio decisions, constraint snapshots, rebalancing evidence, and portfolio-level realized measurements only.

## Hard constraints

The exact solver enforces cash, team hours, warehouse capacity, supplier capacity, maximum risk, channel limits, dependency/exclusivity, and supported policy constraints. Missing dependencies and stale Phase 10 snapshots fail closed.

## Policy constraints

Supported policy controls include maximum selected actions, minimum confidence, forbidden case IDs, and the risk threshold at which active-action removal requires approval. `high_risk_auto_cancel=true` is explicitly rejected.

## Dynamic rebalancing

Rebalance triggers are limited to the Phase 25 roadmap set:

- stockout
- campaign outcome
- cash settlement delay
- supplier incident

A rebalance can propose a different portfolio without mutating the original plan constraints. If the proposal removes an active high-risk action, the proposed run moves to `awaiting_approval` and a Governance OS approval request is created. Applying that rebalance fails closed until the approval request is approved.

## Release gates

Before merge:

- Phase 25 static integrity verifier passes.
- dependency-order regression unit test passes.
- API typecheck, Admin typecheck, frontend tests, API shards, build, format/lint pass.
- Migration Smoke passes with all six Phase 25 tables and RLS/FORCE RLS.
- Admin OpenAPI route drift is zero.
- SDK generation is canonical and produces no diff.
- authenticated navigation resolves `/analytics/growth-portfolio`.

The candidate merged for release is validated only after canonical Biome formatting, the merged Admin OpenAPI build, and SDK code generation have been committed back to the Phase 25 branch and the full repository CI reruns on that exact head.

## Safety boundary

Phase 25 recommends, ranks, measures, and rebalances portfolios. It never silently cancels high-risk active work, bypasses Governance OS, or treats model output as realized business truth.
