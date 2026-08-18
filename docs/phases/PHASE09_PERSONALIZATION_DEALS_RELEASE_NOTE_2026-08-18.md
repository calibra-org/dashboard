# Phase 9 — Personalization & Deals

Release date: 2026-08-18

Phase 9 adds the tenant-safe personalization and deals foundation to Calibra while preserving the existing canonical pricing stack.

## Included

- Versioned behavioral event ingestion with bounded batch ingestion and deduplication.
- Consent-aware anonymous-to-customer identity merge with account-switch safeguards and user reset/preferences controls.
- Recommendation candidate/ranking abstractions, placement serving, exposure telemetry, cold-start fallback and explainability signals.
- Versioned feature, policy and model registries with rollout and rollback controls.
- Deal campaign lifecycle, quantity reservations/redemptions, per-customer limits, margin guard and deterministic conflict simulation through the canonical discounter.
- Successful-order reservation consumption inside order finalization.
- Tenant RLS migrations, admin personalization/deals workspace, storefront Amazing Deals surface, OpenAPI overlays and regenerated SDK contracts.

## Release gates

Phase-specific finalization validates formatting/lint, TypeScript typechecking, fresh database migrations, SDK generation and the Phase 9 integration verifier. Standard repository Check and SEO workflows remain the merge gates for the final PR head.
