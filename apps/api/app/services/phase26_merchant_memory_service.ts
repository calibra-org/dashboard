import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.0.0";

export type MemoryClass =
    | "operational_incident"
    | "supplier_lesson"
    | "campaign_lesson"
    | "pricing_lesson"
    | "customer_segment_behavior"
    | "product_quality"
    | "architecture_process_decision"
    | "policy_precedent";

export type MemoryEvidenceInput = {
    source_type: string;
    source_authority: string;
    source_record_ref: string;
    evidence_role?: "supporting" | "contradicting" | "outcome" | "approval" | "context";
    content_hash?: string | null;
    source_metadata?: Record<string, unknown>;
    observed_at?: string | null;
};

export type MemoryCreateInput = {
    memory_class: MemoryClass;
    stable_key: string;
    context: string;
    observed_signals?: unknown[];
    decision?: string | null;
    reason: string;
    alternatives_rejected?: unknown[];
    actors_and_approvals?: unknown[];
    action?: string | null;
    outcome?: string | null;
    lesson: string;
    confidence?: number;
    strength?: number;
    privacy_mode?: "aggregated" | "redacted" | "restricted";
    visibility_scope?: "tenant_admin" | "approved_agents" | "restricted_humans";
    purpose_tags?: string[];
    valid_from?: string;
    expires_at?: string | null;
    evidence: MemoryEvidenceInput[];
};

export type MemoryRetrieveInput = {
    query?: string | null;
    memory_classes?: MemoryClass[];
    purpose_tags?: string[];
    purpose: string;
    requester_type: "human" | "agent" | "system";
    requester_ref?: string | null;
    access_scopes?: string[];
    limit?: number;
};

type MemoryRow = {
    id: number;
    public_id: string;
    memory_class: MemoryClass;
    stable_key: string;
    version: number;
    context: string;
    observed_signals: unknown;
    decision: string | null;
    reason: string;
    alternatives_rejected: unknown;
    actors_and_approvals: unknown;
    action: string | null;
    outcome: string | null;
    lesson: string;
    confidence: string | number;
    strength: string | number;
    privacy_mode: string;
    visibility_scope: string;
    purpose_tags: unknown;
    status: string;
    valid_from: string | Date;
    expires_at: string | Date | null;
    last_confirmed_at: string | Date | null;
    created_at: string | Date;
    updated_at: string | Date;
};

const tenantId = () => Number(currentTenantId());
const num = (value: unknown) => Number(value ?? 0);
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const obj = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function sha256(value: unknown) {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function words(value: string) {
    return [...new Set(value.toLocaleLowerCase("fa").split(/\s+/u).map((part) => part.trim()).filter(Boolean))];
}

function publicMemory(row: MemoryRow, evidence: unknown[] = []) {
    return {
        public_id: row.public_id,
        memory_class: row.memory_class,
        stable_key: row.stable_key,
        version: num(row.version),
        context: row.context,
        observed_signals: list(row.observed_signals),
        decision: row.decision,
        reason: row.reason,
        alternatives_rejected: list(row.alternatives_rejected),
        actors_and_approvals: list(row.actors_and_approvals),
        action: row.action,
        outcome: row.outcome,
        lesson: row.lesson,
        confidence: num(row.confidence),
        strength: num(row.strength),
        privacy_mode: row.privacy_mode,
        visibility_scope: row.visibility_scope,
        purpose_tags: list<string>(row.purpose_tags),
        status: row.status,
        valid_from: new Date(row.valid_from).toISOString(),
        expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        last_confirmed_at: row.last_confirmed_at ? new Date(row.last_confirmed_at).toISOString() : null,
        evidence,
    };
}

function assertPrivacy(input: MemoryCreateInput) {
    if (input.memory_class !== "customer_segment_behavior") return;
    if ((input.privacy_mode ?? "aggregated") === "aggregated") return;
    if ((input.purpose_tags ?? []).includes("customer_level_raw")) {
        throw new Exception("Raw customer-level sensitive memory must not enter ordinary merchant memory", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RAW_CUSTOMER_MEMORY_FORBIDDEN",
        });
    }
}

async function assertEvidenceExists(evidence: MemoryEvidenceInput) {
    const trx = currentTrx();
    const ref = evidence.source_record_ref;
    const id = Number(ref);
    const numberRef = Number.isSafeInteger(id) && id > 0;

    const authorities: Record<string, () => Promise<unknown>> = {
        phase10_case: async () => numberRef && trx.from("intelligence_cases").where("id", id).first(),
        phase10_decision: async () => numberRef && trx.from("intelligence_decisions").where("id", id).first(),
        phase10_outcome: async () => numberRef && trx.from("intelligence_outcome_records").where("id", id).first(),
        phase11_approval: async () => trx.from("governance_approval_requests").where("reference", ref).first(),
        phase17_experiment: async () => numberRef && trx.from("experiments").where("id", id).first(),
        phase17_causal_knowledge: async () => numberRef && trx.from("experiment_causal_knowledge").where("id", id).first(),
        phase22_agent_run: async () => numberRef && trx.from("agent_orchestrator_runs").where("id", id).first(),
        phase25_portfolio_run: async () => trx.from("growth_portfolio_runs").where("public_id", ref).first(),
        phase25_portfolio_outcome: async () => numberRef && trx.from("growth_portfolio_outcomes").where("id", id).first(),
    };

    const resolver = authorities[evidence.source_authority];
    if (!resolver) {
        throw new Exception("Unsupported merchant memory source authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_AUTHORITY",
        });
    }
    const source = await resolver();
    if (!source) {
        throw new Exception("Merchant memory evidence source was not found in the canonical authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
        });
    }
}

async function evidenceFor(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_evidence")
        .whereIn("memory_id", memoryIds)
        .orderBy("id", "asc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) {
        const key = Number(row.memory_id);
        const current = grouped.get(key) ?? [];
        current.push({
            source_type: row.source_type,
            source_authority: row.source_authority,
            source_record_ref: row.source_record_ref,
            evidence_role: row.evidence_role,
            content_hash: row.content_hash,
            source_metadata: obj(row.source_metadata),
            observed_at: row.observed_at ? new Date(row.observed_at).toISOString() : null,
        });
        grouped.set(key, current);
    }
    return grouped;
}

export async function overview() {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const [classRows, statusRows, retrievals, effectiveness] = await Promise.all([
        trx.from("merchant_memory_records").select("memory_class").count("id as count").groupBy("memory_class"),
        trx.from("merchant_memory_records").select("status").count("id as count").groupBy("status"),
        trx.from("merchant_memory_retrieval_events").where("retrieved_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL()).count("id as count").first(),
        trx
            .from("merchant_memory_effectiveness")
            .where("measured_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL())
            .avg("usefulness as usefulness")
            .sum("repeat_error_avoided as repeat_error_avoided")
            .first(),
    ]);
    const expiredPending = await trx
        .from("merchant_memory_records")
        .where("status", "active")
        .whereNotNull("expires_at")
        .where("expires_at", "<=", now)
        .count("id as count")
        .first();
    return {
        version: MERCHANT_MEMORY_VERSION,
        by_class: Object.fromEntries(classRows.map((row) => [row.memory_class, num(row.count)])),
        by_status: Object.fromEntries(statusRows.map((row) => [row.status, num(row.count)])),
        retrievals_30d: num(retrievals?.count),
        usefulness_30d: effectiveness?.usefulness == null ? null : num(effectiveness.usefulness),
        repeat_errors_avoided_30d: num(effectiveness?.repeat_error_avoided),
        expired_pending: num(expiredPending?.count),
    };
}

export async function createMemory(input: MemoryCreateInput, actor: User) {
    assertPrivacy(input);
    if (!input.evidence.length) {
        throw new Exception("Merchant memory requires at least one canonical evidence source", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EVIDENCE_REQUIRED",
        });
    }
    for (const evidence of input.evidence) await assertEvidenceExists(evidence);

    const trx = currentTrx();
    const current = await trx
        .from("merchant_memory_records")
        .where("stable_key", input.stable_key)
        .orderBy("version", "desc")
        .first();
    const version = current ? Number(current.version) + 1 : 1;
    const publicId = randomUUID();
    const validFrom = input.valid_from ?? DateTime.utc().toISO();
    const [record] = await trx
        .table("merchant_memory_records")
        .insert({
            tenant_id: tenantId(),
            public_id: publicId,
            memory_class: input.memory_class,
            stable_key: input.stable_key,
            version,
            context: input.context,
            observed_signals: JSON.stringify(input.observed_signals ?? []),
            decision: input.decision ?? null,
            reason: input.reason,
            alternatives_rejected: JSON.stringify(input.alternatives_rejected ?? []),
            actors_and_approvals: JSON.stringify(input.actors_and_approvals ?? []),
            action: input.action ?? null,
            outcome: input.outcome ?? null,
            lesson: input.lesson,
            confidence: input.confidence ?? 0.5,
            strength: input.strength ?? 0.5,
            privacy_mode: input.privacy_mode ?? "aggregated",
            visibility_scope: input.visibility_scope ?? "tenant_admin",
            purpose_tags: JSON.stringify(input.purpose_tags ?? []),
            status: "active",
            valid_from: validFrom,
            expires_at: input.expires_at ?? null,
            last_confirmed_at: validFrom,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");

    for (const evidence of input.evidence) {
        await trx.table("merchant_memory_evidence").insert({
            tenant_id: tenantId(),
            memory_id: record.id,
            source_type: evidence.source_type,
            source_authority: evidence.source_authority,
            source_record_ref: evidence.source_record_ref,
            evidence_role: evidence.evidence_role ?? "supporting",
            content_hash: evidence.content_hash ?? sha256(evidence.source_metadata ?? {}),
            source_metadata: JSON.stringify(evidence.source_metadata ?? {}),
            observed_at: evidence.observed_at ?? null,
        });
    }
    const grouped = await evidenceFor([Number(record.id)]);
    return publicMemory(record as MemoryRow, grouped.get(Number(record.id)) ?? []);
}

function canSee(scope: string, accessScopes: string[]) {
    if (scope === "tenant_admin") return accessScopes.includes("tenant_admin");
    if (scope === "approved_agents") return accessScopes.includes("approved_agents") || accessScopes.includes("tenant_admin");
    if (scope === "restricted_humans") return accessScopes.includes("restricted_humans") || accessScopes.includes("tenant_admin");
    return false;
}

function relevance(row: MemoryRow, query: string | null | undefined, tags: string[]) {
    const confidence = num(row.confidence);
    const strength = num(row.strength);
    const freshnessDays = Math.max(0, DateTime.utc().diff(DateTime.fromJSDate(new Date(row.last_confirmed_at ?? row.valid_from)), "days").days);
    const freshness = 1 / (1 + freshnessDays / 90);
    const rowTags = list<string>(row.purpose_tags);
    const tagMatch = tags.length ? tags.filter((tag) => rowTags.includes(tag)).length / tags.length : 1;
    if (!query) return confidence * 0.35 + strength * 0.35 + freshness * 0.2 + tagMatch * 0.1;
    const tokens = words(query);
    const haystack = `${row.context} ${row.reason} ${row.lesson} ${row.decision ?? ""} ${row.action ?? ""} ${row.outcome ?? ""}`.toLocaleLowerCase("fa");
    const lexical = tokens.length ? tokens.filter((token) => haystack.includes(token)).length / tokens.length : 0;
    return lexical * 0.45 + confidence * 0.2 + strength * 0.2 + freshness * 0.1 + tagMatch * 0.05;
}

export async function retrieveMemory(input: MemoryRetrieveInput) {
    const started = Date.now();
    const trx = currentTrx();
    const accessScopes = input.access_scopes ?? [];
    const limit = Math.min(50, Math.max(1, input.limit ?? 12));
    let query = trx.from("merchant_memory_records").where("status", "active");
    if (input.memory_classes?.length) query = query.whereIn("memory_class", input.memory_classes);
    const candidates = (await query.orderBy("updated_at", "desc").limit(500)) as MemoryRow[];
    const now = Date.now();
    const notExpired = candidates.filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now);
    const visible = notExpired.filter((row) => canSee(row.visibility_scope, accessScopes));
    const ranked = visible
        .map((row) => ({ row, score: relevance(row, input.query, input.purpose_tags ?? []) }))
        .sort((left, right) => right.score - left.score || right.row.version - left.row.version)
        .slice(0, limit);
    const evidence = await evidenceFor(ranked.map((item) => Number(item.row.id)));
    const data = ranked.map((item) => ({
        ...publicMemory(item.row, evidence.get(Number(item.row.id)) ?? []),
        retrieval_score: Number(item.score.toFixed(6)),
    }));
    const sourceCoverage = data.length
        ? data.filter((memory) => memory.evidence.length > 0).length / data.length
        : 0;
    const publicId = randomUUID();
    const [retrieval] = await trx
        .table("merchant_memory_retrieval_events")
        .insert({
            tenant_id: tenantId(),
            public_id: publicId,
            requester_type: input.requester_type,
            requester_ref: input.requester_ref ?? null,
            purpose: input.purpose,
            query_hash: sha256(input.query ?? ""),
            filters: JSON.stringify({ memory_classes: input.memory_classes ?? [], purpose_tags: input.purpose_tags ?? [] }),
            returned_memory_public_ids: JSON.stringify(data.map((memory) => memory.public_id)),
            permission_filtered_count: notExpired.length - visible.length,
            expired_filtered_count: candidates.length - notExpired.length,
            source_coverage: sourceCoverage,
            result_count: data.length,
            retrieved_at: DateTime.utc().toISO(),
        })
        .returning(["id", "public_id"]);
    return {
        retrieval_public_id: retrieval.public_id,
        result_count: data.length,
        latency_ms: Date.now() - started,
        source_coverage: sourceCoverage,
        data,
    };
}

async function assertNoLineageCycle(fromId: number, toId: number) {
    const rows = await currentTrx().rawQuery(
        `WITH RECURSIVE chain(id) AS (
            SELECT to_memory_id FROM merchant_memory_lineage WHERE from_memory_id = ?
            UNION
            SELECT l.to_memory_id FROM merchant_memory_lineage l JOIN chain c ON l.from_memory_id = c.id
        ) SELECT 1 FROM chain WHERE id = ? LIMIT 1`,
        [toId, fromId],
    );
    if (rows.rows?.length) {
        throw new Exception("Merchant memory lineage cycle is not allowed", {
            status: 409,
            code: "E_MERCHANT_MEMORY_LINEAGE_CYCLE",
        });
    }
}

export async function supersedeMemory(publicId: string, successorPublicId: string, reason: string, actor: User) {
    const trx = currentTrx();
    const predecessor = await trx.from("merchant_memory_records").where("public_id", publicId).first();
    const successor = await trx.from("merchant_memory_records").where("public_id", successorPublicId).first();
    if (!predecessor || !successor) {
        throw new Exception("Merchant memory record not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    if (predecessor.stable_key !== successor.stable_key || Number(successor.version) <= Number(predecessor.version)) {
        throw new Exception("Successor must be a newer version of the same merchant memory stable key", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SUCCESSOR_INVALID",
        });
    }
    await assertNoLineageCycle(Number(predecessor.id), Number(successor.id));
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: predecessor.id,
        to_memory_id: successor.id,
        relation: "supersedes",
        reason,
        evidence_refs: JSON.stringify([]),
        created_by_user_id: Number(actor.id),
    });
    await trx.from("merchant_memory_records").where("id", predecessor.id).update({ status: "superseded" });
    return { predecessor_public_id: publicId, successor_public_id: successorPublicId, status: "superseded" };
}

export async function expireDueMemory() {
    const changed = await currentTrx()
        .from("merchant_memory_records")
        .where("status", "active")
        .whereNotNull("expires_at")
        .where("expires_at", "<=", DateTime.utc().toSQL())
        .update({ status: "expired", updated_at: DateTime.utc().toSQL() });
    return { expired: Number(changed) };
}

export async function recordEffectiveness(
    retrievalPublicId: string,
    input: {
        usefulness?: number | null;
        memory_applied?: boolean | null;
        repeat_error_avoided?: boolean | null;
        realized_impact_minor?: number | null;
        attribution_confidence?: number | null;
        notes?: string | null;
    },
    actor: User,
) {
    const trx = currentTrx();
    const retrieval = await trx.from("merchant_memory_retrieval_events").where("public_id", retrievalPublicId).first();
    if (!retrieval) {
        throw new Exception("Merchant memory retrieval event not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND",
        });
    }
    const [row] = await trx
        .table("merchant_memory_effectiveness")
        .insert({
            tenant_id: tenantId(),
            retrieval_event_id: retrieval.id,
            usefulness: input.usefulness ?? null,
            memory_applied: input.memory_applied ?? null,
            repeat_error_avoided: input.repeat_error_avoided ?? null,
            realized_impact_minor: input.realized_impact_minor ?? null,
            attribution_confidence: input.attribution_confidence ?? null,
            notes: input.notes ?? null,
            measured_at: DateTime.utc().toISO(),
            recorded_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}
