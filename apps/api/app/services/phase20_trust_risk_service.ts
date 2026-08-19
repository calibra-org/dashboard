import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx, withTenantTransaction } from "#services/tenant_context";

type Severity = "low" | "medium" | "high" | "critical";
type RiskBand = Severity;
type Decision = "allow" | "review" | "challenge" | "hold" | "block";
type SignalInput = {
    code: string;
    severity?: Severity;
    value?: number;
    evidence?: Record<string, unknown>;
    dedupe_key?: string;
};
type Actor = { id?: number | string | bigint };

const BASE_BY_SEVERITY: Record<Severity, number> = {
    low: 60,
    medium: 150,
    high: 280,
    critical: 480,
};
const SIGNAL_MULTIPLIERS: Record<string, number> = {
    "velocity.checkout": 1.0,
    "velocity.payment": 1.15,
    "account.new": 0.55,
    "device.untrusted": 0.7,
    "geo.impossible_travel": 1.45,
    "payment.mismatch": 1.25,
    "coupon.abuse": 1.05,
    "refund.burst": 1.25,
    "auth.ato_suspected": 1.7,
};
const SENSITIVE_KEY = /(authorization|cookie|password|secret|token|session|email|phone|otp|totp|recovery)/i;
const numberValue = (value: unknown) => Number(value ?? 0);
const tenantId = () => Number(currentTenantId());
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function sanitizeEvidence(value: unknown, depth = 0): unknown {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeEvidence(item, depth + 1));
    if (!value || typeof value !== "object") {
        if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 237)}...` : value;
        return value;
    }
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .slice(0, 40)
            .map(([key, item]) => [
                key,
                SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeEvidence(item, depth + 1),
            ]),
    );
}

export function calculateRiskDecision(signals: SignalInput[], control?: string | null) {
    if (control === "block") {
        return {
            score: 1000,
            band: "critical" as RiskBand,
            decision: "block" as Decision,
            reasons: ["control.block"],
        };
    }
    if (control === "allow_override") {
        return {
            score: 0,
            band: "low" as RiskBand,
            decision: "allow" as Decision,
            reasons: ["control.allow_override"],
        };
    }
    const contributions = signals.map((signal) => {
        const severity = signal.severity ?? "medium";
        const value = clamp(Number.isFinite(Number(signal.value)) ? Number(signal.value) : 1, 0, 4);
        return {
            code: signal.code,
            score: Math.round(
                BASE_BY_SEVERITY[severity] * (SIGNAL_MULTIPLIERS[signal.code] ?? 0.8) * value,
            ),
        };
    });
    const score = clamp(
        contributions.reduce((sum, item) => sum + item.score, 0),
        0,
        1000,
    );
    const band: RiskBand =
        score >= 750 ? "critical" : score >= 500 ? "high" : score >= 250 ? "medium" : "low";
    let decision: Decision =
        band === "critical" ? "block" : band === "high" ? "challenge" : band === "medium" ? "review" : "allow";
    if (control === "challenge") decision = "challenge";
    if (control === "review" && decision === "allow") decision = "review";
    return {
        score,
        band,
        decision,
        reasons: contributions
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map((item) => item.code),
    };
}

class Phase20TrustRiskService {
    async overview() {
        const trx = currentTrx();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [bands, decisions, cases, signals, recentScores, recentCases] = await Promise.all([
            trx
                .from("fraud_risk_scores")
                .select("band")
                .count("id as count")
                .where("evaluated_at", ">=", thirtyDaysAgo)
                .groupBy("band"),
            trx
                .from("fraud_decisions")
                .select("decision")
                .count("id as count")
                .where("created_at", ">=", thirtyDaysAgo)
                .groupBy("decision"),
            trx.from("fraud_cases").whereNotIn("status", ["resolved", "closed"]).count("id as total").first(),
            trx.from("fraud_signals").where("observed_at", ">=", dayAgo).count("id as total").first(),
            trx
                .from("fraud_risk_scores")
                .select(
                    "id",
                    "subject_type",
                    "subject_id",
                    "score",
                    "band",
                    "reason_codes_json",
                    "evaluated_at",
                )
                .orderBy("evaluated_at", "desc")
                .limit(30),
            trx
                .from("fraud_cases")
                .select(
                    "id",
                    "case_number",
                    "subject_type",
                    "subject_id",
                    "status",
                    "priority",
                    "summary",
                    "opened_at",
                    "assignee_user_id",
                )
                .orderBy("opened_at", "desc")
                .limit(30),
        ]);
        return {
            data: {
                kpis: {
                    open_cases: numberValue(cases?.total),
                    signals_24h: numberValue(signals?.total),
                    evaluated_30d: bands.reduce(
                        (sum: number, row: any) => sum + numberValue(row.count),
                        0,
                    ),
                    challenged_30d: numberValue(
                        decisions.find((row: any) => row.decision === "challenge")?.count,
                    ),
                    blocked_30d: numberValue(
                        decisions.find((row: any) => row.decision === "block")?.count,
                    ),
                },
                bands: Object.fromEntries(
                    bands.map((row: any) => [row.band, numberValue(row.count)]),
                ),
                decisions: Object.fromEntries(
                    decisions.map((row: any) => [row.decision, numberValue(row.count)]),
                ),
                recent_scores: recentScores,
                recent_cases: recentCases,
            },
        };
    }

    async cases() {
        return {
            data: await currentTrx()
                .from("fraud_cases")
                .select("*")
                .orderBy("opened_at", "desc")
                .limit(200),
        };
    }

    async signals() {
        return {
            data: await currentTrx()
                .from("fraud_signals")
                .select(
                    "id",
                    "subject_type",
                    "subject_id",
                    "code",
                    "severity",
                    "value",
                    "observed_at",
                    "expires_at",
                )
                .orderBy("observed_at", "desc")
                .limit(300),
        };
    }

    async models() {
        const rows = await currentTrx()
            .from("fraud_risk_models as m")
            .leftJoin("fraud_risk_model_versions as v", "v.risk_model_id", "m.id")
            .select(
                "m.*",
                "v.id as version_id",
                "v.version",
                "v.deployment_state",
                "v.validated_at",
                "v.known_limitations",
            )
            .orderBy("m.updated_at", "desc");
        return { data: rows };
    }

    async evaluate(input: {
        subject_type: string;
        subject_id: string;
        signals?: SignalInput[];
        idempotency_key?: string | null;
    }) {
        return withTenantTransaction(async (trx) => {
            const key = input.idempotency_key?.trim().slice(0, 180) || null;
            if (key) {
                const existing = await trx
                    .from("fraud_risk_scores")
                    .where("tenant_id", tenantId())
                    .where("idempotency_key", key)
                    .first();
                if (existing) {
                    return {
                        data: {
                            score: existing,
                            decision: await trx
                                .from("fraud_decisions")
                                .where("risk_score_id", existing.id)
                                .first(),
                        },
                        replayed: true,
                    };
                }
            }
            const activeControl = await trx
                .from("fraud_subject_controls")
                .where("tenant_id", tenantId())
                .where("subject_type", input.subject_type)
                .where("subject_id", input.subject_id)
                .where("status", "active")
                .where((query) => query.whereNull("expires_at").orWhere("expires_at", ">", new Date()))
                .orderBy("created_at", "desc")
                .first();
            const storedSignals = await trx
                .from("fraud_signals")
                .where("tenant_id", tenantId())
                .where("subject_type", input.subject_type)
                .where("subject_id", input.subject_id)
                .where((query) => query.whereNull("expires_at").orWhere("expires_at", ">", new Date()))
                .orderBy("observed_at", "desc")
                .limit(100);
            const incoming = input.signals ?? [];
            for (const signal of incoming) {
                if (
                    signal.dedupe_key &&
                    (await trx
                        .from("fraud_signals")
                        .where("tenant_id", tenantId())
                        .where("dedupe_key", signal.dedupe_key.slice(0, 180))
                        .first())
                ) {
                    continue;
                }
                await trx.table("fraud_signals").insert({
                    tenant_id: tenantId(),
                    subject_type: input.subject_type,
                    subject_id: input.subject_id,
                    code: signal.code,
                    severity: signal.severity ?? "medium",
                    value: clamp(Number(signal.value ?? 1), 0, 4),
                    evidence: sanitizeEvidence(signal.evidence ?? {}),
                    dedupe_key: signal.dedupe_key?.slice(0, 180) ?? null,
                });
            }
            const allSignals = [
                ...storedSignals.map((row: any) => ({
                    code: row.code,
                    severity: row.severity,
                    value: numberValue(row.value),
                })),
                ...incoming,
            ];
            const result = calculateRiskDecision(allSignals, activeControl?.control ?? null);
            const champion = await trx
                .from("fraud_risk_model_versions")
                .where("tenant_id", tenantId())
                .where("deployment_state", "champion")
                .orderBy("validated_at", "desc")
                .first();
            const [score] = await trx
                .table("fraud_risk_scores")
                .insert({
                    tenant_id: tenantId(),
                    subject_type: input.subject_type,
                    subject_id: input.subject_id,
                    model_version_id: champion?.id ?? null,
                    score: result.score,
                    band: result.band,
                    reason_codes_json: JSON.stringify(result.reasons),
                    evidence_summary: {
                        signal_count: allSignals.length,
                        control: activeControl?.control ?? null,
                        evidence_storage: "redacted",
                    },
                    idempotency_key: key,
                })
                .returning("*");
            const [decision] = await trx
                .table("fraud_decisions")
                .insert({
                    tenant_id: tenantId(),
                    risk_score_id: score.id,
                    subject_type: input.subject_type,
                    subject_id: input.subject_id,
                    decision: result.decision,
                    policy_version: champion ? `model:${champion.version}` : "rule-v1",
                    reason_codes_json: JSON.stringify(result.reasons),
                    idempotency_key: key ? `${key}:decision`.slice(0, 180) : null,
                })
                .returning("*");
            if (result.decision !== "allow") {
                const priority =
                    result.band === "critical" ? "critical" : result.band === "high" ? "high" : "medium";
                const [fraudCase] = await trx
                    .table("fraud_cases")
                    .insert({
                        tenant_id: tenantId(),
                        case_number: `FR-${new Date().getUTCFullYear()}-${score.id}`,
                        subject_type: input.subject_type,
                        subject_id: input.subject_id,
                        decision_id: decision.id,
                        priority,
                        summary: `Risk ${result.band}: ${result.reasons.join(", ") || "policy control"}`,
                    })
                    .returning("*");
                await trx.table("fraud_case_events").insert({
                    tenant_id: tenantId(),
                    case_id: fraudCase.id,
                    event_type: "case.opened",
                    metadata: { decision_id: decision.id, score: result.score, band: result.band },
                });
            }
            return { data: { score, decision }, replayed: false };
        });
    }

    async checkoutGuard(input: {
        orderId: number | string;
        customerId?: number | string | bigint | null;
        idempotencyKey?: string | null;
        amountMinor?: number | null;
    }) {
        const signals: SignalInput[] = [];
        if (input.customerId == null) {
            signals.push({
                code: "account.new",
                severity: "low",
                value: 0.5,
                evidence: { source: "guest_checkout" },
            });
        }
        if (numberValue(input.amountMinor) >= 50_000_000) {
            signals.push({
                code: "velocity.checkout",
                severity: "medium",
                value: 0.5,
                evidence: { amount_bucket: "high" },
            });
        }
        const result = await this.evaluate({
            subject_type: "order",
            subject_id: String(input.orderId),
            signals,
            idempotency_key: input.idempotencyKey ? `checkout:${input.idempotencyKey}:risk` : null,
        });
        const decision = result.data.decision?.decision as Decision | undefined;
        if (decision === "block") {
            throw new Exception("Checkout blocked by trust policy", {
                status: 403,
                code: "E_TRUST_CHECKOUT_BLOCKED",
            });
        }
        if (["review", "challenge", "hold"].includes(String(decision))) {
            throw new Exception("Checkout requires trust review", {
                status: 409,
                code: "E_TRUST_CHECKOUT_REVIEW",
            });
        }
        return result;
    }

    async createModel(payload: any, actor: Actor) {
        const trx = currentTrx();
        const [row] = await trx
            .table("fraud_risk_models")
            .insert({
                tenant_id: tenantId(),
                model_id: payload.model_id,
                purpose: payload.purpose ?? "commerce_fraud",
                owner: payload.owner ?? null,
                description: payload.description ?? null,
                status: "active",
            })
            .returning("*");
        await trx.table("fraud_action_executions").insert({
            tenant_id: tenantId(),
            action: "model.create",
            actor_user_id: actor.id ?? null,
            metadata: { model_id: row.model_id },
        });
        return { data: row };
    }

    async createModelVersion(modelId: number, payload: any, actor: Actor) {
        const trx = currentTrx();
        const model = await trx.from("fraud_risk_models").where("id", modelId).first();
        if (!model) {
            throw new Exception("Risk model not found", { status: 404, code: "E_TRUST_MODEL" });
        }
        const [row] = await trx
            .table("fraud_risk_model_versions")
            .insert({
                tenant_id: tenantId(),
                risk_model_id: modelId,
                version: payload.version,
                deployment_state: payload.deployment_state ?? "draft",
                thresholds: payload.thresholds ?? {},
                weights: payload.weights ?? {},
                validation_metrics: payload.validation_metrics ?? {},
                known_limitations: payload.known_limitations ?? null,
                validated_at: payload.validated ? new Date() : null,
                created_by_user_id: actor.id ?? null,
            })
            .returning("*");
        return { data: row };
    }

    async promoteChampion(versionId: number, actor: Actor, idempotencyKey: string | null) {
        return withTenantTransaction(async (trx) => {
            if (idempotencyKey) {
                const replay = await trx
                    .from("fraud_action_executions")
                    .where("tenant_id", tenantId())
                    .where("idempotency_key", idempotencyKey)
                    .first();
                if (replay) return { data: replay, replayed: true };
            }
            const version = await trx
                .from("fraud_risk_model_versions")
                .where("id", versionId)
                .forUpdate()
                .first();
            if (!version) {
                throw new Exception("Risk model version not found", {
                    status: 404,
                    code: "E_TRUST_MODEL_VERSION",
                });
            }
            if (!version.validated_at) {
                throw new Exception("Only validated versions can become champion", {
                    status: 422,
                    code: "E_TRUST_MODEL_NOT_VALIDATED",
                });
            }
            await trx
                .from("fraud_risk_model_versions")
                .where("risk_model_id", version.risk_model_id)
                .where("deployment_state", "champion")
                .update({ deployment_state: "retired" });
            await trx
                .from("fraud_risk_model_versions")
                .where("id", versionId)
                .update({ deployment_state: "champion" });
            const [action] = await trx
                .table("fraud_action_executions")
                .insert({
                    tenant_id: tenantId(),
                    action: "model.promote_champion",
                    actor_user_id: actor.id ?? null,
                    idempotency_key: idempotencyKey,
                    metadata: { version_id: versionId, risk_model_id: version.risk_model_id },
                })
                .returning("*");
            return { data: action, replayed: false };
        });
    }

    async createCase(payload: any, actor: Actor) {
        const trx = currentTrx();
        const [row] = await trx
            .table("fraud_cases")
            .insert({
                tenant_id: tenantId(),
                case_number: `FR-${new Date().getUTCFullYear()}-M${Date.now()}`,
                subject_type: payload.subject_type,
                subject_id: payload.subject_id,
                priority: payload.priority ?? "medium",
                summary: payload.summary ?? null,
            })
            .returning("*");
        await trx.table("fraud_case_events").insert({
            tenant_id: tenantId(),
            case_id: row.id,
            event_type: "case.opened.manual",
            actor_user_id: actor.id ?? null,
        });
        return { data: row };
    }

    async assignCase(caseId: number, assigneeUserId: number | null, actor: Actor) {
        const trx = currentTrx();
        const [row] = await trx
            .from("fraud_cases")
            .where("id", caseId)
            .update({ assignee_user_id: assigneeUserId, status: "investigating" })
            .returning("*");
        if (!row) {
            throw new Exception("Fraud case not found", { status: 404, code: "E_TRUST_CASE" });
        }
        await trx.table("fraud_case_events").insert({
            tenant_id: tenantId(),
            case_id: caseId,
            event_type: "case.assigned",
            actor_user_id: actor.id ?? null,
            metadata: { assignee_user_id: assigneeUserId },
        });
        return { data: row };
    }

    async updateCaseStatus(caseId: number, payload: any, actor: Actor) {
        const trx = currentTrx();
        const patch: any = { status: payload.status, resolution: payload.resolution ?? null };
        if (["resolved", "closed"].includes(payload.status)) patch.closed_at = new Date();
        const [row] = await trx.from("fraud_cases").where("id", caseId).update(patch).returning("*");
        if (!row) {
            throw new Exception("Fraud case not found", { status: 404, code: "E_TRUST_CASE" });
        }
        await trx.table("fraud_case_events").insert({
            tenant_id: tenantId(),
            case_id: caseId,
            event_type: `case.${payload.status}`,
            actor_user_id: actor.id ?? null,
            note: payload.resolution ?? null,
        });
        return { data: row };
    }

    async addCaseNote(caseId: number, note: string, actor: Actor) {
        const trx = currentTrx();
        if (!(await trx.from("fraud_cases").where("id", caseId).first())) {
            throw new Exception("Fraud case not found", { status: 404, code: "E_TRUST_CASE" });
        }
        const [row] = await trx
            .table("fraud_case_events")
            .insert({
                tenant_id: tenantId(),
                case_id: caseId,
                event_type: "case.note",
                actor_user_id: actor.id ?? null,
                note,
            })
            .returning("*");
        return { data: row };
    }

    async createControl(payload: any, actor: Actor, idempotencyKey: string | null) {
        const trx = currentTrx();
        if (idempotencyKey) {
            const replay = await trx
                .from("fraud_subject_controls")
                .where("idempotency_key", idempotencyKey)
                .first();
            if (replay) return { data: replay, replayed: true };
        }
        const [row] = await trx
            .table("fraud_subject_controls")
            .insert({
                tenant_id: tenantId(),
                subject_type: payload.subject_type,
                subject_id: payload.subject_id,
                control: payload.control,
                reason: payload.reason,
                expires_at: payload.expires_at ?? null,
                created_by_user_id: actor.id ?? null,
                idempotency_key: idempotencyKey,
            })
            .returning("*");
        return { data: row, replayed: false };
    }

    async releaseControl(controlId: number, actor: Actor, idempotencyKey: string | null) {
        const trx = currentTrx();
        if (idempotencyKey) {
            const replay = await trx
                .from("fraud_action_executions")
                .where("idempotency_key", idempotencyKey)
                .first();
            if (replay) return { data: replay, replayed: true };
        }
        const [control] = await trx
            .from("fraud_subject_controls")
            .where("id", controlId)
            .update({ status: "released" })
            .returning("*");
        if (!control) {
            throw new Exception("Subject control not found", {
                status: 404,
                code: "E_TRUST_CONTROL",
            });
        }
        const [action] = await trx
            .table("fraud_action_executions")
            .insert({
                tenant_id: tenantId(),
                action: "control.release",
                actor_user_id: actor.id ?? null,
                idempotency_key: idempotencyKey,
                metadata: { control_id: controlId },
            })
            .returning("*");
        return { data: action, replayed: false };
    }

    async health() {
        const result = await currentTrx().rawQuery(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('fraud_risk_scores','fraud_signals','fraud_cases','fraud_decisions','fraud_subject_controls')",
        );
        return {
            data: {
                status: result.rows.length === 5 ? "ready" : "degraded",
                tables: result.rows.map((row: any) => row.table_name),
                policy: "rule-v1",
            },
        };
    }
}

export const phase20TrustRiskService = new Phase20TrustRiskService();
