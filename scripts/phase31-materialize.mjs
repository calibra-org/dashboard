import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, "utf8");

function replaceOnce(file, oldText, newText, alreadyText) {
    let content = read(file);
    if (alreadyText && content.includes(alreadyText)) return;
    const count = content.split(oldText).length - 1;
    if (count !== 1) throw new Error(`Phase31 materializer expected exactly one anchor in ${file}; found ${count}`);
    content = content.replace(oldText, newText);
    write(file, content);
}

replaceOnce(
    "apps/api/start/routes.ts",
    'await import("./routes/admin_retail_media.js");',
    'await import("./routes/admin_retail_media.js");\nawait import("./routes/admin_fulfillment_promise.js");',
    'await import("./routes/admin_fulfillment_promise.js");',
);
replaceOnce(
    "apps/api/start/routes.ts",
    'await import("./routes/retail_media_storefront.js");',
    'await import("./routes/retail_media_storefront.js");\nawait import("./routes/fulfillment_promise_storefront.js");',
    'await import("./routes/fulfillment_promise_storefront.js");',
);

replaceOnce(
    "apps/api/app/controllers/checkout/submit_controller.ts",
    'import { orderFinalizer } from "#services/order_finalizer";',
    'import * as fulfillmentPromise from "#services/fulfillment_promise/promise_service";\nimport { orderFinalizer } from "#services/order_finalizer";',
    'import * as fulfillmentPromise from "#services/fulfillment_promise/promise_service";',
);
replaceOnce(
    "apps/api/app/controllers/checkout/submit_controller.ts",
    "        const result = await orderFinalizer.finalize(cart, draft, {",
    "        const selectedPromiseId = await fulfillmentPromise.checkoutGuard(cart, draft);\n\n        const result = await orderFinalizer.finalize(cart, draft, {",
    "const selectedPromiseId = await fulfillmentPromise.checkoutGuard(cart, draft);",
);
replaceOnce(
    "apps/api/app/controllers/checkout/submit_controller.ts",
    "        let redirectUrl: string | null = result.payment.redirectUrl;",
    "        await fulfillmentPromise.commitOrderPromise(result.order, selectedPromiseId);\n\n        let redirectUrl: string | null = result.payment.redirectUrl;",
    "await fulfillmentPromise.commitOrderPromise(result.order, selectedPromiseId);",
);

replaceOnce(
    "apps/admin/src/components/Sidebar.tsx",
    '            { href: "/analytics/retail-media", label: "رسانه تجاری و سازندگان", icon: BadgePercent },',
    '            { href: "/analytics/retail-media", label: "رسانه تجاری و سازندگان", icon: BadgePercent },\n            { href: "/analytics/fulfillment-promise", label: "وعده تحویل و شبکه محلی", icon: Boxes },',
    'href: "/analytics/fulfillment-promise"',
);

const pkgFile = "docs/api/package.json";
const pkg = JSON.parse(read(pkgFile));
pkg.scripts["build:json:admin-phase31"] =
    "redocly bundle reference/openapi/admin.phase31.v1.yaml -o dist/admin.phase31.v1.json --ext json";
pkg.scripts["build:json:storefront-phase31"] =
    "redocly bundle reference/openapi/storefront.phase31.v1.yaml -o dist/storefront.phase31.v1.json --ext json";
if (!pkg.scripts["build:json:admin"].includes("build:json:admin-phase31")) {
    pkg.scripts["build:json:admin"] = pkg.scripts["build:json:admin"].replace(
        "pnpm build:json:admin-phase30 && pnpm build:json:admin-merge",
        "pnpm build:json:admin-phase30 && pnpm build:json:admin-phase31 && pnpm build:json:admin-merge",
    );
}
if (!pkg.scripts["build:json:storefront"].includes("build:json:storefront-phase31")) {
    pkg.scripts["build:json:storefront"] = pkg.scripts["build:json:storefront"].replace(
        "pnpm build:json:storefront-phase30 && pnpm build:json:storefront-merge",
        "pnpm build:json:storefront-phase30 && pnpm build:json:storefront-phase31 && pnpm build:json:storefront-merge",
    );
}
write(pkgFile, `${JSON.stringify(pkg, null, 4)}\n`);

replaceOnce(
    "docs/api/scripts/merge-admin-spec.js",
    'const phase30 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase30.v1.json"), "utf8"));',
    'const phase30 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase30.v1.json"), "utf8"));\nconst phase31 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase31.v1.json"), "utf8"));',
    "dist/admin.phase31.v1.json",
);
replaceOnce(
    "docs/api/scripts/merge-admin-spec.js",
    '    [phase30, "Phase30RetailMediaOverlay"],',
    '    [phase30, "Phase30RetailMediaOverlay"],\n    [phase31, "Phase31FulfillmentPromiseOverlay"],',
    "Phase31FulfillmentPromiseOverlay",
);
replaceOnce(
    "docs/api/scripts/merge-storefront-spec.js",
    'const phase30 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase30.v1.json"), "utf8"));',
    'const phase30 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase30.v1.json"), "utf8"));\nconst phase31 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase31.v1.json"), "utf8"));',
    "dist/storefront.phase31.v1.json",
);
replaceOnce(
    "docs/api/scripts/merge-storefront-spec.js",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, phase30, discovery]) {",
    "for (const overlay of [completion, identity, phase9, phase17, phase29, phase30, phase31, discovery]) {",
    "phase30, phase31, discovery",
);

console.log("Phase 31 materialization complete");
