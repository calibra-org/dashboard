# Phase 30 — Retail Media & Creator Monetization conformance posture

Phase 30 is a Calibra-native retail-media and creator-economy capability. It extends the canonical Product, Inventory, Order, Refund, Experimentation and Economics domains; it does not create a parallel commerce master.

## Production boundaries

- Sponsored delivery is fail-closed: a candidate must first pass campaign/advertiser state, schedule, product publication, safety approval, minimum relevance, minimum quality, canonical inventory availability and funded-budget availability. Bid is calculated only after those gates.
- Bid is deliberately bounded to a 10% percentile signal after eligibility; relevance and quality make up the other 90% of the ranking score. An unsafe, irrelevant, low-quality or unavailable item cannot buy a top placement.
- Every storefront sponsored decision carries `sponsored: true` and a non-empty merchant-configured disclosure string. The disclosure is part of the placement contract, not optional creative copy.
- Public measurement accepts only pseudonymous `subject_hash` plus a recursively screened context object. Direct-identifier/token-like keys are rejected. Admin reporting suppresses cohort metrics below the configured privacy threshold, with a hard database minimum of 20.
- Campaign money is BIGINT minor units. Funding, spend, refunds and adjustments are an append-only, idempotent ledger. Delivery cannot spend beyond the lesser of the configured campaign cap and recorded funding, and daily pacing is enforced under a campaign row lock.
- Creator attribution is carried through the canonical Cart -> Order attributes boundary. Commission is created only from canonical completed Order/OrderLineItem data; a browser cannot self-report a payable conversion.
- Creator commission is append-only. Refunds produce independent negative `refund_adjustment` rows and never mutate historical commission rows. Adjustment math is proportional and clamped so cumulative refunds cannot reverse more than the original commission.
- Creator payout entries record an externally executed payout reference after backend permission + recent identity step-up. Phase 30 does **not** claim to transmit money to a payout provider.
- Incrementality is not inferred from attributed revenue. The measurement surface only exposes incremental contribution when Phase 17 Experimentation/holdout evidence contains an actual measured effect.

## Reused Calibra authorities

Phase 30 deliberately reuses:

1. canonical `products`, `product_variations` and `inventory_items` for sellability/availability;
2. canonical Cart, Order, OrderLineItem and Refund lifecycle for creator attribution and reconciliation;
3. Phase 17 experiments/holdouts for causal measurement rather than inventing another experimentation system;
4. existing admin permissions, strict audit, step-up authentication, tenant context/RLS and rate limiting;
5. existing Economics ledgers for downstream contribution-margin truth.

## External design references

The implementation is informed by public industry patterns rather than copied code:

- Instacart Ads documentation: sponsored-product delivery uses relevance and inventory/availability controls before auction economics.
- Amazon Ads retail-media documentation: sponsored experiences are designed as native/contextual retail placements with closed-loop first-party measurement.
- Shopify Collabs documentation: creator commissions use a holding window and canceled/refunded orders adjust commissions before payout.
- U.S. FTC Native Advertising guidance: paid/native advertising disclosures should be clear, prominent and proximate to the sponsored content.
- IAB/MRC retail-media measurement guidance: incrementality is a causal lift concept and should be separated from attributed/observed revenue.

These references are design inputs only. Calibra Phase 30 does **not** claim IAB certification, MRC accreditation, FTC legal approval, Amazon/Instacart compatibility, Shopify Collabs compatibility, or any other third-party conformance.

## Release gate

Phase 30 is merge-ready only when the exact PR head passes its dedicated integrity workflow with no materialization or generated-SDK drift, and the repository-wide checks that exercise shared routes, migrations, API contracts and builds have no Phase 30 regression.

## Explicit non-claims

- No IAB/MRC certification or measurement accreditation is claimed.
- No universal privacy/compliance certification is claimed; jurisdiction-specific legal review remains required.
- No guaranteed incrementality is shown when a valid Phase 17 experiment/holdout result is absent.
- No external creator payout transmission is implemented by the ledger-recording endpoint.
- No raw cross-tenant advertiser/customer data is exposed; tenant RLS remains fail-closed.
- Retail-media delivery is not a replacement for the canonical personalization/recommendation authority; it is a sponsored eligibility/ranking layer with explicit disclosure.
