import { Exception } from "@adonisjs/core/exceptions";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export type MerchantMemorySourceReference = {
    source_kind: string;
    source_table: string;
    source_id: string;
};

export type MerchantMemoryPrincipalInput = {
    principal_kind: "admin" | "copilot" | "automation";
    principal_id?: string | null;
};

const SOURCE_AUTHORITIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
    intelligence_cases: ["decision"],
    intelligence_decisions: ["decision"],
    intelligence_action_records: ["action"],
    intelligence_outcome_records: ["outcome"],
    governance_policy_versions: ["policy"],
    governance_approval_requests: ["approval"],
    governance_approval_decisions: ["approval"],
    governance_action_ledger: ["audit"],
    experiments: ["experiment"],
    experiment_analysis_runs: ["experiment"],
    experiment_causal_knowledge: ["experiment"],
    agent_plans: ["orchestration"],
    agent_conflicts: ["orchestration"],
    agent_approvals: ["approval", "orchestration"],
    agent_tool_runs: ["orchestration"],
    agent_outcome_hooks: ["outcome", "orchestration"],
    growth_portfolio_runs: ["portfolio"],
    growth_portfolio_outcomes: ["outcome", "portfolio"],
    growth_portfolio_rebalance_events: ["portfolio"],
});

const tenantId = () => Number(currentTenantId());

function textArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string") return [];
    if (value.startsWith("{") && value.endsWith("}")) {
        return value
            .slice(1, -1)
            .split(",")
            .map((item) => item.replace(/^"|"$/g, "").trim())
            .filter(Boolean);
    }
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

export async function validateMerchantMemorySources(sources: MerchantMemorySourceReference[]) {
    for (const source of sources) {
        const allowedKinds = SOURCE_AUTHORITIES[source.source_table];
        if (!allowedKinds || !allowedKinds.includes(source.source_kind)) {
            throw new Exception("Merchant memory source authority is not allowed", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_FORBIDDEN",
            });
        }
        const sourceId = Number(source.source_id);
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
            throw new Exception("Merchant memory source identifier is invalid", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_ID",
            });
        }
        const row = await currentTrx()
            .from(source.source_table)
            .where({ tenant_id: tenantId(), id: sourceId })
            .select("id")
            .first();
        if (!row) {
            throw new Exception("Merchant memory source is missing or outside the active tenant", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
            });
        }
    }
}

export async function resolveMerchantMemoryAccess(input: MerchantMemoryPrincipalInput, actor: User) {
    if (input.principal_kind === "admin") {
        return {
            principalKind: "admin" as const,
            principalId: String(actor.id),
            permissions: new Set(["merchant_memory.read", "merchant_memory.restricted"]),
            includeRestricted: true,
        };
    }

    const principalKey = input.principal_id?.trim();
    if (!principalKey) {
        throw new Exception("Agent principal is required for merchant memory retrieval", {
            status: 422,
            code: "E_MERCHANT_MEMORY_PRINCIPAL_REQUIRED",
        });
    }
    const principal = await currentTrx()
        .from("governance_agent_principals")
        .where({ tenant_id: tenantId(), principal_key: principalKey })
        .first();
    if (!principal || !principal.enabled || principal.kill_switch) {
        throw new Exception("Agent principal is unavailable for merchant memory retrieval", {
            status: 403,
            code: "E_MERCHANT_MEMORY_PRINCIPAL_DENIED",
        });
    }
    const scopes = new Set(textArray(principal.data_access_classes));
    if (!scopes.has("merchant_memory.read") && !scopes.has("merchant_memory.*")) {
        throw new Exception("Agent principal cannot read merchant memory", {
            status: 403,
            code: "E_MERCHANT_MEMORY_SCOPE_DENIED",
        });
    }
    return {
        principalKind: input.principal_kind,
        principalId: principalKey,
        permissions: scopes,
        includeRestricted: scopes.has("merchant_memory.restricted") || scopes.has("merchant_memory.*"),
    };
}

export const merchantMemorySourceAuthorities = SOURCE_AUTHORITIES;
