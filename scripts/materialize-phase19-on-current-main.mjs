import { readFileSync, writeFileSync } from "node:fs";

function rewrite(path, transform) {
    const before = readFileSync(path, "utf8");
    const after = transform(before);
    if (after !== before) writeFileSync(path, after, "utf8");
}

rewrite("apps/admin/src/components/Sidebar.tsx", (source) => {
    let next = source;
    if (!next.includes('href: "/quality/overview"')) {
        const anchor = '    { href: "/quality-trust/models", labelKey: "trustModels", icon: ChartNoAxesCombined },\n';
        if (!next.includes(anchor)) throw new Error("Quality & Trust sidebar anchor missing");
        next = next.replace(anchor, `${anchor}    { href: "/quality/overview", labelKey: "qualityVoc", icon: Package },\n`);
    }
    const oldActive = '    const trustActive = pathname === "/quality-trust" || pathname.startsWith("/quality-trust/");';
    if (next.includes(oldActive)) {
        next = next.replace(oldActive, '    const trustActive =\n        pathname === "/quality-trust" ||\n        pathname.startsWith("/quality-trust/") ||\n        pathname === "/quality" ||\n        pathname.startsWith("/quality/");');
    }
    const oldSections = '{ 0: navT("trustSectionReview"), 2: navT("trustSectionControl"), 4: navT("trustSectionIntelligence") }';
    if (next.includes(oldSections)) {
        next = next.replace(oldSections, '{ 0: navT("trustSectionReview"), 2: navT("trustSectionControl"), 4: navT("trustSectionIntelligence"), 6: navT("trustSectionQuality") }');
    }
    return next;
});

for (const [path, labels] of [
    ["apps/admin/messages/trust/en.json", { qualityVoc: "Product Quality & VOC", trustSectionQuality: "Quality & VOC" }],
    ["apps/admin/messages/trust/fa.json", { qualityVoc: "کیفیت محصول و صدای مشتری", trustSectionQuality: "کیفیت و صدای مشتری" }],
]) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    data.Nav = { ...data.Nav, ...labels };
    writeFileSync(path, `${JSON.stringify(data, null, 4)}\n`, "utf8");
}

rewrite("apps/api/start/routes.ts", (source) => {
    if (source.includes("admin_quality.js")) return source;
    const anchor = 'await import("./routes/admin_procurement.js");\n';
    if (!source.includes(anchor)) throw new Error("Admin procurement route anchor missing");
    return source.replace(anchor, `${anchor}await import("./routes/admin_quality.js");\n`);
});

rewrite("apps/admin/src/lib/queries/api-client.ts", (source) => {
    const start = source.indexOf("function automaticKeySignature(");
    const end = source.indexOf("\n\nfunction pruneAutomaticKeys", start);
    if (start < 0 || end < 0) throw new Error("automaticKeySignature seam missing");
    const fn = `function automaticKeySignature(method: MutationMethod, path: string, body: unknown): string | null {
    if (method !== "POST") return null;
    const cleaned = path.replace(/^\\/+|\\/+$/g, "");
    const supported = [
        /^orders\\/\\d+\\/refunds$/,
        /^quality\\/cases$/,
        /^order-returns\\/\\d+\\/items\\/\\d+\\/inspection$/,
        /^quality\\/cases\\/\\d+\\/findings$/,
        /^quality\\/voc\\/classifications$/,
        /^quality\\/actions$/,
        /^quality\\/outcomes$/,
    ].some((pattern) => pattern.test(cleaned));
    if (!supported) return null;
    return \`${method}:\${cleaned}:\${stableJson(body ?? null)}\`;
}`;
    return source.slice(0, start) + fn + source.slice(end);
});

const packagePath = "docs/api/package.json";
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
packageJson.scripts["build:json:admin-quality"] = "redocly bundle reference/openapi/admin.quality.v1.yaml -o dist/admin.quality.v1.json --ext json";
if (!packageJson.scripts["build:json:admin"].includes("build:json:admin-quality")) {
    const anchor = " && pnpm build:json:admin-trust";
    if (!packageJson.scripts["build:json:admin"].includes(anchor)) throw new Error("Admin Trust OpenAPI build anchor missing");
    packageJson.scripts["build:json:admin"] = packageJson.scripts["build:json:admin"].replace(anchor, `${anchor} && pnpm build:json:admin-quality`);
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`, "utf8");

rewrite("docs/api/scripts/merge-admin-spec.js", (source) => {
    let next = source;
    if (!next.includes("const quality = ")) {
        const anchor = 'const trust = JSON.parse(readFileSync(resolve(root, "dist/admin.trust.v1.json"), "utf8"));\n';
        if (!next.includes(anchor)) throw new Error("Trust OpenAPI merge anchor missing");
        next = next.replace(anchor, `${anchor}const quality = JSON.parse(readFileSync(resolve(root, "dist/admin.quality.v1.json"), "utf8"));\n`);
    }
    if (!next.includes('[quality, "QualityOverlay"]')) {
        const anchor = '    [trust, "TrustOverlay"],\n';
        if (!next.includes(anchor)) throw new Error("Trust overlay list anchor missing");
        next = next.replace(anchor, `${anchor}    [quality, "QualityOverlay"],\n`);
    }
    return next;
});

console.log("Phase 19 current-main materialization complete");
