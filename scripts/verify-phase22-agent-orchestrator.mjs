import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const must = (value, message) => {
    if (!value) throw new Error(message);
};

const migration = read("apps/api/database/migrations/1775000000000_create_multi_agent_orchestrator.ts");
const registry = read("apps/api/app/services/agent_orchestrator/tool_registry_service.ts");
const orchestrator = read("apps/api/app/services/agent_orchestrator/orchestrator_service.ts");
const controller = read("apps/api/app/controllers/admin/agent_orchestrator_controller.ts");
const routes = read("apps/api/start/routes/admin_agent_orchestrator.ts");
const ui = read("apps/admin/src/features/agent_orchestrator/AgentOrchestratorWorkspace.tsx");

for (const table of [
    "agent_identities",
    "agent_tool_registry",
    "agent_plans",
    "agent_plan_steps",
    "agent_conflicts",
    "agent_approvals",
    "agent_tool_runs",
    "agent_outcome_hooks",
]) {
    must(migration.includes(`createTable("${table}"`), `missing ${table}`);
}
must(migration.includes("ENABLE ROW LEVEL SECURITY") && migration.includes("FORCE ROW LEVEL SECURITY"), "RLS missing");
must(
    registry.includes("BUILTIN_HANDLERS") && registry.includes("E_AGENT_TOOL_HANDLER_FORBIDDEN"),
    "registry confinement missing",
);
must(registry.includes("E_AGENT_TOOL_RISK_UNDERSPECIFIED"), "registered handler risk floor missing");
must(registry.includes("E_AGENT_TOOL_SCOPE_DENIED"), "agent/tool scope gate missing");
must(!registry.includes("eval("), "eval forbidden");
must(!registry.includes("price_minor") && !registry.includes("total_minor"), "stale commerce columns present");
must(orchestrator.includes("E_AGENT_APPROVAL_REQUIRED"), "approval gate missing");
must(orchestrator.includes("risk_class: tool.risk_class"), "step risk must derive from registry");
must(orchestrator.includes("E_AGENT_TOOL_PERMISSION_DENIED"), "tool-specific permission gate missing");
must(orchestrator.includes("E_AGENT_IDEMPOTENCY_MISMATCH"), "step-bound idempotency missing");
must(
    orchestrator.includes("stepUpSatisfied") && orchestrator.includes("E_IDENTITY_STEP_UP_REQUIRED"),
    "high-risk step-up gate missing",
);
must(orchestrator.includes("kill_switch"), "kill switch missing");
must(orchestrator.includes("scheduleOutcomeHook") && orchestrator.includes("agent_outcome_hooks"), "outcome hook missing");
must(!orchestrator.includes("firstOrFail"), "Knex firstOrFail is invalid");
must(
    controller.includes("hasRecentIdentityStepUp") && controller.includes("requireRecentIdentityStepUp"),
    "Phase 7 step-up integration missing",
);
for (const segment of routes.split("router.post").slice(1))
    must(segment.includes("adminWriteLimiter"), "write route without limiter");
must(ui.includes("HelperTooltip"), "help tooltip missing");
must(!/(bg|text|border)-(red|green|blue|amber|yellow|slate|gray|zinc|stone|orange|purple|pink)-\d/.test(ui), "raw palette class");
must(!/\b(mr|ml|pr|pl)-\d/.test(ui), "physical RTL spacing");
console.log("PASS Phase22 production static integration gate");
