import { existsSync, readFileSync } from "node:fs";

const required = [
    "apps/api/database/migrations/1760001400000_ticket_omnichannel_messaging.ts",
    "apps/api/app/services/support/channel_adapter_registry.ts",
    "apps/api/app/services/support/omnichannel_service.ts",
    "apps/api/app/services/support/support_channel_credentials_service.ts",
    "apps/api/app/services/support/support_channel_oauth_service.ts",
    "apps/api/app/services/support/support_api_key_service.ts",
    "apps/api/app/services/support/support_api_webhook_dispatcher.ts",
    "apps/api/app/services/support/support_campaign_dispatch_service.ts",
    "apps/api/app/controllers/support_channel_webhook_controller.ts",
    "apps/api/start/routes/admin_ticket_omnichannel.ts",
    "apps/api/start/routes/support_channel_webhooks.ts",
    "apps/admin/src/features/tickets/channels.tsx",
    "apps/admin/src/features/tickets/api-channel-pane.tsx",
    "apps/admin/src/features/tickets/campaign-omnichannel-controls.tsx",
    "docs/calibra/TICKET_OMNICHANNEL_PROVIDER_REQUIREMENTS.md",
    "docs/calibra/TICKET_OMNICHANNEL_ARCHITECTURE.md",
    "docs/api/reference/openapi/admin.ticket-omnichannel.v1.yaml",
];
for (const path of required) if (!existsSync(path)) throw new Error(`Ticket omnichannel file missing: ${path}`);

const migration = readFileSync(required[0], "utf8");
for (const table of [
    "support_channel_webhook_events",
    "support_channel_connection_events",
    "support_api_keys",
    "support_api_webhook_subscriptions",
    "support_channel_oauth_sessions",
    "support_api_request_logs",
]) {
    if (!migration.includes(`"${table}"`)) throw new Error(`Tenant table missing: ${table}`);
}
if (
    !migration.includes("ENABLE ROW LEVEL SECURITY") ||
    !migration.includes("FORCE ROW LEVEL SECURITY") ||
    !migration.includes("CREATE POLICY tenant_isolation")
)
    throw new Error("Forced tenant RLS loop missing");
if (!migration.includes("credentials_ciphertext") || migration.includes("credentials_plaintext"))
    throw new Error("Encrypted provider credential invariant missing");
if (
    !migration.includes("support_ticket_messages_external_unique") ||
    !migration.includes("support_tickets_provider_conversation_unique")
)
    throw new Error("Provider idempotency uniqueness missing");

const credentials = readFileSync("apps/api/app/services/support/support_channel_credentials_service.ts", "utf8");
if (!credentials.includes("encryption.encrypt") || !credentials.includes("SUPPORT_CREDENTIAL_MASK"))
    throw new Error("Credential encryption/masking implementation missing");

const service = readFileSync("apps/api/app/services/support/omnichannel_service.ts", "utf8");
for (const invariant of [
    "supportTicketService.create",
    "supportTicketService.addMessage",
    'delivery_state: "failed"',
    'addMessage(ticketId, "reply"',
    "payloadHash",
    "support_channel_webhook_events",
])
    if (!service.includes(invariant)) throw new Error(`Omnichannel invariant missing: ${invariant}`);
if (service.includes('kind: "internal_note"'))
    throw new Error("Omnichannel provider service must never construct an internal note send");

const oauth = readFileSync("apps/api/app/services/support/support_channel_oauth_service.ts", "utf8");
for (const invariant of ["state_hash", "code_challenge_method", "S256", "pkce_verifier_ciphertext"])
    if (!oauth.includes(invariant)) throw new Error(`OAuth security invariant missing: ${invariant}`);

const apiKey = readFileSync("apps/api/app/services/support/support_api_key_service.ts", "utf8");
for (const invariant of ["key_hash", "rate_limit_per_minute", "allowed_ips", "signing_secret"])
    if (!apiKey.includes(invariant)) throw new Error(`API channel invariant missing: ${invariant}`);

const dispatcher = readFileSync("apps/api/app/services/support/support_api_webhook_dispatcher.ts", "utf8");
for (const invariant of [
    "createHmac",
    "x-calibra-signature",
    "isPrivateContentSourceAddress",
    "Webhook redirects are not allowed",
])
    if (!dispatcher.includes(invariant)) throw new Error(`Signed webhook invariant missing: ${invariant}`);

const campaign = readFileSync("apps/api/app/services/support/support_campaign_dispatch_service.ts", "utf8");
for (const invariant of ["verifyProviderTemplate", "provider_template_status", "sendTemplate", "E_SUPPORT_CHANNEL_NOT_CONNECTED"])
    if (!campaign.includes(invariant)) throw new Error(`Campaign provider gate invariant missing: ${invariant}`);

const catalog = readFileSync("apps/api/app/services/support/channel_catalog.ts", "utf8");
if (!catalog.includes('provider_key: "eitaa_official_unverified"') || !catalog.includes("production_available: false"))
    throw new Error("Unverified Eitaa posture missing");

const ui = readFileSync("apps/admin/src/features/tickets/channels.tsx", "utf8");
for (const section of ["connections", "chats", "security", "webhooks", "logs"])
    if (!ui.includes(`"${section}"`)) throw new Error(`Channels UI section missing: ${section}`);
if (ui.includes("iframe") || ui.includes("web.whatsapp.com") || ui.includes("web.telegram.org"))
    throw new Error("External web-client embedding is forbidden");

const routes = readFileSync("apps/api/start/routes.ts", "utf8");
for (const route of ["admin_ticket_omnichannel.js", "support_channel_webhooks.js", "support_api.js"])
    if (!routes.includes(route)) throw new Error(`Omnichannel route import missing: ${route}`);

const openapiPackage = JSON.parse(readFileSync("docs/api/package.json", "utf8"));
if (!String(openapiPackage.scripts?.["build:json:admin"]).includes("admin-ticket-omnichannel"))
    throw new Error("Admin OpenAPI build does not include omnichannel overlay");

console.log("Ticket omnichannel integration verifier passed");
