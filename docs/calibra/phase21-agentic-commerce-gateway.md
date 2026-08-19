# Phase 21 — Agentic Commerce Gateway

## Mission
Expose Calibra commerce to AI agents through protocol-neutral, merchant-controlled capabilities. Catalog, inventory, order, payment and Trust/Risk remain canonical; adapters translate contracts rather than own business truth.

## Implemented architecture
- `agentic_principals`: scoped external/system agent identities with hashed credential fingerprints and bounded rate-limit policies.
- `agentic_channels`: disabled/shadow/read-only/live modes with kill switch and versioning.
- `agentic_capability_versions`: input/output schema, scopes, risk class, signed digest and protocol version.
- `agentic_product_readiness`: explainable score snapshots with missing facts and freshness.
- `agentic_channel_events`: tenant-scoped, redacted and idempotent channel telemetry.
- `agentic_action_ledger`: audited/idempotent authorization instances with payload hashes rather than raw secrets.
- `agentic_conformance_runs`: evidence gate for protocol labeling and live mode.

## Public data plane
- `GET /.well-known/calibra-agentic-commerce` exposes only verified capability manifests.
- `GET /api/v1/agentic/products/:productId` reads the canonical machine-safe product graph.
- `POST /api/v1/agentic/actions/authorize` applies principal authentication, scope, channel mode, capability verification, rate limits, idempotency and canonical Phase 20 Trust/Risk before authorization.
- `POST /api/v1/agentic/events` records redacted/idempotent telemetry without storing raw credentials.

## Protocol posture
`native`, `ucp`, `acp`, `mcp`, `a2a` and `custom` are adapter keys only. A channel cannot switch to `live` unless recent conformance evidence passes for the selected adapter/protocol. No UI label is treated as a compliance claim.

## Product graph
Reads canonical `products`, `product_translations`, `product_variations`, `inventory_items`, `product_images` and product attributes. Missing compatibility, returns or legal facts stay explicitly unavailable until their canonical sources exist.

## Security and governance
RLS is forced on every Phase 21 table. Sensitive Admin mutations use backend permissions, write rate limiting, strict audit and fresh Phase 7 step-up. Mutation-capable agent actions bridge to the existing Phase 20 Trust/Risk evaluator with no parallel fraud engine and no fabricated risk signals.

`rate_limit_policy` is enforced during authorization with `{ window_seconds, max_actions }`. Capability signatures are cryptographically re-verified before conformance PASS and action authorization. Reusing an idempotency key with a different payload/capability fails closed with `E_AGENTIC_IDEMPOTENCY_CONFLICT`.

## Admin IA
The Persian-first RTL `Agentic Commerce` workspace exposes Overview, Channels & Principals, Product Readiness, Conformance and the safe Action Ledger projection. Raw credentials and authorization tokens are not rendered.

## Release evidence
The Phase 21 source finalizer passed the static contract, Admin OpenAPI composition, Admin SDK generation, merged OpenAPI 3.0 validation, focused Japa contract tests, API typecheck, Admin typecheck, Admin production build and diff hygiene on the finalized source. Temporary hardening transport files and temporary release workflows were removed before final review.

Repository-wide Biome formatting was normalized with the same toolchain used by CI. The aggregate OpenAPI build now includes the existing Phase 14 procurement and Phase 17 experimentation contracts, the public Phase 17 data plane, and the Phase 21 well-known route in drift verification; SDK types were regenerated from those final bundles before the permanent repository gates were triggered.
