# Phase 20 — Trust, Fraud & Abuse Intelligence

## Mission

Phase 20 adds a tenant-scoped trust operating layer across identity, promotion, order, refund, return, support, device/session, and automation evidence. It does **not** introduce a parallel order, refund, or payment source of truth. Canonical commerce state remains owned by the existing domain services and state machines.

## Admin information architecture

The admin surface is one `Operations → Quality & Trust` workspace with six navigation entries: command center, cases, graph, policies, signals, and models/outcomes. Case detail is contextual and is never a separate navigation item. This follows the Calibra principle that capability growth must not become menu growth.

## Trust contracts

- Signals are normalized, tenant-scoped, idempotent, source-attributed, privacy-classified, and store both event time and receive time.
- Graph edges distinguish verified relationships from inferred relationships, with confidence, provenance, and validity.
- Cases use optimistic concurrency and preserve evidence snapshots.
- Decisions are append-only records. Their execution is represented separately in the action ledger.
- Outcomes carry measured labels such as false positive and actual/prevented loss. Missing outcome data stays unknown.
- Policies are explicit versions. New active versions retire the prior active version for the same key.
- Models use explicit `model_id + version`; no ambiguous `latest` pointer is accepted.

## Adaptive friction

| Risk band | Default action |
| --- | --- |
| trusted | allow |
| low | monitor |
| medium | monitor |
| elevated | Phase 7 scoped step-up |
| high | hold/manual review |
| severe | block |

These defaults are explainable recommendations; stored policies and human review still govern concrete decisions. Checkout enforcement runs before order finalization/payment side effects. `hold` on an existing pending order uses the canonical order state machine.

## Permissions

`trust.view`, `trust.cases.assign`, `trust.cases.review`, `trust.cases.override`, `trust.sensitive.view`, `trust.policies.manage`, `trust.models.manage`, `trust.outcomes.record`, `trust.scan.run`, and `trust.access.manage` are backend-enforced through the existing tenant-scoped `admin_permissions` table.

Sensitive actions require recent Phase 7 scoped step-up:

- `trust.case.enforce` for hold/block decisions
- `trust.case.override` for overrides
- `trust.policy.manage` for policy versions
- `trust.model.manage` for model registration/rollout
- `trust.access.manage` for permission presets

## Privacy and explainability

Evidence is redacted when the operator lacks `trust.sensitive.view`. Payment secrets are never copied into trust tables. Raw email identifiers used during a scan are converted to the existing tenant-bound identity hash before being recorded. Trust evidence is purpose-limited and must not become a marketing attribute implicitly.

Every decision view exposes risk score separately from confidence, source lineage, policy/model versions, false-positive risk when measured, and verified-versus-inferred graph relationships.

## Automation classification

The trust layer reserves distinct classifications for approved/identified agents, unknown automation, and abusive bots. The UI never invents counts; categories appear only when normalized evidence exists.

## Local release gates

1. migration tables have tenant defaults, ENABLE/FORCE RLS, and tenant policies;
2. no duplicate order/refund/payment source-of-truth table is introduced;
3. every write route uses the admin write limiter;
4. every sensitive mutation has a permission check and required Phase 7 step-up scope;
5. checkout trust enforcement runs before order finalization;
6. admin UI uses semantic tokens, logical RTL spacing, Calibra primitives, and `HelperTooltip` for decision-sensitive explanations;
7. all six navigation targets plus contextual case detail exist;
8. Persian and English trust catalogs parse successfully;
9. no mock metrics or fabricated labels are present in runtime code;
10. targeted functional tests and the static verifier must pass before merge.
