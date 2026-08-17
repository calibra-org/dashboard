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

The final Phase 7 certification workflow completed successfully on 2026-08-17 against PostgreSQL 17 and Redis 7. It verified:

- Phase 7 semantic integration verifier
- storefront/admin Identity OpenAPI bundle validity
- canonical SDK generation and SDK build
- SDK typecheck
- API typecheck
- Admin Identity typecheck isolation (no Phase 7 Identity errors)
- Phase 7 functional tests against a migrated PostgreSQL test database
- API production build
- generated SDK publication

The certifier also removed all temporary Phase 7 bootstrap/repair workflows before publication.

## Functional evidence covered by the certification suite

- OTP request creates a tenant-scoped verification ledger without plaintext secret or raw identifier exposure.
- OTP resend rotates challenge generation, supersedes the previous challenge, and produces a fresh secret after cooldown.
- Explicit Admin permission denial is enforced by the backend.
- Password step-up unlocks a sensitive identity settings mutation only after successful proof.
- Provider credential material remains write-only and is absent from Admin API responses.

## Baseline separation

The repository had pre-existing main-branch integration debt before Phase 7, notably Configuration/OpenAPI generated-type drift and other Check workflow failures. Phase 7 certification isolates those baseline failures so they cannot be misattributed to Identity code; repository-wide merge still requires the standard PR Check gate to be evaluated and repaired before PR #20 can merge.
