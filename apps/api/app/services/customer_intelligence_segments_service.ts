import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export type SegmentOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
type SegmentScalar = string | number | boolean;
type SegmentBinding = SegmentScalar;

export interface SegmentCondition {
    feature: string;
    operator: SegmentOperator;
    value: SegmentScalar | SegmentScalar[];
}

export interface SegmentDefinition {
    version: 1;
    op: "and" | "or";
    conditions: SegmentCondition[];
}

const FEATURE_SQL: Record<string, string> = {
    "lifecycle.state": "cip.lifecycle_state",
    "risk.band": "cip.risk_band",
    "value.band": "cip.value_band",
    "rfm.score": "cip.rfm_score",
    "rfm.recency_days": "cip.recency_days",
    "rfm.frequency_365d": "cip.frequency_365d",
    "rfm.monetary_365d_minor": "cip.monetary_365d_minor",
    "economics.historical_revenue_ltv_minor": "cip.historical_revenue_ltv_minor",
    "economics.historical_contribution_ltv_minor": "cip.historical_contribution_ltv_minor",
    "consent.email": "COALESCE(mp.email_opt_in, false)",
    "consent.sms": "COALESCE(mp.sms_opt_in, false)",
};

const OPERATOR_SQL: Record<Exclude<SegmentOperator, "in">, string> = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
};

export const CUSTOMER_SEGMENT_FEATURES = Object.freeze(Object.keys(FEATURE_SQL));

function isScalar(value: unknown): value is SegmentScalar {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function validateDefinition(value: unknown): SegmentDefinition {
    if (!value || typeof value !== "object") {
        throw new Exception("Invalid segment definition", { status: 422, code: "E_SEGMENT_DEFINITION" });
    }
    const candidate = value as Partial<SegmentDefinition>;
    if (candidate.version !== 1 || (candidate.op !== "and" && candidate.op !== "or") || !Array.isArray(candidate.conditions)) {
        throw new Exception("Invalid segment definition", { status: 422, code: "E_SEGMENT_DEFINITION" });
    }
    if (candidate.conditions.length > 20) {
        throw new Exception("Segment definition has too many conditions", { status: 422, code: "E_SEGMENT_DEFINITION" });
    }
    for (const condition of candidate.conditions) {
        if (
            !condition ||
            typeof condition !== "object" ||
            !FEATURE_SQL[condition.feature] ||
            !["eq", "neq", "gt", "gte", "lt", "lte", "in"].includes(condition.operator)
        ) {
            throw new Exception("Segment definition contains an unsupported condition", {
                status: 422,
                code: "E_SEGMENT_DEFINITION",
            });
        }
        if (condition.operator === "in") {
            if (
                !Array.isArray(condition.value) ||
                condition.value.length === 0 ||
                condition.value.length > 50 ||
                !condition.value.every(isScalar)
            ) {
                throw new Exception("Segment IN condition must contain between 1 and 50 scalar values", {
                    status: 422,
                    code: "E_SEGMENT_DEFINITION",
                });
            }
        } else if (!isScalar(condition.value)) {
            throw new Exception("Segment condition must use a scalar value", { status: 422, code: "E_SEGMENT_DEFINITION" });
        }
    }
    return candidate as SegmentDefinition;
}

function compileDefinition(definition: SegmentDefinition): { sql: string; bindings: SegmentBinding[] } {
    if (definition.conditions.length === 0) return { sql: "TRUE", bindings: [] };
    const bindings: SegmentBinding[] = [];
    const fragments = definition.conditions.map((condition) => {
        const column = FEATURE_SQL[condition.feature];
        if (condition.operator === "in") {
            const values = condition.value as SegmentScalar[];
            bindings.push(...values);
            return `${column} IN (${values.map(() => "?").join(",")})`;
        }
        const value = condition.value as SegmentScalar;
        bindings.push(value);
        return `${column} ${OPERATOR_SQL[condition.operator]} ?`;
    });
    return { sql: fragments.map((fragment) => `(${fragment})`).join(definition.op === "and" ? " AND " : " OR "), bindings };
}

async function findOwnedSegment(segmentId: number, userId: number) {
    const row = await currentTrx().from("customer_segments").where("id", segmentId).where("user_id", userId).first();
    if (!row) throw new Exception("Segment not found", { status: 404, code: "E_NOT_FOUND" });
    return row;
}

export async function saveSegmentDefinition(input: {
    segmentId: number;
    userId: number;
    kind: "rule_based" | "rfm" | "cohort" | "lifecycle" | "predictive";
    definition: unknown;
    refreshPolicy: "manual" | "event_driven";
}) {
    await findOwnedSegment(input.segmentId, input.userId);
    const definition = validateDefinition(input.definition);
    const existing = await currentTrx().from("customer_segment_definitions").where("segment_id", input.segmentId).first();
    const version = Number(existing?.definition_version ?? 0) + 1;
    const now = DateTime.utc().toISO()!;
    await currentTrx().rawQuery(
        `INSERT INTO customer_segment_definitions (
             tenant_id, segment_id, kind, definition, refresh_policy, definition_version, status,
             member_count, created_at, updated_at
         ) VALUES (?, ?, ?, ?::jsonb, ?, ?, 'draft', 0, ?, ?)
         ON CONFLICT (segment_id) DO UPDATE SET
             kind = EXCLUDED.kind,
             definition = EXCLUDED.definition,
             refresh_policy = EXCLUDED.refresh_policy,
             definition_version = EXCLUDED.definition_version,
             status = 'draft',
             updated_at = EXCLUDED.updated_at`,
        [
            String(currentTenantId()),
            input.segmentId,
            input.kind,
            JSON.stringify(definition),
            input.refreshPolicy,
            version,
            now,
            now,
        ],
    );
    return getSegmentDefinition(input.segmentId, input.userId);
}

export async function getSegmentDefinition(segmentId: number, userId: number) {
    await findOwnedSegment(segmentId, userId);
    const row = await currentTrx().from("customer_segment_definitions").where("segment_id", segmentId).first();
    if (!row) {
        return {
            segment_id: segmentId,
            kind: "saved_view",
            definition: null,
            refresh_policy: "manual",
            definition_version: 0,
            status: "saved_view",
            member_count: null,
            last_evaluated_at: null,
        };
    }
    return {
        segment_id: Number(row.segment_id),
        kind: String(row.kind),
        definition: row.definition,
        refresh_policy: String(row.refresh_policy),
        definition_version: Number(row.definition_version),
        status: String(row.status),
        member_count: Number(row.member_count ?? 0),
        last_evaluated_at: row.last_evaluated_at ? new Date(String(row.last_evaluated_at)).toISOString() : null,
    };
}

async function matchingCustomerIds(definition: SegmentDefinition, limit?: number) {
    const compiled = compileDefinition(definition);
    const limitSql = limit ? ` LIMIT ${Math.max(1, Math.min(limit, 100))}` : "";
    const { rows } = await currentTrx().rawQuery<{ rows: Array<{ customer_id: number | string }> }>(
        `SELECT cip.customer_id
           FROM customer_intelligence_profiles cip
           LEFT JOIN customer_marketing_prefs mp ON mp.customer_id = cip.customer_id
          WHERE ${compiled.sql}
          ORDER BY cip.customer_id${limitSql}`,
        compiled.bindings,
    );
    return rows.map((row) => Number(row.customer_id));
}

export async function previewSegment(segmentId: number, userId: number) {
    await findOwnedSegment(segmentId, userId);
    const row = await currentTrx().from("customer_segment_definitions").where("segment_id", segmentId).first();
    if (!row) {
        throw new Exception("This saved view has no dynamic segment definition", { status: 409, code: "E_SEGMENT_SAVED_VIEW" });
    }
    const definition = validateDefinition(row.definition);
    const compiled = compileDefinition(definition);
    const countResult = await currentTrx().rawQuery<{ rows: Array<{ count: number | string }> }>(
        `SELECT COUNT(*)::bigint AS count
           FROM customer_intelligence_profiles cip
           LEFT JOIN customer_marketing_prefs mp ON mp.customer_id = cip.customer_id
          WHERE ${compiled.sql}`,
        compiled.bindings,
    );
    return { count: Number(countResult.rows[0]?.count ?? 0), sample_customer_ids: await matchingCustomerIds(definition, 20) };
}

export async function evaluateSegment(segmentId: number, userId: number) {
    await findOwnedSegment(segmentId, userId);
    const row = await currentTrx().from("customer_segment_definitions").where("segment_id", segmentId).first();
    if (!row) {
        throw new Exception("This saved view has no dynamic segment definition", { status: 409, code: "E_SEGMENT_SAVED_VIEW" });
    }
    const definition = validateDefinition(row.definition);
    const ids = await matchingCustomerIds(definition);
    const now = DateTime.utc().toISO()!;
    await currentTrx()
        .from("customer_segment_definitions")
        .where("segment_id", segmentId)
        .update({ status: "evaluating", updated_at: now });
    await currentTrx().from("customer_segment_memberships").where("segment_id", segmentId).delete();
    if (ids.length > 0) {
        await currentTrx()
            .table("customer_segment_memberships")
            .multiInsert(
                ids.map((customerId) => ({ segment_id: segmentId, customer_id: customerId, matched_at: now, evaluated_at: now })),
            );
    }
    await currentTrx().from("customer_segment_definitions").where("segment_id", segmentId).update({
        status: "ready",
        member_count: ids.length,
        last_evaluated_at: now,
        updated_at: now,
    });
    return { member_count: ids.length, evaluated_at: now };
}

export async function listSegmentMembers(segmentId: number, userId: number, page: number, limit: number) {
    await findOwnedSegment(segmentId, userId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const offset = (safePage - 1) * safeLimit;
    const [countRow, rows] = await Promise.all([
        currentTrx().from("customer_segment_memberships").where("segment_id", segmentId).count("* as total").first(),
        currentTrx()
            .from("customer_segment_memberships as csm")
            .join("customers as c", "c.id", "csm.customer_id")
            .leftJoin("users as u", "u.id", "c.user_id")
            .where("csm.segment_id", segmentId)
            .where((query) => query.whereNull("c.user_id").orWhere("u.role", "customer"))
            .select("c.id", "c.first_name", "c.last_name", "c.phone", "csm.matched_at", "csm.evaluated_at")
            .orderBy("csm.matched_at", "desc")
            .offset(offset)
            .limit(safeLimit),
    ]);
    const total = Number(countRow?.total ?? 0);
    return {
        data: rows.map((row) => ({
            id: Number(row.id),
            first_name: row.first_name,
            last_name: row.last_name,
            phone: row.phone,
            matched_at: new Date(String(row.matched_at)).toISOString(),
            evaluated_at: new Date(String(row.evaluated_at)).toISOString(),
        })),
        meta: { page: safePage, limit: safeLimit, total, last_page: Math.max(1, Math.ceil(total / safeLimit)) },
    };
}

export async function reconcileCustomerEventDrivenSegments(customerId: number): Promise<void> {
    const definitions = await currentTrx()
        .from("customer_segment_definitions")
        .where("refresh_policy", "event_driven")
        .select("segment_id", "definition");
    for (const row of definitions) {
        const definition = validateDefinition(row.definition);
        const compiled = compileDefinition(definition);
        const bindings: SegmentBinding[] = [customerId, ...compiled.bindings];
        const { rows } = await currentTrx().rawQuery<{ rows: Array<{ matched: boolean }> }>(
            `SELECT EXISTS (
                 SELECT 1 FROM customer_intelligence_profiles cip
                 LEFT JOIN customer_marketing_prefs mp ON mp.customer_id = cip.customer_id
                 WHERE cip.customer_id = ? AND ${compiled.sql}
             ) AS matched`,
            bindings,
        );
        const segmentId = Number(row.segment_id);
        const matched = Boolean(rows[0]?.matched);
        if (matched) {
            const now = DateTime.utc().toISO()!;
            await currentTrx().rawQuery(
                `INSERT INTO customer_segment_memberships (tenant_id, segment_id, customer_id, matched_at, evaluated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (tenant_id, segment_id, customer_id) DO UPDATE SET evaluated_at = EXCLUDED.evaluated_at`,
                [String(currentTenantId()), segmentId, customerId, now, now],
            );
        } else {
            await currentTrx()
                .from("customer_segment_memberships")
                .where("segment_id", segmentId)
                .where("customer_id", customerId)
                .delete();
        }
        const countRow = await currentTrx()
            .from("customer_segment_memberships")
            .where("segment_id", segmentId)
            .count("* as total")
            .first();
        const recalculatedAt = DateTime.utc().toISO()!;
        await currentTrx()
            .from("customer_segment_definitions")
            .where("segment_id", segmentId)
            .update({
                member_count: Number(countRow?.total ?? 0),
                last_evaluated_at: recalculatedAt,
                status: "ready",
                updated_at: recalculatedAt,
            });
    }
}
