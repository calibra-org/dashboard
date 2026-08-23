import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.1.0";

export type MerchantMemoryClass =
    | "operational_incident"
    | "supplier_lesson"
    | "campaign_lesson"
    | "pricing_lesson"
    | "customer_segment_behavior"
    | "product_quality"
    | "architecture_process_decision"
    | "policy_precedent";

export type MerchantMemoryEvidenceInput = {
    source_kind: string;
    source_ref: string;
    source_version?: string;
    source_route?: string;
    label: string;
    evidence_role?: "supporting" | "contradicting" | "outcome" | "approval" | "context";
    excerpt?: string;
    metadata?: Record<string, unknown>;
    observed_at?: string;
};

export type CreateMerchantMemoryInput = {
    memory_key: string;
    memory_class: MerchantMemoryClass;
    scope_kind: "merchant" | "supplier" | "campaign" | "pricing" | "customer_segment" | "product" | "process" | "policy";
    scope_key?: string;
    title: string;
    context: string;
    observed_signals?: unknown[];
    decision?: string;
    reason?: string;
    alternatives_rejected?: unknown[];
    actors_and_approvals?: unknown[];
    action?: string;
    outcome?: string;
    lesson: string;
    confidence: number;
    strength: number;
    privacy_level?: "internal" | "restricted" | "aggregated";
    retention_class?: "short" | "standard" | "long" | "legal_hold";
    effective_from?: string;
    expires_at?: string;
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
    governance_ledger: "governance_action_ledger",
    experiment: "experiments",
    experiment_analysis: "experiment_analysis_runs",
    orchestrator_plan: "agent_plans",
    orchestrator_tool_run: "agent_tool_runs",
    orchestrator_outcome: "agent_outcome_hooks",
    growth_portfolio_run: "growth_portfolio_runs",
    growth_portfolio_outcome: "growth_portfolio_outcomes",
};

const tenantId = () => Number(currentTenantId());
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function parseJsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

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

function parseUtc(value: unknown) {
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: "utc" });
    return DateTime.fromISO(String(value), { zone: "utc" });
}

async function assertEvidenceSources(evidence: MerchantMemoryEvidenceInput[]) {
    if (evidence.length === 0) {
        throw new Exception("Merchant memory requires source-linked evidence", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EVIDENCE_REQUIRED",
        });
    }

    const trx = currentTrx();
    for (const source of evidence) {
        const table = SOURCE_TABLES[source.source_kind];
        if (!table) {
            throw new Exception("Unsupported merchant memory evidence source", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_UNSUPPORTED",
            });
        }
        const row = await trx
            .from(table)
            .where("tenant_id", tenantId())
            .where("id", parseSourceId(source.source_ref))
            .first();
        if (!row) {
            throw new Exception("Merchant memory evidence source was not found for this tenant", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
            });
        }
    }
}

function assertPrivacyBoundary(input: CreateMerchantMemoryInput) {
    if (input.memory_class !== "customer_segment_behavior") return;
    if (input.scope_kind !== "customer_segment" || input.privacy_level !== "aggregated") {
        throw new Exception("Customer behavior memory must be an aggregated segment lesson", {
            status: 422,
            code: "E_MERCHANT_MEMORY_CUSTOMER_RAW_FORBIDDEN",
        });
    }
}

async function restrictedAllowed(input: RetrieveMerchantMemoryInput) {
    if (input.include_restricted !== true) return false;
    if (input.principal_type === "human") return true;
    if (input.principal_type === "system") return false;

    const principal = await currentTrx()
        .from("governance_agent_principals")
        .where("tenant_id", tenantId())
        .where("principal_key", input.principal_ref)
        .where("enabled", true)
        .where("kill_switch", false)
        .first();
    if (!principal) return false;
    const classes = Array.isArray(principal.data_access_classes)
        ? principal.data_access_classes.map(String)
        : parseJsonArray(principal.data_access_classes).map(String);
    return classes.includes("*") || classes.includes("restricted") || classes.includes("merchant_memory.restricted");
}

function relevanceScore(row: Record<string, unknown>, tokens: string[]) {
    const body = [row.title, row.context, row.decision, row.reason, row.action, row.outcome, row.lesson, row.scope_key]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
    const tokenMatches = tokens.filter((token) => body.includes(token)).length;
    const lexical = tokens.length === 0 ? 0 : tokenMatches / tokens.length;
    const confidence = Number(row.confidence ?? 0);
    const strength = Number(row.strength ?? 0);
    const validatedAt = parseUtc(row.last_validated_at ?? row.updated_at ?? row.effective_from);
    const ageDays = validatedAt.isValid ? Math.max(0, DateTime.utc().diff(validatedAt, "days").days) : 365;
    const freshness = 1 / (1 + ageDays / 90);
    return lexical * 0.5 + confidence * 0.2 + strength * 0.2 + freshness * 0.1;
}

async function markExpiredMemories() {
    await currentTrx()
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("status", "active")
        .whereNotNull("expires_at")
        .where("expires_at", "<=", new Date())
        .update({ status: "expired", updated_at: new Date() });
}

async function evidenceForMemoryIds(memoryIds: number[]) {
    if (memoryIds.length === 0) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_evidence")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("created_at", "desc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) {
        const key = Number(row.memory_id);
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    return grouped;
}

export async function createMerchantMemory(input: CreateMerchantMemoryInput, actor: User) {
    assertPrivacyBoundary(input);
    await assertEvidenceSources(input.evidence);

    const trx = currentTrx();
    const effective = input.effective_from ? DateTime.fromISO(input.effective_from, { zone: "utc" }) : DateTime.utc();
    const expires = input.expires_at ? DateTime.fromISO(input.expires_at, { zone: "utc" }) : null;
    if (!effective.isValid || (expires && (!expires.isValid || expires < effective))) {
        throw new Exception("Invalid merchant memory effective/expiry window", {
            status: 422,
            code: "E_MERCHANT_MEMORY_TIME_WINDOW_INVALID",
        });
    }

    const latest = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("memory_key", input.memory_key)
        .max("version as version")
        .first();
    const version = Number(latest?.version ?? 0) + 1;
    const [memory] = await trx
        .table("merchant_memories")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            memory_key: input.memory_key,
            memory_class: input.memory_class,
            scope_kind: input.scope_kind,
            scope_key: input.scope_key ?? null,
            title: input.title,
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
            privacy_level: input.privacy_level ?? "internal",
            retention_class: input.retention_class ?? "standard",
            status: "active",
            version,
            effective_from: effective.toJSDate(),
            expires_at: expires?.toJSDate() ?? null,
            last_validated_at: new Date(),
            created_by_user_id: Number(actor.id),
        })
        .returning("*");

    for (const source of input.evidence) {
        await trx.table("merchant_memory_evidence").insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            source_kind: source.source_kind,
            source_ref: source.source_ref,
            source_version: source.source_version ?? null,
            source_route: source.source_route ?? null,
            label: source.label,
            evidence_hash: sha256({
                kind: source.source_kind,
                ref: source.source_ref,
                version: source.source_version ?? null,
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
    await markExpiredMemories();
    const trx = currentTrx();
    const query = trx.from("merchant_memories").where("tenant_id", tenantId()).where("public_id", publicId);
    if (!options.includeInactive) query.where("status", "active");
    if (!options.includeRestricted) query.whereNot("privacy_level", "restricted");
    const memory = await query.first();
    if (!memory) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
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
    await markExpiredMemories();
    const query = currentTrx().from("merchant_memories").where("tenant_id", tenantId());
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.status) query.where("status", filters.status);
    if (filters.scope_kind) query.where("scope_kind", filters.scope_kind);
    if (filters.privacy_level) query.where("privacy_level", filters.privacy_level);
    return query.orderBy("updated_at", "desc").limit(Math.min(100, Math.max(1, filters.limit ?? 50)));
}

export async function retrieveMerchantMemory(input: RetrieveMerchantMemoryInput) {
    await markExpiredMemories();
    const trx = currentTrx();
    const limit = Math.min(20, Math.max(1, input.limit ?? 8));
    const tokens = [...new Set(input.query.toLocaleLowerCase().split(/\s+/).map((value) => value.trim()).filter(Boolean))].slice(0, 24);
    const canReadRestricted = await restrictedAllowed(input);
    const query = trx.from("merchant_memories").where("tenant_id", tenantId()).where("status", "active");
    if (!canReadRestricted) query.whereNot("privacy_level", "restricted");
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
    const results = ranked.map((entry) => ({
        ...entry.row,
        retrieval_score: entry.score,
        evidence: evidence.get(Number(entry.row.id)) ?? [],
    }));

    const filterBase = () => {
        const builder = trx.from("merchant_memories").where("tenant_id", tenantId());
        if (input.classes?.length) builder.whereIn("memory_class", input.classes);
        if (input.scope_kind) builder.where("scope_kind", input.scope_kind);
        if (input.scope_key) builder.where("scope_key", input.scope_key);
        return builder;
    };
    const expiredRow = await filterBase().where("status", "expired").count("id as count").first();
    const supersededRow = await filterBase().where("status", "superseded").count("id as count").first();
    const restrictedRow = canReadRestricted
        ? { count: 0 }
        : await filterBase().where("status", "active").where("privacy_level", "restricted").count("id as count").first();

    const [retrieval] = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            principal_type: input.principal_type,
            principal_ref: input.principal_ref,
            query_hash: sha256(input.query.toLocaleLowerCase()),
            query_tokens: JSON.stringify(tokens.map((token) => sha256(token))),
            filters: JSON.stringify({
                classes: input.classes ?? [],
                scope_kind: input.scope_kind ?? null,
                scope_key: input.scope_key ?? null,
                requested_restricted: input.include_restricted === true,
                restricted_allowed: canReadRestricted,
            }),
            result_memory_ids: JSON.stringify(results.map((row) => row.id)),
            result_count: results.length,
            expired_filtered_count: Number(expiredRow?.count ?? 0),
            permission_filtered_count: Number(restrictedRow?.count ?? 0),
            superseded_filtered_count: Number(supersededRow?.count ?? 0),
            purpose: input.purpose ?? "decision_support",
            retrieved_at: new Date(),
        })
        .returning("*");

    return { retrieval_public_id: retrieval.public_id, restricted_allowed: canReadRestricted, results };
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
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: Number(created.id),
        to_memory_id: predecessor.id,
        relation,
        reason,
        created_by_user_id: Number(actor.id),
    });
    if (relation === "supersedes") {
        await trx
            .from("merchant_memories")
            .where("id", predecessor.id)
            .update({ status: "superseded", superseded_at: new Date(), updated_at: new Date() });
    }
    return getMerchantMemory(created.public_id, { includeRestricted: true, includeInactive: true });
}

export async function recordMerchantMemoryFeedback(
    retrievalPublicId: string,
    memoryPublicId: string,
    input: {
        feedback: "useful" | "irrelevant" | "applied" | "incorrect";
        usefulness_score?: number;
        prevented_repeat_error?: boolean;
        outcome_delta?: number;
        note?: string;
    },
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
    const retrievedIds = new Set(parseJsonArray(retrieval.result_memory_ids).map(Number));
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
            usefulness_score: input.usefulness_score ?? null,
            prevented_repeat_error: input.prevented_repeat_error ?? null,
            outcome_delta: input.outcome_delta ?? null,
            note: input.note ?? null,
            actor_user_id: Number(actor.id),
        })
        .onConflict(["tenant_id", "retrieval_id", "memory_id"])
        .merge(["feedback", "usefulness_score", "prevented_repeat_error", "outcome_delta", "note", "actor_user_id"]);
    return { recorded: true };
}

export async function merchantMemoryOverview() {
    await markExpiredMemories();
    const trx = currentTrx();
    const memories = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .select("memory_class", "status")
        .count("id as count")
        .groupBy("memory_class", "status");
    const feedback = await trx
        .from("merchant_memory_feedback")
        .where("tenant_id", tenantId())
        .select("feedback")
        .count("id as count")
        .groupBy("feedback");
    const repeats = await trx
        .from("merchant_memory_feedback")
        .where("tenant_id", tenantId())
        .where("prevented_repeat_error", true)
        .count("id as count")
        .first();
    const retrievals = await trx
        .from("merchant_memory_retrievals")
        .where("tenant_id", tenantId())
        .count("id as count")
        .first();
    return {
        version: MERCHANT_MEMORY_VERSION,
        memories,
        feedback,
        retrieval_count: Number(retrievals?.count ?? 0),
        repeat_errors_prevented: Number(repeats?.count ?? 0),
        generated_at: DateTime.utc().toISO(),
    };
}
