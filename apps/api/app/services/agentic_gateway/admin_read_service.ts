import { currentTenantId, currentTrx } from "#services/tenant_context";

export async function listAgenticActionLedger(limit = 100) {
    const tenantId = Number(currentTenantId());
    return currentTrx()
        .from("agentic_action_ledger as aal")
        .leftJoin("agentic_principals as ap", function join() {
            this.on("ap.id", "aal.principal_id").andOn("ap.tenant_id", "aal.tenant_id");
        })
        .leftJoin("agentic_channels as ac", function join() {
            this.on("ac.id", "aal.channel_id").andOn("ac.tenant_id", "aal.tenant_id");
        })
        .where("aal.tenant_id", tenantId)
        .orderBy("aal.created_at", "desc")
        .limit(Math.max(1, Math.min(limit, 200)))
        .select(
            "aal.public_id",
            "aal.capability_key",
            "aal.action_type",
            "aal.idempotency_key",
            "aal.input_hash",
            "aal.risk_class",
            "aal.status",
            "aal.policy_result",
            "aal.verification",
            "aal.error_class",
            "aal.created_at",
            "aal.completed_at",
            "ap.public_id as principal_public_id",
            "ap.principal_key",
            "ac.public_id as channel_public_id",
            "ac.channel_key",
        );
}
