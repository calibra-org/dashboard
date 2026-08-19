# Phase 9 — Personalization & Deals

Release date: 2026-08-18  
Status: LANDED — merged via PR #36  
Merge commit: `bbe7cdc10c6d19dde084c0a0567d8e69d44ad2c2`

Phase 9 adds the tenant-safe personalization and deals foundation to Calibra while preserving the existing canonical pricing stack.

## Included

- Versioned behavioral event ingestion with bounded batch ingestion and deduplication.
- Consent-aware anonymous-to-customer identity merge with account-switch safeguards and user reset/preferences controls.
- Recommendation candidate/ranking abstractions, placement serving, exposure telemetry, cold-start fallback and explainability signals.
- Versioned feature, policy and model registries with rollout and rollback controls.
- Deal campaign lifecycle, quantity reservations/redemptions, per-customer limits, margin guard and deterministic conflict simulation through the canonical discounter.
- Successful-order reservation consumption inside order finalization.
- Tenant RLS migrations, admin personalization/deals workspace, storefront Amazing Deals surface, OpenAPI overlays and regenerated SDK contracts.

## Release evidence

- The final Phase 9 PR head `7acf839b00bba415b05d874df1fa9f843b743512` completed repository `Check`, `SEO Engines`, and `Phase 13 Planning Integrity` successfully before merge.
- The release candidate was reconciled with the then-current `main` before those final gates ran.
- Generated SDK declarations were synchronized from the composed OpenAPI contracts before release.

## Current integration boundary

Phase 9 is present on `main`. Downstream phases must not describe Phase 9 itself as an unlanded dependency. A downstream subsystem may still truthfully report that it does not directly consume Phase 9 data until that specific integration is implemented and verified.
