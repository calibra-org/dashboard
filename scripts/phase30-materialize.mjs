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

const docsPackagePath = "docs/api/package.json";
const docsPackage = JSON.parse(read(docsPackagePath));
const scripts = docsPackage.scripts ?? {};
scripts["build:json:admin-phase30"] =
    "redocly bundle reference/openapi/admin.phase30.v1.yaml --output dist/admin.phase30.v1.json";
scripts["build:json:storefront-phase30"] =
    "redocly bundle reference/openapi/storefront.phase30.v1.yaml --output dist/storefront.phase30.v1.json";
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
    "phase29, phase30, discovery",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, discovery]) {",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, phase30, discovery]) {",
);

replaceIfMissing(
    "apps/admin/src/features/retail-media/RetailMediaWorkspace.tsx",
    '["campaigns", "placements", "creators", "measurement"].map((key)',
    'if (loading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-36 animate-pulse bg-muted/30" />)}</div>;',
    'if (loading) return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{["campaigns", "placements", "creators", "measurement"].map((key) => <Card key={key} className="h-36 animate-pulse bg-muted/30" />)}</div>;',
);
replaceIfMissing(
    "apps/admin/src/features/retail-media/RetailMediaWorkspace.tsx",
    'const reason = "تنظیم عملیاتی Phase 30";',
    'const [reason, setReason] = useState("تنظیم عملیاتی Phase 30");',
    'const reason = "تنظیم عملیاتی Phase 30";',
);
replaceIfMissing(
    "apps/admin/src/features/retail-media/RetailMediaWorkspace.tsx",
    'const reason = "تعریف جایگاه Sponsored";',
    'const [reason, setReason] = useState("تعریف جایگاه Sponsored");',
    'const reason = "تعریف جایگاه Sponsored";',
);
replaceIfMissing(
    "apps/api/app/services/retail_media/retail_media_service.ts",
    "value.forEach((item, index) => {",
    'value.forEach((item, index) => assertPrivacySafeContext(item, `${path}[${index}]`));',
    'value.forEach((item, index) => {\n            assertPrivacySafeContext(item, `${path}[${index}]`);\n        });',
);

console.log("Phase 30 materialization complete");
