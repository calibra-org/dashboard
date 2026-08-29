import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
    return readFileSync(path, "utf8");
}

function write(path, value) {
    writeFileSync(path, value, "utf8");
}

function replaceOnce(path, needle, replacement) {
    const source = read(path);
    const first = source.indexOf(needle);
    if (first < 0) throw new Error(`Phase30 materializer: expected anchor missing in ${path}: ${needle.slice(0, 80)}`);
    if (source.indexOf(needle, first + needle.length) >= 0) {
        throw new Error(`Phase30 materializer: anchor is ambiguous in ${path}: ${needle.slice(0, 80)}`);
    }
    write(path, source.slice(0, first) + replacement + source.slice(first + needle.length));
}

function replaceIfMissing(path, marker, needle, replacement) {
    const source = read(path);
    if (source.includes(marker)) return;
    replaceOnce(path, needle, replacement);
}

replaceIfMissing(
    "apps/api/start/routes.ts",
    "./routes/admin_retail_media.js",
    'await import("./routes/admin_product_passports.js");',
    'await import("./routes/admin_product_passports.js");\nawait import("./routes/admin_retail_media.js");',
);
replaceIfMissing(
    "apps/api/start/routes.ts",
    "./routes/retail_media_storefront.js",
    'await import("./routes/product_passports_public.js");',
    'await import("./routes/product_passports_public.js");\nawait import("./routes/retail_media_storefront.js");',
);

replaceIfMissing(
    "apps/api/app/services/order_factory.ts",
    "retail_media_attribution: retailMediaAttribution",
    "            order.cartHash = String(cart.id);\n            order.itemsTotal = totals.itemsTotal;",
    `            order.cartHash = String(cart.id);\n            const cartAttributes = (cart.attributes as Record<string, unknown> | null) ?? {};\n            const retailMediaAttribution = cartAttributes.retail_media_attribution;\n            if (retailMediaAttribution && typeof retailMediaAttribution === "object" && !Array.isArray(retailMediaAttribution)) {\n                order.attributes = {\n                    ...((order.attributes as Record<string, unknown> | null) ?? {}),\n                    retail_media_attribution: retailMediaAttribution,\n                };\n            }\n            order.itemsTotal = totals.itemsTotal;`,
);

replaceIfMissing(
    "apps/api/start/events.ts",
    "handleRetailMediaOrderCompleted",
    'emitter.on("order:completed", async ({ order }) => {\n    await CacheInvalidation.customerChanged(order.tenantId, order.customerId as bigint | number | null | undefined);\n});',
    `emitter.on("order:completed", async ({ order }) => {\n    await CacheInvalidation.customerChanged(order.tenantId, order.customerId as bigint | number | null | undefined);\n    try {\n        const { handleRetailMediaOrderCompleted } = await import("#services/retail_media/event_bridge");\n        await handleRetailMediaOrderCompleted(Number(order.id));\n    } catch (error) {\n        logger.error({ err: error, orderId: Number(order.id) }, "Failed to settle creator commissions after order completion");\n    }\n});`,
);
replaceIfMissing(
    "apps/api/start/events.ts",
    "handleRetailMediaOrderRefunded",
    'emitter.on("order:refunded", async ({ tenantId, customerId }) => {\n    await CacheInvalidation.customerChanged(tenantId, customerId);\n});',
    `emitter.on("order:refunded", async ({ tenantId, customerId, refundId }) => {\n    await CacheInvalidation.customerChanged(tenantId, customerId);\n    try {\n        const { handleRetailMediaOrderRefunded } = await import("#services/retail_media/event_bridge");\n        await handleRetailMediaOrderRefunded(Number(refundId));\n    } catch (error) {\n        logger.error({ err: error, refundId: Number(refundId) }, "Failed to reconcile creator commission after refund");\n    }\n});`,
);

replaceIfMissing(
    "apps/admin/src/components/Sidebar.tsx",
    'href: "/analytics/retail-media"',
    '            { href: "/analytics/growth-portfolio", label: "سبد رشد خودکار", icon: TrendingUp },',
    '            { href: "/analytics/growth-portfolio", label: "سبد رشد خودکار", icon: TrendingUp },\n            { href: "/analytics/retail-media", label: "رسانه تجاری و سازندگان", icon: BadgePercent },',
);

const workspacePath = "apps/admin/src/features/retail-media/RetailMediaWorkspace.tsx";
replaceIfMissing(
    workspacePath,
    'subtitle="کنترل یکپارچه تبلیغات بومی',
    'description="کنترل یکپارچه تبلیغات بومی، بودجه و pacing، جایگاه‌های Sponsored، همکاری سازندگان و سنجش incrementality با guardrailهای اعتماد."',
    'subtitle="کنترل یکپارچه تبلیغات بومی، بودجه و pacing، جایگاه‌های Sponsored، همکاری سازندگان و سنجش incrementality با guardrailهای اعتماد."',
);
for (const setter of [
    "setAdvertiserId",
    "setSelectedCampaign",
    "setPlacementId",
    "setSurface",
    "setCreatorId",
    "setCampaignId",
]) {
    replaceIfMissing(
        workspacePath,
        `onValueChange={(value) => ${setter}(String(value))}`,
        `onValueChange={${setter}}`,
        `onValueChange={(value) => ${setter}(String(value))}`,
    );
}
replaceIfMissing(workspacePath, "[row.id]: String(value)", "[row.id]: value", "[row.id]: String(value)");

replaceIfMissing(
    "apps/api/app/services/retail_media/retail_media_service.ts",
    "type EligibleRetailMediaCandidate = RetailMediaRankCandidate &",
    `export type RetailMediaRankCandidate = {\n    campaign_public_id: string;\n    paid_bid_minor: number;\n    relevance_bps: number;\n    quality_bps: number;\n};`,
    `export type RetailMediaRankCandidate = {\n    campaign_public_id: string;\n    paid_bid_minor: number;\n    relevance_bps: number;\n    quality_bps: number;\n};\n\ntype EligibleRetailMediaCandidate = RetailMediaRankCandidate &\n    JsonRecord & {\n        campaign_id: number | string;\n        campaign_name: string;\n        bid_model: "cpc" | "cpm";\n        currency: string;\n        product_id: number | string;\n        variation_id: number | string | null;\n        advertiser_public_id: string;\n        advertiser_name: string;\n        creative: unknown;\n        creative_source_ref: string | null;\n    };`,
);
replaceIfMissing(
    "apps/api/app/services/retail_media/retail_media_service.ts",
    "from.toUTC().toJSDate()",
    "from.toUTC().toSQL()",
    "from.toUTC().toJSDate()",
);
replaceIfMissing(
    "apps/api/app/services/retail_media/retail_media_service.ts",
    "const eligible: EligibleRetailMediaCandidate[] = [];",
    "const eligible: Array<JsonRecord & { paid_bid_minor: number; relevance_bps: number; quality_bps: number }> = [];",
    "const eligible: EligibleRetailMediaCandidate[] = [];",
);
replaceIfMissing(
    "apps/api/app/services/retail_media/retail_media_service.ts",
    "campaign_public_id: String(candidate.campaign_public_id),",
    `        eligible.push({\n            ...candidate,\n            paid_bid_minor: Math.max(0, paidBid),\n            relevance_bps: asNumber(candidate.relevance_bps),\n            quality_bps: asNumber(candidate.quality_bps),\n        });`,
    `        eligible.push({\n            ...candidate,\n            campaign_id: candidate.campaign_id,\n            campaign_public_id: String(candidate.campaign_public_id),\n            campaign_name: String(candidate.campaign_name),\n            bid_model: candidate.bid_model as "cpc" | "cpm",\n            currency: String(candidate.currency),\n            product_id: candidate.product_id,\n            variation_id: candidate.variation_id ?? null,\n            advertiser_public_id: String(candidate.advertiser_public_id),\n            advertiser_name: String(candidate.advertiser_name),\n            creative: candidate.creative,\n            creative_source_ref: candidate.creative_source_ref == null ? null : String(candidate.creative_source_ref),\n            paid_bid_minor: Math.max(0, paidBid),\n            relevance_bps: asNumber(candidate.relevance_bps),\n            quality_bps: asNumber(candidate.quality_bps),\n        });`,
);

const docsPackagePath = "docs/api/package.json";
const docsPackage = JSON.parse(read(docsPackagePath));
const scripts = docsPackage.scripts ?? {};
scripts["build:json:admin-phase30"] =
    "redocly bundle reference/openapi/admin.phase30.v1.yaml -o dist/admin.phase30.v1.json --ext json";
scripts["build:json:storefront-phase30"] =
    "redocly bundle reference/openapi/storefront.phase30.v1.yaml -o dist/storefront.phase30.v1.json --ext json";
const adminBuild = String(scripts["build:json:admin"] ?? "");
if (!adminBuild.includes("build:json:admin-phase30")) {
    const anchor = " && pnpm build:json:admin-merge";
    if (!adminBuild.includes(anchor)) throw new Error("Phase30 materializer: admin OpenAPI aggregate anchor missing");
    scripts["build:json:admin"] = adminBuild.replace(anchor, ` && pnpm build:json:admin-phase30${anchor}`);
}
const storefrontBuild = String(scripts["build:json:storefront"] ?? "");
if (!storefrontBuild.includes("build:json:storefront-phase30")) {
    const anchor = " && pnpm build:json:storefront-merge";
    if (!storefrontBuild.includes(anchor)) throw new Error("Phase30 materializer: storefront OpenAPI aggregate anchor missing");
    scripts["build:json:storefront"] = storefrontBuild.replace(anchor, ` && pnpm build:json:storefront-phase30${anchor}`);
}
delete scripts["build:json:admin-parts"];
delete scripts["build:json:storefront-parts"];
docsPackage.scripts = scripts;
write(docsPackagePath, `${JSON.stringify(docsPackage, null, 4)}\n`);

replaceIfMissing(
    "docs/api/scripts/merge-admin-spec.js",
    "admin.phase30.v1.json",
    'const phase29 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase29.v1.json"), "utf8"));',
    'const phase29 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase29.v1.json"), "utf8"));\nconst phase30 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase30.v1.json"), "utf8"));',
);
replaceIfMissing(
    "docs/api/scripts/merge-admin-spec.js",
    "Phase30RetailMediaOverlay",
    '    [phase29, "Phase29ProductPassportOverlay"],',
    '    [phase29, "Phase29ProductPassportOverlay"],\n    [phase30, "Phase30RetailMediaOverlay"],',
);

replaceIfMissing(
    "docs/api/scripts/merge-storefront-spec.js",
    "storefront.phase30.v1.json",
    'const phase29 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase29.v1.json"), "utf8"));',
    'const phase29 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase29.v1.json"), "utf8"));\nconst phase30 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase30.v1.json"), "utf8"));',
);
replaceIfMissing(
    "docs/api/scripts/merge-storefront-spec.js",
    "phase29, phase30",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, discovery]) {",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, phase30, discovery]) {",
);

console.log("Phase 30 materialization complete");
