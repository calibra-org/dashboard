import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import ConfigurationRevisionService from "#services/configuration_revision_service";
import type { ConfigurationScope } from "#services/configuration_registry";
import { Phase17ExperimentationService } from "#services/phase17_experimentation_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

type Row = Record<string, unknown>;
type Operator = "gte" | "lte" | "gt" | "lt" | "eq";
type Observation = { value: number; evidenceRef: string | null; evidence: Record<string, unknown> };

type InvariantInput = {
    invariant_key: string;
    name: string;
    domain: string;
    severity: "info" | "warning" | "critical";
    source_kind: "synthetic_pass_rate" | "fulfillment_promise_accuracy" | "manual_metric";
    source_config?: Record<string, unknown>;
    operator: Operator;
    threshold: number;
    window_seconds: number;
    min_consecutive_failures: number;
    recovery_consecutive_passes: number;
    remediation_policy_public_id?: string | null;
};

type PolicyInput = {
    policy_key: string;
    name: string;
    action_type: "rollback_configuration" | "pause_experiment" | "disable_policy";
    risk_level: "low" | "medium" | "high" | "critical";
    auto_execute: boolean;
    target?: Record<string, unknown>;
    cooldown_seconds: number;
    max_executions_per_hour: number;
    rollback_required: boolean;
};

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}
function objectValue(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}
function passes(operator: Operator, observed: number, threshold: number): boolean {
    if (operator === "gte") return observed >= threshold;
    if (operator === "lte") return observed <= threshold;
    if (operator === "gt") return observed > threshold;
    if (operator === "lt") return observed < threshold;
    return observed === threshold;
}
function fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function tenantId() {
    return Number(currentTenantId());
}

async function invariantByPublicId(publicId: string) {
    const row = await currentTrx().from("reliability_invariants").where("public_id", publicId).first();
    if (!row) throw new Exception("Reliability invariant not found", { status: 404, code: "E_RELIABILITY_INVARIANT_NOT_FOUND" });
    return row;
}
async function policyByPublicId(publicId: string) {
    const row = await currentTrx().from("reliability_remediation_policies").where("public_id", publicId).first();
    if (!row) throw new Exception("Reliability remediation policy not found", { status: 404, code: "E_RELIABILITY_POLICY_NOT_FOUND" });
    return row;
}
async function latestOpenIncident(invariantId: number) {
    return currentTrx().from("reliability_incidents").where("invariant_id", invariantId).whereIn("status", ["open", "mitigating", "monitoring"]).orderBy("opened_at", "desc").first();
}

async function syntheticPassRate(invariant: Row, now: DateTime): Promise<Observation | null> {
    const config = objectValue(invariant.source_config);
    const journeyKey = stringValue(config.journey_key);
    const windowSeconds = Math.max(60, numberValue(invariant.window_seconds));
    const trx = currentTrx();
    const query = trx
        .from("synthetic_commerce_runs as run")
        .innerJoin("synthetic_commerce_scenarios as scenario", "scenario.id", "run.scenario_id")
        .where("run.created_at", ">=", now.minus({ seconds: windowSeconds }).toJSDate())
        .whereIn("run.status", ["passed", "failed", "blocked"]);
    if (journeyKey) query.where("scenario.journey_key", journeyKey);
    const rows = await query.select("run.public_id", "run.status", "scenario.journey_key", "run.completed_at").limit(500);
    if (!rows.length) return null;
    const passed = rows.filter((row) => row.status === "passed").length;
    return {
        value: Math.round((passed / rows.length) * 10000) / 100,
        evidenceRef: `synthetic:${fingerprint(rows.map((row) => [row.public_id, row.status]))}`,
        evidence: {
            source: "phase24_synthetic_commerce",
            journey_key: journeyKey || null,
            sample_count: rows.length,
            passed,
            failed_or_blocked: rows.length - passed,
            unit: "percent",
        },
    };
}

async function fulfillmentPromiseAccuracy(invariant: Row, now: DateTime): Promise<Observation | null> {
    const rows = await currentTrx()
        .from("fulfillment_promise_outcomes as outcome")
        .innerJoin("fulfillment_promise_quotes as quote", "quote.id", "outcome.promise_quote_id")
        .where("outcome.created_at", ">=", now.minus({ seconds: Math.max(60, numberValue(invariant.window_seconds)) }).toJSDate())
        .whereNotNull("outcome.on_time")
        .select("outcome.id", "outcome.on_time", "quote.public_id")
        .limit(1000);
    if (!rows.length) return null;
    const onTime = rows.filter((row) => Boolean(row.on_time)).length;
    return {
        value: Math.round((onTime / rows.length) * 10000) / 100,
        evidenceRef: `phase31:${fingerprint(rows.map((row) => [row.id, row.on_time]))}`,
        evidence: { source: "phase31_fulfillment_promise", sample_count: rows.length, on_time: onTime, late: rows.length - onTime, unit: "percent" },
    };
}

async function latestManualMetric(invariant: Row, now: DateTime): Promise<Observation | null> {
    const row = await currentTrx()
        .from("reliability_evaluations")
        .where("invariant_id", numberValue(invariant.id))
        .whereRaw("evidence->>'source' = ?", ["manual_metric"])
        .where("evaluated_at", ">=", now.minus({ seconds: Math.max(60, numberValue(invariant.window_seconds)) }).toJSDate())
        .orderBy("evaluated_at", "desc")
        .first();
    if (!row) return null;
    return { value: numberValue(row.observed_value), evidenceRef: row.evidence_ref ? stringValue(row.evidence_ref) : null, evidence: objectValue(row.evidence) };
}
async function observe(invariant: Row, now: DateTime): Promise<Observation | null> {
    if (invariant.source_kind === "synthetic_pass_rate") return syntheticPassRate(invariant, now);
    if (invariant.source_kind === "fulfillment_promise_accuracy") return fulfillmentPromiseAccuracy(invariant, now);
    if (invariant.source_kind === "manual_metric") return latestManualMetric(invariant, now);
    return null;
}

async function attachEvaluation(invariant: Row, observation: Observation, passed: boolean, incidentId: number | null, now: DateTime) {
    await currentTrx().table("reliability_evaluations").insert({
        invariant_id: invariant.id,
        incident_id: incidentId,
        observed_value: observation.value,
        passed,
        evidence_ref: observation.evidenceRef,
        evidence: observation.evidence,
        evaluated_at: now.toJSDate(),
    });
}

async function updateIncident(invariant: Row, observation: Observation, passed: boolean, now: DateTime) {
    const trx = currentTrx();
    let incident = await latestOpenIncident(numberValue(invariant.id));
    const latest = await trx.from("reliability_evaluations").where("invariant_id", invariant.id).orderBy("evaluated_at", "desc").first();
    const previousPassed = latest ? Boolean(latest.passed) : null;
    if (passed) {
        if (!incident) {
            await attachEvaluation(invariant, observation, true, null, now);
            return null;
        }
        const recoveryCount = previousPassed === true ? numberValue(incident.recovery_count) + 1 : 1;
        const resolved = recoveryCount >= Math.max(1, numberValue(invariant.recovery_consecutive_passes));
        await trx.from("reliability_incidents").where("id", incident.id).update({
            recovery_count: recoveryCount,
            last_observed_at: now.toJSDate(),
            latest_evidence: observation.evidence,
            status: resolved ? "resolved" : "monitoring",
            resolved_at: resolved ? now.toJSDate() : null,
            updated_at: now.toJSDate(),
        });
        await attachEvaluation(invariant, observation, true, numberValue(incident.id), now);
        return resolved ? null : { ...incident, status: "monitoring", recovery_count: recoveryCount };
    }
    if (!incident) {
        const recentFailures = await trx
            .from("reliability_evaluations")
            .where("invariant_id", invariant.id)
            .where("passed", false)
            .orderBy("evaluated_at", "desc")
            .limit(Math.max(1, numberValue(invariant.min_consecutive_failures) - 1));
        const consecutive = previousPassed === false ? recentFailures.length + 1 : 1;
        if (consecutive < Math.max(1, numberValue(invariant.min_consecutive_failures))) {
            await attachEvaluation(invariant, observation, false, null, now);
            return null;
        }
        const [created] = await trx.table("reliability_incidents").insert({
            invariant_id: invariant.id,
            remediation_policy_id: invariant.remediation_policy_id ?? null,
            status: "open",
            severity: invariant.severity,
            failure_count: consecutive,
            recovery_count: 0,
            latest_evidence: observation.evidence,
            opened_at: now.toJSDate(),
            last_observed_at: now.toJSDate(),
        }).returning("*");
        incident = created;
    } else {
        const failureCount = previousPassed === false ? numberValue(incident.failure_count) + 1 : 1;
        const [updated] = await trx.from("reliability_incidents").where("id", incident.id).update({
            failure_count: failureCount,
            recovery_count: 0,
            status: incident.status === "monitoring" ? "open" : incident.status,
            last_observed_at: now.toJSDate(),
            latest_evidence: observation.evidence,
            resolved_at: null,
            updated_at: now.toJSDate(),
        }).returning("*");
        incident = updated;
    }
    await attachEvaluation(invariant, observation, false, numberValue(incident.id), now);
    return incident;
}

async function assertExecutionBudget(policy: Row, now: DateTime) {
    const trx = currentTrx();
    const last = await trx.from("reliability_remediation_runs").where("policy_id", policy.id).whereIn("status", ["executing", "verifying", "succeeded"]).orderBy("created_at", "desc").first();
    if (last) {
        const lastAt = DateTime.fromJSDate(new Date(last.created_at));
        if (lastAt.plus({ seconds: numberValue(policy.cooldown_seconds) }) > now) {
            throw new Exception("Remediation policy is cooling down", { status: 409, code: "E_RELIABILITY_REMEDIATION_COOLDOWN" });
        }
    }
    const hourly = await trx.from("reliability_remediation_runs").where("policy_id", policy.id).where("created_at", ">=", now.minus({ hours: 1 }).toJSDate()).whereNot("status", "approval_required").count("id as count").first();
    if (numberValue(hourly?.count) >= numberValue(policy.max_executions_per_hour)) {
        throw new Exception("Remediation hourly budget exhausted", { status: 429, code: "E_RELIABILITY_REMEDIATION_RATE_LIMIT" });
    }
}

async function executeAction(policy: Row, actorUserId: number | null) {
    const target = objectValue(policy.target);
    if (policy.action_type === "rollback_configuration") {
        const scope = stringValue(target.scope) as ConfigurationScope;
        const revision = numberValue(target.revision);
        if (!scope || !revision) throw new Exception("Configuration rollback target is incomplete", { status: 422, code: "E_RELIABILITY_TARGET_INVALID" });
        const revisions = new ConfigurationRevisionService();
        const before = await revisions.list(scope, 1);
        const result = await revisions.rollback(scope, revision, actorUserId);
        if (!result) throw new Exception("Configuration rollback revision was not found", { status: 404, code: "E_RELIABILITY_ROLLBACK_REVISION_NOT_FOUND" });
        return { before: { scope, revision: before[0]?.revision ?? null }, after: { scope, revision: result.revision.revision, rollback_of_revision: revision, changed: result.changed } };
    }
    if (policy.action_type === "pause_experiment") {
        const experimentId = numberValue(target.experiment_id);
        if (!experimentId) throw new Exception("Experiment target is incomplete", { status: 422, code: "E_RELIABILITY_TARGET_INVALID" });
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("id", experimentId).forUpdate().first();
        if (!experiment) throw new Exception("Experiment not found", { status: 404, code: "E_RELIABILITY_EXPERIMENT_NOT_FOUND" });
        if (experiment.status === "paused") return { before: { id: experimentId, status: "paused", version: experiment.version }, after: { id: experimentId, status: "paused", version: experiment.version } };
        if (!["running", "scheduled"].includes(String(experiment.status))) throw new Exception("Only running or scheduled experiments can be paused", { status: 409, code: "E_RELIABILITY_EXPERIMENT_STATE" });
        const result = await new Phase17ExperimentationService().transition(
            experimentId,
            { status: "paused", expected_version: numberValue(experiment.version), reason: "Reliability Guardian mitigation" },
            actorUserId ?? numberValue(experiment.owner_user_id),
        );
        return { before: { id: experimentId, status: experiment.status, version: experiment.version }, after: result.data };
    }
    if (policy.action_type === "disable_policy") {
        const targetPolicyId = numberValue(target.policy_id || policy.id);
        const trx = currentTrx();
        const targetPolicy = await trx.from("reliability_remediation_policies").where("id", targetPolicyId).forUpdate().first();
        if (!targetPolicy) throw new Exception("Reliability policy target not found", { status: 404, code: "E_RELIABILITY_POLICY_NOT_FOUND" });
        await trx.from("reliability_remediation_policies").where("id", targetPolicyId).update({ enabled: false, version: numberValue(targetPolicy.version) + 1, updated_at: new Date() });
        return { before: { id: targetPolicyId, enabled: Boolean(targetPolicy.enabled), version: targetPolicy.version }, after: { id: targetPolicyId, enabled: false, version: numberValue(targetPolicy.version) + 1 } };
    }
    throw new Exception("Unsupported remediation action", { status: 422, code: "E_RELIABILITY_ACTION_UNSUPPORTED" });
}

export async function executeRemediation(incidentPublicId: string, actorUserId: number | null, explicitApproval = false) {
    const trx = currentTrx();
    const incident = await trx.from("reliability_incidents").where("public_id", incidentPublicId).forUpdate().first();
    if (!incident) throw new Exception("Reliability incident not found", { status: 404, code: "E_RELIABILITY_INCIDENT_NOT_FOUND" });
    if (!["open", "mitigating", "monitoring"].includes(String(incident.status))) throw new Exception("Incident is not actionable", { status: 409, code: "E_RELIABILITY_INCIDENT_STATE" });
    if (!incident.remediation_policy_id) throw new Exception("Incident has no remediation policy", { status: 409, code: "E_RELIABILITY_POLICY_REQUIRED" });
    const policy = await trx.from("reliability_remediation_policies").where("id", incident.remediation_policy_id).forUpdate().first();
    if (!policy || !policy.enabled) throw new Exception("Remediation policy is unavailable", { status: 409, code: "E_RELIABILITY_POLICY_DISABLED" });
    const requiresApproval = policy.risk_level !== "low" || !policy.auto_execute;
    if (requiresApproval && !explicitApproval) {
        const key = `${incident.id}:${policy.id}:approval`;
        await trx.table("reliability_remediation_runs").insert({ incident_id: incident.id, policy_id: policy.id, action_type: policy.action_type, status: "approval_required", risk_level: policy.risk_level, idempotency_key: key, executed_by_user_id: actorUserId }).onConflict(["tenant_id", "idempotency_key"]).ignore();
        return { status: "approval_required" };
    }
    await assertExecutionBudget(policy, DateTime.utc());
    const bucket = DateTime.utc().startOf("hour").toISO();
    const idempotencyKey = `${incident.id}:${policy.id}:${bucket}`;
    const existing = await trx.from("reliability_remediation_runs").where("idempotency_key", idempotencyKey).first();
    if (existing) return existing;
    const [run] = await trx.table("reliability_remediation_runs").insert({
        incident_id: incident.id,
        policy_id: policy.id,
        action_type: policy.action_type,
        status: "executing",
        risk_level: policy.risk_level,
        idempotency_key: idempotencyKey,
        executed_by_user_id: actorUserId,
        executed_at: new Date(),
    }).returning("*");
    await trx.from("reliability_incidents").where("id", incident.id).update({ status: "mitigating", updated_at: new Date() });
    try {
        const action = await executeAction(policy, actorUserId);
        const [updated] = await trx.from("reliability_remediation_runs").where("id", run.id).update({
            status: "verifying",
            before_snapshot: action.before,
            after_snapshot: action.after,
            verification: { mode: "next_invariant_cycle", rollback_required: Boolean(policy.rollback_required) },
            updated_at: new Date(),
        }).returning("*");
        await trx.from("reliability_incidents").where("id", incident.id).update({ status: "monitoring", updated_at: new Date() });
        return updated;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown remediation failure";
        await trx.from("reliability_remediation_runs").where("id", run.id).update({ status: "failed", error_message: message, updated_at: new Date() });
        await trx.from("reliability_incidents").where("id", incident.id).update({ status: "open", updated_at: new Date() });
        throw error;
    }
}

async function finalizeMonitoringRuns(invariant: Row, incident: Row | null, passed: boolean, now: DateTime) {
    if (!incident) return;
    const trx = currentTrx();
    const runs = await trx.from("reliability_remediation_runs").where("incident_id", incident.id).where("status", "verifying").orderBy("created_at", "asc").forUpdate();
    for (const run of runs) {
        if (passed) {
            await trx.from("reliability_remediation_runs").where("id", run.id).update({ status: "succeeded", verified_at: now.toJSDate(), verification: { passed: true, invariant_key: invariant.invariant_key }, updated_at: now.toJSDate() });
        } else {
            await trx.from("reliability_remediation_runs").where("id", run.id).update({ verification: { passed: false, invariant_key: invariant.invariant_key, observed_at: now.toISO() }, updated_at: now.toJSDate() });
        }
    }
}

export async function runCycle(actorUserId: number | null = null) {
    const trx = currentTrx();
    await trx.rawQuery("SELECT pg_advisory_xact_lock(hashtext(?))", [`reliability-guardian:${tenantId()}`]);
    const now = DateTime.utc();
    const invariants = await trx.from("reliability_invariants").where("enabled", true).orderBy("id", "asc");
    const results: Array<Record<string, unknown>> = [];
    for (const invariant of invariants) {
        const observation = await observe(invariant, now);
        if (!observation) {
            results.push({ invariant_key: invariant.invariant_key, status: "no_evidence" });
            continue;
        }
        const passed = passes(invariant.operator as Operator, observation.value, numberValue(invariant.threshold));
        const incident = await updateIncident(invariant, observation, passed, now);
        await finalizeMonitoringRuns(invariant, incident, passed, now);
        if (!passed && incident?.remediation_policy_id) {
            const policy = await trx.from("reliability_remediation_policies").where("id", incident.remediation_policy_id).first();
            if (policy?.enabled && policy.auto_execute && policy.risk_level === "low") {
                try {
                    await executeRemediation(stringValue(incident.public_id), actorUserId, false);
                } catch (error) {
                    if (!(error instanceof Exception && [409, 429].includes(error.status))) throw error;
                }
            }
        }
        results.push({ invariant_key: invariant.invariant_key, observed_value: observation.value, threshold: numberValue(invariant.threshold), passed, incident_public_id: incident?.public_id ?? null });
    }
    const scorecard = await createScorecard(now.minus({ minutes: 15 }), now);
    return { evaluated: results.length, results, scorecard };
}

async function createScorecard(windowStart: DateTime, windowEnd: DateTime) {
    const trx = currentTrx();
    const latest = await trx.from("reliability_evaluations as evaluation").where("evaluation.evaluated_at", ">=", windowStart.toJSDate()).where("evaluation.evaluated_at", "<=", windowEnd.toJSDate()).select("evaluation.invariant_id").max("evaluation.id as latest_id").groupBy("evaluation.invariant_id");
    const ids = latest.map((row) => numberValue(row.latest_id)).filter(Boolean);
    const evaluations = ids.length ? await trx.from("reliability_evaluations").whereIn("id", ids) : [];
    const passing = evaluations.filter((row) => Boolean(row.passed)).length;
    const open = await trx.from("reliability_incidents").whereIn("status", ["open", "mitigating", "monitoring"]).count("id as count").first();
    const auto = await trx.from("reliability_remediation_runs as run").innerJoin("reliability_remediation_policies as policy", "policy.id", "run.policy_id").where("run.created_at", ">=", windowStart.toJSDate()).where("run.created_at", "<=", windowEnd.toJSDate()).where("policy.auto_execute", true).whereIn("run.status", ["verifying", "succeeded"]).count("run.id as count").first();
    const reliabilityBps = evaluations.length ? Math.round((passing / evaluations.length) * 10000) : 10000;
    const [row] = await trx.table("reliability_scorecards").insert({
        window_start_at: windowStart.toJSDate(),
        window_end_at: windowEnd.toJSDate(),
        reliability_bps: reliabilityBps,
        evaluated_invariants: evaluations.length,
        passing_invariants: passing,
        open_incidents: numberValue(open?.count),
        auto_remediations: numberValue(auto?.count),
        evidence: { latest_evaluation_ids: ids, evidence_only: evaluations.length === 0 },
    }).returning("*");
    return row;
}

export async function overview() {
    const trx = currentTrx();
    const [invariants, incidents, remediation, scorecard] = await Promise.all([
        trx.from("reliability_invariants").where("enabled", true).count("id as count").first(),
        trx.from("reliability_incidents").whereIn("status", ["open", "mitigating", "monitoring"]).select("severity").count("id as count").groupBy("severity"),
        trx.from("reliability_remediation_runs").where("created_at", ">=", DateTime.utc().minus({ days: 30 }).toJSDate()).select("status").count("id as count").groupBy("status"),
        trx.from("reliability_scorecards").orderBy("window_end_at", "desc").first(),
    ]);
    return {
        active_invariants: numberValue(invariants?.count),
        incidents: Object.fromEntries(incidents.map((row) => [stringValue(row.severity), numberValue(row.count)])),
        remediations_30d: Object.fromEntries(remediation.map((row) => [stringValue(row.status), numberValue(row.count)])),
        latest_scorecard: scorecard ?? null,
        boundaries: {
            synthetic_evidence: "phase24",
            fulfillment_evidence: "phase31",
            configuration_rollback: "configuration_revision_service",
            experimentation: "phase17",
            autonomous_actions: "low_risk_only",
        },
    };
}

export async function listInvariants() {
    return currentTrx().from("reliability_invariants as invariant").leftJoin("reliability_remediation_policies as policy", "policy.id", "invariant.remediation_policy_id").select("invariant.*", "policy.public_id as remediation_policy_public_id", "policy.name as remediation_policy_name").orderBy("invariant.severity", "desc").orderBy("invariant.name", "asc");
}
export async function createInvariant(input: InvariantInput, actorUserId: number) {
    const trx = currentTrx();
    let policyId: number | null = null;
    if (input.remediation_policy_public_id) policyId = numberValue((await policyByPublicId(input.remediation_policy_public_id)).id);
    const payload = { ...input, remediation_policy_id: policyId, source_config: input.source_config ?? {}, created_by_user_id: actorUserId } as Record<string, unknown>;
    delete payload.remediation_policy_public_id;
    const [row] = await trx.table("reliability_invariants").insert(payload).returning("*");
    return row;
}
export async function listPolicies() {
    return currentTrx().from("reliability_remediation_policies").orderBy("updated_at", "desc");
}
export async function createPolicy(input: PolicyInput, actorUserId: number) {
    if (input.auto_execute && input.risk_level !== "low") throw new Exception("Only low-risk remediation may auto-execute", { status: 422, code: "E_RELIABILITY_AUTO_RISK" });
    const [row] = await currentTrx().table("reliability_remediation_policies").insert({ ...input, target: input.target ?? {}, created_by_user_id: actorUserId }).returning("*");
    return row;
}
export async function recordManualObservation(publicId: string, value: number, evidence: Record<string, unknown>) {
    const invariant = await invariantByPublicId(publicId);
    if (invariant.source_kind !== "manual_metric") throw new Exception("Invariant does not accept manual metrics", { status: 422, code: "E_RELIABILITY_SOURCE_MISMATCH" });
    const now = DateTime.utc();
    const observation: Observation = { value, evidenceRef: `manual:${fingerprint({ value, evidence, at: now.toISO() })}`, evidence: { ...evidence, source: "manual_metric" } };
    const passed = passes(invariant.operator as Operator, value, numberValue(invariant.threshold));
    const incident = await updateIncident(invariant, observation, passed, now);
    await finalizeMonitoringRuns(invariant, incident, passed, now);
    return { passed, incident_public_id: incident?.public_id ?? null };
}
export async function listIncidents(limit = 100) {
    return currentTrx().from("reliability_incidents as incident").innerJoin("reliability_invariants as invariant", "invariant.id", "incident.invariant_id").leftJoin("reliability_remediation_policies as policy", "policy.id", "incident.remediation_policy_id").select("incident.*", "invariant.invariant_key", "invariant.name as invariant_name", "policy.public_id as policy_public_id", "policy.name as policy_name").orderBy("incident.opened_at", "desc").limit(Math.min(500, Math.max(1, limit)));
}
export async function listRemediations(limit = 100) {
    return currentTrx().from("reliability_remediation_runs as run").innerJoin("reliability_incidents as incident", "incident.id", "run.incident_id").innerJoin("reliability_remediation_policies as policy", "policy.id", "run.policy_id").select("run.*", "incident.public_id as incident_public_id", "policy.public_id as policy_public_id", "policy.name as policy_name").orderBy("run.created_at", "desc").limit(Math.min(500, Math.max(1, limit)));
}
export async function listScorecards(limit = 100) {
    return currentTrx().from("reliability_scorecards").orderBy("window_end_at", "desc").limit(Math.min(500, Math.max(1, limit)));
}

export async function rollbackRemediation(publicId: string, actorUserId: number) {
    const trx = currentTrx();
    const run = await trx.from("reliability_remediation_runs").where("public_id", publicId).forUpdate().first();
    if (!run) throw new Exception("Remediation run not found", { status: 404, code: "E_RELIABILITY_REMEDIATION_NOT_FOUND" });
    if (!["verifying", "succeeded"].includes(String(run.status))) throw new Exception("Remediation is not rollback-eligible", { status: 409, code: "E_RELIABILITY_REMEDIATION_STATE" });
    const policy = await trx.from("reliability_remediation_policies").where("id", run.policy_id).first();
    if (!policy || !policy.rollback_required) throw new Exception("Policy does not permit rollback", { status: 409, code: "E_RELIABILITY_ROLLBACK_DISABLED" });
    const before = objectValue(run.before_snapshot);
    if (policy.action_type === "rollback_configuration") {
        const scope = stringValue(before.scope) as ConfigurationScope;
        const revision = numberValue(before.revision);
        if (!scope || !revision) throw new Exception("Rollback snapshot is incomplete", { status: 409, code: "E_RELIABILITY_ROLLBACK_SNAPSHOT" });
        const result = await new ConfigurationRevisionService().rollback(scope, revision, actorUserId);
        if (!result) throw new Exception("Rollback revision no longer exists", { status: 409, code: "E_RELIABILITY_ROLLBACK_REVISION_NOT_FOUND" });
    } else if (policy.action_type === "pause_experiment") {
        const experimentId = numberValue(before.id);
        const experiment = await trx.from("experiments").where("id", experimentId).forUpdate().first();
        if (!experiment) throw new Exception("Experiment no longer exists", { status: 409, code: "E_RELIABILITY_EXPERIMENT_NOT_FOUND" });
        if (before.status === "running" && experiment.status === "paused") {
            await new Phase17ExperimentationService().transition(experimentId, { status: "running", expected_version: numberValue(experiment.version), reason: "Reliability Guardian rollback" }, actorUserId);
        }
    } else if (policy.action_type === "disable_policy") {
        const policyId = numberValue(before.id);
        await trx.from("reliability_remediation_policies").where("id", policyId).update({ enabled: Boolean(before.enabled), version: trx.raw("version + 1"), updated_at: new Date() });
    }
    await trx.from("reliability_remediation_runs").where("id", run.id).update({ status: "rolled_back", rolled_back_at: new Date(), executed_by_user_id: actorUserId, updated_at: new Date() });
    return { rolled_back: true };
}
