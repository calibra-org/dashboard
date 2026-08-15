import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(root, "dist/admin.base.v1.json"), "utf8"));
const tickets = JSON.parse(readFileSync(resolve(root, "dist/admin.tickets.v1.json"), "utf8"));
const phase5 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase5.v1.json"), "utf8"));
const runtimeSync = JSON.parse(readFileSync(resolve(root, "dist/admin.runtime-sync.v1.json"), "utf8"));
const completion = JSON.parse(readFileSync(resolve(root, "dist/admin.completion.v1.json"), "utf8"));

function mergeRecord(baseRecord = {}, overlayRecord = {}, label, allowIdentical = false) {
    const merged = { ...baseRecord };
    for (const [key, value] of Object.entries(overlayRecord)) {
        if (!Object.hasOwn(merged, key)) {
            merged[key] = value;
            continue;
        }
        if (allowIdentical && isDeepStrictEqual(merged[key], value)) continue;
        throw new Error(`Admin OpenAPI overlay collides with ${label}: ${key}`);
    }
    return merged;
}

function mergePaths(basePaths = {}, overlayPaths = {}) {
    const merged = { ...basePaths };
    for (const [path, pathItem] of Object.entries(overlayPaths)) {
        if (!Object.hasOwn(merged, path)) {
            merged[path] = pathItem;
            continue;
        }
        merged[path] = mergeRecord(merged[path], pathItem, `paths.${path}`, true);
    }
    return merged;
}

function rewriteRefs(value, replacements) {
    if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, replacements));
    if (!value || typeof value !== "object") return value;
    const rewritten = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === "$ref" && typeof item === "string" && replacements.has(item)) rewritten[key] = replacements.get(item);
        else rewritten[key] = rewriteRefs(item, replacements);
    }
    return rewritten;
}

function namespaceConflictingComponents(overlay, namespace) {
    const replacements = new Map();
    const componentSections = Object.keys(overlay.components ?? {});
    for (const section of componentSections) {
        const baseSection = base.components?.[section] ?? {};
        for (const [key, value] of Object.entries(overlay.components?.[section] ?? {})) {
            if (!Object.hasOwn(baseSection, key) || isDeepStrictEqual(baseSection[key], value)) continue;
            const namespaced = `${namespace}${key}`;
            if (Object.hasOwn(baseSection, namespaced) || Object.hasOwn(overlay.components?.[section] ?? {}, namespaced)) {
                throw new Error(`Admin OpenAPI namespace collision in components.${section}: ${namespaced}`);
            }
            replacements.set(`#/components/${section}/${key}`, `#/components/${section}/${namespaced}`);
        }
    }
    if (replacements.size === 0) return overlay;

    const rewritten = rewriteRefs(overlay, replacements);
    for (const section of Object.keys(rewritten.components ?? {})) {
        const sectionRecord = rewritten.components[section];
        for (const [oldRef, newRef] of replacements) {
            const prefix = `#/components/${section}/`;
            if (!oldRef.startsWith(prefix) || !newRef.startsWith(prefix)) continue;
            const oldKey = oldRef.slice(prefix.length);
            const newKey = newRef.slice(prefix.length);
            if (!Object.hasOwn(sectionRecord, oldKey)) continue;
            sectionRecord[newKey] = sectionRecord[oldKey];
            delete sectionRecord[oldKey];
        }
    }
    return rewritten;
}

for (const [overlaySource, namespace] of [
    [tickets, "TicketOverlay"],
    [phase5, "Phase5Overlay"],
    [runtimeSync, "RuntimeSyncOverlay"],
    [completion, "CompletionOverlay"],
]) {
    const overlay = namespaceConflictingComponents(overlaySource, namespace);
    base.paths = mergePaths(base.paths, overlay.paths);
    const componentSections = new Set([...Object.keys(base.components ?? {}), ...Object.keys(overlay.components ?? {})]);
    const merged = {};
    for (const section of componentSections) {
        merged[section] = mergeRecord(base.components?.[section], overlay.components?.[section], `components.${section}`, true);
    }
    base.components = merged;
    const tags = Array.isArray(base.tags) ? base.tags : [];
    for (const tag of overlay.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);
    base.tags = tags;
}

writeFileSync(resolve(root, "dist/admin.v1.json"), `${JSON.stringify(base, null, 2)}\n`, "utf8");
