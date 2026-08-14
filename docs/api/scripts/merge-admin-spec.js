import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(root, "dist/admin.base.v1.json"), "utf8"));
const tickets = JSON.parse(readFileSync(resolve(root, "dist/admin.tickets.v1.json"), "utf8"));
const completion = JSON.parse(readFileSync(resolve(root, "dist/admin.completion.v1.json"), "utf8"));

function mergeRecord(baseRecord = {}, overlayRecord = {}, label) {
    const collisions = Object.keys(overlayRecord).filter((key) => Object.hasOwn(baseRecord, key));
    if (collisions.length > 0) throw new Error(`Admin OpenAPI overlay collides with ${label}: ${collisions.join(", ")}`);
    return { ...baseRecord, ...overlayRecord };
}

for (const overlay of [tickets, completion]) {
    base.paths = mergeRecord(base.paths, overlay.paths, "paths");
    const componentSections = new Set([
        ...Object.keys(base.components ?? {}),
        ...Object.keys(overlay.components ?? {}),
    ]);
    const merged = {};
    for (const section of componentSections) {
        merged[section] = mergeRecord(
            base.components?.[section],
            overlay.components?.[section],
            `components.${section}`,
        );
    }
    base.components = merged;
    const tags = Array.isArray(base.tags) ? base.tags : [];
    for (const tag of overlay.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);
    base.tags = tags;
}

writeFileSync(resolve(root, "dist/admin.v1.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
