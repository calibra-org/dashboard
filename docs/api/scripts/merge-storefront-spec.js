import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(root, "dist/storefront.base.v1.json"), "utf8"));
const completion = JSON.parse(readFileSync(resolve(root, "dist/storefront.completion.v1.json"), "utf8"));

function mergeRecord(baseRecord = {}, overlayRecord = {}, label) {
    const collisions = Object.keys(overlayRecord).filter((key) => Object.hasOwn(baseRecord, key));
    if (collisions.length > 0) throw new Error(`Storefront completion overlay collides with ${label}: ${collisions.join(", ")}`);
    return { ...baseRecord, ...overlayRecord };
}

base.paths = mergeRecord(base.paths, completion.paths, "paths");
for (const [section, values] of Object.entries(completion.components ?? {})) {
    base.components ??= {};
    base.components[section] = mergeRecord(base.components[section], values, `components.${section}`);
}
const tags = Array.isArray(base.tags) ? base.tags : [];
for (const tag of completion.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);
base.tags = tags;
writeFileSync(resolve(root, "dist/storefront.v1.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
