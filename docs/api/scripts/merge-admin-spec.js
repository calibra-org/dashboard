import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(root, "dist/admin.base.v1.json"), "utf8"));
const tickets = JSON.parse(readFileSync(resolve(root, "dist/admin.tickets.v1.json"), "utf8"));
const ticketOmnichannel = JSON.parse(readFileSync(resolve(root, "dist/admin.ticket-omnichannel.v1.json"), "utf8"));
const phase5 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase5.v1.json"), "utf8"));
const phase6 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase6.v1.json"), "utf8"));
const runtimeSync = JSON.parse(readFileSync(resolve(root, "dist/admin.runtime-sync.v1.json"), "utf8"));
const completion = JSON.parse(readFileSync(resolve(root, "dist/admin.completion.v1.json"), "utf8"));
const identity = JSON.parse(readFileSync(resolve(root, "dist/admin.identity.v1.json"), "utf8"));
const phase9 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase9.v1.json"), "utf8"));
const phase10 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase10.v1.json"), "utf8"));
const phase11 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase11.v1.json"), "utf8"));
const phase12 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase12.v1.json"), "utf8"));
const phase13 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase13.v1.json"), "utf8"));
const discovery = JSON.parse(readFileSync(resolve(root, "dist/admin.discovery.v1.json"), "utf8"));
const phase14 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase14.v1.json"), "utf8"));
const customerIntelligence = JSON.parse(readFileSync(resolve(root, "dist/admin.customer-intelligence.v1.json"), "utf8"));
const phase17 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase17.v1.json"), "utf8"));
const phase18 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase18.v1.json"), "utf8"));
const trust = JSON.parse(readFileSync(resolve(root, "dist/admin.trust.v1.json"), "utf8"));
const quality = JSON.parse(readFileSync(resolve(root, "dist/admin.quality.v1.json"), "utf8"));
const agenticCommerce = JSON.parse(readFileSync(resolve(root, "dist/admin.agentic-commerce.v1.json"), "utf8"));
const agentOrchestrator = JSON.parse(readFileSync(resolve(root, "dist/admin.agent-orchestrator.v1.json"), "utf8"));
const phase23 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase23.v1.json"), "utf8"));
const phase24 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase24.v1.json"), "utf8"));
const phase25 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase25.v1.json"), "utf8"));
const phase26 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase26.v1.json"), "utf8"));
const phase27 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase27.v1.json"), "utf8"));
const phase28 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase28.v1.json"), "utf8"));
const phase29 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase29.v1.json"), "utf8"));
const phase30 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase30.v1.json"), "utf8"));
const phase31 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase31.v1.json"), "utf8"));
const phase32 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase32.v1.json"), "utf8"));
const phase33 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase33.v1.json"), "utf8"));
const phase34 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase34.v1.json"), "utf8"));

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
    [ticketOmnichannel, "TicketOmnichannelOverlay"],
    [phase5, "Phase5Overlay"],
    [phase6, "Phase6Overlay"],
    [runtimeSync, "RuntimeSyncOverlay"],
    [completion, "CompletionOverlay"],
    [identity, "IdentityOverlay"],
    [phase9, "Phase9Overlay"],
    [phase10, "Phase10Overlay"],
    [phase11, "Phase11GovernanceOverlay"],
    [phase12, "Phase12Overlay"],
    [phase13, "Phase13PlanningOverlay"],
    [discovery, "Phase16DiscoveryOverlay"],
    [phase14, "Phase14ProcurementOverlay"],
    [customerIntelligence, "CustomerIntelligenceOverlay"],
    [phase17, "Phase17ExperimentationOverlay"],
    [phase18, "Phase18PricingOverlay"],
    [trust, "TrustOverlay"],
    [quality, "QualityOverlay"],
    [agenticCommerce, "AgenticCommerceOverlay"],
    [agentOrchestrator, "AgentOrchestratorOverlay"],
    [phase23, "Phase23DigitalTwinOverlay"],
    [phase24, "Phase24SyntheticCommerceOverlay"],
    [phase25, "Phase25GrowthPortfolioOverlay"],
    [phase26, "Phase26MerchantMemoryOverlay"],
    [phase27, "Phase27NetworkIntelligenceOverlay"],
    [phase28, "Phase28ObjectiveAutonomyOverlay"],
    [phase29, "Phase29ProductPassportOverlay"],
    [phase30, "Phase30RetailMediaOverlay"],
    [phase31, "Phase31FulfillmentPromiseOverlay"],
    [phase32, "Phase32ReliabilityGuardianOverlay"],
    [phase33, "Phase33SnippetsOverlay"],
    [phase34, "Phase34LiteCashOverlay"],
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
