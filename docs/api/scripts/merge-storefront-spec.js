import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(root, "dist/storefront.base.v1.json"), "utf8"));
const completion = JSON.parse(readFileSync(resolve(root, "dist/storefront.completion.v1.json"), "utf8"));
const identity = JSON.parse(readFileSync(resolve(root, "dist/storefront.identity.v1.json"), "utf8"));
const phase8 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase8.v1.json"), "utf8"));
const phase9 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase9.v1.json"), "utf8"));
const phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));

function mergeRecord(baseRecord = {}, overlayRecord = {}, label) {
    const merged = { ...baseRecord };
    for (const [key, value] of Object.entries(overlayRecord)) {
        if (!Object.hasOwn(merged, key)) {
            merged[key] = value;
            continue;
        }
        const compatibleBearer =
            label === "components.securitySchemes" &&
            key === "BearerAuth" &&
            merged[key]?.type === "http" &&
            value?.type === "http" &&
            String(merged[key]?.scheme ?? "").toLowerCase() === "bearer" &&
            String(value?.scheme ?? "").toLowerCase() === "bearer";
        if (isDeepStrictEqual(merged[key], value) || compatibleBearer) continue;
        throw new Error(`Storefront OpenAPI overlay collides with ${label}: ${key}`);
    }
    return merged;
}

const tags = Array.isArray(base.tags) ? base.tags : [];
for (const overlay of [completion, identity, phase8, phase9, phase17]) {
    base.paths = mergeRecord(base.paths, overlay.paths, "paths");
    for (const [section, values] of Object.entries(overlay.components ?? {})) {
        base.components ??= {};
        base.components[section] = mergeRecord(base.components[section], values, `components.${section}`);
    }
    for (const tag of overlay.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);
}
base.tags = tags;
writeFileSync(resolve(root, "dist/storefront.v1.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
