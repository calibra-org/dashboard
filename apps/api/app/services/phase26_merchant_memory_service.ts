import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.0.0";

export const MEMORY_CLASSES = [
    "operational_incident",
    "supplier_lesson",
    "campaign_lesson",
    "pricing_lesson",
    "customer_segment_behavior",
    "product_quality",
    "architecture_process_decision",
    "policy_precedent",
] as const;

export type MemoryClass = (typeof MEMORY_CLASSES)[number];
export type MemorySensitivity = "internal" | "restricted" | "confidential";
export type MemorySubjectScope = "merchant" | "aggregate" | "segment" | "supplier" | "product" | "process" | "policy";

export type MemorySourceInput = {
    source_domain: "decision_intelligence" | "governance" | "experimentation" | "orchestration" | "growth_portfolio" | "audit";
    source_kind: string;
    source_id?: string | null;
    source_route?: string | null;
    source_version?: string | null;
    evidence_role?: "primary" | "supporting" | "contradicting" | "outcome";
    evidence_snapshot?: Record<string, unknown>;
    freshness_at: string;
};

export type CreateMemoryInput = {
    memory_class: MemoryClass;
    subject_scope: MemorySubjectScope;
    subject_key?: string | null;
    title: string;
    context?: Record<string, unknown>;
    observed_signals?: unknown[];
    decision?: string | null;
    reason?: string | null;
    alternatives_rejected?: unknown[];
    actor_snapshot?: Record<string, unknown>;
    approval_references?: unknown[];
    action_snapshot?: Record<string, unknown>;
    outcome_snapshot?: Record<string, unknown>;
    lesson: string;
    confidence: number;
    strength: number;
    sensitivity?: MemorySensitivity;
    retention_class?: "short" | "standard" | "extended" | "legal_hold";
    minimum_role?: "admin" | "agent";
    relevant_from?: string;
    expires_at?: string | null;
    sources: MemorySourceInput[];
};

export type RetrieveMemoryInput = {
    query: string;
    purpose: string;
    requester_kind: "human" | "agent" | "system";
    requester_id?: string | null;
    clearance?: MemorySensitivity;
    memory_classes?: MemoryClass[];
    subject_scope?: MemorySubjectScope;
    subject_key?: string;
    min_confidence?: number;
    limit?: number;
};

const tenantId = () => Number(currentTenantId());
const sensitivityRank: Record<MemorySensitivity, number> = { internal: 0, restricted: 1, confidential: 2 };

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function json<T>(value: T | string | null | undefined, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function assertPrivacyBoundary(input: CreateMemoryInput) {
    if (!input.sources.length) {
        throw new Exception("Merchant memory requires at least one source-linked evidence reference", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REQUIRED",
        });
    }
    if (input.subject_key?.toLowerCase().startsWith("customer:")) {
        throw new Exception("Raw customer-level memory is forbidden; store an aggregated or segment-level learned fact", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RAW_CUSTOMER_FORBIDDEN",
        });
    }
    if (input.subject_scope === "segment" && !input.subject_key) {
        throw new Exception("Segment memory requires a stable segment subject key", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SUBJECT_REQUIRED",
        });
    }
    const relevant = DateTime.fromISO(input.relevant_from ?? DateTime.utc().toISO());
    const expires = input.expires_at ? DateTime.fromISO(input.expires_at) : null;
    if (!relevant.isValid || (expires && (!expires.isValid || expires <= relevant))) {
        throw new Exception("Memory relevance and expiry timestamps are invalid", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EXPIRY_INVALID",
        });
    }
}

async function requireMemory(publicId: string) {
    const row = await currentTrx()
        .from("merchant_memories")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!row) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    return row;
}

async function sourcesFor(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_sources")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("freshness_at", "desc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) {
        const id = Number(row.memory_id);
        grouped.set(id, [...(grouped.get(id) ?? []), { ...row, evidence_snapshot: json(row.evidence_snapshot, {}) }]);
    }
    return grouped;
}

export async function createMemory(input: CreateMemoryInput, actor: User) {
    assertPrivacyBoundary(input);
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const relevantFrom = DateTime.fromISO(input.relevant_from ?? DateTime.utc().toISO()).toUTC().toSQL();
    const expiresAt = input.expires_at ? DateTime.fromISO(input.expires_at).toUTC().toSQL() : null;
    const rows = await trx
        .table("merchant_memories")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            memory_class: input.memory_class,
            subject_scope: input.subject_scope,
            subject_key: input.subject_key ?? null,
            title: input.title,
            context: JSON.stringify(input.context ?? {}),
            observed_signals: JSON.stringify(input.observed_signals ?? []),
            decision: input.decision ?? null,
            reason: input.reason ?? null,
            alternatives_rejected: JSON.stringify(input.alternatives_rejected ?? []),
            actor_snapshot: JSON.stringify(input.actor_snapshot ?? { user_id: Number(actor.id) }),
            approval_references: JSON.stringify(input.approval_references ?? []),
            action_snapshot: JSON.stringify(input.action_snapshot ?? {}),
            outcome_snapshot: JSON.stringify(input.outcome_snapshot ?? {}),
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.strength,
            sensitivity: input.sensitivity ?? "internal",
            retention_class: input.retention_class ?? "standard",
            minimum_role: input.minimum_role ?? "admin",
            relevant_from: relevantFrom,
            expires_at: expiresAt,
            last_confirmed_at: now,
            status: "active",
            version: 1,
            created_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    const memory = rows[0];
    for (const source of input.sources) {
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            source_domain: source.source_domain,
            source_kind: source.source_kind,
            source_id: source.source_id ?? null,
            source_route: source.source_route ?? null,
            source_version: source.source_version ?? null,
            evidence_role: source.evidence_role ?? "supporting",
            content_hash: hash(source.evidence_snapshot ?? {}),
            evidence_snapshot: JSON.stringify(source.evidence_snapshot ?? {}),
            freshness_at: DateTime.fromISO(source.freshness_at).toUTC().toSQL(),
            created_at: now,
        });
    }
    return memoryDetail(memory.public_id);
}

export async function memoryDetail(publicId: string) {
    const memory = await requireMemory(publicId);
    const sources = await currentTrx()
        .from("merchant_memory_sources")
        .where({ tenant_id: tenantId(), memory_id: memory.id })
        .orderBy("freshness_at", "desc");
    const predecessors = await currentTrx()
        .from("merchant_memory_lineage as l")
        .join("merchant_memories as p", "p.id", "l.predecessor_memory_id")
        .where({ "l.tenant_id": tenantId(), "l.memory_id": memory.id })
        .select("l.relationship", "l.reason_kind", "l.reason", "p.public_id", "p.title", "p.status");
    const successors = await currentTrx()
        .from("merchant_memory_lineage as l")
        .join("merchant_memories as m", "m.id", "l.memory_id")
        .where({ "l.tenant_id": tenantId(), "l.predecessor_memory_id": memory.id })
        .select("l.relationship", "l.reason_kind", "l.reason", "m.public_id", "m.title", "m.status");
    return { ...memory, sources, lineage: { predecessors, successors } };
}

export async function listMemories(filters: {
    memory_class?: MemoryClass;
    status?: "active" | "superseded" | "expired" | "revoked";
    subject_scope?: MemorySubjectScope;
    subject_key?: string;
    limit?: number;
} = {}) {
    const query = currentTrx().from("merchant_memories").where("tenant_id", tenantId());
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.status) query.where("status", filters.status);
    if (filters.subject_scope) query.where("subject_scope", filters.subject_scope);
    if (filters.subject_key) query.where("subject_key", filters.subject_key);
    return query.orderBy("relevant_from", "desc").limit(Math.min(200, Math.max(1, filters.limit ?? 100)));
}

export async function retrieveMemories(input: RetrieveMemoryInput) {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const clearance = input.clearance ?? "internal";
    const limit = Math.min(50, Math.max(1, input.limit ?? 12));
    const base = trx.from("merchant_memories").where({ tenant_id: tenantId(), status: "active" });
    const expired = await base.clone().whereNotNull("expires_at").where("expires_at", "<=", now).count("* as c").first();
    const superseded = await trx
        .from("merchant_memories")
        .where({ tenant_id: tenantId(), status: "superseded" })
        .count("* as c")
        .first();
    const query = base
        .clone()
        .where((builder) => builder.whereNull("expires_at").orWhere("expires_at", ">", now))
        .whereExists(
            trx
                .from("merchant_memory_sources")
                .select(trx.raw("1"))
                .whereRaw("merchant_memory_sources.memory_id = merchant_memories.id")
                .whereRaw("merchant_memory_sources.tenant_id = merchant_memories.tenant_id"),
        );
    if (input.memory_classes?.length) query.whereIn("memory_class", input.memory_classes);
    if (input.subject_scope) query.where("subject_scope", input.subject_scope);
    if (input.subject_key) query.where("subject_key", input.subject_key);
    if (input.min_confidence != null) query.where("confidence", ">=", input.min_confidence);
    if (input.requester_kind === "agent") query.where("minimum_role", "agent");
    const allowedSensitivities = (Object.keys(sensitivityRank) as MemorySensitivity[]).filter(
        (sensitivity) => sensitivityRank[sensitivity] <= sensitivityRank[clearance],
    );
    const permissionFiltered = await query
        .clone()
        .whereNotIn("sensitivity", allowedSensitivities)
        .count("* as c")
        .first();
    query.whereIn("sensitivity", allowedSensitivities);
    const tokens = input.query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 2)
        .slice(0, 8);
    if (tokens.length) {
        query.where((builder) => {
            for (const token of tokens) {
                builder.orWhereILike("title", `%${token}%`).orWhereILike("lesson", `%${token}%`);
            }
        });
    }
    const rows = await query.orderBy("strength", "desc").orderBy("confidence", "desc").orderBy("relevant_from", "desc").limit(limit);
    const groupedSources = await sourcesFor(rows.map((row) => Number(row.id)));
    const eventRows = await trx
        .table("merchant_memory_retrieval_events")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            requester_kind: input.requester_kind,
            requester_id: input.requester_id ?? null,
            purpose: input.purpose,
            query_hash: hash({ query: input.query.trim().toLowerCase(), filters: input, engine: MERCHANT_MEMORY_VERSION }),
            query_features: JSON.stringify({
                memory_classes: input.memory_classes ?? [],
                subject_scope: input.subject_scope ?? null,
                subject_key: input.subject_key ?? null,
                min_confidence: input.min_confidence ?? null,
                engine_version: MERCHANT_MEMORY_VERSION,
            }),
            retrieved_memory_ids: JSON.stringify(rows.map((row) => Number(row.id))),
            result_count: rows.length,
            expired_filtered_count: Number(expired?.c ?? 0),
            permission_filtered_count: Number(permissionFiltered?.c ?? 0),
            superseded_filtered_count: Number(superseded?.c ?? 0),
            created_at: now,
        })
        .returning("*");
    return {
        retrieval_event_id: eventRows[0].public_id,
        engine_version: MERCHANT_MEMORY_VERSION,
        memories: rows.map((row) => ({ ...row, sources: groupedSources.get(Number(row.id)) ?? [] })),
    };
}

export async function supersedeMemory(
    predecessorPublicId: string,
    input: CreateMemoryInput & { reason_kind: "new_evidence" | "market_change" | "policy_change" | "correction" | "expiry_refresh"; supersession_reason: string },
    actor: User,
) {
    const predecessor = await requireMemory(predecessorPublicId);
    if (predecessor.status !== "active") {
        throw new Exception("Only active merchant memory may be superseded", {
            status: 409,
            code: "E_MERCHANT_MEMORY_NOT_ACTIVE",
        });
    }
    if (predecessor.memory_class !== input.memory_class || predecessor.subject_scope !== input.subject_scope) {
        throw new Exception("Superseding memory must preserve class and subject scope lineage", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_MISMATCH",
        });
    }
    const next = await createMemory(input, actor);
    const successor = await requireMemory(next.public_id);
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .table("merchant_memory_lineage")
        .insert({
            tenant_id: tenantId(),
            memory_id: successor.id,
            predecessor_memory_id: predecessor.id,
            relationship: "supersedes",
            reason_kind: input.reason_kind,
            reason: input.supersession_reason,
            created_at: now,
            created_by_user_id: actor.id,
        });
    await currentTrx()
        .from("merchant_memories")
        .where({ tenant_id: tenantId(), id: predecessor.id })
        .update({ status: "superseded", updated_at: now });
    return memoryDetail(next.public_id);
}

export async function expireDueMemories() {
    const now = DateTime.utc().toSQL();
    const count = await currentTrx()
        .from("merchant_memories")
        .where({ tenant_id: tenantId(), status: "active" })
        .whereNotNull("expires_at")
        .where("expires_at", "<=", now)
        .update({ status: "expired", updated_at: now });
    return { expired: Number(count) };
}

export async function recordRetrievalFeedback(
    retrievalPublicId: string,
    input: {
        feedback_kind: "useful" | "not_useful" | "applied" | "ignored" | "harmful";
        usefulness_score?: number | null;
        repeat_error_prevented?: boolean | null;
        decision_changed?: boolean | null;
        applied_memory_ids?: number[];
        notes?: string | null;
    },
    actor: User,
) {
    const trx = currentTrx();
    const event = await trx
        .from("merchant_memory_retrieval_events")
        .where({ tenant_id: tenantId(), public_id: retrievalPublicId })
        .first();
    if (!event) {
        throw new Exception("Merchant memory retrieval event not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND",
        });
    }
    const retrieved = new Set(json<number[]>(event.retrieved_memory_ids, []).map(Number));
    const applied = [...new Set((input.applied_memory_ids ?? []).map(Number))];
    if (applied.some((id) => !retrieved.has(id))) {
        throw new Exception("Feedback may only reference memories returned by the retrieval event", {
            status: 422,
            code: "E_MERCHANT_MEMORY_FEEDBACK_SCOPE",
        });
    }
    const rows = await trx
        .table("merchant_memory_feedback")
        .insert({
            tenant_id: tenantId(),
            retrieval_event_id: event.id,
            feedback_kind: input.feedback_kind,
            usefulness_score: input.usefulness_score ?? null,
            repeat_error_prevented: input.repeat_error_prevented ?? null,
            decision_changed: input.decision_changed ?? null,
            applied_memory_ids: JSON.stringify(applied),
            notes: input.notes ?? null,
            recorded_by_user_id: actor.id,
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return rows[0];
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const now = DateTime.utc().toSQL();
    const [active, superseded, dueExpiry, retrievals, feedback] = await Promise.all([
        trx.from("merchant_memories").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx.from("merchant_memories").where({ tenant_id: tenant, status: "superseded" }).count("* as c").first(),
        trx
            .from("merchant_memories")
            .where({ tenant_id: tenant, status: "active" })
            .whereNotNull("expires_at")
            .where("expires_at", "<=", now)
            .count("* as c")
            .first(),
        trx.from("merchant_memory_retrieval_events").where("tenant_id", tenant).count("* as c").first(),
        trx
            .from("merchant_memory_feedback")
            .where("tenant_id", tenant)
            .select(
                trx.raw("AVG(usefulness_score) as avg_usefulness"),
                trx.raw("AVG(CASE WHEN repeat_error_prevented = true THEN 1.0 WHEN repeat_error_prevented = false THEN 0.0 END) as repeat_error_prevention_rate"),
            )
            .first(),
    ]);
    return {
        engine_version: MERCHANT_MEMORY_VERSION,
        active_memories: Number(active?.c ?? 0),
        superseded_memories: Number(superseded?.c ?? 0),
        due_expiry: Number(dueExpiry?.c ?? 0),
        retrievals: Number(retrievals?.c ?? 0),
        avg_usefulness: feedback?.avg_usefulness == null ? null : Number(feedback.avg_usefulness),
        repeat_error_prevention_rate:
            feedback?.repeat_error_prevention_rate == null ? null : Number(feedback.repeat_error_prevention_rate),
    };
}
