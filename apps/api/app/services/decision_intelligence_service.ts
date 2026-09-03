import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const RANKING_POLICY_VERSION = "phase10.v1.available-components";

export type IntelligenceDecision = "accept" | "reject" | "defer" | "watch";
export type IntelligenceSeverity = "low" | "medium" | "high" | "critical";

interface EvidenceInput {
    evidenceType: string;
    sourceDomain: string;
    sourceKind: string;
    sourceId?: string | null;
    sourceRoute?: string | null;
    labelFa: string;
    labelEn: string;
    metricName?: string | null;
    payload: Record<string, unknown>;
    freshnessAt: string;
}

interface NormalizedSignal {
    stableKey: string;
    kind: "risk" | "opportunity" | "recommendation";
    domain: "payments" | "fulfillment" | "support" | "inventory" | "seo";
    severity: IntelligenceSeverity;
    titleFa: string;
    titleEn: string;
    summaryFa: string;
    summaryEn: string;
    recommendedActionFa: string;
    recommendedActionEn: string;
    actionRoute: string;
    urgency: number;
    signalSnapshot: Record<string, unknown>;
    observationSnapshot: Record<string, unknown>;
    anomalySnapshot: Record<string, unknown>;
    freshnessAt: string;
    evidence: EvidenceInput[];
}

interface ScoreComponent {
    available: boolean;
    raw: number | null;
    baseWeight: number;
    effectiveWeight: number;
    contribution: number;
}

const BASE_WEIGHTS = {
    expectedValue: 0.24,
    confidence: 0.18,
    urgency: 0.2,
    reversibility: 0.08,
    strategicAlignment: 0.1,
    capitalEfficiency: 0.07,
    timeToValue: 0.08,
    customerHarmPenalty: 0.05,
} as const;

const POSITIVE_COMPONENTS = [
    "expectedValue",
    "confidence",
    "urgency",
    "reversibility",
    "strategicAlignment",
    "capitalEfficiency",
    "timeToValue",
] as const;

type PositiveComponent = (typeof POSITIVE_COMPONENTS)[number];

export function scoreAvailableComponents(input: {
    expectedValue?: number | null;
    confidence?: number | null;
    urgency?: number | null;
    reversibility?: number | null;
    strategicAlignment?: number | null;
    capitalEfficiency?: number | null;
    timeToValue?: number | null;
    customerHarmPenalty?: number | null;
}) {
    const values: Record<PositiveComponent, number | null> = {
        expectedValue: input.expectedValue ?? null,
        confidence: input.confidence ?? null,
        urgency: input.urgency ?? null,
        reversibility: input.reversibility ?? null,
        strategicAlignment: input.strategicAlignment ?? null,
        capitalEfficiency: input.capitalEfficiency ?? null,
        timeToValue: input.timeToValue ?? null,
    };
    const availableWeight = POSITIVE_COMPONENTS.reduce((sum, key) => sum + (values[key] === null ? 0 : BASE_WEIGHTS[key]), 0);
    const components: Record<string, ScoreComponent> = {};
    let positiveScore = 0;
    for (const key of POSITIVE_COMPONENTS) {
        const raw = values[key];
        const effectiveWeight = raw === null || availableWeight === 0 ? 0 : BASE_WEIGHTS[key] / availableWeight;
        const contribution = raw === null ? 0 : raw * effectiveWeight;
        positiveScore += contribution;
        components[key] = { available: raw !== null, raw, baseWeight: BASE_WEIGHTS[key], effectiveWeight, contribution };
    }

    const penaltyRaw = input.customerHarmPenalty ?? null;
    const penaltyContribution = penaltyRaw === null ? 0 : penaltyRaw * BASE_WEIGHTS.customerHarmPenalty;
    components.customerHarmPenalty = {
        available: penaltyRaw !== null,
        raw: penaltyRaw,
        baseWeight: BASE_WEIGHTS.customerHarmPenalty,
        effectiveWeight: penaltyRaw === null ? 0 : BASE_WEIGHTS.customerHarmPenalty,
        contribution: -penaltyContribution,
    };

    const score = Math.max(0, Math.min(100, (positiveScore - penaltyContribution) * 100));
    const missing = Object.entries(components)
        .filter(([, value]) => !value.available)
        .map(([key]) => key);
    const calibrated =
        input.expectedValue !== null &&
        input.expectedValue !== undefined &&
        input.confidence !== null &&
        input.confidence !== undefined;
    return {
        score: Number(score.toFixed(4)),
        mode: calibrated ? ("calibrated" as const) : ("provisional" as const),
        components,
        missing,
    };
}

function severityUrgency(severity: IntelligenceSeverity): number {
    return { low: 0.35, medium: 0.55, high: 0.78, critical: 1 }[severity];
}

function numberFrom(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function sqlNow(): string {
    return DateTime.utc().toSQL()!;
}

async function paymentSignals(now: string): Promise<NormalizedSignal[]> {
    const trx = currentTrx();
    const row = await trx
        .from("payment_attempts")
        .whereIn("reconciliation_status", ["mismatch", "error"])
        .select(
            trx.raw("COUNT(*)::int AS count"),
            trx.raw("COUNT(*) FILTER (WHERE reconciliation_status = 'error')::int AS error_count"),
            trx.raw("COALESCE(SUM(amount_minor), 0)::bigint AS amount_minor"),
        )
        .first();
    const count = numberFrom(row?.count);
    if (count === 0) return [];
    const errorCount = numberFrom(row?.error_count);
    const severity: IntelligenceSeverity = errorCount > 0 ? "high" : "medium";
    return [
        {
            stableKey: "payments:reconciliation_attention",
            kind: "risk",
            domain: "payments",
            severity,
            titleFa: "مغایرت در تطبیق پرداخت‌ها",
            titleEn: "Payment reconciliation exceptions",
            summaryFa: `${count} تلاش پرداخت در وضعیت mismatch یا error قرار دارد. مبلغ نمایش‌داده‌شده صرفاً مجموع تراکنش‌های درگیر است و به‌معنای زیان قطعی نیست.`,
            summaryEn: `${count} payment attempts are in mismatch or error reconciliation state. The shown amount is exposure only, not confirmed loss.`,
            recommendedActionFa: "تراکنش‌های درگیر را در مرکز تراکنش‌ها بررسی و با شواهد درگاه تطبیق دهید.",
            recommendedActionEn: "Review the affected attempts in Transactions and reconcile them against gateway evidence.",
            actionRoute: "/transactions",
            urgency: severityUrgency(severity),
            signalSnapshot: { count, errorCount, amountMinor: String(row?.amount_minor ?? 0) },
            observationSnapshot: { reconciliationStatuses: ["mismatch", "error"] },
            anomalySnapshot: { affectedAttempts: count },
            freshnessAt: now,
            evidence: [
                {
                    evidenceType: "aggregate",
                    sourceDomain: "payments",
                    sourceKind: "payment_attempts",
                    sourceRoute: "/transactions",
                    labelFa: "تلاش‌های پرداخت نیازمند تطبیق",
                    labelEn: "Payment attempts requiring reconciliation",
                    metricName: "reconciliation_attention_count",
                    payload: { count, errorCount, amountMinor: String(row?.amount_minor ?? 0) },
                    freshnessAt: now,
                },
            ],
        },
    ];
}

async function fulfillmentSignals(now: string): Promise<NormalizedSignal[]> {
    const trx = currentTrx();
    const row = await trx
        .from("order_shipments")
        .whereIn("status", ["exception", "returned"])
        .select(
            trx.raw("COUNT(*)::int AS count"),
            trx.raw("COUNT(*) FILTER (WHERE status = 'exception')::int AS exception_count"),
        )
        .first();
    const count = numberFrom(row?.count);
    if (count === 0) return [];
    const exceptionCount = numberFrom(row?.exception_count);
    const severity: IntelligenceSeverity = exceptionCount > 0 ? "high" : "medium";
    return [
        {
            stableKey: "fulfillment:shipment_exceptions",
            kind: "risk",
            domain: "fulfillment",
            severity,
            titleFa: "استثنا در ارسال سفارش‌ها",
            titleEn: "Shipment exceptions require review",
            summaryFa: `${count} مرسوله در وضعیت exception یا returned قرار دارد. این سیگنال فقط وضعیت عملیاتی ثبت‌شده را گزارش می‌کند.`,
            summaryEn: `${count} shipments are in exception or returned state. This signal reports the recorded operational state only.`,
            recommendedActionFa: "مرسوله‌ها و سفارش‌های مرتبط را بررسی کنید و وضعیت واقعی تحویل یا بازگشت را ثبت کنید.",
            recommendedActionEn: "Review the related shipments and orders, then record their actual delivery or return state.",
            actionRoute: "/orders",
            urgency: severityUrgency(severity),
            signalSnapshot: { count, exceptionCount },
            observationSnapshot: { shipmentStatuses: ["exception", "returned"] },
            anomalySnapshot: { affectedShipments: count },
            freshnessAt: now,
            evidence: [
                {
                    evidenceType: "aggregate",
                    sourceDomain: "fulfillment",
                    sourceKind: "order_shipments",
                    sourceRoute: "/orders",
                    labelFa: "مرسوله‌های استثنا یا بازگشتی",
                    labelEn: "Exception or returned shipments",
                    metricName: "shipment_exception_count",
                    payload: { count, exceptionCount },
                    freshnessAt: now,
                },
            ],
        },
    ];
}

async function supportSignals(now: string): Promise<NormalizedSignal[]> {
    const trx = currentTrx();
    const firstResponse = await trx
        .from("support_tickets")
        .whereNull("first_response_at")
        .whereNotNull("first_response_due_at")
        .where("first_response_due_at", "<", sqlNow())
        .whereNotIn("status", ["resolved", "closed"])
        .count("id as count")
        .first();
    const resolution = await trx
        .from("support_tickets")
        .whereNull("resolved_at")
        .whereNull("closed_at")
        .whereNotNull("resolution_due_at")
        .where("resolution_due_at", "<", sqlNow())
        .whereNotIn("status", ["resolved", "closed"])
        .count("id as count")
        .first();
    const firstResponseCount = numberFrom(firstResponse?.count);
    const resolutionCount = numberFrom(resolution?.count);
    const count = firstResponseCount + resolutionCount;
    if (count === 0) return [];
    const severity: IntelligenceSeverity = "high";
    return [
        {
            stableKey: "support:sla_breach",
            kind: "risk",
            domain: "support",
            severity,
            titleFa: "عبور تیکت‌ها از SLA",
            titleEn: "Support SLA breaches",
            summaryFa: `${firstResponseCount} تیکت از SLA پاسخ اول و ${resolutionCount} تیکت از SLA حل عبور کرده‌اند. شمارش بر اساس due_at واقعی هر تیکت انجام شده است.`,
            summaryEn: `${firstResponseCount} tickets breached first-response SLA and ${resolutionCount} breached resolution SLA, based on each ticket's stored due time.`,
            recommendedActionFa: "صف تیکت‌های عقب‌افتاده را بر اساس فوریت و زمان سررسید بازبینی و مالک مشخص کنید.",
            recommendedActionEn: "Review overdue tickets by urgency and due time and assign clear ownership.",
            actionRoute: "/tickets/inbox",
            urgency: severityUrgency(severity),
            signalSnapshot: { firstResponseCount, resolutionCount },
            observationSnapshot: { source: "support_tickets due_at timestamps" },
            anomalySnapshot: { breachedSlaCount: count },
            freshnessAt: now,
            evidence: [
                {
                    evidenceType: "aggregate",
                    sourceDomain: "support",
                    sourceKind: "support_tickets",
                    sourceRoute: "/tickets/inbox",
                    labelFa: "تیکت‌های عبورکرده از SLA",
                    labelEn: "Tickets beyond SLA",
                    metricName: "sla_breach_count",
                    payload: { firstResponseCount, resolutionCount },
                    freshnessAt: now,
                },
            ],
        },
    ];
}

async function inventorySignals(now: string): Promise<NormalizedSignal[]> {
    const trx = currentTrx();
    const row = await trx
        .from("inventory_items")
        .where("manage_stock", true)
        .where((query) => {
            query.where("stock_status", "outofstock").orWhere((nested) => {
                nested.whereNotNull("low_stock_threshold").whereRaw("stock_quantity <= low_stock_threshold");
            });
        })
        .select(
            trx.raw("COUNT(*)::int AS count"),
            trx.raw("COUNT(*) FILTER (WHERE stock_status = 'outofstock')::int AS out_of_stock_count"),
        )
        .first();
    const count = numberFrom(row?.count);
    if (count === 0) return [];
    const outOfStockCount = numberFrom(row?.out_of_stock_count);
    const severity: IntelligenceSeverity = outOfStockCount > 0 ? "high" : "medium";
    return [
        {
            stableKey: "inventory:stock_attention",
            kind: "risk",
            domain: "inventory",
            severity,
            titleFa: "موجودی نیازمند اقدام",
            titleEn: "Inventory requires attention",
            summaryFa: `${count} ردیف موجودی مدیریت‌شده به آستانه کمبود رسیده یا ناموجود است؛ ${outOfStockCount} ردیف صراحتاً outofstock است.`,
            summaryEn: `${count} managed inventory rows are at/below their configured low-stock threshold or out of stock; ${outOfStockCount} are explicitly outofstock.`,
            recommendedActionFa: "موجودی‌های درگیر را در گزارش انبار بازبینی و تصمیم تأمین را خارج از این فاز انجام دهید.",
            recommendedActionEn:
                "Review affected inventory in the stock report; procurement execution remains outside this phase.",
            actionRoute: "/analytics/stock",
            urgency: severityUrgency(severity),
            signalSnapshot: { count, outOfStockCount },
            observationSnapshot: { rule: "manage_stock AND (outofstock OR stock_quantity <= low_stock_threshold)" },
            anomalySnapshot: { affectedInventoryRows: count },
            freshnessAt: now,
            evidence: [
                {
                    evidenceType: "aggregate",
                    sourceDomain: "inventory",
                    sourceKind: "inventory_items",
                    sourceRoute: "/analytics/stock",
                    labelFa: "ردیف‌های موجودی کم یا ناموجود",
                    labelEn: "Low or out-of-stock inventory rows",
                    metricName: "stock_attention_count",
                    payload: { count, outOfStockCount },
                    freshnessAt: now,
                },
            ],
        },
    ];
}

async function seoSignals(now: string): Promise<NormalizedSignal[]> {
    const trx = currentTrx();
    const latest = await trx
        .from("seo_crawl_runs")
        .select("id", "status", "failed_count", "completed_count", "finished_at", "updated_at")
        .orderBy("id", "desc")
        .first();
    if (!latest) return [];
    const failedCount = numberFrom(latest.failed_count);
    const problematicStatus = latest.status === "failed" || latest.status === "partial";
    if (!problematicStatus && failedCount === 0) return [];
    const severity: IntelligenceSeverity = latest.status === "failed" ? "high" : "medium";
    const freshnessAt = String(latest.finished_at ?? latest.updated_at ?? now);
    return [
        {
            stableKey: "seo:latest_crawl_health",
            kind: "risk",
            domain: "seo",
            severity,
            titleFa: "خزش سئو با خطا یا اجرای ناقص",
            titleEn: "SEO crawl has failures or partial execution",
            summaryFa: `آخرین اجرای خزش با وضعیت ${latest.status} ثبت شده و ${failedCount} درخواست ناموفق دارد.`,
            summaryEn: `The latest SEO crawl is ${latest.status} with ${failedCount} failed requests.`,
            recommendedActionFa: "جزئیات اجرای خزش و observationهای ناموفق را در مانیتورینگ خزش بررسی کنید.",
            recommendedActionEn: "Inspect the crawl run and failed observations in Crawl Monitoring.",
            actionRoute: "/seo/crawl-monitoring",
            urgency: severityUrgency(severity),
            signalSnapshot: {
                runId: String(latest.id),
                status: latest.status,
                failedCount,
                completedCount: numberFrom(latest.completed_count),
            },
            observationSnapshot: { source: "latest seo_crawl_runs row" },
            anomalySnapshot: { failedCount, partial: latest.status === "partial" },
            freshnessAt,
            evidence: [
                {
                    evidenceType: "crawl_run",
                    sourceDomain: "seo",
                    sourceKind: "seo_crawl_runs",
                    sourceId: String(latest.id),
                    sourceRoute: "/seo/crawl-monitoring",
                    labelFa: "آخرین اجرای خزش",
                    labelEn: "Latest crawl run",
                    metricName: "crawl_failed_count",
                    payload: { status: latest.status, failedCount, completedCount: numberFrom(latest.completed_count) },
                    freshnessAt,
                },
            ],
        },
    ];
}

async function detectSignals(): Promise<NormalizedSignal[]> {
    const now = DateTime.utc().toISO();
    const payments = await paymentSignals(now);
    const fulfillment = await fulfillmentSignals(now);
    const support = await supportSignals(now);
    const inventory = await inventorySignals(now);
    const seo = await seoSignals(now);
    return [...payments, ...fulfillment, ...support, ...inventory, ...seo];
}

function materialFingerprint(signal: NormalizedSignal, scored: ReturnType<typeof scoreAvailableComponents>): string {
    return JSON.stringify({
        kind: signal.kind,
        domain: signal.domain,
        severity: signal.severity,
        titleFa: signal.titleFa,
        titleEn: signal.titleEn,
        summaryFa: signal.summaryFa,
        summaryEn: signal.summaryEn,
        actionRoute: signal.actionRoute,
        signalSnapshot: signal.signalSnapshot,
        observationSnapshot: signal.observationSnapshot,
        anomalySnapshot: signal.anomalySnapshot,
        score: scored.score,
        components: scored.components,
        missing: scored.missing,
    });
}

export async function refreshDecisionIntelligence(): Promise<void> {
    const trx = currentTrx();
    const tenantId = currentTenantId();
    await trx.rawQuery("SELECT pg_advisory_xact_lock(1764, hashtext(?))", [`decision-intelligence:${tenantId.toString()}`]);
    const signals = await detectSignals();
    const activeKeys = signals.map((signal) => signal.stableKey);

    for (const signal of signals) {
        const scored = scoreAvailableComponents({ urgency: signal.urgency });
        const existing = await trx
            .from("intelligence_cases")
            .where("tenant_id", tenantId.toString())
            .where("stable_key", signal.stableKey)
            .first();
        const fingerprint = materialFingerprint(signal, scored);
        const existingFingerprint = existing?.signal_snapshot?.materialFingerprint;
        const materialChanged = !existing || existingFingerprint !== fingerprint || existing.signal_state !== "open";
        const payload = {
            tenant_id: tenantId.toString(),
            stable_key: signal.stableKey,
            kind: signal.kind,
            domain: signal.domain,
            lifecycle_stage: existing?.lifecycle_stage ?? "proposed",
            signal_state: "open",
            severity: signal.severity,
            title_fa: signal.titleFa,
            title_en: signal.titleEn,
            summary_fa: signal.summaryFa,
            summary_en: signal.summaryEn,
            recommended_action_fa: signal.recommendedActionFa,
            recommended_action_en: signal.recommendedActionEn,
            action_route: signal.actionRoute,
            signal_snapshot: { ...signal.signalSnapshot, materialFingerprint: fingerprint },
            observation_snapshot: signal.observationSnapshot,
            anomaly_snapshot: signal.anomalySnapshot,
            expected_value_minor: null,
            expected_value_currency: null,
            confidence: null,
            confidence_source: null,
            urgency: signal.urgency,
            reversibility_weight: null,
            strategic_alignment: null,
            capital_efficiency: null,
            time_to_value_weight: null,
            customer_harm_penalty: null,
            priority_score: scored.score,
            score_mode: scored.mode,
            ranking_policy_version: RANKING_POLICY_VERSION,
            score_components: scored.components,
            missing_components: JSON.stringify(scored.missing),
            freshness_at: signal.freshnessAt,
            last_seen_at: sqlNow(),
            cleared_at: null,
            updated_at: sqlNow(),
        };

        let caseId: string;
        if (!existing) {
            const [created] = await trx
                .table("intelligence_cases")
                .insert({ ...payload, first_seen_at: sqlNow(), version: 1, created_at: sqlNow() })
                .returning("id");
            caseId = String(created.id);
        } else {
            caseId = String(existing.id);
            await trx
                .from("intelligence_cases")
                .where("id", existing.id)
                .update({
                    ...payload,
                    version: materialChanged ? numberFrom(existing.version) + 1 : numberFrom(existing.version),
                });
        }

        await trx.from("intelligence_evidence_links").where("case_id", caseId).delete();
        if (signal.evidence.length > 0) {
            await trx.table("intelligence_evidence_links").multiInsert(
                signal.evidence.map((evidence) => ({
                    tenant_id: tenantId.toString(),
                    case_id: caseId,
                    evidence_type: evidence.evidenceType,
                    source_domain: evidence.sourceDomain,
                    source_kind: evidence.sourceKind,
                    source_id: evidence.sourceId ?? null,
                    source_route: evidence.sourceRoute ?? null,
                    label_fa: evidence.labelFa,
                    label_en: evidence.labelEn,
                    metric_name: evidence.metricName ?? null,
                    payload: evidence.payload,
                    freshness_at: evidence.freshnessAt,
                    created_at: sqlNow(),
                })),
            );
        }
    }

    const staleQuery = trx.from("intelligence_cases").where("tenant_id", tenantId.toString()).where("signal_state", "open");
    if (activeKeys.length > 0) staleQuery.whereNotIn("stable_key", activeKeys);
    await staleQuery.update({ signal_state: "cleared", cleared_at: sqlNow(), updated_at: sqlNow() });
}

function serializeCase(row: Record<string, unknown>) {
    return {
        id: String(row.id),
        stableKey: row.stable_key,
        kind: row.kind,
        domain: row.domain,
        lifecycleStage: row.lifecycle_stage,
        signalState: row.signal_state,
        severity: row.severity,
        titleFa: row.title_fa,
        titleEn: row.title_en,
        summaryFa: row.summary_fa,
        summaryEn: row.summary_en,
        recommendedActionFa: row.recommended_action_fa,
        recommendedActionEn: row.recommended_action_en,
        actionRoute: row.action_route,
        expectedValueMinor: row.expected_value_minor === null ? null : String(row.expected_value_minor),
        expectedValueCurrency: row.expected_value_currency,
        confidence: row.confidence === null ? null : Number(row.confidence),
        confidenceSource: row.confidence_source,
        urgency: row.urgency === null ? null : Number(row.urgency),
        priorityScore: Number(row.priority_score),
        scoreMode: row.score_mode,
        rankingPolicyVersion: row.ranking_policy_version,
        scoreComponents: row.score_components ?? {},
        missingComponents: row.missing_components ?? [],
        freshnessAt: row.freshness_at,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        clearedAt: row.cleared_at,
        version: Number(row.version),
    };
}

export async function listIntelligenceCases(options: {
    page: number;
    limit: number;
    domain?: string;
    severity?: string;
    state?: string;
    q?: string;
}) {
    await refreshDecisionIntelligence();
    const trx = currentTrx();
    const tenantId = currentTenantId().toString();
    const query = trx.from("intelligence_cases").where("tenant_id", tenantId);
    if (options.domain) query.where("domain", options.domain);
    if (options.severity) query.where("severity", options.severity);
    if (options.state) query.where("signal_state", options.state);
    if (options.q) {
        query.where((nested) => {
            nested
                .whereILike("title_fa", `%${options.q}%`)
                .orWhereILike("title_en", `%${options.q}%`)
                .orWhereILike("summary_fa", `%${options.q}%`);
        });
    }
    const countQuery = query.clone().clearSelect().clearOrder().count("id as count").first();
    const rowsQuery = query
        .clone()
        .orderBy("signal_state", "asc")
        .orderBy("priority_score", "desc")
        .orderBy("last_seen_at", "desc")
        .limit(options.limit)
        .offset((options.page - 1) * options.limit);
    const countRow = await countQuery;
    const rows = await rowsQuery;
    const total = numberFrom(countRow?.count);
    return {
        data: rows.map(serializeCase),
        meta: { page: options.page, limit: options.limit, total, lastPage: Math.max(1, Math.ceil(total / options.limit)) },
    };
}

export async function intelligenceSummary() {
    await refreshDecisionIntelligence();
    const trx = currentTrx();
    const tenantId = currentTenantId().toString();
    const totals = await trx
        .from("intelligence_cases")
        .where("tenant_id", tenantId)
        .select(
            trx.raw("COUNT(*) FILTER (WHERE signal_state = 'open')::int AS open_count"),
            trx.raw(
                "COUNT(*) FILTER (WHERE signal_state = 'open' AND severity IN ('high','critical'))::int AS high_critical_count",
            ),
            trx.raw("COUNT(*) FILTER (WHERE signal_state = 'open' AND score_mode = 'provisional')::int AS provisional_count"),
            trx.raw("COUNT(*) FILTER (WHERE lifecycle_stage IN ('measured','learned'))::int AS measured_count"),
        )
        .first();
    const domains = await trx
        .from("intelligence_cases")
        .where("tenant_id", tenantId)
        .where("signal_state", "open")
        .groupBy("domain")
        .select("domain")
        .count("id as count")
        .orderBy("domain", "asc");
    return {
        openCount: numberFrom(totals?.open_count),
        highCriticalCount: numberFrom(totals?.high_critical_count),
        provisionalCount: numberFrom(totals?.provisional_count),
        measuredCount: numberFrom(totals?.measured_count),
        byDomain: domains.map((row) => ({ domain: row.domain, count: numberFrom(row.count) })),
        sourceCoverage: [
            { source: "payments", status: "active" },
            { source: "fulfillment", status: "active" },
            { source: "support", status: "active" },
            { source: "inventory", status: "active" },
            { source: "seo", status: "active" },
            { source: "phase8", status: "dependency_not_landed" },
            { source: "phase9", status: "dependency_not_landed" },
        ],
        rankingPolicyVersion: RANKING_POLICY_VERSION,
    };
}

export async function intelligenceCaseDetail(id: string) {
    await refreshDecisionIntelligence();
    const trx = currentTrx();
    const tenantId = currentTenantId().toString();
    const row = await trx.from("intelligence_cases").where({ id, tenant_id: tenantId }).first();
    if (!row) return null;
    const evidence = await trx
        .from("intelligence_evidence_links")
        .where({ case_id: id, tenant_id: tenantId })
        .orderBy("freshness_at", "desc");
    const decisions = await trx
        .from("intelligence_decisions")
        .where({ case_id: id, tenant_id: tenantId })
        .orderBy("created_at", "desc");
    const actions = await trx
        .from("intelligence_action_records")
        .where({ case_id: id, tenant_id: tenantId })
        .orderBy("created_at", "desc");
    const outcomes = await trx
        .from("intelligence_outcome_records")
        .where({ case_id: id, tenant_id: tenantId })
        .orderBy("observed_at", "desc");
    return { case: serializeCase(row), evidence, decisions, actions, outcomes };
}

export async function recordIntelligenceDecision(input: {
    caseId: string;
    decision: IntelligenceDecision;
    reason: string;
    version: number;
    reviewerUserId: bigint | number | null;
}) {
    const trx = currentTrx();
    const tenantId = currentTenantId().toString();
    const current = await trx.from("intelligence_cases").where({ id: input.caseId, tenant_id: tenantId }).first();
    if (!current) return { kind: "not_found" as const };
    if (numberFrom(current.version) !== input.version)
        return { kind: "conflict" as const, currentVersion: numberFrom(current.version) };
    const evidence = await trx
        .from("intelligence_evidence_links")
        .where({ case_id: input.caseId, tenant_id: tenantId })
        .orderBy("freshness_at", "desc");
    const lifecycleStage = input.decision === "accept" ? "approved" : input.decision === "reject" ? "rejected" : "reviewed";
    const updated = await trx
        .from("intelligence_cases")
        .where({ id: input.caseId, tenant_id: tenantId, version: input.version })
        .update({ lifecycle_stage: lifecycleStage, version: input.version + 1, updated_at: sqlNow() })
        .returning("*");
    if (updated.length === 0) return { kind: "conflict" as const, currentVersion: input.version + 1 };
    const [decision] = await trx
        .table("intelligence_decisions")
        .insert({
            tenant_id: tenantId,
            case_id: input.caseId,
            decision: input.decision,
            reason: input.reason,
            reviewer_user_id: input.reviewerUserId,
            case_version: input.version,
            context_snapshot: serializeCase(current),
            evidence_snapshot: evidence,
            created_at: sqlNow(),
        })
        .returning("*");
    if (input.decision === "accept") {
        await trx.table("intelligence_action_records").insert({
            tenant_id: tenantId,
            case_id: input.caseId,
            decision_id: decision.id,
            action_kind: "deep_link",
            status: "planned",
            action_route: current.action_route,
            result: { executionBoundary: "human_navigation_only", phase11RequiredForPolicyExecution: true },
            created_at: sqlNow(),
            updated_at: sqlNow(),
        });
    }
    return { kind: "ok" as const, case: serializeCase(updated[0]), decision };
}

export async function recordIntelligenceOutcome(input: {
    caseId: string;
    metricName: string;
    baselineValue?: number;
    observedValue?: number;
    measurementWindow?: string;
    attributionConfidence?: number;
    notes?: string;
    observedAt: string;
    recordedByUserId: bigint | number | null;
}) {
    const trx = currentTrx();
    const tenantId = currentTenantId().toString();
    const intelligenceCase = await trx.from("intelligence_cases").where({ id: input.caseId, tenant_id: tenantId }).first();
    if (!intelligenceCase) return null;
    const delta =
        input.baselineValue === undefined || input.observedValue === undefined ? null : input.observedValue - input.baselineValue;
    const [outcome] = await trx
        .table("intelligence_outcome_records")
        .insert({
            tenant_id: tenantId,
            case_id: input.caseId,
            action_record_id: null,
            metric_name: input.metricName,
            baseline_value: input.baselineValue ?? null,
            observed_value: input.observedValue ?? null,
            delta,
            measurement_window: input.measurementWindow ?? null,
            attribution_confidence: input.attributionConfidence ?? null,
            notes: input.notes ?? null,
            observed_at: input.observedAt,
            recorded_by_user_id: input.recordedByUserId,
            created_at: sqlNow(),
        })
        .returning("*");
    await trx
        .from("intelligence_cases")
        .where({ id: input.caseId, tenant_id: tenantId })
        .update({ lifecycle_stage: "measured", updated_at: sqlNow() });
    return outcome;
}
