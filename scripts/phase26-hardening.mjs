import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoPath = (path) => resolve(repoRoot, path);

function replaceOnce(text, oldValue, newValue, label) {
    if (text.includes(newValue)) return text;
    if (!text.includes(oldValue)) throw new Error(`Phase26 hardening marker missing: ${label}`);
    return text.replace(oldValue, newValue);
}

const servicePath = repoPath("apps/api/app/services/phase26_merchant_memory_service.ts");
let service = readFileSync(servicePath, "utf8");
service = replaceOnce(
    service,
    "type SourceTarget = { table: string; idColumn?: string };",
    "type AgentMemoryPrincipal = { id: number; principal_key: string };\n\ntype SourceTarget = { table: string; idColumn?: string };",
    "agent principal type",
);
service = replaceOnce(
    service,
    "function assertPrivacyBoundary(input: CreateMemoryInput) {",
    "export function assertMerchantMemoryPrivacyBoundary(input: CreateMemoryInput) {",
    "privacy export",
);
service = service.replaceAll("assertPrivacyBoundary(input);", "assertMerchantMemoryPrivacyBoundary(input);");

if (!service.includes("E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE")) {
    service = replaceOnce(
        service,
        '    const sensitivity = input.sensitivity ?? "aggregate";\n    const consumers = input.allowed_consumers ?? ["human"];\n    const subjectType = input.subject_type?.trim().toLowerCase();',
        '    const sensitivity = input.sensitivity ?? "aggregate";\n    const consumers = input.allowed_consumers ?? ["human"];\n    const sourceSensitivities = new Set(input.sources.map((source) => source.sensitivity ?? "aggregate"));\n    if (sourceSensitivities.has("customer_level_sensitive") && sensitivity !== "customer_level_sensitive") {\n        throw new Exception("Sensitive source evidence requires sensitive memory classification", {\n            status: 422,\n            code: "E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE",\n        });\n    }\n    if (sourceSensitivities.has("internal") && sensitivity === "aggregate") {\n        throw new Exception("Internal source evidence cannot be downgraded to aggregate memory", {\n            status: 422,\n            code: "E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE",\n        });\n    }\n    const subjectType = input.subject_type?.trim().toLowerCase();',
        "source sensitivity",
    );
}

if (!service.includes("agentPrincipal: AgentMemoryPrincipal | null = null")) {
    service = replaceOnce(
        service,
        "export async function retrieveMemories(input: RetrieveMemoryInput, actor: User) {\n    const trx = currentTrx();",
        'export async function retrieveMemories(\n    input: RetrieveMemoryInput,\n    actor: User,\n    agentPrincipal: AgentMemoryPrincipal | null = null,\n) {\n    if (input.consumer === "agent" && !agentPrincipal) {\n        throw new Exception("Approved agent principal is required for agent retrieval", {\n            status: 403,\n            code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",\n        });\n    }\n    if (input.consumer === "human" && agentPrincipal) {\n        throw new Exception("Agent principal cannot be attached to human retrieval", {\n            status: 422,\n            code: "E_MERCHANT_MEMORY_PRINCIPAL_KIND_MISMATCH",\n        });\n    }\n    const trx = currentTrx();',
        "agent retrieval signature",
    );
}
service = service.replace(
    "            principal_id: String(actor.id),",
    '            principal_id: input.consumer === "agent" ? String(agentPrincipal!.id) : String(actor.id),',
);

if (!service.includes("sourceLinkage")) {
    service = replaceOnce(
        service,
        "    const [active, superseded, expired, retrievals, effectiveness] = await Promise.all([",
        "    const [active, superseded, expired, retrievals, sourceLinkage, effectiveness] = await Promise.all([",
        "overview destructure",
    );
    service = replaceOnce(
        service,
        '        trx.from("merchant_memory_retrievals").where("tenant_id", tenantId()).count("* as count").first(),\n        trx\n            .from("merchant_memory_effectiveness")',
        '        trx.from("merchant_memory_retrievals").where("tenant_id", tenantId()).count("* as count").first(),\n        trx\n            .from("merchant_memory_retrievals")\n            .where("tenant_id", tenantId())\n            .select(trx.raw("SUM(source_linked_count)::float / NULLIF(SUM(result_count), 0) AS source_linked_retrieval_rate"))\n            .first(),\n        trx\n            .from("merchant_memory_effectiveness")',
        "source-linked retrieval metric",
    );
}

if (!service.includes("misleading_memory_rate")) {
    const repeatMetric = '                trx.raw(\n                    "AVG(CASE WHEN repeat_error_avoided IS TRUE THEN 1.0 WHEN repeat_error_avoided IS FALSE THEN 0.0 END) AS repeat_error_avoidance_rate",\n                ),';
    service = replaceOnce(
        service,
        repeatMetric,
        `${repeatMetric}\n                trx.raw("AVG(CASE WHEN signal = 'harmful' THEN 1.0 ELSE 0.0 END) AS misleading_memory_rate"),`,
        "misleading memory metric",
    );
    service = replaceOnce(
        service,
        '        repeat_error_reduction_proxy:\n            effectiveness?.repeat_error_avoidance_rate == null ? null : Number(effectiveness.repeat_error_avoidance_rate),\n    };',
        '        repeat_error_reduction_proxy:\n            effectiveness?.repeat_error_avoidance_rate == null ? null : Number(effectiveness.repeat_error_avoidance_rate),\n        misleading_memory_rate:\n            effectiveness?.misleading_memory_rate == null ? null : Number(effectiveness.misleading_memory_rate),\n        source_linked_retrieval_rate:\n            sourceLinkage?.source_linked_retrieval_rate == null ? null : Number(sourceLinkage.source_linked_retrieval_rate),\n    };',
        "overview KPI response",
    );
}
writeFileSync(servicePath, service, "utf8");

const controllerPath = repoPath("apps/api/app/controllers/admin/merchant_memory_controller.ts");
let controller = readFileSync(controllerPath, "utf8");
if (!controller.includes("let agentPrincipal: Awaited<ReturnType<typeof requireApprovedAgentPrincipal>>")) {
    controller = replaceOnce(
        controller,
        '        if (payload.consumer === "agent") {\n            if (!payload.agent_principal_key) {\n                throw new Exception("Agent retrieval requires an approved principal key", {\n                    status: 403,\n                    code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",\n                });\n            }\n            await requireApprovedAgentPrincipal(payload.agent_principal_key);\n            payload.include_customer_sensitive = false;\n        } else if (payload.include_customer_sensitive) {\n            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");\n        }\n        return response.ok({ data: await memory.retrieveMemories(payload, auth.user!) });',
        '        let agentPrincipal: Awaited<ReturnType<typeof requireApprovedAgentPrincipal>> | null = null;\n        if (payload.consumer === "agent") {\n            if (!payload.agent_principal_key) {\n                throw new Exception("Agent retrieval requires an approved principal key", {\n                    status: 403,\n                    code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",\n                });\n            }\n            agentPrincipal = await requireApprovedAgentPrincipal(payload.agent_principal_key);\n            payload.include_customer_sensitive = false;\n        } else if (payload.include_customer_sensitive) {\n            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");\n        }\n        return response.ok({ data: await memory.retrieveMemories(payload, auth.user!, agentPrincipal) });',
        "controller principal binding",
    );
}
writeFileSync(controllerPath, controller, "utf8");

const uiPath = repoPath("apps/admin/src/features/merchant-memory/MerchantMemoryWorkspace.tsx");
let ui = readFileSync(uiPath, "utf8");
if (!ui.includes("misleading_memory_rate")) {
    ui = replaceOnce(
        ui,
        "    repeat_error_reduction_proxy: number | null;\n",
        "    repeat_error_reduction_proxy: number | null;\n    misleading_memory_rate: number | null;\n    source_linked_retrieval_rate: number | null;\n",
        "overview type KPIs",
    );
    ui = ui.replace('className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"', 'className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"');
    const card = '                <Card className="p-4">\n                    <p className="text-muted-foreground text-sm">کاهش تکرار خطا</p>\n                    <p className="mt-2 font-semibold text-3xl">{percent(overview.data?.repeat_error_reduction_proxy)}</p>\n                </Card>';
    ui = replaceOnce(
        ui,
        card,
        `${card}\n                <Card className="p-4">\n                    <p className="text-muted-foreground text-sm">بازیابی منبع‌دار</p>\n                    <p className="mt-2 font-semibold text-3xl">{percent(overview.data?.source_linked_retrieval_rate)}</p>\n                </Card>\n                <Card className="p-4">\n                    <p className="text-muted-foreground text-sm">حافظه گمراه‌کننده</p>\n                    <p className="mt-2 font-semibold text-3xl">{percent(overview.data?.misleading_memory_rate)}</p>\n                </Card>`,
        "KPI cards",
    );
    ui = ui.replace("<span>Score: {memory.retrieval_score}</span>", "<span>امتیاز: {percent(memory.retrieval_score)}</span>");
}
writeFileSync(uiPath, ui, "utf8");

const verifierPath = repoPath("scripts/verify-phase26-merchant-memory.mjs");
let verifier = readFileSync(verifierPath, "utf8");
if (!verifier.includes("server-derived agent principal linkage missing")) {
    const assertions = `\nmust(service.includes("agentPrincipal!.id"), "server-derived agent principal linkage missing");\nmust(service.includes("E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE"), "source sensitivity downgrade protection missing");\nmust(service.includes("misleading_memory_rate") && service.includes("source_linked_retrieval_rate"), "Phase 26 effectiveness KPIs incomplete");\nmust(read("apps/api/app/controllers/admin/merchant_memory_controller.ts").includes("agentPrincipal = await requireApprovedAgentPrincipal"), "Governance principal is not bound to retrieval logging");\n`;
    verifier = verifier.replace('console.log("PASS Phase26 Merchant Memory integrity gate");', `${assertions}\nconsole.log("PASS Phase26 Merchant Memory integrity gate");`);
}
writeFileSync(verifierPath, verifier, "utf8");

console.log("PASS Phase26 hardening materializer");
