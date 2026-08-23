import { randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export type MerchantMemorySourceInput = {
    source_type: string;
    source_reference: string;
    source_uri?: string | null;
    evidence_hash?: string | null;
    evidence_role?: "supporting" | "contradicting" | "outcome" | "approval" | "policy";
    evidence_snapshot?: Record<string, unknown>;
    observed_at?: string | null;
};

export type MerchantMemoryInput = {
    memory_class:
        | "operational_incident"
        | "supplier_lesson"
        | "campaign_lesson"
        | "pricing_lesson"
        | "customer_segment_behavior"
        | "product_quality"
        | "architecture_process_decision"
        | "policy_precedent";
    title: string;
    context: string;
    observed_signals?: unknown[];
    decision: string;
    reason: string;
    alternatives_rejected?: unknown[];
    actors_approvals?: unknown[];
    action?: string | null;
    outcome?: string | null;
    lesson: string;
    confidence: number;
    strength: number;
    visibility_scope?: "admin_only" | "admin_agent";
    sensitivity_level?: "internal" | "restricted" | "sensitive";
    aggregation_level?: "aggregate" | "cohort" | "record_level";
    effective_from?: string;
    expires_at?: string | null;
    sources: MerchantMemorySourceInput[];
};

export type MerchantMemoryRetrievalInput = {
    query_text: string;
    memory_classes?: string[];
    limit?: number;
    requester_type: "human" | "agent" | "system";
    requester_reference?: string | null;
};

const tenantId = () => Number(currentTenantId());

function ensureEvidence(input: MerchantMemoryInput) {
    if (!input.sources.length) {
        throw new Exception("Merchant memory must have at least one source or evidence reference", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REQUIRED",
        });
    }
    if (input.sensitivity_level === "sensitive" && input.aggregation_level === "record_level") {
        throw new Exception("Sensitive record-level memory is not allowed; store an aggregate or cohort lesson instead", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SENSITIVE_RAW_FORBIDDEN",
        });
    }
}

async function memoryByPublicId(publicId: string) {
    const row = await currentTrx()
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .first();
    if (!row) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    return row;
}

async function insertSources(memoryId: number, sources: MerchantMemorySourceInput[]) {
    const trx = currentTrx();
    for (const source of sources) {
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memoryId,
            source_type: source.source_type,
            source_reference: source.source_reference,
            source_uri: source.source_uri ?? null,
            evidence_hash: source.evidence_hash ?? null,
            evidence_role: source.evidence_role ?? "supporting",
            evidence_snapshot: JSON.stringify(source.evidence_snapshot ?? {}),
            observed_at: source.observed_at ? DateTime.fromISO(source.observed_at).toSQL() : null,
        });
    }
}

export async function overview() {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const [active, superseded, expired, retrievals, usefulness] = await Promise.all([
        trx.from("merchant_memories").where("tenant_id", tenantId()).where("status", "active").where((query) => {
            query.whereNull("expires_at").orWhere("expires_at", ">", now);
        }).count("id as count").first(),
        trx.from("merchant_memories").where("tenant_id", tenantId()).where("status", "superseded").count("id as count").first(),
        trx.from("merchant_memories").where("tenant_id", tenantId()).where((query) => {
            query.where("status", "expired").orWhere("expires_at", "<=", now);
        }).count("id as count").first(),
        trx.from("merchant_memory_retrievals").where("tenant_id", tenantId()).count("id as count").first(),
        trx.from("merchant_memory_effectiveness").where("tenant_id", tenantId()).avg("usefulness_score as score").first(),
    ]);
    return {
        active: Number(active?.count ?? 0),
        superseded: Number(superseded?.count ?? 0),
        expired: Number(expired?.count ?? 0),
        retrievals: Number(retrievals?.count ?? 0),
        average_usefulness: usefulness?.score == null ? null : Number(usefulness.score),
    };
}

export async function listMemories() {
    return currentTrx()
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .orderBy("updated_at", "desc")
        .limit(200);
}

export async function getMemory(publicId: string) {
    const memory = await memoryByPublicId(publicId);
    const trx = currentTrx();
    const [sources, predecessors, successors, effectiveness] = await Promise.all([
        trx.from("merchant_memory_sources").where("tenant_id", tenantId()).where("memory_id", memory.id).orderBy("id", "asc"),
        trx
            .from("merchant_memory_lineage as l")
            .join("merchant_memories as m", "m.id", "l.predecessor_memory_id")
            .where("l.tenant_id", tenantId())
            .where("l.successor_memory_id", memory.id)
            .select("m.public_id", "m.title", "l.relation", "l.reason", "l.created_at"),
        trx
            .from("merchant_memory_lineage as l")
            .join("merchant_memories as m", "m.id", "l.successor_memory_id")
            .where("l.tenant_id", tenantId())
            .where("l.predecessor_memory_id", memory.id)
            .select("m.public_id", "m.title", "l.relation", "l.reason", "l.created_at"),
        trx.from("merchant_memory_effectiveness").where("tenant_id", tenantId()).where("memory_id", memory.id).orderBy("measured_at", "desc"),
    ]);
    return { ...memory, sources, lineage: { predecessors, successors }, effectiveness };
}

export async function createMemory(input: MerchantMemoryInput, actor: User) {
    ensureEvidence(input);
    const trx = currentTrx();
    const publicId = randomUUID();
    const [memory] = await trx
        .table("merchant_memories")
        .insert({
            public_id: publicId,
            tenant_id: tenantId(),
            memory_class: input.memory_class,
            title: input.title,
            context: input.context,
            observed_signals: JSON.stringify(input.observed_signals ?? []),
            decision: input.decision,
            reason: input.reason,
            alternatives_rejected: JSON.stringify(input.alternatives_rejected ?? []),
            actors_approvals: JSON.stringify(input.actors_approvals ?? []),
            action: input.action ?? null,
            outcome: input.outcome ?? null,
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.strength,
            visibility_scope: input.visibility_scope ?? "admin_agent",
            sensitivity_level: input.sensitivity_level ?? "internal",
            aggregation_level: input.aggregation_level ?? "aggregate",
            effective_from: input.effective_from ? DateTime.fromISO(input.effective_from).toSQL() : DateTime.utc().toSQL(),
            expires_at: input.expires_at ? DateTime.fromISO(input.expires_at).toSQL() : null,
            created_by_user_id: Number(actor.id),
        })
        .returning(["id", "public_id"]);
    await insertSources(Number(memory.id), input.sources);
    return getMemory(memory.public_id);
}

export async function supersedeMemory(publicId: string, input: MerchantMemoryInput & { lineage_reason: string }, actor: User) {
    const predecessor = await memoryByPublicId(publicId);
    if (predecessor.status !== "active") {
        throw new Exception("Only active memory can be superseded", {
            status: 409,
            code: "E_MERCHANT_MEMORY_NOT_ACTIVE",
        });
    }
    const successor = await createMemory(input, actor);
    const trx = currentTrx();
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        predecessor_memory_id: predecessor.id,
        successor_memory_id: successor.id,
        relation: "supersedes",
        reason: input.lineage_reason,
        created_by_user_id: Number(actor.id),
    });
    await trx.from("merchant_memories").where("id", predecessor.id).update({ status: "superseded", updated_at: DateTime.utc().toSQL() });
    return getMemory(successor.public_id);
}

export async function retrieve(input: MerchantMemoryRetrievalInput) {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const base = trx
        .from("merchant_memories as m")
        .where("m.tenant_id", tenantId())
        .where("m.status", "active")
        .where((query) => query.whereNull("m.expires_at").orWhere("m.expires_at", ">", now))
        .whereExists((query) => {
            query.select(trx.raw("1")).from("merchant_memory_sources as s").whereRaw("s.memory_id = m.id").where("s.tenant_id", tenantId());
        });

    if (input.requester_type !== "human") {
        base.where("m.visibility_scope", "admin_agent").whereNot("m.sensitivity_level", "sensitive");
    }
    if (input.memory_classes?.length) base.whereIn("m.memory_class", input.memory_classes);
    const q = input.query_text.trim();
    if (q) {
        base.where((query) => {
            query.whereILike("m.title", `%${q}%`).orWhereILike("m.context", `%${q}%`).orWhereILike("m.lesson", `%${q}%`).orWhereILike("m.reason", `%${q}%`);
        });
    }

    const rows = await base
        .select("m.*")
        .orderBy([{ column: "m.strength", order: "desc" }, { column: "m.confidence", order: "desc" }, { column: "m.updated_at", order: "desc" }])
        .limit(limit);

    const withSources = [];
    for (const memory of rows) {
        const sources = await trx.from("merchant_memory_sources").where("tenant_id", tenantId()).where("memory_id", memory.id).orderBy("id", "asc");
        withSources.push({ ...memory, sources });
    }

    const [retrieval] = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            requester_type: input.requester_type,
            requester_reference: input.requester_reference ?? null,
            query_text: input.query_text,
            filters: JSON.stringify({ memory_classes: input.memory_classes ?? [] }),
            returned_memory_ids: JSON.stringify(rows.map((row) => row.id)),
            result_count: rows.length,
            source_linked_count: withSources.filter((row) => row.sources.length > 0).length,
            expired_excluded_count: 0,
            superseded_excluded_count: 0,
            permission_excluded_count: 0,
            retrieved_at: DateTime.utc().toSQL(),
        })
        .returning(["id", "public_id"]);

    return { retrieval_public_id: retrieval.public_id, memories: withSources };
}

export async function recordEffectiveness(
    publicId: string,
    input: {
        retrieval_public_id?: string | null;
        effect_kind: "useful" | "not_useful" | "prevented_repeat_error" | "decision_influenced" | "outcome_supported";
        usefulness_score?: number | null;
        decision_reference?: string | null;
        outcome_reference?: string | null;
        notes?: string | null;
    },
    actor: User,
) {
    const memory = await memoryByPublicId(publicId);
    let retrievalId: number | null = null;
    if (input.retrieval_public_id) {
        const retrieval = await currentTrx()
            .from("merchant_memory_retrievals")
            .where("tenant_id", tenantId())
            .where("public_id", input.retrieval_public_id)
            .first();
        if (!retrieval) throw new Exception("Memory retrieval not found", { status: 404, code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND" });
        retrievalId = Number(retrieval.id);
    }
    const [row] = await currentTrx()
        .table("merchant_memory_effectiveness")
        .insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            retrieval_id: retrievalId,
            effect_kind: input.effect_kind,
            usefulness_score: input.usefulness_score ?? null,
            decision_reference: input.decision_reference ?? null,
            outcome_reference: input.outcome_reference ?? null,
            notes: input.notes ?? null,
            measured_at: DateTime.utc().toSQL(),
            recorded_by_user_id: Number(actor.id),
        })
        .returning("id");
    return { id: row.id };
}
