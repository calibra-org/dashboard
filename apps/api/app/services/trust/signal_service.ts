import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { identityHash } from "#services/identity/security";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { clampBasisPoints, recommendedActionForBand, riskBandForScore, safeEntityId } from "#services/trust/contracts";

interface TrustSignalInput {
    eventId?: string | null;
    schemaVersion?: number;
    eventType: string;
    source: string;
    sourceRef?: string | null;
    correlationId?: string | null;
    causationId?: string | null;
    sessionId?: string | null;
    consentContext?: Record<string, unknown>;
    subjectType: string;
    subjectId: string | number | bigint;
    signalType: string;
    scoreDelta: number;
    confidenceBp?: number;
    privacyClassification?: string;
    ruleKey?: string | null;
    ruleVersion?: number | null;
    modelId?: string | null;
    modelVersion?: string | null;
    evidence?: Record<string, unknown>;
    occurredAt?: DateTime;
}

export async function recordTrustSignal(input: TrustSignalInput) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    if (input.eventId) {
        const existing = await trx.from("fraud_signals").where("tenant_id", tenantId).where("event_id", input.eventId).first();
        if (existing) return existing;
    }
    const score = Math.max(0, Math.min(100, Math.round(input.scoreDelta)));
    const rows = await trx
        .table("fraud_signals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            event_id: input.eventId ?? null,
            schema_version: input.schemaVersion ?? 1,
            event_type: input.eventType,
            source: input.source,
            source_ref: input.sourceRef ?? null,
            correlation_id: input.correlationId ?? null,
            causation_id: input.causationId ?? null,
            session_ref: input.sessionId ?? null,
            consent_context: JSON.stringify(input.consentContext ?? {}),
            subject_type: input.subjectType,
            subject_id: safeEntityId(input.subjectId),
            code: input.signalType,
            signal_type: input.signalType,
            risk_band: riskBandForScore(score),
            score_delta: score,
            confidence_bp: clampBasisPoints(input.confidenceBp ?? 7500),
            severity: score >= 90 ? "critical" : score >= 75 ? "high" : score >= 30 ? "medium" : "low",
            value: Math.max(0.1, Math.min(4, score / 25)),
            dedupe_key: input.eventId?.slice(0, 180) ?? null,
            privacy_classification: input.privacyClassification ?? "internal",
            rule_key: input.ruleKey ?? null,
            rule_version: input.ruleVersion ?? null,
            model_id: input.modelId ?? null,
            model_version: input.modelVersion ?? null,
            evidence: JSON.stringify(input.evidence ?? {}),
            observed_at: (input.occurredAt ?? DateTime.utc()).toSQL(),
            occurred_at: (input.occurredAt ?? DateTime.utc()).toSQL(),
            received_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    const signal = rows[0];
    await maybeOpenCaseForSignal(signal);
    return signal;
}

export async function upsertTrustEdge(input: {
    sourceType: string;
    sourceId: string | number | bigint;
    targetType: string;
    targetId: string | number | bigint;
    relationship: string;
    isInferred?: boolean;
    confidenceBp?: number;
    provenanceType: string;
    provenanceRef?: string | null;
    evidence?: Record<string, unknown>;
}) {
    const now = DateTime.utc().toSQL();
    const tenantId = Number(currentTenantId());
    const row = {
        public_id: randomUUID(),
        tenant_id: tenantId,
        source_type: input.sourceType,
        source_id: safeEntityId(input.sourceId),
        target_type: input.targetType,
        target_id: safeEntityId(input.targetId),
        relationship: input.relationship,
        is_inferred: input.isInferred ?? false,
        confidence_bp: clampBasisPoints(input.confidenceBp ?? (input.isInferred ? 7000 : 10000)),
        provenance_type: input.provenanceType,
        provenance_ref: input.provenanceRef ?? null,
        evidence: JSON.stringify(input.evidence ?? {}),
        valid_from: now,
        last_observed_at: now,
        created_at: now,
        updated_at: now,
    };
    await currentTrx()
        .table("fraud_relationship_edges")
        .insert(row)
        .onConflict(["tenant_id", "source_type", "source_id", "target_type", "target_id", "relationship"])
        .merge([
            "is_inferred",
            "confidence_bp",
            "provenance_type",
            "provenance_ref",
            "evidence",
            "last_observed_at",
            "updated_at",
        ]);
}

async function maybeOpenCaseForSignal(signal: Record<string, unknown>) {
    const score = Number(signal.score_delta ?? 0);
    if (score < 55) return;
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const subjectType = String(signal.subject_type);
    const subjectId = String(signal.subject_id);
    const pattern = String(signal.signal_type);
    const existing = await trx
        .from("fraud_cases")
        .where("tenant_id", tenantId)
        .where("subject_type", subjectType)
        .where("subject_id", subjectId)
        .where("pattern", pattern)
        .whereIn("status", ["open", "in_review", "waiting_step_up", "held", "appealed"])
        .first();
    if (existing) {
        if (score > Number(existing.risk_score)) {
            const band = riskBandForScore(score);
            await trx
                .from("fraud_cases")
                .where("id", existing.id)
                .update({
                    risk_score: score,
                    risk_band: band,
                    recommended_action: recommendedActionForBand(band),
                    confidence_bp: Number(signal.confidence_bp ?? existing.confidence_bp),
                    version: Number(existing.version) + 1,
                    updated_at: DateTime.utc().toSQL(),
                });
        }
        const linked = await trx
            .from("fraud_case_evidence")
            .where("case_id", existing.id)
            .where("signal_id", Number(signal.id))
            .first();
        if (!linked) {
            await trx.table("fraud_case_evidence").insert({
                tenant_id: tenantId,
                case_id: existing.id,
                signal_id: signal.id,
                evidence_type: "signal",
                evidence_ref: signal.public_id,
                weight: score,
                summary: `Signal ${String(signal.signal_type)} from ${String(signal.source)}`,
                is_sensitive: String(signal.privacy_classification).includes("sensitive"),
            });
        }
        return;
    }
    const band = riskBandForScore(score);
    const now = DateTime.utc();
    const caseRows = await trx
        .table("fraud_cases")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            case_number: `FR-${now.toFormat("yyyy")}-${randomUUID().slice(0, 8).toUpperCase()}`,
            subject_type: subjectType,
            subject_id: subjectId,
            order_id: subjectType === "order" ? Number(subjectId) || null : null,
            pattern,
            title: humanCaseTitle(pattern),
            summary: `Trust signal ${pattern} requires review`,
            priority: band === "severe" ? "critical" : band === "high" ? "high" : "medium",
            risk_score: score,
            risk_band: band,
            confidence_bp: Number(signal.confidence_bp ?? 7500),
            status: "open",
            recommended_action: recommendedActionForBand(band),
            policy_key: signal.rule_key ?? null,
            policy_version: signal.rule_version ?? null,
            model_id: signal.model_id ?? null,
            model_version: signal.model_version ?? null,
            sla_due_at: now.plus({ hours: band === "severe" ? 1 : band === "high" ? 4 : 12 }).toSQL(),
            opened_at: now.toSQL(),
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning("*");
    await trx.table("fraud_case_evidence").insert({
        tenant_id: tenantId,
        case_id: caseRows[0].id,
        signal_id: signal.id,
        evidence_type: "signal",
        evidence_ref: signal.public_id,
        weight: score,
        summary: `Signal ${String(signal.signal_type)} from ${String(signal.source)}`,
        is_sensitive: String(signal.privacy_classification).includes("sensitive"),
    });
}

function humanCaseTitle(pattern: string) {
    const titles: Record<string, string> = {
        identity_velocity: "ناهنجاری در هویت یا سرعت تلاش‌ها",
        promotion_abuse: "الگوی مشکوک استفاده از تخفیف",
        refund_abuse: "الگوی مشکوک بازپرداخت",
        return_abuse: "الگوی مشکوک مرجوعی",
        order_risk: "ریسک عملیاتی سفارش",
    };
    return titles[pattern] ?? "پروندهٔ نیازمند بررسی اعتماد";
}

export async function scanCanonicalTrustSources() {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc();
    const since24h = now.minus({ hours: 24 }).toSQL();
    const since48h = now.minus({ hours: 48 }).toSQL();
    const since30d = now.minus({ days: 30 }).toSQL();
    const presentRows = await trx
        .from("information_schema.tables")
        .where("table_schema", "public")
        .whereIn("table_name", ["identity_risk_events", "coupon_redemptions", "order_refunds", "orders", "order_returns"])
        .select("table_name");
    const present = new Set(presentRows.map((row) => String(row.table_name)));
    const sourceStatus: Record<string, string> = {};
    let normalized = 0;

    if (present.has("identity_risk_events")) {
        sourceStatus.identity = "ready";
        const identityEvents = await trx
            .from("identity_risk_events")
            .where("tenant_id", tenantId)
            .where("created_at", ">=", since24h)
            .where("score", ">=", 55)
            .orderBy("created_at", "desc")
            .limit(500);
        for (const event of identityEvents) {
            await recordTrustSignal({
                eventId: `identity-risk:${event.id}`,
                eventType: `identity.risk.${String(event.event_type)}`,
                source: "identity",
                sourceRef: String(event.id),
                subjectType: event.user_id ? "customer_account" : "identity_subject",
                subjectId: event.user_id ?? event.subject_hash ?? `risk-${event.id}`,
                signalType: "identity_velocity",
                scoreDelta: Number(event.score),
                confidenceBp: 9000,
                privacyClassification: "auth_security_sensitive",
                ruleKey: "identity_risk_bridge",
                ruleVersion: 1,
                causationId: event.verification_id ? `identity-verification:${event.verification_id}` : null,
                evidence: { decision: event.decision, reasons: event.reasons, verification_id: event.verification_id ?? null },
                occurredAt: DateTime.fromJSDate(new Date(event.created_at)),
            });
            normalized += 1;
        }
    } else sourceStatus.identity = "unavailable";

    if (present.has("coupon_redemptions")) {
        sourceStatus.coupons = "ready";
        const couponRows = await trx
            .from("coupon_redemptions")
            .where("redeemed_at", ">=", since48h)
            .select("coupon_id", "customer_id", "email_snapshot")
            .count("id as redemption_count")
            .groupBy("coupon_id", "customer_id", "email_snapshot")
            .havingRaw("COUNT(id) >= 4")
            .limit(250);
        for (const row of couponRows) {
            const subjectId = row.customer_id
                ? String(row.customer_id)
                : identityHash(`coupon-email:${String(row.email_snapshot ?? "").toLowerCase()}`);
            const count = Number(row.redemption_count ?? 0);
            const score = count >= 6 ? 88 : 68;
            const eventId = `coupon-velocity:${row.coupon_id}:${subjectId}:${now.toFormat("yyyyLLddHH")}`;
            await recordTrustSignal({
                eventId,
                eventType: "commerce.coupon.velocity_anomaly",
                source: "coupons",
                sourceRef: String(row.coupon_id),
                subjectType: row.customer_id ? "customer" : "guest_identity",
                subjectId,
                signalType: "promotion_abuse",
                scoreDelta: score,
                confidenceBp: 8200,
                privacyClassification: "customer_personal",
                ruleKey: "promotion_velocity",
                ruleVersion: 1,
                evidence: { coupon_id: Number(row.coupon_id), redemptions_48h: count },
            });
            await upsertTrustEdge({
                sourceType: row.customer_id ? "customer" : "guest_identity",
                sourceId: subjectId,
                targetType: "coupon",
                targetId: row.coupon_id,
                relationship: "REDEEMED_COUPON",
                provenanceType: "coupon_redemption",
                provenanceRef: eventId,
                evidence: { redemptions_48h: count },
            });
            normalized += 1;
        }
    } else sourceStatus.coupons = "unavailable";

    if (present.has("order_refunds") && present.has("orders")) {
        sourceStatus.refunds = "ready";
        const refundRows = await trx
            .from("order_refunds as refund")
            .innerJoin("orders as orders", "orders.id", "refund.order_id")
            .where("refund.processed_at", ">=", since30d)
            .whereNotNull("orders.customer_id")
            .select("orders.customer_id")
            .count("refund.id as refund_count")
            .sum("refund.amount_minor as refund_amount_minor")
            .groupBy("orders.customer_id")
            .havingRaw("COUNT(refund.id) >= 3")
            .limit(250);
        for (const row of refundRows) {
            const count = Number(row.refund_count ?? 0);
            await recordTrustSignal({
                eventId: `refund-velocity:${row.customer_id}:${now.toFormat("yyyyLLdd")}`,
                eventType: "commerce.refund.velocity_anomaly",
                source: "refunds",
                subjectType: "customer",
                subjectId: row.customer_id,
                signalType: "refund_abuse",
                scoreDelta: count >= 5 ? 86 : 66,
                confidenceBp: 7800,
                privacyClassification: "financial_sensitive",
                ruleKey: "refund_velocity",
                ruleVersion: 1,
                evidence: { refunds_30d: count, amount_minor_30d: Number(row.refund_amount_minor ?? 0) },
            });
            normalized += 1;
        }
    } else sourceStatus.refunds = "unavailable";

    if (present.has("order_returns") && present.has("orders")) {
        sourceStatus.returns = "ready";
        const returnRows = await trx
            .from("order_returns as returns")
            .innerJoin("orders as orders", "orders.id", "returns.order_id")
            .where("returns.created_at", ">=", since30d)
            .whereNotNull("orders.customer_id")
            .select("orders.customer_id")
            .count("returns.id as return_count")
            .groupBy("orders.customer_id")
            .havingRaw("COUNT(returns.id) >= 3")
            .limit(250);
        for (const row of returnRows) {
            const count = Number(row.return_count ?? 0);
            await recordTrustSignal({
                eventId: `return-velocity:${row.customer_id}:${now.toFormat("yyyyLLdd")}`,
                eventType: "commerce.return.velocity_anomaly",
                source: "returns",
                subjectType: "customer",
                subjectId: row.customer_id,
                signalType: "return_abuse",
                scoreDelta: count >= 5 ? 82 : 64,
                confidenceBp: 7600,
                privacyClassification: "financial_sensitive",
                ruleKey: "return_velocity",
                ruleVersion: 1,
                evidence: { returns_30d: count },
            });
            normalized += 1;
        }
    } else sourceStatus.returns = "unavailable";

    sourceStatus.automation = "not_configured";
    return {
        normalized,
        scanned_at: now.toISO(),
        sources: sourceStatus,
        automation_classifications: ["approved_agent", "unknown_automation", "abusive_bot"],
    };
}
