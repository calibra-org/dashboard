# Phase 26 — Merchant Memory & Organizational Learning

## Release scope

Phase 26 creates a durable, structured, source-linked organizational memory layer for merchant decisions and learned lessons. Phase 10/11/17/22/25 remain the canonical authorities for decisions, governance, experiments, orchestration and portfolio outcomes.

## Safety boundaries

- Chat transcripts and hidden model reasoning are not memory truth.
- Active retrieval requires source-linked evidence.
- Raw customer-level sensitive durable memory is rejected; aggregate/segment lessons are preferred.
- Superseded and expired knowledge must not leak into active retrieval.
- Agent retrieval is bound to canonical Governance OS principals and data-access classes.
- Retrieval does not grant new execution permissions.
- Evidence references are allowlisted and tenant-validated before persistence.
- Source sensitivity cannot be downgraded while converting evidence into durable memory.

## Final validation checkpoint

- deterministic relevance ranking is active in production retrieval and exposes score decomposition;
- Governance principal identity is bound server-side to agent retrieval logging;
- required effectiveness KPIs include retrieval usefulness, repeat-error reduction, misleading-memory rate and source-linked retrieval rate;
- Phase 26 OpenAPI is part of the canonical Admin specification and generated SDK;
- Persian RTL Merchant Memory workspace is linked from analytics navigation;
- dedicated ranking and privacy regression tests are included;
- temporary canonicalization/hardening workflows and build hooks have been removed; permanent Phase 26 CI is verification-only.

## Release status

Implementation remains in canonical Draft PR #84 until all exact-head repository, migration, typecheck, build, formatting, OpenAPI/SDK and Phase 26 integrity gates are green. Only then may the PR be marked ready and merged into `main`.
