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
- Source sensitivity cannot be downgraded when durable memory is created.

## Release status

Phase 26 is implementation-complete in PR #84. The final candidate passed the dedicated Merchant Memory integrity workflow, exact ranking and privacy regressions, API/Admin typechecks, production build, canonical Admin OpenAPI and SDK sync, the repository Check including all six API shards and aggregate tests, Migration Smoke, SEO Engines, and Phase 13/14/15/17/19/20/21/23 integrity gates.
