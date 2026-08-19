# Phase 21 — Agentic Commerce Gateway

## Mission
Expose Calibra commerce to AI agents through protocol-neutral, merchant-controlled capabilities. The core product/order/payment domains remain canonical; adapters translate contracts rather than own business truth.

## Implemented architecture
- `agentic_principals`: scoped external/system agent identities; no raw credentials in Admin responses.
- `agentic_channels`: disabled/shadow/read-only/live with kill switch and version.
- `agentic_capability_versions`: schema + scopes + risk + signed digest + protocol version.
- `agentic_product_readiness`: explainable score snapshots with missing facts/freshness.
- `agentic_channel_events`: immutable/idempotent event envelope for real channel activity.
- `agentic_action_ledger`: audited action instances; no arbitrary DB mutation path.
- `agentic_conformance_runs`: evidence gate for protocol labeling/live mode.

## Protocol posture
`native`, `ucp`, `acp`, `mcp`, `a2a`, `custom` are adapter keys only. A channel cannot switch to `live` unless its recent history includes a passing conformance run for the selected adapter/protocol. This avoids claiming compliance from a UI toggle.

## Product graph
Reads canonical `products`, `product_translations`, `product_variations`, `inventory_items`, `product_images`, and product attributes. Missing compatibility/returns/legal facts remain explicitly unavailable until their canonical sources exist.

## Security
RLS forced on every Phase21 table. Channel/capability management uses backend permissions, write rate limiting, strict audit and Phase7 step-up. Agent principals are scoped; raw secrets are not stored in these tables.

## IA
`Channels → Agentic Commerce`. No giant Agent sidebar.

## Release evidence
Static verifier + syntax parse are included. Full migration/Japa/typecheck/build require the project dependencies/runtime and remain BLOCKED/PENDING if unavailable.

## Hardening نهایی
- `rate_limit_policy` هر Agent principal در authorization واقعی enforce می‌شود. قرارداد پشتیبانی‌شده `{ window_seconds, max_actions }` است؛ هر دو باید صفر یا هر دو مقدار مثبت و محدود داشته باشند.
- شمارش از `agentic_action_ledger` همان tenant/principal انجام می‌شود و عبور از حد با `principal_rate_limit_exceeded` در policy result ثبت می‌شود.
- action authorization همچنان scope، channel mode، kill switch، capability verification، risk class و idempotency را قبل از صدور امضای مجوز بررسی می‌کند.

- Capability signatures are cryptographically re-verified before conformance PASS and action authorization; a stored signature string alone is not sufficient.
- Reusing an idempotency key with a different payload/capability fails closed with `E_AGENTIC_IDEMPOTENCY_CONFLICT`.
- Mutation authorization and conformance execution require fresh Phase 7 identity step-up; issued action authorization tokens expire after five minutes.
