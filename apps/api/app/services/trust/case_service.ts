import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import type User from "#models/user";
import { recordAudit } from "#services/admin_audit_log_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { executeTrustAction } from "#services/trust/action_service";
import type { TrustAction, TrustCaseStatus } from "#services/trust/contracts";

function statusForAction(action: TrustAction): TrustCaseStatus {
    if (action === "step_up") return "waiting_step_up";
    if (action === "hold" || action === "block") return "held";
    if (action === "dismiss") return "dismissed";
    if (action === "allow") return "resolved";
    return "in_review";
}

async function loadCaseForUpdate(publicId: string) {
    const row = await currentTrx()
        .from("fraud_cases")
        .where("tenant_id", Number(currentTenantId()))
        .where("public_id", publicId)
        .forUpdate()
        .first();
    if (!row) throw Object.assign(new Error("Trust case not found"), { status: 404, code: "E_TRUST_CASE_NOT_FOUND" });
    return row;
}

function assertVersion(row: Record<string, unknown>, expectedVersion: number) {
    if (Number(row.version) === expectedVersion) return;
    throw Object.assign(new Error("Trust case changed since it was loaded"), {
        status: 409,
        code: "E_TRUST_CASE_VERSION_CONFLICT",
        meta: { current_version: Number(row.version) },
    });
}

export async function assignTrustCase(input: {
    ctx: Parameters<typeof recordAudit>[0]["ctx"];
    publicId: string;
    assigneeUserId: number | null;
    expectedVersion: number;
    actor: User;
    reason: string;
}) {
    const row = await loadCaseForUpdate(input.publicId);
    assertVersion(row, input.expectedVersion);
    if (input.assigneeUserId !== null) {
        const assignee = await currentTrx()
            .from("users")
            .where("tenant_id", Number(currentTenantId()))
            .where("id", input.assigneeUserId)
            .where("role", "admin")
            .whereNull("deleted_at")
            .first();
        if (!assignee) throw Object.assign(new Error("Reviewer is not available in this tenant"), { status: 422, code: "E_TRUST_REVIEWER_INVALID" });
    }
    const nextVersion = Number(row.version) + 1;
    const nextStatus = row.status === "open" ? "in_review" : row.status;
    await currentTrx()
        .from("fraud_cases")
        .where("id", row.id)
        .update({ assignee_user_id: input.assigneeUserId, status: nextStatus, version: nextVersion, updated_at: DateTime.utc().toSQL() });
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.case.assign",
        entityKind: "trust_case",
        entityId: Number(row.id),
        payload: { case_public_id: input.publicId, assignee_user_id: input.assigneeUserId, reason: input.reason, previous_version: row.version },
        trx: currentTrx(),
        strict: true,
    });
    return { ...row, assignee_user_id: input.assigneeUserId, assigned_to_user_id: input.assigneeUserId, status: nextStatus, version: nextVersion };
}

export async function decideTrustCase(input: {
    ctx: Parameters<typeof recordAudit>[0]["ctx"];
    publicId: string;
    action: TrustAction;
    reasonCode: string;
    reason: string;
    expectedVersion: number;
    actor: User;
    isOverride?: boolean;
    idempotencyKey: string;
}) {
    const row = await loadCaseForUpdate(input.publicId);
    const replayDecision = await currentTrx()
        .from("fraud_decisions")
        .where("tenant_id", Number(currentTenantId()))
        .where("case_id", row.id)
        .where("idempotency_key", input.idempotencyKey)
        .first();
    if (replayDecision) {
        const replayAction = await currentTrx()
            .from("fraud_action_executions")
            .where("tenant_id", Number(currentTenantId()))
            .where("decision_id", replayDecision.id)
            .where("idempotency_key", input.idempotencyKey)
            .first();
        return { case: row, decision: replayDecision, action: replayAction ?? null, replayed: true };
    }
    assertVersion(row, input.expectedVersion);
    const previous = await currentTrx().from("fraud_decisions").where("case_id", row.id).orderBy("id", "desc").first();
    const evidence = await currentTrx()
        .from("fraud_case_evidence")
        .where("case_id", row.id)
        .orderBy("created_at", "desc")
        .limit(50)
        .select("evidence_type", "evidence_ref", "weight", "summary", "is_sensitive");
    const score1000 = Math.max(0, Math.min(1000, Math.round(Number(row.risk_score ?? 0) * 10)));
    const scoreBand = String(row.risk_band ?? "medium");
    const legacyBand = scoreBand === "severe" ? "critical" : scoreBand === "high" || scoreBand === "elevated" ? "high" : scoreBand === "medium" ? "medium" : "low";
    const scoreRows = await currentTrx()
        .table("fraud_risk_scores")
        .insert({
            tenant_id: Number(currentTenantId()),
            subject_type: String(row.subject_type),
            subject_id: String(row.subject_id),
            score: score1000,
            band: legacyBand,
            reason_codes_json: JSON.stringify([input.reasonCode]),
            evidence_summary: JSON.stringify({ case_public_id: row.public_id, case_version: row.version, source: "human_review" }),
            idempotency_key: `case:${input.idempotencyKey}:score`.slice(0, 180),
        })
        .returning("*");
    const decisionRows = await currentTrx()
        .table("fraud_decisions")
        .insert({
            public_id: randomUUID(),
            tenant_id: Number(currentTenantId()),
            risk_score_id: scoreRows[0].id,
            case_id: row.id,
            subject_type: String(row.subject_type),
            subject_id: String(row.subject_id),
            actor_user_id: Number(input.actor.id),
            previous_decision_id: previous?.id ?? null,
            idempotency_key: input.idempotencyKey,
            decision: input.action,
            policy_version: row.policy_key && row.policy_version ? `${String(row.policy_key)}:${String(row.policy_version)}` : "human-review-v1",
            reason_code: input.reasonCode,
            reason: input.reason,
            is_override: input.isOverride ?? false,
            alternatives: JSON.stringify(["allow", "monitor", "step_up", "hold", "block", "dismiss"].filter((action) => action !== input.action)),
            evidence_snapshot: JSON.stringify({ case_version: row.version, evidence }),
            policy_evaluation: JSON.stringify({ policy_key: row.policy_key ?? null, policy_version: row.policy_version ?? null }),
            approval_chain: JSON.stringify([{ actor_user_id: Number(input.actor.id), at: DateTime.utc().toISO(), kind: input.isOverride ? "override" : "review" }]),
            reason_codes_json: JSON.stringify([input.reasonCode]),
        })
        .returning("*");
    const decision = decisionRows[0];
    const actionResult = await executeTrustAction({
        caseRow: row,
        decisionId: Number(decision.id),
        action: input.action,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
    });
    const nextStatus = statusForAction(input.action);
    const nextVersion = Number(row.version) + 1;
    await currentTrx()
        .from("fraud_cases")
        .where("id", row.id)
        .update({
            status: nextStatus,
            decision_id: decision.id,
            version: nextVersion,
            resolved_at: ["resolved", "dismissed"].includes(nextStatus) ? DateTime.utc().toSQL() : null,
            updated_at: DateTime.utc().toSQL(),
        });
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: input.isOverride ? "trust.case.override" : "trust.case.decision",
        entityKind: "trust_case",
        entityId: Number(row.id),
        payload: {
            case_public_id: input.publicId,
            action: input.action,
            reason_code: input.reasonCode,
            reason: input.reason,
            decision_public_id: decision.public_id,
            action_public_id: actionResult.public_id,
            previous_version: row.version,
        },
        trx: currentTrx(),
        strict: true,
    });
    return { case: { ...row, status: nextStatus, version: nextVersion }, decision, action: actionResult };
}

export async function appealTrustCase(input: {
    ctx: Parameters<typeof recordAudit>[0]["ctx"];
    publicId: string;
    reason: string;
    expectedVersion: number;
    actor: User;
}) {
    const row = await loadCaseForUpdate(input.publicId);
    assertVersion(row, input.expectedVersion);
    const nextVersion = Number(row.version) + 1;
    await currentTrx()
        .from("fraud_cases")
        .where("id", row.id)
        .update({ status: "appealed", version: nextVersion, resolved_at: null, updated_at: DateTime.utc().toSQL() });
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.case.appeal",
        entityKind: "trust_case",
        entityId: Number(row.id),
        payload: { case_public_id: input.publicId, reason: input.reason, previous_version: row.version },
        trx: currentTrx(),
        strict: true,
    });
    return { ...row, status: "appealed", version: nextVersion };
}

export async function recordTrustOutcome(input: {
    ctx: Parameters<typeof recordAudit>[0]["ctx"];
    publicId: string;
    outcome: string;
    isFalsePositive?: boolean | null;
    appealOutcome?: string | null;
    baseline?: Record<string, unknown>;
    predictedP10Minor?: number | null;
    predictedP50Minor?: number | null;
    predictedP90Minor?: number | null;
    actualLossMinor?: number | null;
    incrementalEffectMinor?: number | null;
    preventedLossMinor?: number | null;
    guardrails?: Record<string, unknown>;
    finalAssessment?: string | null;
    measurementConfidenceBp: number;
    unexpectedEffects?: string[];
    notes?: string | null;
    actor: User;
}) {
    const row = await loadCaseForUpdate(input.publicId);
    const decision = await currentTrx().from("fraud_decisions").where("case_id", row.id).orderBy("id", "desc").first();
    const outcomeRows = await currentTrx()
        .table("fraud_outcomes")
        .insert({
            tenant_id: Number(currentTenantId()),
            case_id: row.id,
            decision_id: decision?.id ?? null,
            outcome: input.outcome,
            is_false_positive: input.isFalsePositive ?? null,
            appeal_outcome: input.appealOutcome ?? null,
            baseline: JSON.stringify(input.baseline ?? {}),
            predicted_p10_minor: input.predictedP10Minor ?? null,
            predicted_p50_minor: input.predictedP50Minor ?? null,
            predicted_p90_minor: input.predictedP90Minor ?? null,
            actual_loss_minor: input.actualLossMinor ?? null,
            incremental_effect_minor: input.incrementalEffectMinor ?? null,
            prevented_loss_minor: input.preventedLossMinor ?? null,
            guardrails: JSON.stringify(input.guardrails ?? {}),
            final_assessment: input.finalAssessment ?? null,
            measurement_confidence_bp: input.measurementConfidenceBp,
            unexpected_effects: JSON.stringify(input.unexpectedEffects ?? []),
            notes: input.notes ?? null,
            recorded_by_user_id: Number(input.actor.id),
        })
        .returning("*");
    await recordAudit({
        ctx: input.ctx,
        actorUserId: Number(input.actor.id),
        action: "trust.outcome.record",
        entityKind: "trust_case",
        entityId: Number(row.id),
        payload: {
            case_public_id: input.publicId,
            outcome: input.outcome,
            is_false_positive: input.isFalsePositive ?? null,
            appeal_outcome: input.appealOutcome ?? null,
        },
        trx: currentTrx(),
        strict: true,
    });
    return outcomeRows[0];
}
