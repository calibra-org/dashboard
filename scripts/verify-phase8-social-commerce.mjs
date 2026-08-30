import { existsSync, readFileSync } from "node:fs";

const failures = [];
let checks = 0;
const read = (path) => {
    checks += 1;
    if (!existsSync(path)) {
        failures.push(`missing file: ${path}`);
        return "";
    }
    return readFileSync(path, "utf8");
};
const has = (text, needle, label) => {
    checks += 1;
    if (!text.includes(needle)) failures.push(label ?? `missing invariant: ${needle}`);
};
const hasAny = (text, needles, label) => {
    checks += 1;
    if (!needles.some((needle) => text.includes(needle))) failures.push(label ?? `missing one of: ${needles.join(", ")}`);
};
const forbids = (text, needle, label) => {
    checks += 1;
    if (text.includes(needle)) failures.push(label ?? `forbidden invariant present: ${needle}`);
};

const routes = read("apps/api/start/routes.ts");
for (const routeFile of ["storefront_social_commerce", "account_social_commerce", "admin_social_commerce"])
    has(routes, routeFile, `route registry missing ${routeFile}`);

const adminRoutes = read("apps/api/start/routes/admin_social_commerce.ts");
for (const path of [
    "/contents",
    "/channels",
    "/threads",
    "/moderation",
    "/media/upload-intents",
    "/security-scan",
    "/live/emergency-stop",
    "/live/chat-freeze",
    "/live/replay",
    "/reviews/:reviewId",
    "/search",
    "/analytics",
    "/attributions",
])
    has(adminRoutes, path, `admin social route missing ${path}`);
const storefrontRoutes = read("apps/api/start/routes/storefront_social_commerce.ts");
for (const path of ["/story-rail", "/discover", "/interactions", "/search", "/playback", "/ask", "/provider/webhook"])
    has(storefrontRoutes, path, `storefront social route missing ${path}`);
const accountRoutes = read("apps/api/start/routes/account_social_commerce.ts");
for (const path of ["/follow", "/interactions", "/threads", "/messages", "/reports", "/reviews", "/reputation"])
    has(accountRoutes, path, `account social route missing ${path}`);

const limiter = read("apps/api/start/limiter.ts");
has(limiter, "socialInteractionLimiter", "social interaction limiter missing");
has(limiter, "socialProviderWebhookLimiter", "social provider webhook limiter missing");

const provider = read("apps/api/app/services/social/social_video_provider.ts");
for (const invariant of ["direct_upload", "direct_user", "createPlayback", "createLiveInput", "timingSafeEqual"])
    has(provider, invariant, `video provider invariant missing ${invariant}`);

const media = read("apps/api/app/services/social/social_media_pipeline_service.ts");
for (const invariant of [
    "createUploadIntent",
    "acknowledgeUpload",
    "consumeProviderWebhook",
    "inspect",
    "recordSecurityScan",
    "retryFailed",
    "markPublishable",
    "media_rights",
    "media_tracks",
    "media_security_scans",
    "askVideo",
    "insufficient_evidence",
    'event.readyToStream ? "scanning"',
    "E_SOCIAL_MEDIA_SCAN_REQUIRED",
    "safety_state",
    "quarantined",
])
    has(media, invariant, `media pipeline invariant missing ${invariant}`);
for (const invariant of ["!cleanScan", '!== "clean"']) has(media, invariant, `media publication must fail closed: ${invariant}`);

const service = read("apps/api/app/services/social/social_commerce_service.ts");
for (const invariant of [
    "emergencyStopLive",
    "freezeLiveChat",
    "moderateLiveParticipant",
    "attachLiveReplay",
    "convertThreadToTicket",
    "publishDue",
    "catalog_inventory_live",
    "Canonical Orders",
    "Ticket Operations",
    'input.cover_media_id ? "image/"',
    '["video", "live"].includes(String(current.kind)) ? "video/"',
])
    has(service, invariant, `social service invariant missing ${invariant}`);
for (const forbidden of ["social_orders", "social_payments", "social_support_tickets", "social_products", "social_inventory"]) {
    const migrationText = read("apps/api/database/migrations/1763900000000_create_social_commerce_os.ts");
    forbids(migrationText, `createTable(\"${forbidden}\"`, `parallel canonical domain created: ${forbidden}`);
}

const events = read("apps/api/app/services/social/social_event_service.ts");
for (const invariant of ["schema_version", "event_id", "event_name", "source_surface", "dedupe_key"])
    has(events, invariant, `event envelope missing ${invariant}`);
const registry = read("apps/api/app/services/social/social_event_registry.ts");
for (const invariant of ["schemaVersion", "purchase", "cart"]) has(registry, invariant, `event registry missing ${invariant}`);
const search = read("apps/api/app/services/social/social_search_service.ts");
hasAny(search, ["visibility", "access_policy"], "search ACL projection missing");
const reviews = read("apps/api/app/services/social/social_review_service.ts");
for (const invariant of ["verifiedPurchase", "helpful", "sellerResponse", "report"])
    has(reviews, invariant, `review trust invariant missing ${invariant}`);
const privacy = read("apps/api/app/services/social/social_privacy_service.ts");
for (const invariant of ["retentionDays", "eraseCustomer", "eraseDueCustomers"])
    has(privacy, invariant, `privacy invariant missing ${invariant}`);

const config = read("apps/api/app/services/configuration_registry.ts");
for (const key of [
    "community.social_story_rail_enabled",
    "community.social_discover_enabled",
    "community.social_live_enabled",
    "community.social_live_provider_enabled",
    "community.social_live_emergency_off",
    "community.social_moderation_emergency_mode",
    "media.social_uploads_enabled",
    "media.social_safety_required",
    "media.social_max_video_seconds",
])
    has(config, key, `Configuration OS key missing ${key}`);

const coreMigration = read("apps/api/database/migrations/1763900000000_create_social_commerce_os.ts");
for (const table of [
    "social_contents",
    "social_story_frames",
    "social_product_markers",
    "social_follow_edges",
    "social_interaction_events",
    "social_channels",
    "social_channel_memberships",
    "social_threads",
    "social_messages",
    "social_moderation_cases",
    "social_moderation_actions",
    "social_live_sessions",
    "social_commerce_attributions",
])
    has(coreMigration, `createTable("${table}"`, `core migration missing ${table}`);
for (const invariant of [
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "CREATE POLICY tenant_isolation",
    "frame_type",
    "cta_url",
    "product_id",
])
    has(coreMigration, invariant, `core migration invariant missing ${invariant}`);
const extensionMigration = read("apps/api/database/migrations/1764100000000_extend_phase8_media_reviews_events.ts");
for (const invariant of [
    "media_tracks",
    "media_rights",
    "social_provider_events",
    "social_moderation_appeals",
    "verified_order_id",
    "provider_ref",
    "storage_key",
    "evidence",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
])
    has(extensionMigration, invariant, `media/review extension missing ${invariant}`);
const hardeningMigration = read("apps/api/database/migrations/1764200000000_harden_phase8_media_live_privacy.ts");
for (const invariant of [
    "media_security_scans",
    "social_live_participant_controls",
    "suspicious",
    "malicious",
    "retry_count",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
])
    has(hardeningMigration, invariant, `hardening migration missing ${invariant}`);
const conversationMigration = read("apps/api/database/migrations/1764300000000_add_phase8_conversation_media.ts");
for (const invariant of ["social_message_media", "ENABLE ROW LEVEL SECURITY", "FORCE ROW LEVEL SECURITY"])
    has(conversationMigration, invariant, `conversation media migration missing ${invariant}`);

const adminValidator = read("apps/api/app/validators/admin/social_commerce_validator.ts");
for (const invariant of [
    "maxLength(1_024)",
    "/^(?:https?:\\/\\/|\\/(?!\\/))/i",
    "suspicious",
    "provider_ref",
    "storage_key",
    "500_000",
])
    has(adminValidator, invariant, `admin validator invariant missing ${invariant}`);
const storefrontValidator = read("apps/api/app/validators/storefront/social_commerce_validator.ts");
has(storefrontValidator, '"cart"', "storefront event contract missing cart");

const pkg = read("package.json");
for (const invariant of ["verify:phase8", "social:publish-due", "social:privacy-retention"])
    has(pkg, invariant, `root script missing ${invariant}`);
read("apps/api/commands/social_publish_due.ts");
read("apps/api/commands/social_privacy_retention.ts");

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
has(sidebar, "socialItems", "Admin sidebar socialItems missing");
for (const path of ["/social/overview", "/social/studio", "/social/community", "/social/moderation", "/social/analytics"])
    has(sidebar, path, `Admin social navigation missing ${path}`);
const workspace = read("apps/admin/src/features/social/SocialCommerceWorkspace.tsx");
for (const invariant of [
    "Creator Studio",
    "Media Governance",
    "Transcript / Caption Evidence",
    "Convert to Ticket",
    "Moderation",
    "Phase 8",
    "ResponsiveContainer",
    "AreaChart",
    "BarChart",
    "StatCard",
    "Capability health",
    "Attribution integrity",
])
    has(workspace, invariant, `Admin workspace invariant missing ${invariant}`);
for (const page of ["overview", "studio", "community", "moderation", "analytics"])
    read(`apps/admin/src/app/[locale]/(authenticated)/social/${page}/page.tsx`);
for (const locale of ["en", "fa"]) {
    const path = `apps/admin/messages/${locale}.json`;
    const text = read(path);
    try {
        JSON.parse(text);
        checks += 1;
    } catch {
        failures.push(`invalid JSON: ${path}`);
    }
    for (const key of ["socialOverview", "socialStudio", "socialCommunity", "socialModeration", "socialAnalytics"])
        has(text, `"${key}"`, `${path} missing ${key}`);
}
read("apps/admin/src/lib/queries/social/index.ts");

const webAdapter = read("apps/web/src/lib/social-api.ts");
for (const invariant of ["catalog_inventory_live", 'status:"network"'])
    has(webAdapter, invariant, `web social adapter missing ${invariant}`);
const cartRoute = read("apps/web/src/app/api/social/cart/route.ts");
for (const invariant of ["/api/v1/cart/items", "canonical_cart_path", "cart"])
    has(cartRoute, invariant, `social cart adapter missing ${invariant}`);
const action = read("apps/web/src/components/social/social-product-action.tsx");
hasAny(action, ["Add to cart", "افزودن به سبد", "aria-label"], "accessible social product cart action missing");

for (const doc of [
    "docs/calibra/PHASE8_MEDIA_LIVE_FAILURE_RUNBOOK.md",
    "docs/calibra/PHASE8_RETENTION_DELETION_PLAN.md",
    "docs/calibra/PHASE8_RELEASE_GATE_MATRIX.md",
])
    read(doc);
const failureRunbook = read("docs/calibra/PHASE8_MEDIA_LIVE_FAILURE_RUNBOOK.md");
for (const invariant of ["scanning", "quarantined", "social_live_emergency_off", "replay_ready"])
    has(failureRunbook, invariant, `failure runbook missing ${invariant}`);
const retentionPlan = read("docs/calibra/PHASE8_RETENTION_DELETION_PLAN.md");
for (const invariant of ["search", "caches", "Behavioral", "PENDING"])
    has(retentionPlan, invariant, `retention plan missing ${invariant}`);
const releaseGates = read("docs/calibra/PHASE8_RELEASE_GATE_MATRIX.md");
for (const invariant of ["PASS", "PENDING", "BLOCKED", "provider credentials"])
    has(releaseGates, invariant, `release matrix missing ${invariant}`);

const adminOpenApi = read("docs/api/reference/openapi/admin.phase8.v1.yaml");
for (const invariant of [
    "/api/v1/admin/social/contents",
    "/channels",
    "/threads",
    "/moderation",
    "/media",
    "/security-scan",
    "/live",
    "/replay",
    "/reviews",
    "/search",
    "/analytics",
])
    has(adminOpenApi, invariant, `admin OpenAPI missing ${invariant}`);
const storefrontOpenApi = read("docs/api/reference/openapi/storefront.phase8.v1.yaml");
for (const invariant of ["/story-rail", "/discover", "/interactions", "/search", "/playback", "/ask", "/provider/webhook"])
    has(storefrontOpenApi, invariant, `storefront OpenAPI missing ${invariant}`);

const testSpec = read("apps/api/tests/functional/social/phase8_social_commerce.spec.ts");
for (const title of [
    "Draft → Review → Published",
    "convert-to-ticket",
    "anonymous interaction",
    "duration beyond Configuration OS policy",
    "blocks video publication until canonical media is publishable",
    "rejects helpful self-votes",
    "requires a clean security verdict",
    "persists live mute/ban controls",
])
    has(testSpec, title, `functional coverage missing: ${title}`);

if (failures.length > 0) {
    console.error(JSON.stringify({ status: "FAIL", checks, failures }, null, 2));
    process.exit(1);
}
console.log(JSON.stringify({ status: "PASS", checks, failures: [] }, null, 2));
