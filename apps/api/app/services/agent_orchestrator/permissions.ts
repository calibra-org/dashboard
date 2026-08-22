import { currentTenantId, currentTrx } from "#services/tenant_context";
export const AGENT_ORCHESTRATOR_PERMISSIONS = [
    "agent_orchestrator.view",
    "agent_orchestrator.agents.manage",
    "agent_orchestrator.tools.manage",
    "agent_orchestrator.plans.manage",
    "agent_orchestrator.approve",
    "agent_orchestrator.execute",
    "agent_orchestrator.kill_switch",
    "agent_orchestrator.access.manage",
] as const;
export type AgentOrchestratorPermission = (typeof AGENT_ORCHESTRATOR_PERMISSIONS)[number];
export async function requireAgentOrchestratorPermission(
    user: { id: string | number | bigint; role: string },
    permission: AgentOrchestratorPermission,
) {
    if (user.role !== "admin")
        throw Object.assign(new Error("Admin access required"), { status: 403, code: "E_AGENT_ORCHESTRATOR_ADMIN_REQUIRED" });
    const row = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (row && !row.allowed)
        throw Object.assign(new Error("Agent orchestrator permission denied"), {
            status: 403,
            code: "E_AGENT_ORCHESTRATOR_PERMISSION_DENIED",
        });
}
