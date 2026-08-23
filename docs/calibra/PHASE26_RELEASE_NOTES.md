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

## Release status

Implementation is in canonical Draft PR #84. Merge is blocked until schema/service contracts, permission-aware retrieval, source validation, lineage, admin surface, OpenAPI/SDK, dedicated tests and full repository CI are green on the exact final head.
