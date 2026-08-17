# Phase 7 — Identity, Verification & Messaging Trust OS — Release Evidence

Date: 2026-08-17
Branch: `agent/phase7-identity-trust-os`
PR: #20

## Scope

Phase 7 extends the existing Calibra authentication and tenant boundary. It does not replace the current auth stack. The delivered scope includes tenant-scoped verification transactions, OTP compatibility endpoints, provider routing and delivery evidence, abuse controls, sessions/devices, step-up authentication, credential lifecycle (TOTP/recovery/passkey), fine-grained `identity.*` admin permissions, the Persian RTL Identity workspace, and OpenAPI/SDK synchronization.

## Security invariants

- Plaintext OTP values are not stored in the verification ledger; challenge secrets are hashed.
- Raw user identifiers are not persisted in the verification ledger; normalized identifier hashes and masked display values are used.
- OTP resend is bound to both the verification transaction and the normalized identifier, honors policy/SMS cooldown, supersedes the prior active challenge, increments challenge generation, and generates a fresh secret.
- Provider credentials are write-only in Admin API responses and stored encrypted.
- SMS delivery state is evidence-based; the simulated/log driver reports an unknown delivery state rather than claiming delivery.
- Sensitive Admin identity mutations require backend permission checks and recent action-scoped step-up proof.
- Identity tables are tenant-scoped and covered by the Phase 7 RLS migration.

## Contract and build evidence

The Phase 6/7 integration certification ran on GitHub Actions against PostgreSQL 17 and Redis 7 and verified the materialized production source before publication. The certification covered:

- canonical Phase 6 Configuration backend restoration without rebuilding a parallel settings domain
- Phase 7 semantic integration verifier
- storefront/admin Identity and Configuration OpenAPI bundle validity
- canonical SDK regeneration, SDK build and SDK typecheck
- API and Admin typechecks
- API route/OpenAPI synchronization
- merged OpenAPI test-fixture validation
- isolated Configuration engine/history regressions
- isolated Orders and Transaction Center regressions
- Phase 7 Identity functional regressions
- formatting normalization before the production-source commit

The materialization job then removed all temporary bootstrap, diagnostic and repair workflows and published the normalized source to the Phase 7 branch. Repository-standard `Check` and `SEO Engines` remain the final merge gates for this exact branch head.

## Functional evidence covered by the certification suite

- OTP request creates a tenant-scoped verification ledger without plaintext secret or raw identifier exposure.
- OTP resend rotates challenge generation, supersedes the previous challenge, and produces a fresh secret after cooldown.
- Explicit Admin permission denial is enforced by the backend.
- Password step-up unlocks a sensitive identity settings mutation only after successful proof.
- Provider credential material remains write-only and is absent from Admin API responses.
- Configuration preview/version/approval invariants remain covered after Phase 6 and Phase 7 coexistence.
- Order shipment and payment transaction regression suites pass against the normalized integration state.

## Baseline integration resolution

The earlier branch state exposed a real integration gap: Phase 6 Configuration UI existed on `main`, while its backend/OpenAPI overlay had not been materialized into the canonical branch consumed by Phase 7. That gap is now resolved in the production source. Phase 6 migrations are sequenced alongside the Phase 7 identity migration, Configuration is included in the Admin OpenAPI merge, generated SDK types are synchronized, and the targeted Phase 6/7 regression suites pass on the materialized state.
