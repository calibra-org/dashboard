import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import type User from "#models/user";
import { recordAudit } from "#services/admin_audit_log_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { recommendedActionForBand, riskBandForScore } from "#services/trust/contracts";

function bpRate(numerator: number, denominator: number): number | null {
    return denominator > 0 ? Math.round((numerator / denominator) * 10_000) : null;
}

export async function trustOverview() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const since30d = DateTime.utc().minus({ days: 30 }).toSQL();
    const [openCases, severeCases, decisions, outcomes, falsePositives, signals, activeActions] = await Promise.all([
        trx
            .from("fraud_cases")
            .where("tenant_id", tenantId)
            .whereIn("status", ["open", "in_review", "waiting_step_up", "held", "appealed"])
            .count("id as count")
            .first(),
        trx
            .from("fraud_cases")
            .where("tenant_id", tenantId)
            .whereIn("risk_band", ["high", "severe"])
            .whereIn("status", ["open", "in_review", "waiting_step_up", "held", "appealed"])
            .count("id as count")
            .first(),
        trx.from("fraud_decisions").where("tenant_id", tenantId).where("created_at", ">=", since30d).count("id as count").first(),
        trx.from("fraud_outcomes").where("tenant_id", tenantId).where("created_at", ">=", since30d).count("id as count").first(),
        trx
            .from("fraud_outcomes")
            .where("tenant_id", tenantId)
            .where("created_at", ">=", since30d)
            .where("is_false_positive", true)
            .count("id as count")
            .first(),
        trx.from("fraud_signals").where("tenant_id", tenantId).where("occurred_at", ">=", since30d).count("id as count").first(),
        trx
            .from("fraud_action_executions")
            .where("tenant_id", tenantId)
            .whereIn("status", ["active", "pending"])
            .count("id as count")
            .first(),
    ]);
    const recentCases = await trx
        .from("fraud_cases")
        .where("tenant_id", tenantId)
        .whereIn("status", ["open", "in_review", "waiting_step_up", "held", "appealed"])
        .select(
            "public_id",
            "title",
            "pattern",
            "subject_type",
            "subject_id",
            "risk_score",
            "risk_band",
            "status",
            "recommended_action",
            "assignee_user_id as assigned_to_user_id",
            "sla_due_at",
            "updated_at",
            "version",
        )
        .orderBy("risk_score", "desc")
        .orderBy("updated_at", "desc")
        .limit(8);
    const distribution = await trx
        .from("fraud_decisions")
        .where("tenant_id", tenantId)
        .where("created_at", ">=", since30d)
        .groupBy("decision")
        .select("decision as action")
        .count("id as count");
    const patterns = await trx
        .from("fraud_signals")
        .where("tenant_id", tenantId)
        .where("occurred_at", ">=", since30d)
        .groupBy("signal_type")
        .select("signal_type")
        .count("id as count")
        .max("occurred_at as latest_at")
        .orderBy("count", "desc")
        .limit(8);
    const prevented = await trx
        .from("fraud_outcomes")
        .where("tenant_id", tenantId)
        .where("created_at", ">=", since30d)
        .sum("prevented_loss_minor as total")
        .first();
    const outcomeCount = Number(outcomes?.count ?? 0);
    return {
        kpis: {
            open_cases: Number(openCases?.count ?? 0),
            high_or_severe_cases: Number(severeCases?.count ?? 0),
            decisions_30d: Number(decisions?.count ?? 0),
            signals_30d: Number(signals?.count ?? 0),
            active_enforcements: Number(activeActions?.count ?? 0),
            prevented_loss_minor_30d: outcomeCount > 0 ? Number(prevented?.total ?? 0) : null,
            false_positive_rate_bp: bpRate(Number(falsePositives?.count ?? 0), outcomeCount),
            outcome_coverage_bp: bpRate(outcomeCount, Number(decisions?.count ?? 0)),
        },
        recent_cases: recentCases,
        decision_distribution: distribution.map((row) => ({ action: row.action, count: Number(row.count) })),
        active_patterns: patterns.map((row) => ({
            signal_type: row.signal_type,
            count: Number(row.count),
            latest_at: row.latest_at,
        })),
        freshness: {
            generated_at: DateTime.utc().toISO(),
            sources: ["fraud_signals", "fraud_cases", "fraud_decisions", "fraud_outcomes"],
        },
    };
}

export async function listTrustCases(input: { status?: string; riskBand?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.max(1, Math.min(100, input.limit ?? 25));
    const query = currentTrx().from("fraud_cases").where("tenant_id", Number(currentTenantId()));
    if (input.status) query.where("status", input.status);
    if (input.riskBand) query.where("risk_band", input.riskBand);
    if (input.q) {
        const needle = `%${input.q.toLowerCase()}%`;
        query.where((sub) =>
            sub
                .whereRaw("LOWER(title) LIKE ?", [needle])
                .orWhereRaw("LOWER(subject_id) LIKE ?", [needle])
                .orWhereRaw("LOWER(public_id::text) LIKE ?", [needle]),
        );
    }
    const countQuery = query.clone().clearSelect().clearOrder().count("id as count").first();
    const rowsQuery = query
        .select(
            "public_id",
            "title",
            "pattern",
            "subject_type",
            "subject_id",
            "order_id",
            "risk_score",
            "risk_band",
            "confidence_bp",
            "false_positive_risk_bp",
            "status",
            "recommended_action",
            "assignee_user_id as assigned_to_user_id",
            "sla_due_at",
            "policy_key",
            "policy_version",
            "model_id",
            "model_version",
            "opened_at",
            "updated_at",
            "version",
        )
        .orderBy("risk_score", "desc")
        .orderBy("updated_at", "desc")
        .offset((page - 1) * limit)
        .limit(limit);
    const [countRow, rows] = await Promise.all([countQuery, rowsQuery]);
    const total = Number(countRow?.count ?? 0);
    return { data: rows, meta: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function trustCaseDetail(publicId: string, includeSensitive = false) {
    const trx = currentTrx();
    const row = await trx.from("fraud_cases").where("tenant_id", Number(currentTenantId())).where("public_id", publicId).first();
    if (!row) throw Object.assign(new Error("Trust case not found"), { status: 404, code: "E_TRUST_CASE_NOT_FOUND" });
    const [evidence, decisions, actions, outcomes] = await Promise.all([
        trx.from("fraud_case_evidence").where("case_id", row.id).orderBy("created_at", "desc").limit(100),
        trx.from("fraud_decisions").where("case_id", row.id).orderBy("created_at", "desc").limit(50),
        trx.from("fraud_action_executions").where("case_id", row.id).orderBy("created_at", "desc").limit(50),
        trx.from("fraud_outcomes").where("case_id", row.id).orderBy("created_at", "desc").limit(50),
    ]);
    const sanitizedEvidence = evidence.map((item) =>
        item.is_sensitive && !includeSensitive
            ? { ...item, evidence_ref: null, summary: "جزئیات حساس برای نقش فعلی مخفی شده است." }
            : item,
    );
    const signals = await trx
        .from("fraud_signals")
        .whereIn("id", sanitizedEvidence.map((item) => item.signal_id).filter(Boolean))
        .orderBy("occurred_at", "desc")
        .limit(100);
    return { ...row, evidence: sanitizedEvidence, signals, decisions, actions, outcomes };
}

export async function listTrustSignals(input: { riskBand?: string; source?: string; signalType?: string; limit?: number }) {
    const query = currentTrx().from("fraud_signals").where("tenant_id", Number(currentTenantId()));
    if (input.riskBand) query.where("risk_band", input.riskBand);
    if (input.source) query.where("source", input.source);
    if (input.signalType) query.where("signal_type", input.signalType);
    return query
        .select(
            "public_id",
            "event_type",
            "source",
            "source_ref",
            "correlation_id",
            "causation_id",
            "session_ref as session_id",
            "consent_context",
            "subject_type",
            "subject_id",
            "signal_type",
            "risk_band",
            "score_delta",
            "confidence_bp",
            "privacy_classification",
            "rule_key",
            "rule_version",
            "model_id",
            "model_version",
            "evidence",
            "occurred_at",
            "received_at",
        )
        .orderBy("occurred_at", "desc")
        .limit(Math.max(1, Math.min(250, input.limit ?? 100)));
}

export async function trustGraph(input: { subjectType?: string; subjectId?: string; casePublicId?: string; depth?: number }) {
    const trx = currentTrx();
    let subjectType = input.subjectType;
    let subjectId = input.subjectId;
    if (input.casePublicId) {
        const caseRow = await trx.from("fraud_cases").where("public_id", input.casePublicId).first();
        if (!caseRow) throw Object.assign(new Error("Trust case not found"), { status: 404, code: "E_TRUST_CASE_NOT_FOUND" });
        subjectType = caseRow.subject_type;
        subjectId = caseRow.subject_id;
    }
    if (!subjectType || !subjectId)
        return { nodes: [], edges: [], root: null, depth: 1, freshness: { generated_at: DateTime.utc().toISO() } };
    const depth = Math.max(1, Math.min(3, input.depth ?? 1));
    const seen = new Set([`${subjectType}:${subjectId}`]);
    let frontier = [{ type: subjectType, id: subjectId }];
    const edges: Record<string, unknown>[] = [];
    for (let level = 0; level < depth; level += 1) {
        if (frontier.length === 0) break;
        const rows = await trx
            .from("fraud_relationship_edges")
            .where("tenant_id", Number(currentTenantId()))
            .where((query) => {
                for (const [index, node] of frontier.entries()) {
                    if (index === 0) {
                        query.where((nested) =>
                            nested
                                .where((side) => side.where("source_type", node.type).where("source_id", node.id))
                                .orWhere((side) => side.where("target_type", node.type).where("target_id", node.id)),
                        );
                    } else {
                        query.orWhere((nested) =>
                            nested
                                .where((side) => side.where("source_type", node.type).where("source_id", node.id))
                                .orWhere((side) => side.where("target_type", node.type).where("target_id", node.id)),
                        );
                    }
                }
            })
            .limit(300);
        const next: { type: string; id: string }[] = [];
        for (const edge of rows) {
            const key = `${edge.public_id}`;
            if (!edges.some((existing) => existing.public_id === key)) edges.push({ ...edge, public_id: key });
            for (const node of [
                { type: String(edge.source_type), id: String(edge.source_id) },
                { type: String(edge.target_type), id: String(edge.target_id) },
            ]) {
                const nodeKey = `${node.type}:${node.id}`;
                if (!seen.has(nodeKey)) {
                    seen.add(nodeKey);
                    next.push(node);
                }
            }
        }
        frontier = next;
    }
    const nodes = [...seen].map((key) => {
        const separator = key.indexOf(":");
        return {
            key,
            type: key.slice(0, separator),
            id: key.slice(separator + 1),
            is_root: key === `${subjectType}:${subjectId}`,
        };
    });
    return {
        nodes,
        edges,
        root: { type: subjectType, id: subjectId },
        depth,
        freshness: { generated_at: DateTime.utc().toISO() },
    };
}

export async function listTrustPolicies() {
    return currentTrx()
        .from("fraud_policy_versions")
        .where("tenant_id", Number(currentTenantId()))
        .select(
            "public_id",
            "policy_key",
            "version",
            "status",
            "scope",
            "conditions",
            "effect",
            "approval_required",
            "reason",
            "owner_user_id",
            "effective_from",
            "effective_to",
            "created_at",
        )
        .orderBy("policy_key")
        .orderBy("version", "desc");
}

export async function createTrustPolicyVersion(input: {
    ctx: HttpContext;
    actor: User;
    policyKey: string;
    status: "draft" | "active";
    scope: Record<string, unknown>;
    conditions: Array<Record<string, unknown>>;
    effect: string;
    approvalRequired: boolean;
    reason: string;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const latest = await trx
        .from("fraud_policy_versions")
        .where("tenant_id", tenantId)
        .where("policy_key", input.policyKey)
        .max("version as version")
        .first();
    const version = Number(latest?.version ?? 0) + 1;
    if (input.status === "active") {
        await trx
            .from("fraud_policy_versions")
            .where("tenant_id", tenantId)
            .where("policy_key", input.policyKey)
            .where("status", "active")
            .update({ status: "retired", effective_to: DateTime.utc().toSQL() });
    }
    const rows = await trx
        .table("fraud_policy_versions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            policy_key: input.policyKey,
            version,
            status: input.status,
            scope: JSON.stringify(input.scope),
            conditions: JSON.stringify(input.conditions),
            effect: input.effect,
            approval_required: input.approvalRequired,
            reason: input.reason,
            owner_user_id: Number(input.actor.id),
            created_by_user_id: Number(input.actor.id),
            effective_from: input.status === "active" ? DateTime.utc().toSQL() : null,
        })
        .returning("*");
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.policy.version.create",
        entityKind: "trust_policy",
        entityId: Number(rows[0].id),
        payload: { policy_key: input.policyKey, version, status: input.status, effect: input.effect, reason: input.reason },
        trx,
        strict: true,
    });
    return rows[0];
}

function compare(left: unknown, operator: string, right: unknown): boolean {
    if (operator === "eq") return String(left) === String(right);
    if (operator === "neq") return String(left) !== String(right);
    if (["gte", "gt", "lte", "lt"].includes(operator)) {
        const l = Number(left);
        const r = Number(right);
        if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
        if (operator === "gte") return l >= r;
        if (operator === "gt") return l > r;
        if (operator === "lte") return l <= r;
        return l < r;
    }
    if (operator === "in") return Array.isArray(right) && right.map(String).includes(String(left));
    return false;
}

export async function simulateTrustPolicy(input: { policyKey: string; version?: number; context: Record<string, unknown> }) {
    const allowedFields = new Set([
        "risk_score",
        "signal_type",
        "redemptions_48h",
        "refunds_30d",
        "returns_30d",
        "auth_failures_10m",
        "automation_class",
    ]);
    let query = currentTrx()
        .from("fraud_policy_versions")
        .where("tenant_id", Number(currentTenantId()))
        .where("policy_key", input.policyKey);
    if (input.version) query = query.where("version", input.version);
    else query = query.orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END").orderBy("version", "desc");
    const policy = await query.first();
    if (!policy) throw Object.assign(new Error("Trust policy not found"), { status: 404, code: "E_TRUST_POLICY_NOT_FOUND" });
    const conditions = Array.isArray(policy.conditions) ? policy.conditions : [];
    const trace = conditions.map((condition: Record<string, unknown>) => {
        const field = String(condition.field ?? "");
        const operator = String(condition.operator ?? "eq");
        const safe = allowedFields.has(field);
        const passed = safe ? compare(input.context[field], operator, condition.value) : false;
        return { field, operator, expected: condition.value, actual: input.context[field], passed, supported: safe };
    });
    const matched = trace.length > 0 && trace.every((item: { passed: boolean }) => item.passed);
    return {
        policy: { policy_key: policy.policy_key, version: policy.version, status: policy.status, effect: policy.effect },
        matched,
        recommended_action: matched ? policy.effect : "no_match",
        trace,
        dry_run: true,
        side_effects: false,
    };
}

export async function listTrustModels() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const models = await trx
        .from("fraud_risk_model_versions as version")
        .innerJoin("fraud_risk_models as model", "model.id", "version.risk_model_id")
        .where("version.tenant_id", tenantId)
        .select(
            "version.public_id",
            "model.model_id",
            "version.version",
            "model.purpose",
            "version.deployment_state as status",
            "model.owner",
            "version.features",
            "version.privacy_controls",
            "version.evaluation",
            "version.calibration",
            "version.deployment",
            "version.limitations_json as limitations",
            "version.rollout_percent",
            "version.rollback_version",
            "version.last_evaluated_at",
            "version.updated_at",
        )
        .orderBy("model.model_id")
        .orderBy("version.created_at", "desc");
    const outcomes = await trx
        .from("fraud_outcomes")
        .where("tenant_id", tenantId)
        .where("created_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL())
        .select("is_false_positive")
        .count("id as count")
        .groupBy("is_false_positive");
    const total = outcomes.reduce((sum, row) => sum + Number(row.count), 0);
    const fp = outcomes.find((row) => row.is_false_positive === true);
    return { models, quality: { labeled_outcomes_30d: total, false_positive_rate_bp: bpRate(Number(fp?.count ?? 0), total) } };
}

export async function registerTrustModel(input: {
    ctx: HttpContext;
    actor: User;
    modelId: string;
    version: string;
    purpose: string;
    owner: string;
    features: string[];
    privacyControls: Record<string, unknown>;
    evaluation: Record<string, unknown>;
    calibration: Record<string, unknown>;
    deployment?: Record<string, unknown>;
    limitations: string[];
    rollbackVersion?: string | null;
    reason: string;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    let model = await trx.from("fraud_risk_models").where("tenant_id", tenantId).where("model_id", input.modelId).first();
    if (!model) {
        const rows = await trx
            .table("fraud_risk_models")
            .insert({
                tenant_id: tenantId,
                model_id: input.modelId,
                purpose: input.purpose,
                owner: input.owner,
                description: `Phase 20 governed model: ${input.modelId}`,
                status: "active",
            })
            .returning("*");
        model = rows[0];
    } else if (String(model.purpose) !== input.purpose) {
        throw Object.assign(new Error("Model purpose conflicts with the registered model"), {
            status: 409,
            code: "E_TRUST_MODEL_PURPOSE_CONFLICT",
        });
    }
    const rows = await trx
        .table("fraud_risk_model_versions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            risk_model_id: Number(model.id),
            version: input.version,
            deployment_state: "challenger",
            thresholds: JSON.stringify({}),
            weights: JSON.stringify({}),
            validation_metrics: JSON.stringify(input.evaluation),
            known_limitations: input.limitations.join("\n") || null,
            features: JSON.stringify(input.features),
            privacy_controls: JSON.stringify(input.privacyControls),
            evaluation: JSON.stringify(input.evaluation),
            calibration: JSON.stringify(input.calibration),
            deployment: JSON.stringify(input.deployment ?? {}),
            limitations_json: JSON.stringify(input.limitations),
            rollout_percent: 0,
            rollback_version: input.rollbackVersion ?? null,
            created_by_user_id: Number(input.actor.id),
        })
        .returning("*");
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.model.register",
        entityKind: "fraud_risk_model_version",
        entityId: Number(rows[0].id),
        payload: { model_id: input.modelId, version: input.version, purpose: input.purpose, reason: input.reason },
        trx,
        strict: true,
    });
    return { ...rows[0], model_id: input.modelId, purpose: input.purpose, owner: input.owner, status: rows[0].deployment_state };
}

export async function updateTrustModelRollout(input: {
    ctx: HttpContext;
    actor: User;
    publicId: string;
    status: "challenger" | "champion" | "rollback_ready" | "disabled";
    rolloutPercent: number;
    reason: string;
}) {
    const trx = currentTrx();
    const row = await trx
        .from("fraud_risk_model_versions as version")
        .innerJoin("fraud_risk_models as model", "model.id", "version.risk_model_id")
        .where("version.tenant_id", Number(currentTenantId()))
        .where("version.public_id", input.publicId)
        .select("version.*", "model.model_id", "model.purpose")
        .forUpdate()
        .first();
    if (!row) throw Object.assign(new Error("Trust model version not found"), { status: 404, code: "E_TRUST_MODEL_NOT_FOUND" });
    if (input.status === "champion" && input.rolloutPercent <= 0)
        throw Object.assign(new Error("Champion rollout must be greater than zero"), {
            status: 422,
            code: "E_TRUST_MODEL_ROLLOUT_INVALID",
        });
    if (input.status === "champion") {
        const competing = await trx
            .from("fraud_risk_model_versions as other")
            .innerJoin("fraud_risk_models as other_model", "other_model.id", "other.risk_model_id")
            .where("other.tenant_id", Number(currentTenantId()))
            .where("other_model.purpose", row.purpose)
            .where("other.deployment_state", "champion")
            .whereNot("other.id", row.id)
            .select("other.id");
        if (competing.length) {
            await trx
                .from("fraud_risk_model_versions")
                .whereIn(
                    "id",
                    competing.map((item) => Number(item.id)),
                )
                .update({ deployment_state: "rollback_ready", rollout_percent: 0, updated_at: DateTime.utc().toSQL() });
        }
    }
    await trx
        .from("fraud_risk_model_versions")
        .where("id", row.id)
        .update({ deployment_state: input.status, rollout_percent: input.rolloutPercent, updated_at: DateTime.utc().toSQL() });
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.model.rollout.update",
        entityKind: "fraud_risk_model_version",
        entityId: Number(row.id),
        payload: {
            model_id: row.model_id,
            version: row.version,
            status: input.status,
            rollout_percent: input.rolloutPercent,
            reason: input.reason,
        },
        trx,
        strict: true,
    });
    return { ...row, status: input.status, deployment_state: input.status, rollout_percent: input.rolloutPercent };
}

export async function trustOutcomeSummary() {
    const trx = currentTrx();
    const since30d = DateTime.utc().minus({ days: 30 }).toSQL();
    const rows = await trx
        .from("fraud_outcomes")
        .where("tenant_id", Number(currentTenantId()))
        .where("created_at", ">=", since30d)
        .select(
            "outcome",
            "is_false_positive",
            "appeal_outcome",
            "baseline",
            "predicted_p10_minor",
            "predicted_p50_minor",
            "predicted_p90_minor",
            "measurement_confidence_bp",
            "actual_loss_minor",
            "incremental_effect_minor",
            "prevented_loss_minor",
            "guardrails",
            "unexpected_effects",
            "final_assessment",
            "created_at",
        )
        .orderBy("created_at", "desc")
        .limit(250);
    return { rows, generated_at: DateTime.utc().toISO() };
}

export function previewRiskBand(score: number) {
    const band = riskBandForScore(score);
    return { risk_score: score, risk_band: band, recommended_action: recommendedActionForBand(band) };
}
