import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const CUSTOMER_INTELLIGENCE_ENGINE_VERSION = "phase15-customer-genome-v2";

const COUNTED_STATUSES = ["pending", "on_hold", "processing", "completed", "refunded"] as const;
const PAID_STATUSES = ["processing", "completed", "refunded"] as const;

export type LifecycleState = "never_purchased" | "first_purchase" | "active_repeat" | "at_risk" | "lapsed" | "reactivated";
export type RiskBand = "unknown" | "low" | "medium" | "high";
export type ValueBand = "unknown" | "developing" | "core" | "high_value";

type ContributionStatus = "available" | "partial" | "unavailable";
type ContributionQuality = "realized" | "estimated" | "incomplete" | "unavailable";

export interface CustomerIntelligenceRow {
    customer_id: number;
    lifecycle_state: LifecycleState;
    lifecycle_reason: string;
    recency_days: number | null;
    frequency_365d: number;
    monetary_365d_minor: number;
    rfm_recency_score: number | null;
    rfm_frequency_score: number | null;
    rfm_monetary_score: number | null;
    rfm_score: number | null;
    value_band: ValueBand;
    risk_band: RiskBand;
    historical_revenue_ltv_minor: number | null;
    historical_contribution_ltv_minor: number | null;
    expected_next_purchase_from: string | null;
    expected_next_purchase_to: string | null;
    signals: Record<string, unknown>;
    prediction_meta: Record<string, unknown>;
    nba_candidates: Array<Record<string, unknown>>;
    quality_status: string;
    engine_version: string;
    calculated_at: string;
    stale_at: string | null;
}

interface PopulationRow {
    customer_id: string | number;
    created_at: string | Date;
    order_count: string | number | null;
    paid_order_count: string | number | null;
    orders_365d: string | number | null;
    gross_ltv_minor: string | number | null;
    gross_365d_minor: string | number | null;
    refunds_minor: string | number | null;
    first_order_at: string | Date | null;
    last_order_at: string | Date | null;
    open_tickets: string | number | null;
    tickets_90d: string | number | null;
    email_opt_in: boolean | null;
    sms_opt_in: boolean | null;
    economic_order_count: string | number | null;
    economic_incomplete_entries: string | number | null;
    economic_estimated_entries: string | number | null;
    economic_contribution_minor: string | number | null;
    category_affinity: unknown;
    brand_affinity: unknown;
    personalization_allowed: boolean | null;
}

interface ScoredPopulationRow extends PopulationRow {
    recency_days: number | null;
    r_score: number | null;
    f_score: number | null;
    m_score: number | null;
}

interface ContributionResult {
    status: ContributionStatus;
    quality: ContributionQuality;
    valueMinor: number | null;
    coveredOrders: number;
    expectedOrders: number;
    incompleteEntries: number;
    estimatedEntries: number;
}

function safeNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isSafeInteger(parsed) ? parsed : 0;
}

function daysSince(value: string | Date | null): number | null {
    if (!value) return null;
    const dt = typeof value === "string" ? DateTime.fromISO(value, { zone: "utc" }) : DateTime.fromJSDate(value, { zone: "utc" });
    if (!dt.isValid) return null;
    return Math.max(0, Math.floor(DateTime.utc().diff(dt, "days").days));
}

export function deriveLifecycle(orderCount: number, recencyDays: number | null, previous?: string | null) {
    if (orderCount === 0 || recencyDays === null) return { state: "never_purchased" as const, reason: "no_counted_orders" };
    if (previous === "lapsed" && recencyDays <= 60) return { state: "reactivated" as const, reason: "purchase_after_lapse" };
    if (recencyDays > 120) return { state: "lapsed" as const, reason: "last_order_over_120_days" };
    if (recencyDays > 60) return { state: "at_risk" as const, reason: "last_order_61_to_120_days" };
    if (orderCount === 1) return { state: "first_purchase" as const, reason: "single_recent_order" };
    return { state: "active_repeat" as const, reason: "repeat_recent_orders" };
}

export function deriveRiskBand(lifecycle: LifecycleState): RiskBand {
    if (lifecycle === "lapsed") return "high";
    if (lifecycle === "at_risk") return "medium";
    if (lifecycle === "never_purchased") return "unknown";
    return "low";
}

export function deriveValueBand(rfmScore: number | null): ValueBand {
    if (rfmScore === null) return "unknown";
    if (rfmScore >= 13) return "high_value";
    if (rfmScore >= 9) return "core";
    return "developing";
}

function nextPurchaseWindow(firstOrderAt: string | Date | null, lastOrderAt: string | Date | null, orderCount: number) {
    if (!firstOrderAt || !lastOrderAt || orderCount < 2) return { from: null, to: null };
    const first =
        typeof firstOrderAt === "string"
            ? DateTime.fromISO(firstOrderAt, { zone: "utc" })
            : DateTime.fromJSDate(firstOrderAt, { zone: "utc" });
    const last =
        typeof lastOrderAt === "string"
            ? DateTime.fromISO(lastOrderAt, { zone: "utc" })
            : DateTime.fromJSDate(lastOrderAt, { zone: "utc" });
    if (!first.isValid || !last.isValid) return { from: null, to: null };
    const averageGap = Math.max(7, Math.round(last.diff(first, "days").days / Math.max(1, orderCount - 1)));
    const expected = last.plus({ days: averageGap });
    const width = Math.max(7, Math.round(averageGap * 0.25));
    return {
        from: expected.minus({ days: width }).toUTC().toISO(),
        to: expected.plus({ days: width }).toUTC().toISO(),
    };
}

function contributionFor(row: PopulationRow): ContributionResult {
    const expectedOrders = safeNumber(row.paid_order_count);
    const coveredOrders = safeNumber(row.economic_order_count);
    const incompleteEntries = safeNumber(row.economic_incomplete_entries);
    const estimatedEntries = safeNumber(row.economic_estimated_entries);
    if (expectedOrders === 0) {
        return {
            status: "unavailable",
            quality: "unavailable",
            valueMinor: null,
            coveredOrders,
            expectedOrders,
            incompleteEntries,
            estimatedEntries,
        };
    }
    const complete = coveredOrders >= expectedOrders && incompleteEntries === 0;
    if (!complete) {
        return {
            status: coveredOrders > 0 ? "partial" : "unavailable",
            quality: incompleteEntries > 0 ? "incomplete" : "unavailable",
            valueMinor: null,
            coveredOrders,
            expectedOrders,
            incompleteEntries,
            estimatedEntries,
        };
    }
    return {
        status: "available",
        quality: estimatedEntries > 0 ? "estimated" : "realized",
        valueMinor: safeNumber(row.economic_contribution_minor),
        coveredOrders,
        expectedOrders,
        incompleteEntries,
        estimatedEntries,
    };
}

export function deriveQualityStatus(orderCount: number, expectedOrders: number, contributionStatus: ContributionStatus): string {
    if (orderCount === 0 || expectedOrders === 0) return "limited_history";
    if (contributionStatus === "available") return "ready";
    if (contributionStatus === "partial") return "partial_economic_coverage";
    return "missing_economic_coverage";
}

function buildNbaCandidates(lifecycle: LifecycleState, openTickets: number, emailOptIn: boolean, smsOptIn: boolean) {
    if (openTickets > 0) {
        return [
            {
                action_type: "service_follow_up",
                reason_codes: ["open_support_ticket"],
                evidence_refs: ["signals.support.open_tickets"],
                eligibility: "eligible",
                consent_requirement: "service_processing",
                execution: { status: "candidate_only", owner: "phase10" },
            },
        ];
    }
    if (lifecycle === "lapsed" || lifecycle === "at_risk") {
        const hasMarketingChannel = emailOptIn || smsOptIn;
        return [
            {
                action_type: hasMarketingChannel ? "win_back" : "do_nothing",
                reason_codes: hasMarketingChannel ? ["lifecycle_risk_with_marketing_consent"] : ["no_marketing_consent"],
                evidence_refs: ["lifecycle.state", "signals.consent"],
                eligibility: hasMarketingChannel ? "eligible" : "blocked_by_consent",
                consent_requirement: "marketing",
                execution: { status: "candidate_only", owner: "phase10" },
            },
        ];
    }
    return [
        {
            action_type: "no_incentive_needed",
            reason_codes: ["healthy_recent_relationship"],
            evidence_refs: ["lifecycle.state", "risk.band"],
            eligibility: "eligible",
            consent_requirement: "none",
            execution: { status: "candidate_only", owner: "phase10" },
        },
    ];
}

async function loadPopulation(): Promise<ScoredPopulationRow[]> {
    const counted = COUNTED_STATUSES.map(() => "?").join(",");
    const paid = PAID_STATUSES.map(() => "?").join(",");
    const { rows } = await currentTrx().rawQuery<{ rows: PopulationRow[] }>(
        `WITH order_stats AS (
             SELECT o.customer_id,
                    COUNT(*) FILTER (WHERE o.status IN (${counted})) AS order_count,
                    COUNT(*) FILTER (WHERE o.status IN (${paid})) AS paid_order_count,
                    COUNT(*) FILTER (WHERE o.status IN (${counted}) AND o.created_at >= now() - interval '365 days') AS orders_365d,
                    COALESCE(SUM(o.grand_total) FILTER (WHERE o.status IN (${paid})), 0) AS gross_ltv_minor,
                    COALESCE(SUM(o.grand_total) FILTER (WHERE o.status IN (${paid}) AND o.created_at >= now() - interval '365 days'), 0) AS gross_365d_minor,
                    MIN(o.created_at) FILTER (WHERE o.status IN (${counted})) AS first_order_at,
                    MAX(o.created_at) FILTER (WHERE o.status IN (${counted})) AS last_order_at
               FROM orders o
              GROUP BY o.customer_id
         ), refund_stats AS (
             SELECT o.customer_id, COALESCE(SUM(r.amount_minor), 0) AS refunds_minor
               FROM order_refunds r
               JOIN orders o ON o.id = r.order_id
              GROUP BY o.customer_id
         ), support_stats AS (
             SELECT customer_id,
                    COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) AS open_tickets,
                    COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days') AS tickets_90d
               FROM support_tickets
              WHERE customer_id IS NOT NULL
              GROUP BY customer_id
         ), economics_stats AS (
             SELECT o.customer_id,
                    COUNT(DISTINCT ele.order_id) FILTER (WHERE ele.entry_kind = 'revenue') AS economic_order_count,
                    COUNT(*) FILTER (WHERE ele.quality = 'incomplete' OR ele.amount_minor IS NULL) AS economic_incomplete_entries,
                    COUNT(*) FILTER (WHERE ele.quality IN ('estimated','forecast')) AS economic_estimated_entries,
                    COALESCE(SUM(ele.amount_minor) FILTER (WHERE ele.amount_minor IS NOT NULL), 0) AS economic_contribution_minor
               FROM economic_ledger_entries ele
               JOIN orders o ON o.id = ele.order_id
              WHERE o.status IN (${paid})
              GROUP BY o.customer_id
         ), personalization AS (
             SELECT pp.subject_id::bigint AS customer_id,
                    pp.category_affinity,
                    pp.brand_affinity,
                    COALESCE(pc.personalization, false) AS personalization_allowed
               FROM personalization_profiles pp
               LEFT JOIN personalization_consents pc
                 ON pc.subject_type = pp.subject_type AND pc.subject_id = pp.subject_id
              WHERE pp.subject_type = 'customer'
         )
         SELECT c.id AS customer_id, c.created_at,
                COALESCE(os.order_count, 0) AS order_count,
                COALESCE(os.paid_order_count, 0) AS paid_order_count,
                COALESCE(os.orders_365d, 0) AS orders_365d,
                COALESCE(os.gross_ltv_minor, 0) AS gross_ltv_minor,
                COALESCE(os.gross_365d_minor, 0) AS gross_365d_minor,
                COALESCE(rs.refunds_minor, 0) AS refunds_minor,
                os.first_order_at, os.last_order_at,
                COALESCE(ss.open_tickets, 0) AS open_tickets,
                COALESCE(ss.tickets_90d, 0) AS tickets_90d,
                COALESCE(mp.email_opt_in, false) AS email_opt_in,
                COALESCE(mp.sms_opt_in, false) AS sms_opt_in,
                COALESCE(es.economic_order_count, 0) AS economic_order_count,
                COALESCE(es.economic_incomplete_entries, 0) AS economic_incomplete_entries,
                COALESCE(es.economic_estimated_entries, 0) AS economic_estimated_entries,
                COALESCE(es.economic_contribution_minor, 0) AS economic_contribution_minor,
                p.category_affinity, p.brand_affinity, COALESCE(p.personalization_allowed, false) AS personalization_allowed
           FROM customers c
           LEFT JOIN users u ON u.id = c.user_id
           LEFT JOIN order_stats os ON os.customer_id = c.id
           LEFT JOIN refund_stats rs ON rs.customer_id = c.id
           LEFT JOIN support_stats ss ON ss.customer_id = c.id
           LEFT JOIN customer_marketing_prefs mp ON mp.customer_id = c.id
           LEFT JOIN economics_stats es ON es.customer_id = c.id
           LEFT JOIN personalization p ON p.customer_id = c.id
          WHERE c.deleted_at IS NULL
            AND (c.user_id IS NULL OR u.role = 'customer')`,
        [
            ...COUNTED_STATUSES,
            ...PAID_STATUSES,
            ...COUNTED_STATUSES,
            ...PAID_STATUSES,
            ...PAID_STATUSES,
            ...COUNTED_STATUSES,
            ...COUNTED_STATUSES,
            ...PAID_STATUSES,
        ],
    );

    const normalized = rows.map((row) => ({ ...row, recency_days: daysSince(row.last_order_at) }));
    const purchased = normalized.filter((row) => safeNumber(row.order_count) > 0);
    const rank = (values: number[], value: number, higherIsBetter: boolean) => {
        if (values.length === 0) return null;
        const sorted = [...values].sort((a, b) => a - b);
        const lessOrEqual = sorted.filter((entry) => entry <= value).length;
        const bucket = Math.min(5, Math.max(1, Math.ceil((lessOrEqual / sorted.length) * 5)));
        return higherIsBetter ? bucket : 6 - bucket;
    };
    const recencies = purchased.map((row) => row.recency_days ?? 0);
    const frequencies = purchased.map((row) => safeNumber(row.orders_365d));
    const monetaries = purchased.map((row) => safeNumber(row.gross_365d_minor));
    return normalized.map((row) => {
        if (safeNumber(row.order_count) === 0) return { ...row, r_score: null, f_score: null, m_score: null };
        return {
            ...row,
            r_score: rank(recencies, row.recency_days ?? 0, false),
            f_score: rank(frequencies, safeNumber(row.orders_365d), true),
            m_score: rank(monetaries, safeNumber(row.gross_365d_minor), true),
        };
    });
}

async function previousLifecycle(customerId: number): Promise<string | null> {
    const row = await currentTrx()
        .from("customer_intelligence_profiles")
        .where("customer_id", customerId)
        .select("lifecycle_state")
        .first();
    return row?.lifecycle_state ? String(row.lifecycle_state) : null;
}

function normalizeStored(row: Record<string, unknown>): CustomerIntelligenceRow {
    return {
        customer_id: Number(row.customer_id),
        lifecycle_state: String(row.lifecycle_state) as LifecycleState,
        lifecycle_reason: String(row.lifecycle_reason),
        recency_days: row.recency_days === null ? null : Number(row.recency_days),
        frequency_365d: Number(row.frequency_365d ?? 0),
        monetary_365d_minor: Number(row.monetary_365d_minor ?? 0),
        rfm_recency_score: row.rfm_recency_score === null ? null : Number(row.rfm_recency_score),
        rfm_frequency_score: row.rfm_frequency_score === null ? null : Number(row.rfm_frequency_score),
        rfm_monetary_score: row.rfm_monetary_score === null ? null : Number(row.rfm_monetary_score),
        rfm_score: row.rfm_score === null ? null : Number(row.rfm_score),
        value_band: String(row.value_band) as ValueBand,
        risk_band: String(row.risk_band) as RiskBand,
        historical_revenue_ltv_minor: row.historical_revenue_ltv_minor === null ? null : Number(row.historical_revenue_ltv_minor),
        historical_contribution_ltv_minor:
            row.historical_contribution_ltv_minor === null ? null : Number(row.historical_contribution_ltv_minor),
        expected_next_purchase_from: row.expected_next_purchase_from
            ? new Date(String(row.expected_next_purchase_from)).toISOString()
            : null,
        expected_next_purchase_to: row.expected_next_purchase_to
            ? new Date(String(row.expected_next_purchase_to)).toISOString()
            : null,
        signals: (row.signals ?? {}) as Record<string, unknown>,
        prediction_meta: (row.prediction_meta ?? {}) as Record<string, unknown>,
        nba_candidates: (row.nba_candidates ?? []) as Array<Record<string, unknown>>,
        quality_status: String(row.quality_status),
        engine_version: String(row.engine_version),
        calculated_at: new Date(String(row.calculated_at)).toISOString(),
        stale_at: row.stale_at ? new Date(String(row.stale_at)).toISOString() : null,
    };
}

async function getStored(customerId: number): Promise<CustomerIntelligenceRow> {
    const row = await currentTrx().from("customer_intelligence_profiles").where("customer_id", customerId).first();
    if (!row) throw new Error(`Customer intelligence profile ${customerId} was not persisted`);
    return normalizeStored(row);
}

async function persist(row: ScoredPopulationRow): Promise<CustomerIntelligenceRow> {
    const customerId = Number(row.customer_id);
    const orderCount = safeNumber(row.order_count);
    const previous = await previousLifecycle(customerId);
    const lifecycle = deriveLifecycle(orderCount, row.recency_days, previous);
    const rfmScore = row.r_score && row.f_score && row.m_score ? row.r_score + row.f_score + row.m_score : null;
    const contribution = contributionFor(row);
    const refunds = safeNumber(row.refunds_minor);
    const historicalRevenue = Math.max(0, safeNumber(row.gross_ltv_minor) - refunds);
    const next = nextPurchaseWindow(row.first_order_at, row.last_order_at, orderCount);
    const openTickets = safeNumber(row.open_tickets);
    const personalizationAllowed = Boolean(row.personalization_allowed);
    const signals = {
        support: { open_tickets: openTickets, tickets_90d: safeNumber(row.tickets_90d) },
        refunds: { refunded_minor: refunds },
        consent: {
            email_opt_in: Boolean(row.email_opt_in),
            sms_opt_in: Boolean(row.sms_opt_in),
            personalization: personalizationAllowed,
        },
        economics: {
            contribution_status: contribution.status,
            contribution_quality: contribution.quality,
            covered_orders: contribution.coveredOrders,
            expected_orders: contribution.expectedOrders,
            incomplete_entries: contribution.incompleteEntries,
        },
        affinities: personalizationAllowed
            ? { category: row.category_affinity ?? {}, brand: row.brand_affinity ?? {}, source: "phase9_personalization_profile" }
            : { status: "blocked_by_consent" },
    };
    const predictionMeta = {
        churn: {
            status: "not_calibrated",
            probability: null,
            horizon_days: 90,
            method: "rule_based_lifecycle_v1",
            risk_band_source: "lifecycle_rules",
        },
        next_purchase: {
            status: next.from ? "heuristic" : "insufficient_data",
            probability: null,
            method: "observed_cadence_v1",
        },
        contribution_ltv: {
            status: contribution.status,
            quality: contribution.quality,
            source: "phase12.economic_ledger_entries",
            value_minor: contribution.valueMinor,
            covered_orders: contribution.coveredOrders,
            expected_orders: contribution.expectedOrders,
        },
        predicted_contribution_ltv: {
            status: "not_calibrated",
            value_minor: null,
            confidence: null,
            horizon_days: null,
            model_version: null,
        },
    };
    const qualityStatus = deriveQualityStatus(orderCount, contribution.expectedOrders, contribution.status);
    const now = DateTime.utc().toISO()!;
    const historicalContribution = contribution.status === "available" ? contribution.valueMinor : null;
    const nbaCandidates = buildNbaCandidates(lifecycle.state, openTickets, Boolean(row.email_opt_in), Boolean(row.sms_opt_in));
    const payload = {
        tenant_id: String(currentTenantId()),
        customer_id: customerId,
        lifecycle_state: lifecycle.state,
        lifecycle_reason: lifecycle.reason,
        recency_days: row.recency_days,
        frequency_365d: safeNumber(row.orders_365d),
        monetary_365d_minor: safeNumber(row.gross_365d_minor),
        rfm_recency_score: row.r_score,
        rfm_frequency_score: row.f_score,
        rfm_monetary_score: row.m_score,
        rfm_score: rfmScore,
        value_band: deriveValueBand(rfmScore),
        risk_band: deriveRiskBand(lifecycle.state),
        historical_revenue_ltv_minor: historicalRevenue,
        historical_contribution_ltv_minor: historicalContribution,
        expected_next_purchase_from: next.from,
        expected_next_purchase_to: next.to,
        signals: JSON.stringify(signals),
        prediction_meta: JSON.stringify(predictionMeta),
        nba_candidates: JSON.stringify(nbaCandidates),
        quality_status: qualityStatus,
        engine_version: CUSTOMER_INTELLIGENCE_ENGINE_VERSION,
        calculated_at: now,
        stale_at: null,
        created_at: now,
        updated_at: now,
    };

    await currentTrx().table("customer_intelligence_profiles").insert(payload).onConflict(["tenant_id", "customer_id"]).merge({
        lifecycle_state: payload.lifecycle_state,
        lifecycle_reason: payload.lifecycle_reason,
        recency_days: payload.recency_days,
        frequency_365d: payload.frequency_365d,
        monetary_365d_minor: payload.monetary_365d_minor,
        rfm_recency_score: payload.rfm_recency_score,
        rfm_frequency_score: payload.rfm_frequency_score,
        rfm_monetary_score: payload.rfm_monetary_score,
        rfm_score: payload.rfm_score,
        value_band: payload.value_band,
        risk_band: payload.risk_band,
        historical_revenue_ltv_minor: payload.historical_revenue_ltv_minor,
        historical_contribution_ltv_minor: payload.historical_contribution_ltv_minor,
        expected_next_purchase_from: payload.expected_next_purchase_from,
        expected_next_purchase_to: payload.expected_next_purchase_to,
        signals: payload.signals,
        prediction_meta: payload.prediction_meta,
        nba_candidates: payload.nba_candidates,
        quality_status: payload.quality_status,
        engine_version: payload.engine_version,
        calculated_at: payload.calculated_at,
        stale_at: null,
        updated_at: payload.updated_at,
    });

    if (previous !== lifecycle.state) {
        await currentTrx()
            .table("customer_lifecycle_history")
            .insert({
                customer_id: customerId,
                previous_state: previous,
                new_state: lifecycle.state,
                reason_code: lifecycle.reason,
                evidence: JSON.stringify({ order_count: orderCount, recency_days: row.recency_days }),
                engine_version: CUSTOMER_INTELLIGENCE_ENGINE_VERSION,
                effective_at: now,
                calculated_at: now,
            });
    }
    return getStored(customerId);
}

export async function refreshAllCustomerIntelligence(): Promise<number> {
    const population = await loadPopulation();
    for (const row of population) await persist(row);
    return population.length;
}

export async function refreshCustomerIntelligence(customerId: number): Promise<CustomerIntelligenceRow> {
    const population = await loadPopulation();
    const row = population.find((entry) => Number(entry.customer_id) === customerId);
    if (!row) throw new Error("Customer not found or not eligible for customer intelligence");
    return persist(row);
}

export async function getCustomerIntelligence(customerId: number): Promise<CustomerIntelligenceRow> {
    const stored = await currentTrx().from("customer_intelligence_profiles").where("customer_id", customerId).first();
    if (!stored) return refreshCustomerIntelligence(customerId);
    const calculatedAt = DateTime.fromJSDate(new Date(String(stored.calculated_at)), { zone: "utc" });
    const stale = Boolean(stored.stale_at) || !calculatedAt.isValid || DateTime.utc().diff(calculatedAt, "hours").hours >= 6;
    return stale ? refreshCustomerIntelligence(customerId) : normalizeStored(stored);
}

export async function markCustomerIntelligenceStale(customerId: bigint | number | null | undefined): Promise<void> {
    if (customerId === null || customerId === undefined) return;
    await currentTrx()
        .from("customer_intelligence_profiles")
        .where("customer_id", Number(customerId))
        .update({ stale_at: DateTime.utc().toISO() });
}

export async function getCustomerIntelligenceSummary() {
    const row = await currentTrx()
        .from("customer_intelligence_profiles")
        .select(currentTrx().raw("COUNT(*)::bigint AS total"))
        .select(currentTrx().raw("COUNT(*) FILTER (WHERE lifecycle_state = 'active_repeat')::bigint AS active_repeat"))
        .select(currentTrx().raw("COUNT(*) FILTER (WHERE lifecycle_state = 'at_risk')::bigint AS at_risk"))
        .select(currentTrx().raw("COUNT(*) FILTER (WHERE lifecycle_state = 'lapsed')::bigint AS lapsed"))
        .select(currentTrx().raw("COUNT(*) FILTER (WHERE risk_band = 'high')::bigint AS high_risk"))
        .select(currentTrx().raw("COUNT(*) FILTER (WHERE value_band = 'high_value')::bigint AS high_value"))
        .select(currentTrx().raw("COALESCE(SUM(historical_revenue_ltv_minor), 0)::bigint AS historical_revenue_ltv_minor"))
        .select(
            currentTrx().raw(
                "COALESCE(SUM(historical_contribution_ltv_minor) FILTER (WHERE historical_contribution_ltv_minor IS NOT NULL), 0)::bigint AS historical_contribution_ltv_minor",
            ),
        )
        .select(
            currentTrx().raw(
                "COUNT(*) FILTER (WHERE historical_contribution_ltv_minor IS NOT NULL)::bigint AS contribution_customer_count",
            ),
        )
        .select(
            currentTrx().raw(
                "COUNT(*) FILTER (WHERE COALESCE((signals->'economics'->>'expected_orders')::int, 0) > 0)::bigint AS contribution_eligible_customer_count",
            ),
        )
        .first();
    const latest = await currentTrx().from("customer_intelligence_profiles").max("calculated_at as calculated_at").first();
    const total = Number(row?.total ?? 0);
    const contributionCustomers = Number(row?.contribution_customer_count ?? 0);
    const contributionEligibleCustomers = Number(row?.contribution_eligible_customer_count ?? 0);
    return {
        total,
        active_repeat: Number(row?.active_repeat ?? 0),
        at_risk: Number(row?.at_risk ?? 0),
        lapsed: Number(row?.lapsed ?? 0),
        high_risk: Number(row?.high_risk ?? 0),
        high_value: Number(row?.high_value ?? 0),
        historical_revenue_ltv_minor: Number(row?.historical_revenue_ltv_minor ?? 0),
        historical_contribution_ltv_minor: Number(row?.historical_contribution_ltv_minor ?? 0),
        contribution_customer_count: contributionCustomers,
        contribution_coverage_ratio:
            contributionEligibleCustomers === 0 ? 0 : contributionCustomers / contributionEligibleCustomers,
        generated_at: latest?.calculated_at ? new Date(String(latest.calculated_at)).toISOString() : null,
        engine_version: CUSTOMER_INTELLIGENCE_ENGINE_VERSION,
        predictive_status: "not_calibrated",
        contribution_status:
            contributionEligibleCustomers === 0
                ? "unavailable"
                : contributionCustomers < contributionEligibleCustomers
                  ? "partial"
                  : "available",
    };
}

export async function getLifecycleCohorts() {
    const { rows } = await currentTrx().rawQuery<{ rows: Array<Record<string, string | number | null>> }>(
        `SELECT TO_CHAR(date_trunc('month', COALESCE(first_order.first_order_at, c.created_at)), 'YYYY-MM') AS cohort,
                cip.lifecycle_state,
                COUNT(*)::bigint AS customers,
                COALESCE(SUM(cip.historical_revenue_ltv_minor), 0)::bigint AS revenue_ltv_minor,
                CASE
                    WHEN COUNT(*) FILTER (WHERE COALESCE((cip.signals->'economics'->>'expected_orders')::int, 0) > 0) = 0 THEN NULL
                    WHEN COUNT(*) FILTER (WHERE cip.historical_contribution_ltv_minor IS NOT NULL) =
                         COUNT(*) FILTER (WHERE COALESCE((cip.signals->'economics'->>'expected_orders')::int, 0) > 0)
                    THEN SUM(cip.historical_contribution_ltv_minor)::bigint
                    ELSE NULL
                END AS contribution_ltv_minor
           FROM customer_intelligence_profiles cip
           JOIN customers c ON c.id = cip.customer_id
           LEFT JOIN LATERAL (
               SELECT MIN(o.created_at) AS first_order_at
                 FROM orders o
                WHERE o.customer_id = c.id AND o.status IN ('pending','on_hold','processing','completed','refunded')
           ) first_order ON TRUE
          GROUP BY date_trunc('month', COALESCE(first_order.first_order_at, c.created_at)), cip.lifecycle_state
          ORDER BY date_trunc('month', COALESCE(first_order.first_order_at, c.created_at)) DESC, cip.lifecycle_state`,
    );
    return rows.map((row) => ({
        cohort: String(row.cohort),
        lifecycle_state: String(row.lifecycle_state),
        customers: Number(row.customers),
        revenue_ltv_minor: Number(row.revenue_ltv_minor),
        contribution_ltv_minor: row.contribution_ltv_minor === null ? null : Number(row.contribution_ltv_minor),
    }));
}
