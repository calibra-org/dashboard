import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const basePath = resolve(root, "dist/admin.base.v1.json");
const ticketPath = resolve(root, "dist/admin.tickets.v1.json");
const outputPath = resolve(root, "dist/admin.v1.json");
const base = JSON.parse(readFileSync(basePath, "utf8"));
const tickets = JSON.parse(readFileSync(ticketPath, "utf8"));

function mergeRecord(baseRecord = {}, overlayRecord = {}, label) {
    const collisions = Object.keys(overlayRecord).filter((key) => Object.hasOwn(baseRecord, key));
    if (collisions.length > 0) {
        throw new Error(`Ticket OpenAPI overlay collides with base admin ${label}: ${collisions.join(", ")}`);
    }
    return { ...baseRecord, ...overlayRecord };
}

base.paths = mergeRecord(base.paths, tickets.paths, "paths");

const componentSections = new Set([
    ...Object.keys(base.components ?? {}),
    ...Object.keys(tickets.components ?? {}),
]);
const mergedComponents = {};
for (const section of componentSections) {
    mergedComponents[section] = mergeRecord(
        base.components?.[section],
        tickets.components?.[section],
        `components.${section}`,
    );
}
base.components = mergedComponents;

const tags = Array.isArray(base.tags) ? base.tags : [];
if (!tags.some((tag) => tag?.name === "Admin / Tickets")) {
    tags.push({
        name: "Admin / Tickets",
        description: "Tenant-scoped support tickets, SLA, assignment, conversations, and operational history.",
    });
}
base.tags = tags;
writeFileSync(outputPath, `${JSON.stringify(base, null, 2)}\n`, "utf8");
