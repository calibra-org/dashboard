# Phase 8 release gate matrix

Date: 2026-08-18
Scope: Social Commerce, Stories, Video & Community OS

| Gate | Status | Evidence / required proof |
|---|---|---|
| Tenant schema + forced RLS + canonical Product/Inventory/Order/Ticket boundaries | PASS | Static verifier and migration inspection; runtime migration/RLS test still required in CI. |
| Content lifecycle, moderation, community and Ticket handoff wiring | PASS | Static verifier plus functional test coverage committed with Phase 8. |
| Media fail-closed publication gate, security scan and bounded retry | PASS | Static state-machine verification; runtime DB/provider simulations must pass before merge. |
| Live emergency stop, chat freeze, participant mute/ban and replay gate | PASS | Static contracts and functional coverage; live provider call proof depends on credentials. |
| Admin Social Commerce workspace + navigation | PASS | API-driven queries and five authenticated routes are wired. |
| Storefront Story Rail, Discover and canonical cart bridge | PASS | Storefront adapter and cart path are statically verified. |
| OpenAPI overlay build + merge | PENDING | Must bundle/lint in GitHub CI against the current merged API specs. |
| Typecheck / lint / build / test | PENDING | Must pass on the exact PR head in GitHub Actions. |
| PostgreSQL migration up/down + forced RLS runtime proof | PENDING | Requires CI/runtime database execution on the exact PR head. |
| Provider webhook/live/upload proof with real provider credentials | BLOCKED | No production provider credentials are assumed in source control; provider credentials remain secret-store dependencies. |
| External media malware/security scanner proof | BLOCKED | Requires configured scanner/runtime evidence; manual test endpoints do not equal production scanner proof. |
| Production rollout | BLOCKED | Only after all non-provider merge gates are PASS and provider-dependent gates are explicitly accepted or completed. |

A gate is never promoted from PENDING/BLOCKED to PASS because a feature flag or credential variable exists. PASS requires observed evidence on the exact code being released.
