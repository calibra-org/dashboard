# Phase 26 — Merchant Memory & Organizational Learning

## Mission

Separate durable merchant knowledge from chat history. Phase 26 stores evidence-linked organizational lessons that humans and agents can retrieve without inventing prose memory.

## Canonical memory record

Each memory carries:

- context
- observed signals
- decision
- reason
- rejected alternatives
- actors and approvals
- action
- outcome
- lesson
- confidence and strength
- validity, expiry and relevance

## Memory classes

- operational incidents
- supplier lessons
- campaign lessons
- pricing lessons
- customer or segment behavior
- product quality
- architecture or process decisions
- policy precedents

## Source authority and dependencies

Phase 26 consumes landed history rather than replacing it:

- Phase 10 decision and outcome records remain canonical business decision/outcome truth.
- Phase 11 governance approvals remain canonical approval truth.
- Phase 17 experiments remain canonical experiment truth.
- Phase 22 orchestration history remains canonical agent-run truth.
- Phase 25 portfolio runs/outcomes remain canonical portfolio truth.

Merchant Memory stores learned facts, evidence references and lineage. It does not become a parallel order, payment, inventory, policy, experiment, portfolio or audit ledger.

## Retrieval contract

Retrieval must return structured memory plus explicit source references. A model may summarize retrieved records for presentation, but the memory layer itself never fabricates source-free facts.

Default retrieval excludes:

- expired memories
- revoked memories
- superseded memories unless lineage/history is explicitly requested
- records outside the caller's visibility scope or purpose

Every retrieval records the query hash, purpose, filters, returned memory IDs, source coverage and counts filtered by permission/expiry.

## Contradiction and supersession

Memories are immutable versions. New evidence never overwrites an old lesson. Lineage records one of:

- supersedes
- refines
- contradicts
- revalidates

The prior record remains reconstructable. The active version is selected from lineage/status, not by destructive update.

## Privacy and retention

Prefer aggregate learned facts over raw customer-level sensitive memory. Every record declares a privacy mode:

- aggregated
- redacted
- restricted

Raw secrets, credentials, message bodies or unnecessary PII are not valid memory payloads. Restricted memory requires backend permission-aware retrieval. Expiry is first-class and retention can differ by class.

## Effectiveness measurement

Memory is only useful if it changes outcomes. Phase 26 measures retrieval usefulness, whether the memory was applied, repeat-error avoidance, optional realized impact and attribution confidence.

## Initial implementation slice

1. tenant-isolated structured memory schema with RLS + FORCE RLS
2. evidence link store
3. immutable lineage/supersession store
4. retrieval event ledger
5. effectiveness measurement ledger
6. permission-aware retrieval service
7. Decision Center / Copilot operator surface
8. OpenAPI + SDK + tests + permanent Phase 26 release gate

## Definition of Done

- structured memory store exists
- every active memory is source/evidence linked
- supersession and expiry are explicit and reconstructable
- retrieval is permission/purpose aware and source linked
- customer-sensitive raw memory is minimized and restricted
- effectiveness is measurable
- API/admin typecheck, formatting, tests, build, migration smoke, OpenAPI/SDK drift and Phase 26 integrity are green on the exact merge head
