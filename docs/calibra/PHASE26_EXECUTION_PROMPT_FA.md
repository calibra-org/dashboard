# Phase 26 — Merchant Memory & Organizational Learning

## Mission

Phase 26 turns durable business learning into a first-class, evidence-linked knowledge layer instead of relying on chat history or free-form prose memory.

## Canonical memory record

Every memory must preserve:

- context
- observed signals
- decision
- reason
- rejected alternatives
- actors / approvals
- action
- outcome
- lesson
- confidence / strength
- expiry / relevance
- source evidence

## Memory classes

- operational incidents
- supplier lessons
- campaign lessons
- pricing lessons
- customer / segment behavior
- product quality
- architecture / process decisions
- policy precedents

## Truth boundaries

Phase 26 is not a new source of operational truth. It stores learned, source-linked institutional knowledge derived from canonical systems such as Phase 10 Decision Intelligence, Phase 11 governance, Phase 17 experiments, Phase 22 orchestration, and Phase 25 portfolio outcomes.

Raw hidden reasoning is never stored as memory. A memory is a structured business artifact with explicit evidence.

## Retrieval contract

Human and agent retrieval must:

- return only active, non-expired memories by default
- exclude superseded memory from current recommendations
- respect visibility and sensitivity scope
- never return a memory without at least one source link
- include the evidence references with every result
- persist retrieval telemetry so usefulness can be measured

## Contradiction and supersession

New evidence never overwrites history. A replacement memory creates a lineage edge and the predecessor becomes superseded. Other lineage relations may refine or contradict an earlier memory without destroying it.

## Privacy and retention

Sensitive customer-level raw memory is forbidden at record level. Prefer aggregate or cohort lessons. Expiry is explicit and retrieval must fail closed for expired knowledge.

## Effectiveness

Phase 26 must measure whether retrieved memory was useful, influenced a decision, supported an outcome, or prevented a repeated error. This is the minimum feedback loop for organizational learning.

## Definition of Done

- structured tenant-isolated memory store with RLS + FORCE RLS
- evidence/source references
- lineage, supersession, expiry and revocation
- permission-aware source-linked retrieval
- privacy guardrails against sensitive raw customer memory
- effectiveness measurement
- API/OpenAPI/SDK contract
- Persian RTL Decision Center/Copilot surface
- dedicated tests, verifier and CI gate
- full repository CI green before merge
