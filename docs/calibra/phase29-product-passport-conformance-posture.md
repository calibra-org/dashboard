# Phase 29 — Product Provenance & Digital Product Passport OS

## Binding posture

Phase 29 is standards-aware and interoperability-oriented. It MUST NOT represent Calibra, a merchant, a product, or a passport as certified or conformant with GS1, the EU Ecodesign for Sustainable Products Regulation (ESPR), any delegated act, or any other jurisdictional Digital Product Passport regime unless an explicit, versioned conformance review has been completed for the exact framework and product category.

## Source-of-truth boundaries

Phase 29 does not create a parallel product master.

- Product identity reuses `products` and `product_variations`.
- GTIN continues to come from the existing product/variation model.
- Supplier provenance reuses Phase 14 suppliers, purchase orders and receipt-line lot/batch/serial data.
- Quality evidence may reference Phase 19 quality cases/evidence/findings.
- Risk and authenticity decisions may reference Phase 20 trust/risk outputs.
- Returns, refunds and support/service evidence remain owned by their existing domains.
- Phase 29 stores passport projections, immutable evidence references, provenance edges and issued public snapshots.

## Identity levels

The generic identity hierarchy is:

1. `product` — canonical product family identity.
2. `model` — product variation/model identity.
3. `batch` — batch/lot identity; `batch_code` is required.
4. `item` — serialized item identity; `serial_number` is required.

The passport layer links these identities to existing operational records rather than duplicating them.

## Public/private data contract

Public resolver output is allow-list based. It may only contain:

- explicit `public_fields` from a published passport version;
- evidence records whose visibility is `public`;
- graph edges whose visibility is `public`;
- safe identity/resolver metadata intentionally included in the issued snapshot.

`private_fields`, private evidence payloads and private graph edges are never merged into the public response. Admin permissions do not change this public-output rule.

## Resolver and data-carrier abstraction

`resolver_key` is stable within a tenant. `resolver_config` may carry identifier and link-template metadata suitable for future GS1 Digital Link integration, but Phase 29 does not claim GS1 Digital Link conformance by construction alone. QR or other data carriers resolve to a stable Calibra resolver endpoint; carrier encoding is an adapter concern, not the product identity source of truth.

## Regulatory mappings

Regulatory mappings are data, not hard-coded truth. Every mapping is keyed by:

- jurisdiction;
- framework;
- framework version;
- Calibra mapping version;
- effective period;
- explicit conformance note.

A mapping can be draft, active or retired. Updating a regulatory interpretation creates a new version rather than silently mutating historical issued passports.

## Evidence integrity

Evidence entries are append-oriented and content-addressed with SHA-256 content hashes. An evidence record identifies source kind/reference, issuer, occurrence time and verification state. Phase 29 may project trusted evidence from existing domains but must preserve provenance to the originating source.

Published passport versions are immutable snapshots with their own content hash. Re-publication creates a new monotonically increasing version.

## Initial conformance-review checklist

Before any external conformance claim:

1. identify the exact jurisdiction, regulation/standard version and applicable product category;
2. confirm mandatory identifiers, data fields, access rights and data-carrier rules;
3. confirm registry/resolver/service-provider obligations where applicable;
4. validate data ownership, retention and update duties;
5. run schema and resolver interoperability tests;
6. document gaps and compensating controls;
7. obtain explicit legal/standards sign-off and store the reviewed version reference.

This document is the binding Phase 29 posture until a later versioned conformance review supersedes it.
