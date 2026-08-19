# Phase 8 retention & deletion propagation plan

Date: 2026-08-17
Owner: Calibra Platform / Privacy

## Scope

Phase 8 creates social interaction, community, review, media-rights, moderation, provider-event, and attribution records. Deletion is not complete until all user-identifying links are removed or pseudonymized across the authoritative database and derived systems.

## Authoritative database propagation

- Customer erasure invokes `social_privacy_service` to unlink or pseudonymize `social_follow_edges`, `social_channel_memberships`, messages/conversations where retention is still required, interaction actors, and `media_rights` holder/customer references where policy allows.
- Private conversation attachments in `social_message_media` follow the parent message/thread retention outcome; canonical `media` objects are deleted only when no retained authority still references them.
- Moderation and legal evidence that must remain is retained with identifying fields minimized; the legal/policy basis must be recorded rather than inferred.
- Behavioral-event rows expire through the configured retention command. Attribution needed for canonical commerce/audit is handled under the commerce retention authority rather than duplicated into a permanent Social identity store.

## Derived-system propagation

- **search**: remove or resync deleted/hidden content and customer-derived projections; ACL changes must be propagated before search documents can be considered deleted.
- **caches**: invalidate Story Rail, Discover, playback/access, moderation, reputation and thread caches that can expose removed identity or content.
- Analytics/Behavioral projections must be rebuilt or compacted so erased actor identifiers are not recoverable from derived materializations.
- Provider-side originals, variants and temporary uploads follow media provider retention policy after the canonical record becomes eligible for deletion.

## Operational workflow

1. Resolve tenant and subject identity under tenant context.
2. Execute authoritative database unlink/erase in a transaction where practical.
3. Enqueue or synchronously perform search/cache/provider propagation.
4. Record audit evidence containing operation id and outcome, not deleted sensitive payloads.
5. Re-run privacy verification and surface any incomplete propagation as an operator task.

## Current release evidence

- Database-side privacy service and scheduled retention command: **PASS** by static integration checks.
- Search/cache/provider deletion propagation runtime proof: **PENDING** until CI/runtime integration evidence exists.
- Live provider retention/deletion proof with production credentials: **PENDING** and must not be reported as complete from configuration alone.
