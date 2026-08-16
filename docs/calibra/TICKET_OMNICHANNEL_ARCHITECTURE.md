# Calibra Ticket Omnichannel Architecture

Last updated: **2026-08-15**

## Current architecture audit

The existing Calibra Ticket OS already owns the canonical support domain. The implementation therefore extends, rather than replaces, these components:

- `support_tickets`, `support_ticket_messages`, `support_ticket_events`
- Ticket CRUD, Inbox, Detail, SLA, attachments, merge, presence
- saved views and bulk operations
- `support_channel_integrations`
- routing/automation rules
- campaigns/reports/CSAT/public support portal
- tenant request transaction + PostgreSQL RLS (`app.current_tenant`)
- Admin audit logging
- Adonis Transmit ticket invalidation (`ticket_realtime.ts`)
- the established Adonis encryption pattern used by payment-gateway credentials
- OpenAPI overlay -> bundled Admin spec -> generated SDK workflow

The previous channel registry was configuration/env-reference oriented and did not provide provider adapters, encrypted tenant-entered secrets, webhook ingestion, external IDs, persisted unread state, evidence-driven health, or native chat workspaces.

## Gap matrix

| Area | Existing | Required | Decision |
|---|---|---|---|
| Ticket records | Full canonical Ticket tables | External conversation mapping | Extend existing tables additively |
| Messages | Requester/reply/internal/system | Provider IDs, direction, media metadata, delivery/read | Extend `support_ticket_messages`; no parallel message table |
| Channel registry | One integration row per channel, basic status/config | Provider key, capabilities, encrypted secrets, health evidence | Extend existing registry |
| Credentials | Ticket registry used env references | Tenant-admin entered secrets, encryption/masking/rotation | Reuse Adonis encryption; never plaintext |
| Realtime | Tenant/user ticket invalidation after response | Message/status refresh | Reuse same Transmit invalidation; DB remains source of truth |
| Webhooks | No channel webhook pipeline | Verify, dedupe, normalize, map ticket | Add provider adapter webhook endpoints and RLS-scoped ledger |
| Routing/automation | Persisted existing engine | Provider/channel triggers | Feed canonical inbound tickets/messages to existing domain; do not create another engine |
| Campaigns | Persisted campaign model | Adapter-based dispatch evidence | Must call connected adapters only; no synthetic delivery |
| API channel | Registry entry | Scoped keys, expiry/IP/rate-limit/logs/webhooks | Add hash-only API key subsystem |
| UI | Generic channel cards | Provider forms, internal tabs, chat/security/logs | Replace only Channels surface; keep 8 first-class Ticket pages |

## Final request path

```text
Tickets / Channels UI
  -> same-origin Admin proxy
  -> Admin API auth + admin RBAC
  -> tenant context transaction
  -> PostgreSQL RLS
  -> OmnichannelService
  -> SupportChannelAdapterRegistry
  -> provider adapter
  -> official provider API
```

Inbound:

```text
Official Provider
  -> /api/v1/support/channels/:channel/:integrationId[/secret]
  -> tenant resolver / request transaction
  -> adapter verification (signature/header/clientState/path secret)
  -> payload hash + provider-event id dedupe
  -> adapter normalization / hydration
  -> existing support_tickets + support_ticket_messages
  -> persisted unread count
  -> post-response Transmit invalidation
  -> Ticket Inbox / Channels chat workspace
```

## Provider adapter contract

`SupportChannelAdapter` contains the provider-specific behavior and prevents controller-level provider conditionals:

- `validateConfiguration`
- `verifyConnection`
- `connect`
- `disconnect`
- optional `refreshCredentials`
- `sendMessage`
- optional `sendMedia`
- optional `sendTemplate` / `verifyTemplate`
- optional `markRead`
- `verifyWebhook`
- `normalizeWebhook`
- optional `expandWebhook` for push systems that require a follow-up fetch (Gmail/Graph)
- optional `verifyChallenge`

The registry is the only production adapter lookup. A catalog item without a registered/verified adapter cannot become `connected`.

## Credential and security model

Provider credentials are entered by tenant admins and encrypted using the same server-side Adonis encryption infrastructure already approved for payment credentials.

Security invariants:

- plaintext secret is accepted only on write and is never returned by a read API
- persisted integration stores ciphertext plus non-secret field-name metadata
- credential reads return `***`/configured booleans only
- blank secret fields preserve the stored value; entering a new value rotates it
- encryption purpose includes tenant + channel + provider to prevent cross-context ciphertext reuse
- secrets are not included in audit payloads; audit stores only changed field names
- provider errors are reduced to safe codes/messages
- secrets are not placed in browser storage, analytics, URLs (except a dedicated random callback path secret where the provider has no documented signature mechanism), or application logs
- API keys are random; database stores SHA-256 hash + short prefix only; full key is shown once
- API webhook signing secrets are encrypted and shown once
- API keys enforce scopes, optional IP allowlist, expiry/revoke and persisted per-minute accounting

## Webhook model

`support_channel_webhook_events` is a tenant-RLS ledger containing only event identity/processing metadata, not raw credential material. `payload_hash` provides replay/idempotency protection even when the provider supplies no stable event id. Where a stable provider event id exists it receives its own uniqueness constraint.

Provider-specific verification:

- Meta: `X-Hub-Signature-256` HMAC with App Secret + verification challenge token
- Telegram: official secret-token header
- Microsoft Graph: subscription validation token and `clientState`
- Gmail: authenticated Google Cloud Pub/Sub push is expected at ingress; API envelope is validated and history is hydrated through Gmail API
- Bale/Rubika: random Calibra callback path secret is used when a provider signature contract is not documented

No invalid event is converted into a Ticket message.

## Canonical conversation model

External conversation identity is stored on the existing ticket:

- `channel`
- `provider_account_id`
- `provider_conversation_id`
- `external_identity_key`
- persisted `unread_count`
- `last_read_at`

External message metadata is stored on the existing message:

- provider/account/conversation/message IDs
- direction (`inbound`, `outbound`, `internal`, `system`)
- sender/recipient external IDs
- message type and media reference
- reply target
- evidence-backed delivery state
- sent/delivered/read/provider timestamps
- provider metadata that does not contain secrets

A partial unique index on provider conversation prevents duplicate Ticket threads. A separate partial unique index on external provider message ID prevents duplicate messages.

## Ticket mapping and customer resolution

1. Find Ticket by tenant + channel + provider account + provider conversation.
2. If it exists, append the canonical message.
3. If it does not exist, create through `SupportTicketService` so SLA/reference/default-assignee behavior remains centralized, then attach provider identity to that Ticket/message.
4. Customer matching is deliberately conservative: exact normalized email or phone only in the initial path. Provider user ID is stored as an external identity, not silently merged into an unrelated customer.
5. Existing routing/automation can then operate on the resulting canonical Ticket/channel.

## Outbound messaging

```text
Agent reply
 -> validate/RBAC/RLS
 -> optimistic ticket version check
 -> existing `reply` message record (`sending`)
 -> provider adapter
 -> external provider message ID + `sent`
 -> later provider webhook may advance to delivered/read
```

If the provider call fails, the persisted reply becomes `failed` with only a safe error code. It is never reported as delivered.

**Internal notes cannot enter this path.** The omnichannel reply endpoint accepts only a reply body. Existing internal-note handling remains local to Calibra.

## Realtime and unread

The database remains source of truth. After a successful request transaction, the existing `scheduleTicketRealtime` broadcasts only a tenant/user-scoped ticket invalidation. Clients refetch the canonical Ticket/Conversation data. This preserves the existing anti-race design and avoids a second realtime bus.

Unread counters are persisted on tickets and aggregated per provider card/tab. Opening a conversation calls the persisted mark-read path; if the adapter supports an official external mark-read operation, it is invoked there.

## UI architecture

No ninth Ticket page is introduced. `Tickets -> Channels` owns five internal sections:

- Connections
- Chats
- Security
- Webhooks
- Logs

Provider cards use local SVG icon components (no hotlinks or new icon dependency). Internal provider tabs stay inside the page and preserve React state instead of opening browser tabs. Chat layout is 3-column on wide desktop, 2-column on smaller desktop/tablet and naturally collapses on narrow screens. The third column is Ticket context. Empty conversations remain empty; there is no demo customer/message/unread state.

## Database changes

Migration `1760001400000_ticket_omnichannel_messaging.ts` is additive and backward-compatible:

- extends `support_channel_integrations`
- extends `support_tickets`
- extends `support_ticket_messages`
- adds `support_channel_webhook_events`
- adds `support_channel_connection_events`
- adds `support_api_keys`
- adds `support_api_webhook_subscriptions`
- adds `support_api_request_logs`
- adds `support_channel_oauth_sessions`
- extends `support_campaigns` with provider template evidence/dispatch state

Every new tenant table uses tenant default GUC, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and the existing fail-closed tenant policy.

## Threat model

| Threat | Control |
|---|---|
| Credential disclosure | encryption at rest, masked response, safe audit/error payloads |
| Cross-tenant read/write | request transaction + forced PostgreSQL RLS |
| Forged webhook | provider signature/secret/clientState validation |
| Replay/duplicate message | payload hash + provider event/message unique indexes |
| CSRF on Admin writes | existing same-origin proxy + CSRF mutation header + Admin auth |
| API key theft | one-time display, hash-only DB, expiry/revoke/IP/rate limits |
| Fake health | explicit connection state machine based on provider evidence |
| Internal note disclosure | separate local note endpoint; omnichannel sender cannot accept internal-note kind |
| Poisoned media | outbound media accepts only existing Ticket attachments whose scan state is `clean`; size/MIME limits are enforced by the provider adapter |
| SSRF from API webhook URL | HTTPS-only create validation, DNS resolution, private/internal-address blocking, pinned connection address and redirect rejection in the signed webhook dispatcher |
| OAuth CSRF | Gmail/Microsoft interactive OAuth uses hash-only state, encrypted PKCE verifier, short-lived one-use sessions and S256; pre-provisioned refresh tokens remain a server-side fallback |

## Test strategy

Required automated coverage:

- adapter contract tests with mocked official HTTP boundaries
- credential encryption/masking/no-return tests
- valid/invalid provider verification
- webhook signature/secret valid/invalid
- duplicate webhook/message idempotency
- inbound creates or reuses correct Ticket
- outbound success/failure state transitions
- provider delivery/read update
- unread persistence + mark-read
- internal note isolation
- tenant RLS isolation
- API key hash-only, one-time secret, scopes, expiry, revoke, IP and rate-limit
- admin Channels empty/configured/error/connected UI states
- provider tab switching and chat state preservation
- mobile/tablet/desktop visual/responsive checks
- migration up/down and OpenAPI/codegen sync

Live provider E2E is conditional: if production/sandbox credentials are absent, only implementation and contract tests can pass. The release report must say exactly: **Implementation/contract tests passed; live provider verification requires credentials.**

## Rollout strategy

1. Apply additive migration.
2. Ship catalog/credential storage with every external integration disabled.
3. Enable one tenant/provider at a time after credentials are entered and `Test Connection` succeeds.
4. Configure/verify webhook and only then permit `connected`.
5. Observe last inbound/outbound/webhook/API timestamps and connection-event logs.
6. Enable outbound replies for that provider.
7. Enable campaigns only after the provider adapter and template/policy prerequisites are verified.
8. Do not enable Eitaa, generic SMTP/IMAP, or an SMS provider until their current production contract/dependency gate is explicitly satisfied.

## Implemented production gates

- API Channel keys are hash-only, scoped, expiring/revocable, optional-IP-restricted and rate-limited. Outbound API webhooks are HMAC signed and SSRF-hardened.
- WhatsApp campaign templates are verified directly against Meta and only provider `APPROVED` evidence can set the provider-template gate to approved. Delivery/read campaign counters advance only from provider events.
- Media sending is available only where the adapter advertises an implemented capability and only from clean-scanned Ticket attachments.
- Gmail/Microsoft interactive OAuth is implemented with state + PKCE; no OAuth token is placed in browser storage.

## Known rollout gates

- Real Meta/Gmail/Microsoft/Telegram/Bale/Rubika credentials are not stored in repository and must be supplied by the tenant/environment for live E2E.
- Gmail requires authenticated Pub/Sub push ingress configuration.
- Microsoft Graph subscription renewal must be scheduled before production long-running health can be considered complete.
- Generic SMTP/IMAP needs approval for a maintained IMAP dependency or a separately approved implementation.
- A concrete SMS provider must be selected and its official API contract verified before its adapter is enabled.
- Eitaa stays unavailable until official production documentation is verifiable.
