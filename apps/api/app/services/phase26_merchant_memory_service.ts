import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.0.0";

export type MerchantMemoryClass =
    | "operational_incident"
    | "supplier_lesson"
    | "campaign_lesson"
    | "pricing_lesson"
    | "customer_segment_behavior"
    | "product_quality"
    | "architecture_process"
    | "policy_precedent";

export type MerchantMemoryEvidenceInput = {
    source_kind: string;
    source_ref: string;
    source_version?: string | null;
    evidence_role?: "supporting" | "contradicting" | "outcome" | "approval" | "context";
    excerpt?: string | null;
    metadata?: Record<string, unknown>;
    observed_at?: string | null;
};

export type CreateMerchantMemoryInput = {
    memory_class: MerchantMemoryClass;
    scope_kind: "merchant" | "supplier" | "campaign" | "pricing" | "customer_segment" | "product" | "architecture" | "policy";
    scope_key?: string | null;
    context: string;
    observed_signals?: unknown[];
    decision?: string | null;
    reason?: string | null;
    alternatives_rejected?: unknown[];
    actors_and_approvals?: unknown[];
    action?: string | null;
    outcome?: string | null;
    lesson: string;
    confidence: number;
    strength: number;
    privacy_level: "internal" | "restricted" | "aggregated";
    retention_class: "short" | "standard" | "long" | "legal_hold";
    effective_from: string;
    expires_at?: string | null;
    evidence: MerchantMemoryEvidenceInput[];
};

export type RetrieveMerchantMemoryInput = {
    query: string;
    principal_type: "human" | "agent" | "system";
    principal_ref: string;
    classes?: MerchantMemoryClass[];
    scope_kind?: string;
    scope_key?: string;
    include_restricted?: boolean;
    limit?: number;
    purpose?: string;
};

const SOURCE_TABLES: Record<string, string> = {
    intelligence_case: "intelligence_cases",
    intelligence_decision: "intelligence_decisions",
    intelligence_action: "intelligence_action_records",
    intelligence_outcome: "intelligence_outcome_records",
    governance_policy: "governance_policy_versions",
    governance_approval: "governance_approval_requests",
    experiment: "experiments",
    experiment_analysis: "experiment_analysis_runs",
    orchestrator_plan: "agent_plans",
    orchestrator_tool_run: "agent_tool_runs",
    orchestrator_outcome: "agent_outcome_hooks",
    growth_portfolio_run: "growth_portfolio_runs",
    growth_portfolio_outcome: "growth_portfolio_outcomes",
};

const tenantId = () => Number(currentTenantId());
const nowIso = () => DateTime.utc().toISO();
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function parseSourceId(sourceRef: string) {
    const value = Number(sourceRef);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Exception("Evidence source_ref must identify an authoritative numeric source record", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REF_INVALID",
        });
    }
    return value;
}

async function assertEvidenceSources(evidence: MerchantMemoryEvidenceInput[]) {
    if (evidence.length === 0) {
        throw new Exception("Merchant memory requires at least one source-linked evidence record", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EVIDENCE_REQUIRED",
        });
    }

    const trx = currentTrx();
    const tenant = tenantId();
    for (const source of evidence) {
        const table = SOURCE_TABLES[source.source_kind];
        if (!table) {
            throw new Exception("Unsupported merchant memory evidence source", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_UNSUPPORTED",
            });
        }
        const sourceId = parseSourceId(source.source_ref);
        const row = await trx.from(table).where("tenant_id", tenant).where("id", sourceId).first();
        if (!row) {
            throw new Exception("Merchant memory evidence source was not found for this tenant", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
            });
        }
    }
}

function assertPrivacyBoundary(input: CreateMerchantMemoryInput) {
    if (input.memory_class === "customer_segment_behavior" && input.scope_kind !== "customer_segment") {
        throw new Exception("Customer behavior memory must be aggregated to a segment scope", {
            status: 422,
            code: "E_MERCHANT_MEMORY_CUSTOMER_RAW_FORBIDDEN",
        });
    }
    if (input.memory_class === "customer_segment_behavior" && input.privacy_level !== "aggregated") {
        throw new Exception("Customer behavior memory must use aggregated privacy level", {
            status: 422,
            code: "E_MERCHANT_MEMORY_CUSTOMER_AGGREGATION_REQUIRED",
        });
    }
}

function relevanceScore(row: Record<string, unknown>, tokens: string[]) {
    const body = [row.context, row.decision, row.reason, row.action, row.outcome, row.lesson, row.scope_key]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
    const tokenMatches = tokens.filter((token) => body.includes(token)).length;
    const lexical = tokens.length === 0 ? 0 : tokenMatches / tokens.length;
    const confidence = Number(row.confidence ?? 0);
    const strength = Number(row.strength ?? 0);
    const validatedAt = DateTime.fromJSDate(new Date(String(row.last_validated_at ?? row.updated_at ?? row.effective_from)));
    const ageDays = Math.max(0, DateTime.utc().diff(validatedAt, "days").days);
    const freshness = 1 / (1 + ageDays / 90);
    return lexical * 0.5 + confidence * 0.2 + strength * 0.2 + freshness * 0.1;
}

async function evidenceForMemoryIds(memoryIds: number[]) {
    if (memoryIds.length === 0) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_evidence")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("created_at", "desc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) grouped.set(Number(row.memory_id), [...(grouped.get(Number(row.memory_id)) ?? []), row]);
    return grouped;
}

export async function createMerchantMemory(input: CreateMerchantMemoryInput, actor: User) {
    assertPrivacyBoundary(input);
    await assertEvidenceSources(input.evidence);

    const trx = currentTrx();
    const tenant = tenantId();
    const effective = DateTime.fromISO(input.effective_from, { zone: "utc" });
    const expires = input.expires_at ? DateTime.fromISO(input.expires_at, { zone: "utc" }) : null;
    if (!effective.isValid || (expires && (!expires.isValid || expires <= effective))) {
        throw new Exception("Invalid merchant memory effective/expiry window", {
            status: 422,
            code: "E_MERCHANT_MEMORY_TIME_WINDOW_INVALID",
        });
    }

    const [memory] = await trx
        .table("merchant_memories")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            memory_class: input.memory_class,
            scope_kind: input.scope_kind,
            scope_key: input.scope_key ?? null,
            context: input.context,
            observed_signals: JSON.stringify(input.observed_signals ?? []),
            decision: input.decision ?? null,
            reason: input.reason ?? null,
            alternatives_rejected: JSON.stringify(input.alternatives_rejected ?? []),
            actors_and_approvals: JSON.stringify(input.actors_and_approvals ?? []),
            action: input.action ?? null,
            outcome: input.outcome ?? null,
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.strength,
            privacy_level: input.privacy_level,
            retention_class: input.retention_class,
            status: "active",
            version: 1,
            effective_from: effective.toJSDate(),
            expires_at: expires?.toJSDate() ?? null,
            last_validated_at: new Date(),
            created_by_user_id: Number(actor.id),
        })
        .returning("*");

    for (const source of input.evidence) {
        await trx.table("merchant_memory_evidence").insert({
            tenant_id: tenant,
            memory_id: memory.id,
            source_kind: source.source_kind,
            source_ref: source.source_ref,
            source_version: source.source_version ?? null,
            evidence_hash: hash({
                source_kind: source.source_kind,
                source_ref: source.source_ref,
                source_version: source.source_version ?? null,
                metadata: source.metadata ?? {},
            }),
            evidence_role: source.evidence_role ?? "supporting",
            excerpt: source.excerpt ?? null,
            metadata: JSON.stringify(source.metadata ?? {}),
            observed_at: source.observed_at ? DateTime.fromISO(source.observed_at, { zone: "utc" }).toJSDate() : null,
        });
    }

    return getMerchantMemory(memory.public_id, { includeRestricted: true, includeInactive: true });
}

export async function getMerchantMemory(
    publicId: string,
    options: { includeRestricted?: boolean; includeInactive?: boolean } = {},
) {
    const trx = currentTrx();
    const query = trx.from("merchant_memories").where("tenant_id", tenantId()).where("public_id", publicId);
    if (!options.includeInactive) query.where("status", "active");
    if (!options.includeRestricted) query.whereNot("privacy_level", "restricted");
    const memory = await query.first();
    if (!memory) {
        throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    const evidence = await trx
        .from("merchant_memory_evidence")
        .where("tenant_id", tenantId())
        .where("memory_id", memory.id)
        .orderBy("created_at", "desc");
    const lineage = await trx
        .from("merchant_memory_lineage")
        .where("tenant_id", tenantId())
        .where((builder) => builder.where("from_memory_id", memory.id).orWhere("to_memory_id", memory.id))
        .orderBy("created_at", "desc");
    return { ...memory, evidence, lineage };
}

export async function listMerchantMemories(filters: {
    memory_class?: string;
    status?: string;
    scope_kind?: string;
    privacy_level?: string;
    limit?: number;
}) {
    const query = currentTrx().from("merchant_memories").where("tenant_id", tenantId());
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.status) query.where("status", filters.status);
    if (filters.scope_kind) query.where("scope_kind", filters.scope_kind);
    if (filters.privacy_level) query.where("privacy_level", filters.privacy_level);
    return query.orderBy("updated_at", "desc").limit(Math.min(100, Math.max(1, filters.limit ?? 50)));
}

export async function retrieveMerchantMemory(input: RetrieveMerchantMemoryInput) {
    const trx = currentTrx();
    const tenant = tenantId();
    const limit = Math.min(20, Math.max(1, input.limit ?? 8));
    const tokens = [...new Set(input.query.toLocaleLowerCase().split(/\s+/).map((value) => value.trim()).filter(Boolean))].slice(0, 24);
    const query = trx
        .from("merchant_memories")
        .where("tenant_id", tenant)
        .where("status", "active")
        .where((builder) => builder.whereNull("expires_at").orWhere("expires_at", ">", new Date()));
    if (!input.include_restricted) query.whereNot("privacy_level", "restricted");
    if (input.classes?.length) query.whereIn("memory_class", input.classes);
    if (input.scope_kind) query.where("scope_kind", input.scope_kind);
    if (input.scope_key) query.where("scope_key", input.scope_key);
    const rows = await query.orderBy("updated_at", "desc").limit(250);
    const ranked = rows
        .map((row) => ({ row, score: relevanceScore(row, tokens) }))
        .filter((entry) => tokens.length === 0 || entry.score > 0.09)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    const evidence = await evidenceForMemoryIds(ranked.map((entry) => Number(entry.row.id)));
    const result = ranked.map((entry) => ({
        ...entry.row,
        retrieval_score: entry.score,
        evidence: evidence.get(Number(entry.row.id)) ?? [],
    }));

    const [retrieval] = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            principal_type: input.principal_type,
            principal_ref: input.principal_ref,
            query_hash: hash({ query: input.query.toLocaleLowerCase(), classes: input.classes ?? [], scope: input.scope_key ?? null }),
            query_text: null,
            filters: JSON.stringify({
                classes: input.classes ?? [],
                scope_kind: input.scope_kind ?? null,
                scope_key: input.scope_key ?? null,
                include_restricted: input.include_restricted === true,
            }),
            result_memory_ids: JSON.stringify(result.map((row) => row.id)),
            result_count: result.length,
            purpose: input.purpose ?? "decision_support",
            retrieved_at: new Date(),
        })
        .returning("*");

    return { retrieval_public_id: retrieval.public_id, results: result };
}

export async function supersedeMerchantMemory(
    predecessorPublicId: string,
    replacement: CreateMerchantMemoryInput,
    relation: "supersedes" | "contradicts" | "refines" | "supports",
    reason: string,
    actor: User,
) {
    const trx = currentTrx();
    const predecessor = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("public_id", predecessorPublicId)
        .where("status", "active")
        .first();
    if (!predecessor) {
        throw new Exception("Active predecessor merchant memory not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_PREDECESSOR_NOT_FOUND",
        });
    }
    const created = await createMerchantMemory(replacement, actor);
    const successorId = Number(created.id);
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: successorId,
        to_memory_id: predecessor.id,
        relation,
        reason,
        created_by_user_id: Number(actor.id),
    });
    if (relation === "supersedes") {
        await trx
            .from("merchant_memories")
            .where("id", predecessor.id)
            .update({ status: "superseded", superseded_at: new Date() });
    }
    return getMerchantMemory(created.public_id, { includeRestricted: true, includeInactive: true });
}

export async function recordMerchantMemoryFeedback(
    retrievalPublicId: string,
    memoryPublicId: string,
    input: { feedback: "useful" | "irrelevant" | "applied" | "incorrect"; prevented_repeat_error?: boolean | null; outcome_delta?: number | null; note?: string | null },
    actor: User,
) {
    const trx = currentTrx();
    const retrieval = await trx
        .from("merchant_memory_retrievals")
        .where("tenant_id", tenantId())
        .where("public_id", retrievalPublicId)
        .first();
    const memory = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("public_id", memoryPublicId)
        .first();
    if (!retrieval || !memory) {
        throw new Exception("Merchant memory retrieval or memory not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_FEEDBACK_TARGET_NOT_FOUND",
        });
    }
    const retrievedIds = new Set((Array.isArray(retrieval.result_memory_ids) ? retrieval.result_memory_ids : JSON.parse(retrieval.result_memory_ids ?? "[]")).map(Number));
    if (!retrievedIds.has(Number(memory.id))) {
        throw new Exception("Feedback memory was not part of this retrieval", {
            status: 422,
            code: "E_MERCHANT_MEMORY_FEEDBACK_NOT_RETRIEVED",
        });
    }
    await trx
        .table("merchant_memory_feedback")
        .insert({
            tenant_id: tenantId(),
            retrieval_id: retrieval.id,
            memory_id: memory.id,
            feedback: input.feedback,
            prevented_repeat_error: input.prevented_repeat_error ?? null,
            outcome_delta: input.outcome_delta ?? null,
            note: input.note ?? null,
            actor_user_id: Number(actor.id),
        })
        .onConflict(["tenant_id", "retrieval_id", "memory_id"])
        .merge(["feedback", "prevented_repeat_error", "outcome_delta", "note", "actor_user_id"]);
    return { recorded: true };
}

export async function merchantMemoryOverview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const memories = await trx
        .from("merchant_memories")
        .where("tenant_id", tenant)
        .select("memory_class", "status")
        .count("id as count")
        .groupBy("memory_class", "status");
    const feedback = await trx
        .from("merchant_memory_feedback as f")
        .join("merchant_memory_retrievals as r", "r.id", "f.retrieval_id")
        .where("f.tenant_id", tenant)
        .select("f.feedback")
        .count("f.id as count")
        .groupBy("f.feedback");
    const repeats = await trx
        .from("merchant_memory_feedback")
        .where("tenant_id", tenant)
        .where("prevented_repeat_error", true)
        .count("id as count")
        .first();
    return {
        version: MERCHANT_MEMORY_VERSION,
        memories,
        feedback,
        repeat_errors_prevented: Number(repeats?.count ?? 0),
        generated_at: nowIso(),
    };
}
