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
export type MemorySensitivity = "aggregated" | "internal" | "restricted";

type MemorySourceInput = {
    source_kind:
        | "decision"
        | "outcome"
        | "approval"
        | "experiment"
        | "portfolio"
        | "incident"
        | "audit"
        | "operator";
    source_table: string;
    source_id: string;
    source_public_id?: string | null;
    evidence_hash?: string | null;
    evidence_role?: "primary" | "supporting" | "contradicting";
    observed_at?: string | null;
};

type CreateMemoryInput = {
    memory_class: MemoryClass;
    subject_type?: string | null;
    subject_key?: string | null;
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
    required_permission?: string | null;
    relevant_from?: string;
    expires_at?: string | null;
    sources: MemorySourceInput[];
};

type RetrieveMemoryInput = {
    query: string;
    principal_kind: "admin" | "copilot" | "automation";
    principal_id?: string | null;
    memory_classes?: MemoryClass[];
    subject_type?: string | null;
    subject_key?: string | null;
    permissions?: string[];
    include_restricted?: boolean;
    limit?: number;
};

type EffectivenessInput = {
    retrieval_public_id: string;
    memory_public_id?: string | null;
    outcome: "used" | "ignored" | "misleading" | "prevented_repeat_error" | "unknown";
    usefulness?: number | null;
    repeat_error_avoided?: boolean | null;
    notes?: string | null;
};

const tenantId = () => Number(currentTenantId());

const json = <T>(value: T | string | null | undefined, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

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

function parseMoment(value: string | null | undefined, fallbackNow = false) {
    if (!value && fallbackNow) return DateTime.utc();
    if (!value) return null;
    const parsed = DateTime.fromISO(value, { setZone: true }).toUTC();
    return parsed.isValid ? parsed : null;
}

function assertPrivacyBoundary(input: CreateMemoryInput) {
    if (!input.sources.length) {
        throw new Exception("Merchant memory requires source-linked evidence", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REQUIRED",
        });
    }

    const subjectType = input.subject_type?.trim().toLowerCase();
    if (subjectType === "customer" || subjectType === "customer_id" || input.subject_key?.toLowerCase().startsWith("customer:")) {
        throw new Exception("Raw customer-level durable memory is forbidden; use an aggregated segment lesson", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RAW_CUSTOMER_FORBIDDEN",
        });
    }

    if (input.memory_class === "customer_segment_behavior" && subjectType && subjectType !== "segment") {
        throw new Exception("Customer behavior memory must be aggregated at segment scope", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SEGMENT_SCOPE_REQUIRED",
        });
    }

    const relevant = parseMoment(input.relevant_from, true)!;
    const expires = parseMoment(input.expires_at);
    if (input.relevant_from && !parseMoment(input.relevant_from)) {
        throw new Exception("Invalid relevant_from timestamp", { status: 422, code: "E_MERCHANT_MEMORY_RELEVANCE_INVALID" });
    }
    if (input.expires_at && !expires) {
        throw new Exception("Invalid expires_at timestamp", { status: 422, code: "E_MERCHANT_MEMORY_EXPIRY_INVALID" });
    }
    if (expires && expires <= relevant) {
        throw new Exception("Memory expiry must be after relevance start", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EXPIRY_INVALID",
        });
    }
}

async function expireDueMemories() {
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .from("merchant_memory_records")
        .where({ tenant_id: tenantId(), status: "active" })
        .whereNotNull("expires_at")
        .where("expires_at", "<=", now)
        .update({ status: "expired", updated_at: now });
}

async function requireMemory(publicId: string) {
    await expireDueMemories();
    const row = await currentTrx()
        .from("merchant_memory_records")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!row) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    return row;
}

async function sourceMap(memoryIds: number[]) {
    const grouped = new Map<number, unknown[]>();
    if (!memoryIds.length) return grouped;
    const rows = await currentTrx()
        .from("merchant_memory_sources")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("observed_at", "desc");
    for (const row of rows) {
        const id = Number(row.memory_id);
        grouped.set(id, [...(grouped.get(id) ?? []), row]);
    }
    return grouped;
}

export async function createMemory(input: CreateMemoryInput, actor: User) {
    assertPrivacyBoundary(input);
    const trx = currentTrx();
    const now = DateTime.utc();
    const relevantFrom = parseMoment(input.relevant_from, true)!;
    const expiresAt = parseMoment(input.expires_at);
    const publicId = randomUUID();

    const [memory] = await trx
        .table("merchant_memory_records")
        .insert({
            public_id: publicId,
            tenant_id: tenantId(),
            memory_class: input.memory_class,
            subject_type: input.subject_type ?? null,
            subject_key: input.subject_key ?? null,
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
            status: "active",
            sensitivity: input.sensitivity ?? "aggregated",
            required_permission: input.required_permission ?? null,
            relevant_from: relevantFrom.toSQL(),
            expires_at: expiresAt?.toSQL() ?? null,
            superseded_at: null,
            created_by_user_id: actor.id,
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning("*");

    for (const source of input.sources) {
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            source_kind: source.source_kind,
            source_table: source.source_table,
            source_id: source.source_id,
            source_public_id: source.source_public_id ?? null,
            evidence_hash: source.evidence_hash ?? null,
            evidence_role: source.evidence_role ?? "supporting",
            observed_at: parseMoment(source.observed_at)?.toSQL() ?? null,
            created_at: now.toSQL(),
        });
    }

    return memoryDetail(publicId);
}

export async function memoryDetail(publicId: string) {
    const memory = await requireMemory(publicId);
    const trx = currentTrx();
    const sources = await trx
        .from("merchant_memory_sources")
        .where({ tenant_id: tenantId(), memory_id: memory.id })
        .orderBy("created_at", "asc");
    const predecessors = await trx
        .from("merchant_memory_lineage as l")
        .join("merchant_memory_records as p", "p.id", "l.from_memory_id")
        .where({ "l.tenant_id": tenantId(), "l.to_memory_id": memory.id })
        .select("l.relation", "l.reason", "p.public_id", "p.lesson", "p.status");
    const successors = await trx
        .from("merchant_memory_lineage as l")
        .join("merchant_memory_records as n", "n.id", "l.to_memory_id")
        .where({ "l.tenant_id": tenantId(), "l.from_memory_id": memory.id })
        .select("l.relation", "l.reason", "n.public_id", "n.lesson", "n.status");
    return {
        ...memory,
        observed_signals: json(memory.observed_signals, []),
        alternatives_rejected: json(memory.alternatives_rejected, []),
        actors_and_approvals: json(memory.actors_and_approvals, []),
        sources,
        lineage: { predecessors, successors },
    };
}

export async function listMemories(filters: {
    memory_class?: MemoryClass;
    status?: string;
    subject_type?: string;
    subject_key?: string;
} = {}) {
    await expireDueMemories();
    const query = currentTrx().from("merchant_memory_records").where("tenant_id", tenantId());
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.status) query.where("status", filters.status);
    if (filters.subject_type) query.where("subject_type", filters.subject_type);
    if (filters.subject_key) query.where("subject_key", filters.subject_key);
    return query.orderBy("relevant_from", "desc").limit(200);
}

function lexicalScore(row: Record<string, unknown>, tokens: string[]) {
    if (!tokens.length) return 1;
    const haystack = `${row.context ?? ""} ${row.decision ?? ""} ${row.reason ?? ""} ${row.lesson ?? ""}`.toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    return hits / tokens.length;
}

export async function retrieveMemories(input: RetrieveMemoryInput, actor: User) {
    await expireDueMemories();
    const trx = currentTrx();
    const permissions = new Set(input.permissions ?? []);
    const limit = Math.min(50, Math.max(1, input.limit ?? 12));
    const tokens = input.query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 2)
        .slice(0, 12);

    const allActive = trx.from("merchant_memory_records").where({ tenant_id: tenantId(), status: "active" });
    if (input.memory_classes?.length) allActive.whereIn("memory_class", input.memory_classes);
    if (input.subject_type) allActive.where("subject_type", input.subject_type);
    if (input.subject_key) allActive.where("subject_key", input.subject_key);

    const candidates = await allActive
        .clone()
        .whereExists(
            trx
                .from("merchant_memory_sources")
                .select(trx.raw("1"))
                .whereRaw("merchant_memory_sources.memory_id = merchant_memory_records.id")
                .whereRaw("merchant_memory_sources.tenant_id = merchant_memory_records.tenant_id"),
        )
        .orderBy("strength", "desc")
        .orderBy("confidence", "desc")
        .limit(300);

    let permissionFiltered = 0;
    const allowed = candidates.filter((row) => {
        if (row.sensitivity === "restricted" && !input.include_restricted) {
            permissionFiltered += 1;
            return false;
        }
        if (row.required_permission && !permissions.has(String(row.required_permission))) {
            permissionFiltered += 1;
            return false;
        }
        return true;
    });

    const ranked = allowed
        .map((row) => ({
            row,
            score:
                lexicalScore(row, tokens) * 0.5 +
                Number(row.confidence ?? 0) * 0.25 +
                Number(row.strength ?? 0) * 0.25,
        }))
        .filter(({ score }) => tokens.length === 0 || score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    const ids = ranked.map(({ row }) => Number(row.id));
    const sources = await sourceMap(ids);
    const retrievalPublicId = randomUUID();
    const [retrieval] = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: retrievalPublicId,
            tenant_id: tenantId(),
            principal_kind: input.principal_kind,
            principal_id: input.principal_id ?? String(actor.id),
            query: input.query,
            filters: JSON.stringify({
                memory_classes: input.memory_classes ?? [],
                subject_type: input.subject_type ?? null,
                subject_key: input.subject_key ?? null,
                permissions: [...permissions].sort(),
                include_restricted: input.include_restricted ?? false,
                engine_version: MERCHANT_MEMORY_VERSION,
                query_hash: hash(input.query.trim().toLowerCase()),
            }),
            returned_memory_ids: JSON.stringify(ids),
            result_count: ids.length,
            source_linked_count: ranked.filter(({ row }) => (sources.get(Number(row.id)) ?? []).length > 0).length,
            expired_filtered_count: 0,
            permission_filtered_count: permissionFiltered,
            retrieved_at: DateTime.utc().toSQL(),
        })
        .returning("*");

    return {
        retrieval_public_id: retrieval.public_id,
        engine_version: MERCHANT_MEMORY_VERSION,
        memories: ranked.map(({ row, score }) => ({
            ...row,
            retrieval_score: Number(score.toFixed(6)),
            sources: sources.get(Number(row.id)) ?? [],
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
        throw new Exception("Only active merchant memory may be superseded", {
            status: 409,
            code: "E_MERCHANT_MEMORY_NOT_ACTIVE",
        });
    }
    if (predecessor.memory_class !== input.memory_class) {
        throw new Exception("Superseding memory must preserve memory class", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_CLASS_MISMATCH",
        });
    }

    const successor = await createMemory(input, actor);
    const next = await requireMemory(successor.public_id);
    const now = DateTime.utc().toSQL();
    await currentTrx().table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: predecessor.id,
        to_memory_id: next.id,
        relation: input.relation ?? "supersedes",
        reason: input.supersession_reason,
        created_by_user_id: actor.id,
        created_at: now,
    });
    if ((input.relation ?? "supersedes") === "supersedes") {
        await currentTrx()
            .from("merchant_memory_records")
            .where({ tenant_id: tenantId(), id: predecessor.id })
            .update({ status: "superseded", superseded_at: now, updated_at: now });
    }
    return memoryDetail(successor.public_id);
}

export async function recordEffectiveness(recordPublicId: string, input: EffectivenessInput, actor: User) {
    const memory = await requireMemory(recordPublicId);
    if (input.memory_public_id && input.memory_public_id !== recordPublicId) {
        throw new Exception("Effectiveness memory identifier does not match the route", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EFFECTIVENESS_SCOPE",
        });
    }
    const retrieval = await currentTrx()
        .from("merchant_memory_retrievals")
        .where({ tenant_id: tenantId(), public_id: input.retrieval_public_id })
        .first();
    if (!retrieval) {
        throw new Exception("Merchant memory retrieval not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND",
        });
    }
    const returned = new Set(json<number[]>(retrieval.returned_memory_ids, []).map(Number));
    if (!returned.has(Number(memory.id))) {
        throw new Exception("Effectiveness may only reference a memory returned by that retrieval", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EFFECTIVENESS_SCOPE",
        });
    }
    const [row] = await currentTrx()
        .table("merchant_memory_effectiveness")
        .insert({
            tenant_id: tenantId(),
            retrieval_id: retrieval.id,
            memory_id: memory.id,
            outcome: input.outcome,
            usefulness: input.usefulness ?? null,
            repeat_error_avoided: input.repeat_error_avoided ?? null,
            notes: input.notes ?? null,
            recorded_by_user_id: actor.id,
            recorded_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return row;
}

export async function revokeMemory(publicId: string, actor: User) {
    const memory = await requireMemory(publicId);
    if (memory.status === "revoked") return memoryDetail(publicId);
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .from("merchant_memory_records")
        .where({ tenant_id: tenantId(), id: memory.id })
        .update({ status: "revoked", updated_at: now, created_by_user_id: memory.created_by_user_id ?? actor.id });
    return memoryDetail(publicId);
}

export async function overview() {
    await expireDueMemories();
    const trx = currentTrx();
    const tenant = tenantId();
    const [active, superseded, expired, retrievals, sourceCoverage, effectiveness] = await Promise.all([
        trx.from("merchant_memory_records").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx.from("merchant_memory_records").where({ tenant_id: tenant, status: "superseded" }).count("* as c").first(),
        trx.from("merchant_memory_records").where({ tenant_id: tenant, status: "expired" }).count("* as c").first(),
        trx.from("merchant_memory_retrievals").where("tenant_id", tenant).count("* as c").first(),
        trx
            .from("merchant_memory_records as m")
            .where("m.tenant_id", tenant)
            .whereExists(
                trx
                    .from("merchant_memory_sources as s")
                    .select(trx.raw("1"))
                    .whereRaw("s.memory_id = m.id")
                    .whereRaw("s.tenant_id = m.tenant_id"),
            )
            .count("* as c")
            .first(),
        trx
            .from("merchant_memory_effectiveness")
            .where("tenant_id", tenant)
            .select(
                trx.raw("AVG(usefulness) as avg_usefulness"),
                trx.raw("AVG(CASE WHEN repeat_error_avoided = true THEN 1.0 WHEN repeat_error_avoided = false THEN 0.0 END) as repeat_error_avoidance_rate"),
            )
            .first(),
    ]);
    return {
        engine_version: MERCHANT_MEMORY_VERSION,
        active_memories: Number(active?.c ?? 0),
        superseded_memories: Number(superseded?.c ?? 0),
        expired_memories: Number(expired?.c ?? 0),
        retrievals: Number(retrievals?.c ?? 0),
        source_linked_memories: Number(sourceCoverage?.c ?? 0),
        avg_usefulness: effectiveness?.avg_usefulness == null ? null : Number(effectiveness.avg_usefulness),
        repeat_error_avoidance_rate:
            effectiveness?.repeat_error_avoidance_rate == null ? null : Number(effectiveness.repeat_error_avoidance_rate),
    };
}
