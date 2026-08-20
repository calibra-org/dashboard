# Phase 8 Media & Live failure runbook

Date: 2026-08-17
Owner: Calibra Platform / Social Commerce

## Safety rule

Never mark a gate healthy from configuration alone. Use database state, provider response, callback evidence, queue/runtime metrics and an operator-visible audit trail.

## Media upload / processing

1. Check `social_media_assets.upload_state`, `media.processing_state`, the latest `social_provider_events`, and the latest `media_security_scans`.
2. `scanning` means provider processing may be ready while Calibra's safety gate is unresolved. Do not force `publishable`.
3. `quarantined` or `rejected` requires evidence review. Do not expose that asset through public playback.
4. `processing_failed` and `validation_failed` may use the bounded retry path. Retry count is capped; repeated failure requires operator investigation rather than an infinite loop.
5. A missing or invalid provider signature is a security failure, not a retryable tenant-routing issue.
6. If provider health is uncertain, disable `media.social_uploads_enabled` while preserving already-safe playback.

## Live incident

1. Set `community.social_live_emergency_off=true` to prevent new or progressing Live sessions during a broad incident.
2. For one session, use the audited emergency-stop action; provider ingest is stopped before domain state is finalized.
3. Use chat freeze and tenant-scoped mute/ban participant controls when abuse is localized.
4. A replay is `replay_ready` only after a canonical `live_replay` media asset reaches the required media gate and is explicitly attached.
5. Never expose stream keys in logs, audit payloads, tickets, or metadata.

## Recovery evidence

Record incident correlation id, tenant, affected provider reference, timestamps, callback ids, state transitions, operator, and rollback/config changes. Credential rotation belongs in the infrastructure secret store, not Configuration OS values exposed to content operators.
