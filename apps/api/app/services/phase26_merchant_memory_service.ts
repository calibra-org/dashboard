import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.1.0";

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
export type MemoryConsumer = "human" | "agent";
export type MemorySensitivity = "aggregate" | "internal" | "customer_level_sensitive";
export type SourcePhase = "phase10" | "phase11" | "phase17" | "phase22" | "phase25" | "manual_reviewed";

type MemorySourceInput = {
    source_phase: SourcePhase;
    source_kind: string;
    source_id: string;
    source_route?: string | null;
    source_hash?: string | null;
    label: string;
    evidence_role?: "primary" | "supporting" | "contradicting" | "outcome";
    evidence_summary?: Record<string, unknown>;
    sensitivity?: MemorySensitivity;
    observed_at: string;
};

export type CreateMemoryInput = {
    memory_class: MemoryClass;
    subject_type?: string | null;
    subject_id?: string | null;
    title: string;
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
    sensitivity?: MemorySensitivity;
    retention_class?: "short" | "standard" | "extended" | "legal_hold";
    allowed_consumers?: MemoryConsumer[];
    purposes?: string[];
    relevant_from?: string;
    expires_at?: string | null;
    sources: MemorySourceInput[];
};

export type RetrieveMemoryInput = {
    query: string;
    purpose: string;
    consumer: MemoryConsumer;
    memory_classes?: MemoryClass[];
    subject_type?: string | null;
    subject_id?: string | null;
    min_confidence?: number;
    include_customer_sensitive?: boolean;
    limit?: number;
    request_correlation_id?: string | null;
};

type SourceTarget = { table: string; idColumn?: string };

const SOURCE_TARGETS: Record<string, SourceTarget> = {
    "phase10:case": { table: "intelligence_cases" },
    "phase10:decision": { table: "intelligence_decisions" },
    "phase10:action": { table: "intelligence_action_records" },
    "phase10:outcome": { table: "intelligence_outcome_records" },
    "phase11:policy_version": { table: "governance_policy_versions" },
    "phase11:approval_request": { table: "governance_approval_requests" },
    "phase11:approval_decision": { table: "governance_approval_decisions" },
    "phase11:action_ledger": { table: "governance_action_ledger" },
    "phase17:experiment": { table: "experiments" },
    "phase17:analysis_run": { table: "experiment_analysis_runs" },
    "phase22:plan": { table: "agent_plans" },
    "phase22:tool_run": { table: "agent_tool_runs" },
    "phase22:outcome_hook": { table: "agent_outcome_hooks" },
    "phase25:plan": { table: "growth_portfolio_plans" },
    "phase25:run": { table: "growth_portfolio_runs" },
    "phase25:outcome": { table: "growth_portfolio_outcomes" },
    "phase25:rebalance": { table: "growth_portfolio_rebalance_events" },
};

const tenantId = () => Number(currentTenantId());
const nowSql = () => DateTime.utc().toSQL();

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
    return createHash("sha256")
        .update(JSON.stringify(stable(value)))
        .digest("hex");
}

export function normalizeMerchantMemorySearchTokens(query: string) {
    return [
        ...new Set(
            query
                .normalize("NFKC")
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, " ")
                .split(/\s+/)
                .filter((token) => token.length >= 2),
        ),
    ].slice(0, 8);
}

export function merchantMemoryRetrievalScore(
    row: { title?: unknown; context?: unknown; lesson?: unknown; confidence?: unknown; strength?: unknown },
    tokens: string[],
) {
    const haystack = `${row.title ?? ""} ${row.context ?? ""} ${row.lesson ?? ""}`.normalize("NFKC").toLowerCase();
    const lexicalRatio = tokens.length === 0 ? 1 : tokens.filter((token) => haystack.includes(token)).length / tokens.length;
    const lexical = lexicalRatio * 0.5;
    const confidence = Math.max(0, Math.min(1, Number(row.confidence ?? 0))) * 0.25;
    const strength = Math.max(0, Math.min(1, Number(row.strength ?? 0))) * 0.25;
    return {
        lexical: Number(lexical.toFixed(8)),
        confidence: Number(confidence.toFixed(8)),
        strength: Number(strength.toFixed(8)),
        total: Number((lexical + confidence + strength).toFixed(8)),
    };
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

function asId(value: string) {
    if (!/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseDate(value: string | undefined, fallback: DateTime) {
    const parsed = value ? DateTime.fromISO(value, { setZone: true }) : fallback;
    if (!parsed.isValid) {
        throw new Exception("Merchant memory timestamp is invalid", {
            status: 422,
            code: "E_MERCHANT_MEMORY_TIME_INVALID",
        });
    }
    return parsed.toUTC();
}

function assertPrivacyBoundary(input: CreateMemoryInput) {
    if (!input.sources.length) {
        throw new Exception("Merchant memory requires source-linked evidence", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REQUIRED",
        });
    }
    const sensitivity = input.sensitivity ?? "aggregate";
    const consumers = input.allowed_consumers ?? ["human"];
    const subjectType = input.subject_type?.trim().toLowerCase();
    const relevant = parseDate(input.relevant_from, DateTime.utc());
    const expires = input.expires_at ? parseDate(input.expires_at, DateTime.utc()) : null;
    if (expires && expires <= relevant) {
        throw new Exception("Memory expiry must be after relevance start", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EXPIRY_INVALID",
        });
    }
    if (subjectType === "customer" && sensitivity !== "customer_level_sensitive") {
        throw new Exception("Customer-level memory must be explicitly marked sensitive", {
            status: 422,
            code: "E_MERCHANT_MEMORY_CUSTOMER_SENSITIVITY_REQUIRED",
        });
    }
    if (sensitivity === "customer_level_sensitive") {
        if (consumers.some((consumer) => consumer !== "human")) {
            throw new Exception("Customer-level sensitive memory cannot be exposed to agents", {
                status: 422,
                code: "E_MERCHANT_MEMORY_AGENT_SENSITIVE_FORBIDDEN",
            });
        }
        if ((input.retention_class ?? "standard") !== "short" || !expires || expires.diff(relevant, "days").days > 30) {
            throw new Exception("Customer-level sensitive memory requires short retention and expiry within 30 days", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SENSITIVE_RETENTION_REQUIRED",
            });
        }
    }
}

async function validateSource(source: MemorySourceInput) {
    if (source.source_phase === "manual_reviewed") return;
    const target = SOURCE_TARGETS[`${source.source_phase}:${source.source_kind}`];
    if (!target) {
        throw new Exception("Unsupported merchant memory source authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_UNSUPPORTED",
        });
    }
    const id = asId(source.source_id);
    if (!id) {
        throw new Exception("Canonical merchant memory sources require a numeric source id", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_ID_INVALID",
        });
    }
    const row = await currentTrx()
        .from(target.table)
        .where({ tenant_id: tenantId(), [target.idColumn ?? "id"]: id })
        .first();
    if (!row) {
        throw new Exception("Merchant memory source was not found in the current tenant", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
        });
    }
}

async function requireMemory(publicId: string) {
    const row = await currentTrx().from("merchant_memory_records").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!row) {
        throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    return row;
}

async function sourceRows(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_sources")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("observed_at", "desc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) {
        const id = Number(row.memory_id);
        grouped.set(id, [...(grouped.get(id) ?? []), { ...row, evidence_summary: json(row.evidence_summary, {}) }]);
    }
    return grouped;
}

export async function createMemory(input: CreateMemoryInput, actor: User) {
    assertPrivacyBoundary(input);
    for (const source of input.sources) await validateSource(source);
    const trx = currentTrx();
    const now = nowSql();
    const relevantFrom = parseDate(input.relevant_from, DateTime.utc()).toSQL();
    const expiresAt = input.expires_at ? parseDate(input.expires_at, DateTime.utc()).toSQL() : null;
    const records = await trx
        .table("merchant_memory_records")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            memory_class: input.memory_class,
            subject_type: input.subject_type ?? null,
            subject_id: input.subject_id ?? null,
            title: input.title,
            context: input.context,
            observed_signals: JSON.stringify(input.observed_signals ?? []),
            decision: input.decision ?? null,
            reason: input.reason ?? null,
            alternatives_rejected: JSON.stringify(input.alternatives_rejected ?? []),
            actors_and_approvals: JSON.stringify(input.actors_and_approvals ?? [{ user_id: Number(actor.id) }]),
            action: input.action ?? null,
            outcome: input.outcome ?? null,
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.strength,
            status: "active",
            sensitivity: input.sensitivity ?? "aggregate",
            retention_class: input.retention_class ?? "standard",
            allowed_consumers: JSON.stringify(input.allowed_consumers ?? ["human"]),
            purposes: JSON.stringify(input.purposes ?? []),
            relevant_from: relevantFrom,
            expires_at: expiresAt,
            created_by_user_id: Number(actor.id),
            updated_by_user_id: Number(actor.id),
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    const memory = records[0];
    for (const source of input.sources) {
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            source_phase: source.source_phase,
            source_kind: source.source_kind,
            source_id: source.source_id,
            source_route: source.source_route ?? null,
            source_hash: source.source_hash ?? hash(source.evidence_summary ?? {}),
            label: source.label,
            evidence_role: source.evidence_role ?? "supporting",
            evidence_summary: JSON.stringify(source.evidence_summary ?? {}),
            sensitivity: source.sensitivity ?? "aggregate",
            observed_at: parseDate(source.observed_at, DateTime.utc()).toSQL(),
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
        .orderBy("observed_at", "desc");
    const predecessors = await currentTrx()
        .from("merchant_memory_lineage as l")
        .join("merchant_memory_records as p", "p.id", "l.from_memory_id")
        .where({ "l.tenant_id": tenantId(), "l.to_memory_id": memory.id })
        .select("l.relation", "l.reason", "p.public_id", "p.title", "p.status");
    const successors = await currentTrx()
        .from("merchant_memory_lineage as l")
        .join("merchant_memory_records as n", "n.id", "l.to_memory_id")
        .where({ "l.tenant_id": tenantId(), "l.from_memory_id": memory.id })
        .select("l.relation", "l.reason", "n.public_id", "n.title", "n.status");
    return {
        ...memory,
        observed_signals: json(memory.observed_signals, []),
        alternatives_rejected: json(memory.alternatives_rejected, []),
        actors_and_approvals: json(memory.actors_and_approvals, []),
        allowed_consumers: json(memory.allowed_consumers, []),
        purposes: json(memory.purposes, []),
        sources: sources.map((source) => ({ ...source, evidence_summary: json(source.evidence_summary, {}) })),
        lineage: { predecessors, successors },
    };
}

export async function listMemories(
    filters: {
        memory_class?: MemoryClass;
        status?: "active" | "superseded" | "expired" | "withdrawn";
        subject_type?: string;
        subject_id?: string;
        limit?: number;
    } = {},
) {
    const query = currentTrx().from("merchant_memory_records").where("tenant_id", tenantId());
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.status) query.where("status", filters.status);
    if (filters.subject_type) query.where("subject_type", filters.subject_type);
    if (filters.subject_id) query.where("subject_id", filters.subject_id);
    return query.orderBy("relevant_from", "desc").limit(Math.min(200, Math.max(1, filters.limit ?? 100)));
}

export async function retrieveMemories(input: RetrieveMemoryInput, actor: User) {
    const trx = currentTrx();
    const now = nowSql();
    const limit = Math.min(50, Math.max(1, input.limit ?? 12));
    const activeBase = trx.from("merchant_memory_records").where({ tenant_id: tenantId(), status: "active" });
    const candidateRow = await activeBase.clone().count("* as count").first();
    const expiredRow = await activeBase
        .clone()
        .whereNotNull("expires_at")
        .where("expires_at", "<=", now)
        .count("* as count")
        .first();
    const supersededRow = await trx
        .from("merchant_memory_records")
        .where({ tenant_id: tenantId(), status: "superseded" })
        .count("* as count")
        .first();
    const query = activeBase
        .clone()
        .where((builder) => builder.whereNull("expires_at").orWhere("expires_at", ">", now))
        .whereRaw("allowed_consumers @> ?::jsonb", [JSON.stringify([input.consumer])])
        .where((builder) =>
            builder
                .whereRaw("jsonb_array_length(purposes) = 0")
                .orWhereRaw("purposes @> ?::jsonb", [JSON.stringify([input.purpose])]),
        )
        .whereExists(
            trx
                .from("merchant_memory_sources")
                .select(trx.raw("1"))
                .whereRaw("merchant_memory_sources.memory_id = merchant_memory_records.id")
                .whereRaw("merchant_memory_sources.tenant_id = merchant_memory_records.tenant_id"),
        );
    if (input.memory_classes?.length) query.whereIn("memory_class", input.memory_classes);
    if (input.subject_type) query.where("subject_type", input.subject_type);
    if (input.subject_id) query.where("subject_id", input.subject_id);
    if (input.min_confidence != null) query.where("confidence", ">=", input.min_confidence);
    if (input.consumer === "agent" || !input.include_customer_sensitive) {
        query.whereNot("sensitivity", "customer_level_sensitive");
    }
    const beforePermission = await activeBase
        .clone()
        .where((builder) => builder.whereNull("expires_at").orWhere("expires_at", ">", now))
        .count("* as count")
        .first();
    const afterPermission = await query.clone().count("* as count").first();
    const tokens = normalizeMerchantMemorySearchTokens(input.query);
    if (tokens.length) {
        query.where((builder) => {
            for (const token of tokens) {
                builder
                    .orWhereILike("title", `%${token}%`)
                    .orWhereILike("lesson", `%${token}%`)
                    .orWhereILike("context", `%${token}%`);
            }
        });
    }
    const candidateRows = await query
        .orderBy("strength", "desc")
        .orderBy("confidence", "desc")
        .orderBy("relevant_from", "desc")
        .limit(300);
    const ranked = candidateRows
        .map((row) => ({ row, score: merchantMemoryRetrievalScore(row, tokens) }))
        .sort((a, b) => b.score.total - a.score.total || Number(b.row.id) - Number(a.row.id))
        .slice(0, limit);
    const rows = ranked.map(({ row }) => row);
    const scores = new Map(ranked.map(({ row, score }) => [Number(row.id), score]));
    const groupedSources = await sourceRows(rows.map((row) => Number(row.id)));
    const publicIds = rows.map((row) => String(row.public_id));
    const retrievals = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            principal_kind: input.consumer,
            principal_id: String(actor.id),
            purpose: input.purpose,
            query_hash: hash({ query: input.query.trim().toLowerCase(), engine: MERCHANT_MEMORY_VERSION }),
            filters: JSON.stringify({
                memory_classes: input.memory_classes ?? [],
                subject_type: input.subject_type ?? null,
                subject_id: input.subject_id ?? null,
                min_confidence: input.min_confidence ?? null,
                include_customer_sensitive: input.consumer === "human" && input.include_customer_sensitive === true,
                engine_version: MERCHANT_MEMORY_VERSION,
            }),
            returned_memory_public_ids: JSON.stringify(publicIds),
            candidate_count: Number(candidateRow?.count ?? 0),
            result_count: rows.length,
            source_linked_count: rows.filter((row) => (groupedSources.get(Number(row.id)) ?? []).length > 0).length,
            expired_filtered_count: Number(expiredRow?.count ?? 0),
            permission_filtered_count: Math.max(0, Number(beforePermission?.count ?? 0) - Number(afterPermission?.count ?? 0)),
            superseded_filtered_count: Number(supersededRow?.count ?? 0),
            request_correlation_id: input.request_correlation_id ?? null,
            retrieved_at: now,
        })
        .returning("*");
    return {
        retrieval_public_id: retrievals[0].public_id,
        engine_version: MERCHANT_MEMORY_VERSION,
        memories: rows.map((row) => ({
            ...row,
            retrieval_score: scores.get(Number(row.id))?.total ?? 0,
            score_components: scores.get(Number(row.id)) ?? null,
            sources: groupedSources.get(Number(row.id)) ?? [],
        })),
    };
}

export async function supersedeMemory(
    predecessorPublicId: string,
    input: CreateMemoryInput & { relation?: "supersedes" | "contradicts" | "refines"; supersession_reason: string },
    actor: User,
) {
    const predecessor = await requireMemory(predecessorPublicId);
    if (predecessor.status !== "active") {
        throw new Exception("Only active merchant memory can be superseded", {
            status: 409,
            code: "E_MERCHANT_MEMORY_NOT_ACTIVE",
        });
    }
    if (predecessor.memory_class !== input.memory_class) {
        throw new Exception("Memory lineage must preserve the memory class", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_CLASS_MISMATCH",
        });
    }
    if (
        (predecessor.subject_type ?? null) !== (input.subject_type ?? null) ||
        (predecessor.subject_id ?? null) !== (input.subject_id ?? null)
    ) {
        throw new Exception("Memory lineage must preserve the subject identity", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_SUBJECT_MISMATCH",
        });
    }
    const next = await createMemory(input, actor);
    const successor = await requireMemory(next.public_id);
    const now = nowSql();
    await currentTrx()
        .table("merchant_memory_lineage")
        .insert({
            tenant_id: tenantId(),
            from_memory_id: predecessor.id,
            to_memory_id: successor.id,
            relation: input.relation ?? "supersedes",
            reason: input.supersession_reason,
            created_by_user_id: Number(actor.id),
            created_at: now,
        });
    if ((input.relation ?? "supersedes") === "supersedes") {
        await currentTrx()
            .from("merchant_memory_records")
            .where({ tenant_id: tenantId(), id: predecessor.id })
            .update({ status: "superseded", superseded_at: now, updated_by_user_id: Number(actor.id), updated_at: now });
    }
    return memoryDetail(successor.public_id);
}

export async function revokeMemory(publicId: string, actor: User) {
    const memory = await requireMemory(publicId);
    if (memory.status === "withdrawn") return memoryDetail(publicId);
    await currentTrx()
        .from("merchant_memory_records")
        .where({ tenant_id: tenantId(), id: memory.id })
        .update({ status: "withdrawn", updated_by_user_id: Number(actor.id), updated_at: nowSql() });
    return memoryDetail(publicId);
}

export async function recordEffectiveness(
    retrievalPublicId: string,
    input: {
        memory_public_id?: string | null;
        signal: "used" | "ignored" | "helpful" | "harmful" | "repeat_error";
        usefulness?: number | null;
        repeat_error_avoided?: boolean | null;
        notes?: string | null;
        source_outcome_record_id?: number | null;
    },
    actor: User,
) {
    const retrieval = await currentTrx()
        .from("merchant_memory_retrievals")
        .where({ tenant_id: tenantId(), public_id: retrievalPublicId })
        .first();
    if (!retrieval) {
        throw new Exception("Merchant memory retrieval not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND",
        });
    }
    let memory: Record<string, unknown> | null = null;
    if (input.memory_public_id) {
        const selectedMemory = await requireMemory(input.memory_public_id);
        const returned = json<string[]>(retrieval.returned_memory_public_ids, []);
        if (!returned.includes(String(selectedMemory.public_id))) {
            throw new Exception("Effectiveness may only reference memory returned by this retrieval", {
                status: 422,
                code: "E_MERCHANT_MEMORY_EFFECTIVENESS_SCOPE_MISMATCH",
            });
        }
        memory = selectedMemory;
    }
    if (input.source_outcome_record_id) {
        const outcome = await currentTrx()
            .from("intelligence_outcome_records")
            .where({ tenant_id: tenantId(), id: input.source_outcome_record_id })
            .first();
        if (!outcome) {
            throw new Exception("Outcome evidence is outside the current tenant", {
                status: 422,
                code: "E_MERCHANT_MEMORY_OUTCOME_NOT_FOUND",
            });
        }
    }
    const rows = await currentTrx()
        .table("merchant_memory_effectiveness")
        .insert({
            tenant_id: tenantId(),
            retrieval_id: retrieval.id,
            memory_id: memory ? Number(memory.id) : null,
            signal: input.signal,
            usefulness: input.usefulness ?? null,
            repeat_error_avoided: input.repeat_error_avoided ?? null,
            source_outcome_record_id: input.source_outcome_record_id ?? null,
            notes: input.notes ?? null,
            recorded_by_user_id: Number(actor.id),
            recorded_at: nowSql(),
        })
        .returning("*");
    return rows[0];
}

export async function overview() {
    const trx = currentTrx();
    const now = nowSql();
    const [active, superseded, expired, retrievals, effectiveness] = await Promise.all([
        trx.from("merchant_memory_records").where({ tenant_id: tenantId(), status: "active" }).count("* as count").first(),
        trx.from("merchant_memory_records").where({ tenant_id: tenantId(), status: "superseded" }).count("* as count").first(),
        trx
            .from("merchant_memory_records")
            .where({ tenant_id: tenantId(), status: "active" })
            .whereNotNull("expires_at")
            .where("expires_at", "<=", now)
            .count("* as count")
            .first(),
        trx.from("merchant_memory_retrievals").where("tenant_id", tenantId()).count("* as count").first(),
        trx
            .from("merchant_memory_effectiveness")
            .where("tenant_id", tenantId())
            .select(
                trx.raw("COUNT(*)::int AS samples"),
                trx.raw("AVG(usefulness) FILTER (WHERE usefulness IS NOT NULL) AS usefulness_rate"),
                trx.raw(
                    "AVG(CASE WHEN repeat_error_avoided IS TRUE THEN 1.0 WHEN repeat_error_avoided IS FALSE THEN 0.0 END) AS repeat_error_avoidance_rate",
                ),
            )
            .first(),
    ]);
    return {
        engine_version: MERCHANT_MEMORY_VERSION,
        active_memories: Number(active?.count ?? 0),
        superseded_memories: Number(superseded?.count ?? 0),
        expired_memories: Number(expired?.count ?? 0),
        retrieval_count: Number(retrievals?.count ?? 0),
        effectiveness_samples: Number(effectiveness?.samples ?? 0),
        retrieval_usefulness: effectiveness?.usefulness_rate == null ? null : Number(effectiveness.usefulness_rate),
        repeat_error_reduction_proxy:
            effectiveness?.repeat_error_avoidance_rate == null ? null : Number(effectiveness.repeat_error_avoidance_rate),
    };
}
