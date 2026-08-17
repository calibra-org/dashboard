import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Exception } from "@adonisjs/core/exceptions";

import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const GENESIS_HASH = "0".repeat(64);
const SECRET_KEY = /(secret|token|password|credential|authorization|cookie|otp|proof|api.?key|private.?key)/i;

export type GovernanceEffect = "allow" | "deny" | "require_approval" | "require_step_up" | "limit";
export type GovernanceActorType = "human" | "agent" | "service";
export type GovernanceResultStatus = "proposed" | "allowed" | "denied" | "executed" | "failed" | "compensated";

export interface GovernedAction {
    key: string;
    labelFa: string;
    labelEn: string;
    domain: string;
    risk: "low" | "medium" | "high" | "critical";
    reversibility: "reversible" | "compensatable" | "effectively_irreversible" | "destructive";
    maxAutonomy: 0 | 1 | 2 | 3 | 4 | 5;
    defaultEffect: "allow_human" | "approval" | "deny_agent";
    stepUpByDefault?: boolean;
}

export const governanceActions: readonly GovernedAction[] = Object.freeze([
    { key: "configuration.apply", labelFa: "اعمال تنظیمات", labelEn: "Apply configuration", domain: "configuration", risk: "high", reversibility: "reversible", maxAutonomy: 3, defaultEffect: "allow_human" },
    { key: "configuration.rollback", labelFa: "بازگردانی تنظیمات", labelEn: "Rollback configuration", domain: "configuration", risk: "critical", reversibility: "reversible", maxAutonomy: 2, defaultEffect: "approval", stepUpByDefault: true },
    { key: "content.publish", labelFa: "انتشار محتوا", labelEn: "Publish content", domain: "content", risk: "high", reversibility: "compensatable", maxAutonomy: 3, defaultEffect: "approval" },
    { key: "seo.action.apply", labelFa: "اعمال اقدام سئو", labelEn: "Apply SEO action", domain: "seo", risk: "medium", reversibility: "compensatable", maxAutonomy: 4, defaultEffect: "approval" },
    { key: "inventory.adjust", labelFa: "اصلاح موجودی", labelEn: "Adjust inventory", domain: "inventory", risk: "high", reversibility: "compensatable", maxAutonomy: 3, defaultEffect: "approval" },
    { key: "order.cancel", labelFa: "لغو سفارش", labelEn: "Cancel order", domain: "orders", risk: "high", reversibility: "compensatable", maxAutonomy: 3, defaultEffect: "approval" },
    { key: "refund.create", labelFa: "ایجاد بازپرداخت", labelEn: "Create refund", domain: "payments", risk: "critical", reversibility: "effectively_irreversible", maxAutonomy: 2, defaultEffect: "approval", stepUpByDefault: true },
    { key: "ticket.bulk", labelFa: "عملیات گروهی تیکت", labelEn: "Bulk ticket operation", domain: "support", risk: "medium", reversibility: "compensatable", maxAutonomy: 4, defaultEffect: "approval" },
    { key: "governance.policy.version.create", labelFa: "نسخه جدید سیاست", labelEn: "Create policy version", domain: "governance", risk: "critical", reversibility: "reversible", maxAutonomy: 0, defaultEffect: "approval", stepUpByDefault: true },
    { key: "governance.agent.update", labelFa: "تغییر عامل خودکار", labelEn: "Update agent principal", domain: "governance", risk: "critical", reversibility: "reversible", maxAutonomy: 0, defaultEffect: "approval", stepUpByDefault: true },
    { key: "governance.agent.kill_switch", labelFa: "توقف اضطراری عامل", labelEn: "Agent emergency stop", domain: "governance", risk: "critical", reversibility: "reversible", maxAutonomy: 0, defaultEffect: "deny_agent", stepUpByDefault: true },
    { key: "governance.approval.break_glass", labelFa: "دسترسی اضطراری", labelEn: "Break-glass approval", domain: "governance", risk: "critical", reversibility: "effectively_irreversible", maxAutonomy: 0, defaultEffect: "deny_agent", stepUpByDefault: true },
    { key: "governance.ledger.verify", labelFa: "اعتبارسنجی دفتر اقدام", labelEn: "Verify action ledger", domain: "governance", risk: "low", reversibility: "reversible", maxAutonomy: 5, defaultEffect: "allow_human" },
]);

export interface PolicyEvaluationInput {
    actorType?: GovernanceActorType;
    actorUserId?: number | null;
    agentId?: number | null;
    actionKey: string;
    resourceType?: string | null;
    resourceId?: string | number | null;
    context?: Record<string, unknown>;
    requestedAutonomy?: number;
    amountMinor?: number | null;
    currency?: string | null;
}

export interface PolicyDecision {
    allowed: boolean;
    requiresApproval: boolean;
    requiresStepUp: boolean;
    reasons: string[];
    matchedPolicies: Array<{ id: number; policyKey: string; version: number; effect: GovernanceEffect }>;
    action: GovernedAction;
    autonomyCeiling: number;
    policyDigest: string;
}

type Row = Record<string, any>;

function canonical(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export function sha256(value: unknown): string {
    return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

export function safeGovernanceEvidence(value: unknown, depth = 0): unknown {
    if (depth > 7) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => safeGovernanceEvidence(item, depth + 1));
    if (value && typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 200)) {
            output[key] = SECRET_KEY.test(key) ? "[redacted]" : safeGovernanceEvidence(item, depth + 1);
        }
        return output;
    }
    if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
    return value;
}

function text(value: unknown, max = 1000): string {
    const output = String(value ?? "").trim();
    if (!output || output.length > max) throw new Exception("Invalid governance input", { status: 422, code: "E_GOVERNANCE_INPUT" });
    return output;
}

function actionPatternMatches(pattern: string, actionKey: string): boolean {
    if (pattern === "*" || pattern === actionKey) return true;
    return pattern.endsWith(".*") && actionKey.startsWith(pattern.slice(0, -1));
}

function governedAction(actionKey: string): GovernedAction {
    return governanceActions.find((item) => item.key === actionKey) ?? {
        key: actionKey,
        labelFa: actionKey,
        labelEn: actionKey,
        domain: actionKey.split(".")[0] || "custom",
        risk: "high",
        reversibility: "compensatable",
        maxAutonomy: 3,
        defaultEffect: "approval",
    };
}

function predicateMatches(predicate: unknown, context: Record<string, unknown>): boolean {
    if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) return true;
    for (const [key, expected] of Object.entries(predicate as Record<string, unknown>)) {
        const actual = key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, context);
        if (expected && typeof expected === "object" && !Array.isArray(expected)) {
            const op = expected as Record<string, unknown>;
            if ("eq" in op && actual !== op.eq) return false;
            if ("neq" in op && actual === op.neq) return false;
            if (Array.isArray(op.in) && !op.in.includes(actual)) return false;
            if (typeof op.gte === "number" && Number(actual) < op.gte) return false;
            if (typeof op.lte === "number" && Number(actual) > op.lte) return false;
            continue;
        }
        if (actual !== expected) return false;
    }
    return true;
}

export function governanceApprovalRequestHash(input: { actionKey: string; resourceType?: string | null; resourceId?: string | number | null; payload?: unknown }): string {
    return sha256({ actionKey: input.actionKey, resourceType: input.resourceType ?? null, resourceId: input.resourceId == null ? null : String(input.resourceId), payload: safeGovernanceEvidence(input.payload ?? {}) });
}

export class GovernanceService {
    async overview() {
        await this.expireApprovals();
        const trx = currentTrx();
        const tenantId = String(currentTenantId());
        const [policy, agents, approvals, ledger, shadow] = await Promise.all([
            trx.from("governance_policy_versions").where("tenant_id", tenantId).countDistinct("policy_key as count").first(),
            trx.from("governance_agent_principals").where("tenant_id", tenantId).select("autonomy_level", "enabled", "kill_switch"),
            trx.from("governance_approval_requests").where("tenant_id", tenantId).where("status", "pending").count("id as count").first(),
            trx.from("governance_action_ledger").where("tenant_id", tenantId).count("id as count").max("sequence as max_sequence").first(),
            trx.from("governance_shadow_observations").where("tenant_id", tenantId).whereNotNull("reviewed_at").count("id as count").first(),
        ]);
        const autonomyDistribution = [0, 1, 2, 3, 4, 5].map((level) => ({ level, count: agents.filter((row: Row) => Number(row.autonomy_level) === level).length }));
        return {
            policyCount: Number(policy?.count ?? 0), agentCount: agents.length,
            activeAgentCount: agents.filter((row: Row) => row.enabled && !row.kill_switch).length,
            killedAgentCount: agents.filter((row: Row) => row.kill_switch).length,
            pendingApprovals: Number(approvals?.count ?? 0), ledgerEntries: Number(ledger?.count ?? 0), ledgerLastSequence: Number(ledger?.max_sequence ?? 0),
            reviewedShadowObservations: Number(shadow?.count ?? 0), autonomyDistribution, ledgerIntegrity: await this.verifyLedger(),
        };
    }

    registry() {
        return { actions: governanceActions, effects: ["allow", "deny", "require_approval", "require_step_up", "limit"], autonomyLevels: [0,1,2,3,4,5].map((level) => ({ level, key: `L${level}` })) };
    }

    async listPolicies() {
        const rows = await currentTrx().from("governance_policy_versions").where("tenant_id", String(currentTenantId())).orderBy("created_at", "desc").limit(500);
        return rows.map(this.presentPolicy);
    }

    async createPolicy(input: Record<string, unknown>, actorUserId: number) {
        const policyKey = text(input.policyKey, 128); const name = text(input.name, 180); const actionPattern = text(input.actionPattern ?? "*", 180); const reason = text(input.reason, 2000);
        const effect = String(input.effect ?? "") as GovernanceEffect;
        if (!["allow", "deny", "require_approval", "require_step_up", "limit"].includes(effect)) throw new Exception("Invalid governance effect", { status: 422, code: "E_GOVERNANCE_EFFECT" });
        const priority = Number(input.priority ?? 100); const autonomyCeiling = input.autonomyCeiling == null ? null : Number(input.autonomyCeiling);
        if (!Number.isSafeInteger(priority) || priority < 0 || priority > 10000 || (autonomyCeiling !== null && (!Number.isInteger(autonomyCeiling) || autonomyCeiling < 0 || autonomyCeiling > 5))) throw new Exception("Invalid governance policy bounds", { status: 422, code: "E_GOVERNANCE_POLICY_BOUNDS" });
        const trx = currentTrx(); const tenantId = Number(currentTenantId());
        const latest = await trx.from("governance_policy_versions").where("tenant_id", tenantId).where("policy_key", policyKey).orderBy("version", "desc").forUpdate().first();
        const version = Number(latest?.version ?? 0) + 1;
        const material = { policyKey, version, name, description: input.description ?? null, actionPattern, scope: safeGovernanceEvidence(input.scope ?? {}), predicate: safeGovernanceEvidence(input.predicate ?? {}), effect, priority, autonomyCeiling, limits: safeGovernanceEvidence(input.limits ?? {}), enabled: input.enabled !== false, reason };
        const rows = await trx.table("governance_policy_versions").insert({ tenant_id: tenantId, policy_key: policyKey, version, name, description: input.description ? text(input.description, 4000) : null, action_pattern: actionPattern, scope: material.scope, predicate: material.predicate, effect, priority, autonomy_ceiling: autonomyCeiling, limits: material.limits, enabled: material.enabled, owner_user_id: input.ownerUserId == null ? null : Number(input.ownerUserId), created_by_user_id: actorUserId, reason, content_hash: sha256(material), supersedes_id: latest?.id ?? null }).returning("*");
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.policy.version.create", resourceType: "governance_policy", resourceId: policyKey, reason, afterState: material, resultStatus: "executed", result: { version } });
        return this.presentPolicy(rows[0]);
    }

    async evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision> {
        const actionKey = text(input.actionKey, 180); const action = governedAction(actionKey); const actorType = input.actorType ?? "human"; const requestedAutonomy = Number(input.requestedAutonomy ?? 0);
        const reasons: string[] = []; let requiresApproval = action.defaultEffect === "approval"; let requiresStepUp = action.stepUpByDefault === true; let allowed = actorType === "human" ? action.defaultEffect !== "deny_agent" : true; let autonomyCeiling = action.maxAutonomy;
        const context = { ...(input.context ?? {}), actorType, actionKey, resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null, requestedAutonomy, amountMinor: input.amountMinor ?? null, currency: input.currency ?? null };
        if (requestedAutonomy > action.maxAutonomy) { allowed = false; reasons.push("action_autonomy_ceiling"); }
        if (actorType === "agent") {
            const agent = input.agentId ? await currentTrx().from("governance_agent_principals").where("tenant_id", String(currentTenantId())).where("id", input.agentId).first() : null;
            if (!agent || !agent.enabled || agent.kill_switch) { allowed = false; reasons.push(agent?.kill_switch ? "agent_kill_switch" : "agent_disabled_or_missing"); }
            else {
                const permitted = Array.isArray(agent.allowed_actions) && agent.allowed_actions.some((pattern: string) => actionPatternMatches(pattern, actionKey));
                const prohibited = Array.isArray(agent.prohibited_actions) && agent.prohibited_actions.some((pattern: string) => actionPatternMatches(pattern, actionKey));
                if (!permitted || prohibited) { allowed = false; reasons.push(prohibited ? "agent_action_prohibited" : "agent_action_not_allowlisted"); }
                autonomyCeiling = Math.min(autonomyCeiling, Number(agent.autonomy_level));
                if (requestedAutonomy > Number(agent.autonomy_level)) { allowed = false; reasons.push("agent_autonomy_ceiling"); }
                if (input.amountMinor != null && agent.budget_limit_minor != null && Number(agent.budget_spent_minor) + Number(input.amountMinor) > Number(agent.budget_limit_minor)) { allowed = false; reasons.push("agent_budget_exceeded"); }
                if (input.currency && agent.budget_currency && String(input.currency).toUpperCase() !== String(agent.budget_currency).toUpperCase()) { allowed = false; reasons.push("agent_budget_currency"); }
            }
        }
        const now = new Date().toISOString();
        const rows = await currentTrx().from("governance_policy_versions as p").where("p.tenant_id", String(currentTenantId())).where("p.enabled", true).whereRaw("p.version = (SELECT MAX(p2.version) FROM governance_policy_versions p2 WHERE p2.tenant_id = p.tenant_id AND p2.policy_key = p.policy_key)").where((query) => query.whereNull("effective_from").orWhere("effective_from", "<=", now)).where((query) => query.whereNull("effective_until").orWhere("effective_until", ">", now)).orderBy("priority", "desc");
        const matched: Row[] = [];
        let explicitDeny = false;
        for (const row of rows) {
            if (!actionPatternMatches(String(row.action_pattern), actionKey)) continue;
            const scope = row.scope && typeof row.scope === "object" ? row.scope : {};
            if (!predicateMatches(scope, context) || !predicateMatches(row.predicate, context)) continue;
            matched.push(row);
            if (row.effect === "deny") explicitDeny = true;
            if (row.effect === "allow") allowed = true;
            if (row.effect === "require_approval") requiresApproval = true;
            if (row.effect === "require_step_up") requiresStepUp = true;
            if (row.autonomy_ceiling != null) autonomyCeiling = Math.min(autonomyCeiling, Number(row.autonomy_ceiling));
            const limits = row.limits ?? {};
            if (limits.max_amount_minor != null && Number(input.amountMinor ?? 0) > Number(limits.max_amount_minor)) { allowed = false; reasons.push(`${row.policy_key}:max_amount_minor`); }
        }
        if (requestedAutonomy > autonomyCeiling) { allowed = false; reasons.push("effective_autonomy_ceiling"); }
        if (explicitDeny) { allowed = false; reasons.push("policy_deny"); }
        const matchedPolicies = matched.map((row) => ({ id: Number(row.id), policyKey: String(row.policy_key), version: Number(row.version), effect: row.effect as GovernanceEffect }));
        return { allowed, requiresApproval, requiresStepUp, reasons, matchedPolicies, action, autonomyCeiling, policyDigest: sha256(matchedPolicies) };
    }

    async listAgents() {
        const rows = await currentTrx().from("governance_agent_principals").where("tenant_id", String(currentTenantId())).orderBy("created_at", "desc").limit(500);
        return rows.map(this.presentAgent);
    }

    async createAgent(input: Record<string, unknown>, actorUserId: number) {
        const principalKey = text(input.principalKey, 120); const name = text(input.name, 180); const autonomyLevel = Number(input.autonomyLevel ?? 0);
        if (!Number.isInteger(autonomyLevel) || autonomyLevel < 0 || autonomyLevel > 5) throw new Exception("Invalid autonomy level", { status: 422, code: "E_GOVERNANCE_AUTONOMY" });
        const budgetLimit = input.budgetLimitMinor == null ? null : Number(input.budgetLimitMinor); if (budgetLimit !== null && (!Number.isSafeInteger(budgetLimit) || budgetLimit < 0)) throw new Exception("Invalid budget", { status: 422, code: "E_GOVERNANCE_BUDGET" });
        const allowed = this.stringArray(input.allowedActions); const prohibited = this.stringArray(input.prohibitedActions); const dataAccess = this.stringArray(input.dataAccessClasses);
        const rows = await currentTrx().table("governance_agent_principals").insert({ tenant_id: Number(currentTenantId()), principal_key: principalKey, name, owner_user_id: input.ownerUserId == null ? null : Number(input.ownerUserId), allowed_actions: allowed, prohibited_actions: prohibited, data_access_classes: dataAccess, autonomy_level: autonomyLevel, budget_limit_minor: budgetLimit, budget_currency: input.budgetCurrency ? text(input.budgetCurrency, 3).toUpperCase() : null, budget_period: input.budgetPeriod ? text(input.budgetPeriod, 16) : "monthly", attributes: safeGovernanceEvidence(input.attributes ?? {}), enabled: input.enabled !== false, kill_switch: false, row_version: 1, created_by_user_id: actorUserId, updated_by_user_id: actorUserId }).returning("*");
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.agent.update", resourceType: "agent_principal", resourceId: rows[0].id, reason: "Agent principal created", afterState: rows[0], resultStatus: "executed" });
        return this.presentAgent(rows[0]);
    }

    async setKillSwitch(id: number, enabled: boolean, actorUserId: number) {
        const row = await currentTrx().from("governance_agent_principals").where("tenant_id", String(currentTenantId())).where("id", id).forUpdate().first();
        if (!row) throw new Exception("Agent principal not found", { status: 404, code: "E_GOVERNANCE_AGENT_NOT_FOUND" });
        await currentTrx().from("governance_agent_principals").where("id", id).update({ kill_switch: enabled, row_version: Number(row.row_version) + 1, updated_by_user_id: actorUserId, updated_at: new Date().toISOString() });
        const updated = await currentTrx().from("governance_agent_principals").where("id", id).first();
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.agent.kill_switch", resourceType: "agent_principal", resourceId: id, reason: enabled ? "Emergency kill switch enabled" : "Kill switch released", beforeState: row, afterState: updated, resultStatus: "executed" });
        return this.presentAgent(updated);
    }

    async listApprovals(status?: string) {
        await this.expireApprovals();
        let query = currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId()));
        if (status) query = query.where("status", status);
        const rows = await query.orderBy("created_at", "desc").limit(200);
        return Promise.all(rows.map((row: Row) => this.approvalDetail(row)));
    }

    async createApproval(input: Record<string, unknown>, actorUserId: number) {
        const actionKey = text(input.actionKey, 180); const reason = text(input.reason, 2000); const workflowKind = String(input.workflowKind ?? "single");
        if (!["single", "sequential", "quorum"].includes(workflowKind)) throw new Exception("Invalid approval workflow", { status: 422, code: "E_GOVERNANCE_APPROVAL_WORKFLOW" });
        const expiresInMinutes = Number(input.expiresInMinutes ?? 1440); if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 5 || expiresInMinutes > 10080) throw new Exception("Invalid approval expiry", { status: 422, code: "E_GOVERNANCE_APPROVAL_EXPIRY" });
        const resourceType = input.resourceType ? text(input.resourceType, 80) : null; const resourceId = input.resourceId == null ? null : text(input.resourceId, 160); const safePayload = safeGovernanceEvidence(input.payload ?? {});
        const reference = `govap_${randomBytes(18).toString("base64url")}`; const requestHash = governanceApprovalRequestHash({ actionKey, resourceType, resourceId, payload: safePayload });
        const stepsRaw = Array.isArray(input.steps) && input.steps.length ? input.steps as Array<Record<string, unknown>> : [{ label: "Approval", quorum: workflowKind === "quorum" ? 2 : 1 }];
        if (stepsRaw.length > 10) throw new Exception("Too many approval steps", { status: 422, code: "E_GOVERNANCE_APPROVAL_STEPS" });
        const trx = currentTrx(); const tenantId = Number(currentTenantId());
        const rows = await trx.table("governance_approval_requests").insert({ tenant_id: tenantId, reference, action_key: actionKey, resource_type: resourceType, resource_id: resourceId, requester_type: "human", requested_by_user_id: actorUserId, reason, safe_payload: safePayload, request_hash: requestHash, workflow_kind: workflowKind, separation_of_duties: input.separationOfDuties !== false, status: "pending", current_step: 0, row_version: 1, expires_at: new Date(Date.now() + expiresInMinutes * 60000).toISOString() }).returning("*");
        const request = rows[0];
        await trx.table("governance_approval_steps").insert(stepsRaw.map((step, index) => ({ tenant_id: tenantId, request_id: request.id, step_index: index, label: text(step.label ?? `Step ${index + 1}`, 160), assigned_user_id: step.assignedUserId == null ? null : Number(step.assignedUserId), required_permission: step.requiredPermission ? text(step.requiredPermission, 160) : null, escalate_after_minutes: step.escalateAfterMinutes == null ? null : Number(step.escalateAfterMinutes), escalation_permission: step.escalationPermission ? text(step.escalationPermission, 160) : null, quorum: Math.max(1, Math.min(20, Number(step.quorum ?? 1))), status: "pending" })));
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.approval.request", resourceType: "approval_request", resourceId: reference, reason, resultStatus: "proposed", result: { actionKey, requestHash } });
        return this.approvalDetail(request);
    }

    async decideApproval(reference: string, decision: "approve" | "reject", reason: string, actorUserId: number) {
        const request = await this.lockApproval(reference); this.assertApprovalPending(request);
        if (request.separation_of_duties && Number(request.requested_by_user_id ?? 0) === actorUserId) throw new Exception("Requester cannot approve the same action", { status: 409, code: "E_GOVERNANCE_SEPARATION_OF_DUTIES" });
        const step = await currentTrx().from("governance_approval_steps").where("request_id", request.id).where("step_index", request.current_step).forUpdate().first(); if (!step) throw new Exception("Approval step missing", { status: 409, code: "E_GOVERNANCE_APPROVAL_STEP" });
        await this.assertApprover(step, actorUserId);
        const duplicate = await currentTrx().from("governance_approval_decisions").where("request_id", request.id).where("step_id", step.id).where("actor_user_id", actorUserId).whereIn("decision", ["approve", "reject"]).first();
        if (duplicate) throw new Exception("Approver already decided this step", { status: 409, code: "E_GOVERNANCE_APPROVAL_DUPLICATE" });
        await currentTrx().table("governance_approval_decisions").insert({ tenant_id: Number(currentTenantId()), request_id: request.id, step_id: step.id, decision, actor_user_id: actorUserId, reason: text(reason, 1000) });
        if (decision === "reject") {
            await currentTrx().from("governance_approval_steps").where("id", step.id).update({ status: "rejected", completed_at: new Date().toISOString() });
            await currentTrx().from("governance_approval_requests").where("id", request.id).update({ status: "rejected", rejected_at: new Date().toISOString(), row_version: Number(request.row_version) + 1, updated_at: new Date().toISOString() });
        } else {
            const count = await currentTrx().from("governance_approval_decisions").where("step_id", step.id).where("decision", "approve").count("id as count").first();
            if (Number(count?.count ?? 0) >= Number(step.quorum)) {
                await currentTrx().from("governance_approval_steps").where("id", step.id).update({ status: "approved", completed_at: new Date().toISOString() });
                const next = await currentTrx().from("governance_approval_steps").where("request_id", request.id).where("step_index", Number(request.current_step) + 1).first();
                await currentTrx().from("governance_approval_requests").where("id", request.id).update(next ? { current_step: Number(request.current_step) + 1, row_version: Number(request.row_version) + 1, updated_at: new Date().toISOString() } : { status: "approved", approved_at: new Date().toISOString(), row_version: Number(request.row_version) + 1, updated_at: new Date().toISOString() });
            }
        }
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.approval.decision", resourceType: "approval_request", resourceId: reference, reason, resultStatus: "executed", result: { decision } });
        return this.getApproval(reference);
    }

    async delegateApproval(reference: string, delegatedToUserId: number, reason: string, actorUserId: number) {
        if (!Number.isInteger(delegatedToUserId) || delegatedToUserId <= 0 || delegatedToUserId === actorUserId) throw new Exception("Invalid delegate", { status: 422, code: "E_GOVERNANCE_APPROVAL_DELEGATE" });
        const request = await this.lockApproval(reference); this.assertApprovalPending(request);
        if (request.separation_of_duties && Number(request.requested_by_user_id ?? 0) === delegatedToUserId) throw new Exception("Requester cannot receive delegated authority", { status: 409, code: "E_GOVERNANCE_SEPARATION_OF_DUTIES" });
        const step = await currentTrx().from("governance_approval_steps").where("request_id", request.id).where("step_index", request.current_step).forUpdate().first(); if (!step) throw new Exception("Approval step missing", { status: 409 });
        await this.assertApprover(step, actorUserId); const target = await currentTrx().from("users").where("id", delegatedToUserId).first(); if (!target) throw new Exception("Delegate not found", { status: 404 });
        await currentTrx().table("governance_approval_decisions").insert({ tenant_id: Number(currentTenantId()), request_id: request.id, step_id: step.id, decision: "delegate", actor_user_id: actorUserId, delegated_to_user_id: delegatedToUserId, reason: text(reason, 1000), metadata: { authority_transferred: true } });
        return this.getApproval(reference);
    }

    async breakGlass(reference: string, reason: string, actorUserId: number) {
        const request = await this.lockApproval(reference); this.assertApprovalPending(request);
        await currentTrx().table("governance_approval_decisions").insert({ tenant_id: Number(currentTenantId()), request_id: request.id, step_id: null, decision: "break_glass", actor_user_id: actorUserId, reason: text(reason, 1000), metadata: { elevated_audit: true } });
        await currentTrx().from("governance_approval_steps").where("request_id", request.id).where("status", "pending").update({ status: "skipped", completed_at: new Date().toISOString() });
        await currentTrx().from("governance_approval_requests").where("id", request.id).update({ status: "approved", approved_at: new Date().toISOString(), row_version: Number(request.row_version) + 1, updated_at: new Date().toISOString() });
        await this.appendLedger({ actorType: "human", actorUserId, actionKey: "governance.approval.break_glass", resourceType: "approval_request", resourceId: reference, reason, resultStatus: "executed", result: { breakGlass: true } });
        return this.getApproval(reference);
    }

    async validateApproval(reference: string, expected: { actionKey: string; resourceType?: string | null; resourceId?: string | number | null; payload?: unknown }) {
        const row = await currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId())).where("reference", reference).first();
        if (!row || row.status !== "approved") throw new Exception("Approved governance request required", { status: 409, code: "E_GOVERNANCE_APPROVAL_REQUIRED" });
        if (new Date(row.expires_at).getTime() <= Date.now()) throw new Exception("Governance approval expired", { status: 409, code: "E_GOVERNANCE_APPROVAL_EXPIRED" });
        const expectedHash = governanceApprovalRequestHash(expected); if (row.action_key !== expected.actionKey || row.request_hash !== expectedHash) throw new Exception("Approval is scoped to another request", { status: 409, code: "E_GOVERNANCE_APPROVAL_SCOPE" });
        return row;
    }

    async markApprovalExecuted(reference: string) {
        await currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId())).where("reference", reference).where("status", "approved").update({ status: "executed", executed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }

    async enforce(input: PolicyEvaluationInput & { approvalReference?: string | null; approvalPayload?: unknown }) {
        const decision = await this.evaluate(input);
        if (!decision.allowed) throw new Exception("Governance policy denied action", { status: 403, code: "E_GOVERNANCE_POLICY_DENIED", cause: { reasons: decision.reasons } });
        if (decision.requiresStepUp && input.actorUserId) await requireRecentIdentityStepUp(input.actorUserId, input.actionKey);
        if (decision.requiresApproval) {
            if (!input.approvalReference) throw new Exception("Governance approval required", { status: 409, code: "E_GOVERNANCE_APPROVAL_REQUIRED" });
            await this.validateApproval(input.approvalReference, { actionKey: input.actionKey, resourceType: input.resourceType, resourceId: input.resourceId, payload: input.approvalPayload ?? {} });
        }
        return decision;
    }

    async listLedger(limit = 100) {
        const rows = await currentTrx().from("governance_action_ledger").where("tenant_id", String(currentTenantId())).orderBy("sequence", "desc").limit(Math.max(1, Math.min(500, limit)));
        return rows.map(this.presentLedger);
    }

    async appendLedger(input: { actorType: GovernanceActorType; actorUserId?: number | null; actorAgentId?: number | null; actionKey: string; resourceType?: string | null; resourceId?: string | number | null; requestId?: string | null; correlationId?: string | null; causationId?: string | null; reason: string; evidenceRefs?: unknown[]; policyDecision?: unknown; approvalReferences?: string[]; beforeState?: unknown; afterState?: unknown; externalEvidence?: unknown; resultStatus: GovernanceResultStatus; result?: unknown; compensation?: unknown }) {
        const trx = currentTrx(); const tenantId = Number(currentTenantId());
        await trx.table("governance_ledger_heads").insert({ tenant_id: tenantId, last_sequence: 0, last_hash: GENESIS_HASH }).onConflict("tenant_id").ignore();
        const head = await trx.from("governance_ledger_heads").where("tenant_id", tenantId).forUpdate().first(); if (!head) throw new Exception("Governance ledger unavailable", { status: 500 });
        const sequence = Number(head.last_sequence) + 1; const occurredAt = new Date().toISOString(); const eventId = randomUUID(); const previousHash = String(head.last_hash); const beforeHash = input.beforeState === undefined ? null : sha256(safeGovernanceEvidence(input.beforeState)); const afterHash = input.afterState === undefined ? null : sha256(safeGovernanceEvidence(input.afterState));
        const material = { tenantId, sequence, eventId, actorType: input.actorType, actorUserId: input.actorUserId ?? null, actorAgentId: input.actorAgentId ?? null, actionKey: input.actionKey, resourceType: input.resourceType ?? null, resourceId: input.resourceId == null ? null : String(input.resourceId), requestId: input.requestId ?? null, correlationId: input.correlationId ?? null, causationId: input.causationId ?? null, reason: input.reason, evidenceRefs: safeGovernanceEvidence(input.evidenceRefs ?? []), policyDecision: safeGovernanceEvidence(input.policyDecision ?? {}), approvalReferences: input.approvalReferences ?? [], beforeHash, afterHash, externalEvidence: safeGovernanceEvidence(input.externalEvidence ?? {}), resultStatus: input.resultStatus, result: safeGovernanceEvidence(input.result ?? {}), compensation: safeGovernanceEvidence(input.compensation ?? {}), previousHash, occurredAt };
        const entryHash = sha256(material);
        const rows = await trx.table("governance_action_ledger").insert({ tenant_id: tenantId, sequence, event_id: eventId, actor_type: input.actorType, actor_user_id: input.actorUserId ?? null, actor_agent_id: input.actorAgentId ?? null, action_key: text(input.actionKey, 180), resource_type: input.resourceType ?? null, resource_id: input.resourceId == null ? null : String(input.resourceId), request_id: input.requestId ?? null, correlation_id: input.correlationId ?? null, causation_id: input.causationId ?? null, reason: text(input.reason, 2000), evidence_refs: material.evidenceRefs, policy_decision: material.policyDecision, approval_references: material.approvalReferences, before_hash: beforeHash, after_hash: afterHash, external_evidence: material.externalEvidence, result_status: input.resultStatus, result: material.result, compensation: material.compensation, previous_hash: previousHash, entry_hash: entryHash, occurred_at: occurredAt }).returning("*");
        await trx.from("governance_ledger_heads").where("tenant_id", tenantId).update({ last_sequence: sequence, last_hash: entryHash, updated_at: occurredAt });
        return this.presentLedger(rows[0]);
    }

    async verifyLedger() {
        const rows = await currentTrx().from("governance_action_ledger").where("tenant_id", String(currentTenantId())).orderBy("sequence", "asc").limit(100000);
        let previous = GENESIS_HASH; let expected = 1;
        for (const row of rows) {
            if (Number(row.sequence) !== expected || String(row.previous_hash) !== previous) return { ok: false, checked: expected - 1, reason: "chain_link_mismatch", sequence: Number(row.sequence) };
            const material = { tenantId: Number(row.tenant_id), sequence: Number(row.sequence), eventId: String(row.event_id), actorType: String(row.actor_type), actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id), actorAgentId: row.actor_agent_id == null ? null : Number(row.actor_agent_id), actionKey: String(row.action_key), resourceType: row.resource_type ?? null, resourceId: row.resource_id ?? null, requestId: row.request_id ?? null, correlationId: row.correlation_id ?? null, causationId: row.causation_id ?? null, reason: String(row.reason), evidenceRefs: row.evidence_refs ?? [], policyDecision: row.policy_decision ?? {}, approvalReferences: row.approval_references ?? [], beforeHash: row.before_hash ?? null, afterHash: row.after_hash ?? null, externalEvidence: row.external_evidence ?? {}, resultStatus: String(row.result_status), result: row.result ?? {}, compensation: row.compensation ?? {}, previousHash: String(row.previous_hash), occurredAt: new Date(row.occurred_at).toISOString() };
            const hash = sha256(material); if (hash !== String(row.entry_hash)) return { ok: false, checked: expected - 1, reason: "entry_hash_mismatch", sequence: expected }; previous = hash; expected += 1;
        }
        const head = await currentTrx().from("governance_ledger_heads").where("tenant_id", String(currentTenantId())).first(); const ok = !head || (Number(head.last_sequence) === rows.length && String(head.last_hash) === previous);
        return { ok, checked: rows.length, lastSequence: rows.length, lastHash: previous, reason: ok ? null : "head_mismatch" };
    }

    async listShadow() {
        const rows = await currentTrx().from("governance_shadow_observations").where("tenant_id", String(currentTenantId())).orderBy("created_at", "desc").limit(500);
        const reviewed = rows.filter((row: Row) => row.reviewed_at); const approvals = reviewed.filter((row: Row) => row.human_decision === "approve").length; const failures = reviewed.filter((row: Row) => ["reject", "modify"].includes(row.human_decision)).length; const agreementRate = reviewed.length ? approvals / reviewed.length : 0; const failureRate = reviewed.length ? failures / reviewed.length : 0; const currentStage = rows.length ? Math.max(...rows.map((row: Row) => Number(row.autonomy_stage))) : 0; const eligible = reviewed.length >= 20 && agreementRate >= 0.95 && failureRate <= 0.02;
        return { data: rows.map((row: Row) => ({ id: Number(row.id), agentPrincipalId: row.agent_principal_id == null ? null : Number(row.agent_principal_id), actionKey: String(row.action_key), autonomyStage: Number(row.autonomy_stage), proposalHash: String(row.proposal_hash), safeProposal: row.safe_proposal ?? {}, policyDecision: row.policy_decision ?? {}, humanDecision: row.human_decision ?? null, outcome: row.outcome ?? {}, policyDigest: row.policy_digest ?? null, reviewedAt: row.reviewed_at ?? null, createdAt: row.created_at })), readiness: { criteriaVersion: "phase11.v1", reviewed: reviewed.length, agreementRate, failureRate, currentStage, eligible, recommendedStage: eligible ? Math.min(5, currentStage + 1) : currentStage } };
    }

    async createShadow(input: Record<string, unknown>) {
        const actionKey = text(input.actionKey, 180); const stage = Number(input.autonomyStage ?? 0); if (!Number.isInteger(stage) || stage < 0 || stage > 5) throw new Exception("Invalid shadow stage", { status: 422 });
        const proposal = safeGovernanceEvidence(input.proposal ?? {}); const policyDecision = safeGovernanceEvidence(input.policyDecision ?? {}); const rows = await currentTrx().table("governance_shadow_observations").insert({ tenant_id: Number(currentTenantId()), agent_principal_id: input.agentPrincipalId == null ? null : Number(input.agentPrincipalId), action_key: actionKey, autonomy_stage: stage, proposal_hash: sha256(proposal), safe_proposal: proposal, policy_decision: policyDecision, policy_digest: input.policyDigest ? text(input.policyDigest, 64) : null, row_version: 1 }).returning("*"); return rows[0];
    }

    async reviewShadow(id: number, decision: string, outcome: unknown, actorUserId: number) {
        if (!["approve", "reject", "modify", "abstain"].includes(decision)) throw new Exception("Invalid shadow review", { status: 422 });
        const row = await currentTrx().from("governance_shadow_observations").where("tenant_id", String(currentTenantId())).where("id", id).whereNull("reviewed_at").forUpdate().first(); if (!row) throw new Exception("Shadow observation not found or reviewed", { status: 404 });
        await currentTrx().from("governance_shadow_observations").where("id", id).update({ human_decision: decision, outcome: safeGovernanceEvidence(outcome ?? {}), reviewed_at: new Date().toISOString(), reviewed_by_user_id: actorUserId, row_version: Number(row.row_version) + 1, updated_at: new Date().toISOString() }); return { reviewed: true };
    }

    async getApproval(reference: string) { const row = await currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId())).where("reference", reference).first(); if (!row) throw new Exception("Approval not found", { status: 404 }); return this.approvalDetail(row); }
    private async lockApproval(reference: string) { const row = await currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId())).where("reference", reference).forUpdate().first(); if (!row) throw new Exception("Approval not found", { status: 404 }); return row; }
    private assertApprovalPending(row: Row) { if (new Date(row.expires_at).getTime() <= Date.now()) throw new Exception("Approval expired", { status: 409, code: "E_GOVERNANCE_APPROVAL_EXPIRED" }); if (row.status !== "pending") throw new Exception("Approval is not pending", { status: 409, code: "E_GOVERNANCE_APPROVAL_STATUS" }); }
    private async assertApprover(step: Row, actorUserId: number) { const delegated = await currentTrx().from("governance_approval_decisions").where("step_id", step.id).where("decision", "delegate").orderBy("id", "desc").first(); const required = delegated?.delegated_to_user_id ?? step.assigned_user_id; if (required != null && Number(required) !== actorUserId) throw new Exception("Approval assigned to another user", { status: 403, code: "E_GOVERNANCE_APPROVAL_ASSIGNEE" }); }
    private async expireApprovals() { await currentTrx().from("governance_approval_requests").where("tenant_id", String(currentTenantId())).where("status", "pending").where("expires_at", "<=", new Date().toISOString()).update({ status: "expired", updated_at: new Date().toISOString() }); }
    private async approvalDetail(row: Row) { const steps = await currentTrx().from("governance_approval_steps").where("request_id", row.id).orderBy("step_index", "asc"); const decisions = await currentTrx().from("governance_approval_decisions").where("request_id", row.id).orderBy("created_at", "asc"); return { id: Number(row.id), reference: String(row.reference), actionKey: String(row.action_key), resourceType: row.resource_type ?? null, resourceId: row.resource_id ?? null, requesterType: String(row.requester_type), requestedByUserId: row.requested_by_user_id == null ? null : Number(row.requested_by_user_id), reason: String(row.reason), safePayload: row.safe_payload ?? {}, requestHash: String(row.request_hash), workflowKind: String(row.workflow_kind), separationOfDuties: Boolean(row.separation_of_duties), status: String(row.status), currentStep: Number(row.current_step), expiresAt: row.expires_at, approvedAt: row.approved_at ?? null, rejectedAt: row.rejected_at ?? null, executedAt: row.executed_at ?? null, createdAt: row.created_at, steps: steps.map((step: Row) => ({ id: Number(step.id), index: Number(step.step_index), label: String(step.label), assignedUserId: step.assigned_user_id == null ? null : Number(step.assigned_user_id), requiredPermission: step.required_permission ?? null, escalateAfterMinutes: step.escalate_after_minutes == null ? null : Number(step.escalate_after_minutes), escalationPermission: step.escalation_permission ?? null, quorum: Number(step.quorum), status: String(step.status), completedAt: step.completed_at ?? null })), decisions: decisions.map((item: Row) => ({ id: Number(item.id), stepId: item.step_id == null ? null : Number(item.step_id), decision: String(item.decision), actorUserId: item.actor_user_id == null ? null : Number(item.actor_user_id), delegatedToUserId: item.delegated_to_user_id == null ? null : Number(item.delegated_to_user_id), reason: String(item.reason), createdAt: item.created_at })) }; }
    private presentPolicy(row: Row) { return { id: Number(row.id), policyKey: String(row.policy_key), version: Number(row.version), name: String(row.name), description: row.description ?? null, actionPattern: String(row.action_pattern), scope: row.scope ?? {}, predicate: row.predicate ?? {}, effect: row.effect as GovernanceEffect, priority: Number(row.priority), autonomyCeiling: row.autonomy_ceiling == null ? null : Number(row.autonomy_ceiling), limits: row.limits ?? {}, enabled: Boolean(row.enabled), reason: String(row.reason), contentHash: String(row.content_hash), createdAt: row.created_at }; }
    private presentAgent(row: Row) { return { id: Number(row.id), principalKey: String(row.principal_key), name: String(row.name), ownerUserId: row.owner_user_id == null ? null : Number(row.owner_user_id), allowedActions: row.allowed_actions ?? [], prohibitedActions: row.prohibited_actions ?? [], dataAccessClasses: row.data_access_classes ?? [], autonomyLevel: Number(row.autonomy_level), budgetLimitMinor: row.budget_limit_minor == null ? null : Number(row.budget_limit_minor), budgetCurrency: row.budget_currency ?? null, budgetPeriod: String(row.budget_period), budgetSpentMinor: Number(row.budget_spent_minor), enabled: Boolean(row.enabled), killSwitch: Boolean(row.kill_switch), version: Number(row.row_version), createdAt: row.created_at, updatedAt: row.updated_at }; }
    private presentLedger(row: Row) { return { id: Number(row.id), sequence: Number(row.sequence), eventId: String(row.event_id), actorType: String(row.actor_type), actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id), actorAgentId: row.actor_agent_id == null ? null : Number(row.actor_agent_id), actionKey: String(row.action_key), resourceType: row.resource_type ?? null, resourceId: row.resource_id ?? null, requestId: row.request_id ?? null, correlationId: row.correlation_id ?? null, causationId: row.causation_id ?? null, reason: String(row.reason), policyDecision: row.policy_decision ?? {}, approvalReferences: row.approval_references ?? [], beforeHash: row.before_hash ?? null, afterHash: row.after_hash ?? null, resultStatus: String(row.result_status), result: row.result ?? {}, previousHash: String(row.previous_hash), entryHash: String(row.entry_hash), occurredAt: row.occurred_at }; }
    private stringArray(value: unknown): string[] { if (!Array.isArray(value)) return []; return [...new Set(value.map((item) => String(item).trim()).filter((item) => item && item.length <= 180))].slice(0, 200); }
}

export const governanceService = new GovernanceService();
