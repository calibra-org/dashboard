import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.1.0";

export const MERCHANT_MEMORY_CLASSES = [
    "operational_incident",
    "supplier_lesson",
    "campaign_lesson",
    "pricing_lesson",
    "customer_segment_behavior",
    "product_quality",
    "architecture_process_decision",
    "policy_precedent",
] as const;

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
    memory_class: (typeof MERCHANT_MEMORY_CLASSES)[number];
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
    retention_class?: string;
    effective_from?: string;
    expires_at?: string | null;
    sources: MerchantMemorySourceInput[];
};

export type MerchantMemoryRetrievalInput = {
    query_text: string;
    purpose: string;
    memory_classes?: string[];
    limit?: number;
    requester_type: "human" | "agent" | "system";
    requester_reference?: string | null;
};

type EffectivenessInput = {
    retrieval_public_id?: string | null;
    effect_kind: "useful" | "not_useful" | "prevented_repeat_error" | "decision_influenced" | "outcome_supported";
    usefulness_score?: number | null;
    repeat_error_avoided?: boolean | null;
    decision_reference?: string | null;
    outcome_reference?: string | null;
    source_outcome_record_id?: number | null;
    notes?: string | null;
};

const SOURCE_AUTHORITIES: Record<string, { table: string; key: string }> = {
    phase10_case: { table: "intelligence_cases", key: "id" },
    phase10_decision: { table: "intelligence_decisions", key: "id" },
    phase10_action: { table: "intelligence_action_records", key: "id" },
    phase10_outcome: { table: "intelligence_outcome_records", key: "id" },
    phase11_approval: { table: "governance_approval_requests", key: "reference" },
    phase17_experiment: { table: "experiments", key: "experiment_key" },
    phase17_analysis: { table: "experiment_analysis_runs", key: "id" },
    phase22_plan: { table: "agent_plans", key: "public_id" },
    phase22_tool_run: { table: "agent_tool_runs", key: "public_id" },
    phase22_outcome: { table: "agent_outcome_hooks", key: "public_id" },
    phase25_portfolio_run: { table: "growth_portfolio_runs", key: "public_id" },
};

const tenantId = () => Number(currentTenantId());

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

export function merchantMemoryQueryHash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function parseMoment(value: string | null | undefined, fallbackNow = false) {
    if (!value && fallbackNow) return DateTime.utc();
    if (!value) return null;
    const parsed = DateTime.fromISO(value, { setZone: true }).toUTC();
    return parsed.isValid ? parsed : null;
}

function ensureEvidenceAndPrivacy(input: MerchantMemoryInput) {
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
    const effective = parseMoment(input.effective_from, true)!;
    const expires = parseMoment(input.expires_at);
    if (input.effective_from && !parseMoment(input.effective_from)) {
        throw new Exception("Invalid memory effective_from timestamp", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EFFECTIVE_FROM_INVALID",
        });
    }
    if (input.expires_at && !expires) {
        throw new Exception("Invalid memory expires_at timestamp", { status: 422, code: "E_MERCHANT_MEMORY_EXPIRY_INVALID" });
    }
    if (expires && expires <= effective) {
        throw new Exception("Memory expiry must be after its effective time", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EXPIRY_INVALID",
        });
    }
}

async function validateSource(source: MerchantMemorySourceInput) {
    if (source.source_type === "manual_evidence") {
        if (!source.source_uri && !source.evidence_hash) {
            throw new Exception("Manual memory evidence requires a URI or integrity hash", {
                status: 422,
                code: "E_MERCHANT_MEMORY_MANUAL_EVIDENCE_WEAK",
            });
        }
        return;
    }
    const authority = SOURCE_AUTHORITIES[source.source_type];
    if (!authority) {
        throw new Exception("Unsupported merchant-memory source authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_AUTHORITY",
        });
    }
    const row = await currentTrx()
        .from(authority.table)
        .where("tenant_id", tenantId())
        .where(authority.key, source.source_reference)
        .first();
    if (!row) {
        throw new Exception("Merchant-memory source reference was not found in its canonical authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
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
        await validateSource(source);
        const observed = source.observed_at ? parseMoment(source.observed_at) : DateTime.utc();
        if (!observed) {
            throw new Exception("Invalid evidence observed_at timestamp", {
                status: 422,
                code: "E_MERCHANT_MEMORY_SOURCE_TIME_INVALID",
            });
        }
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memoryId,
            source_type: source.source_type,
            source_reference: source.source_reference,
            source_uri: source.source_uri ?? null,
            evidence_hash: source.evidence_hash ?? merchantMemoryQueryHash(source.evidence_snapshot ?? {}),
            evidence_role: source.evidence_role ?? "supporting",
            evidence_snapshot: JSON.stringify(source.evidence_snapshot ?? {}),
            observed_at: observed.toSQL(),
        });
    }
}

export async function overview() {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const [active, superseded, expired, retrievals, usefulness, repeatAvoidance] = await Promise.all([
        trx
            .from("merchant_memories")
            .where("tenant_id", tenantId())
            .where("status", "active")
            .where((query) => query.whereNull("expires_at").orWhere("expires_at", ">", now))
            .count("id as count")
            .first(),
        trx.from("merchant_memories").where("tenant_id", tenantId()).where("status", "superseded").count("id as count").first(),
        trx
            .from("merchant_memories")
            .where("tenant_id", tenantId())
            .where((query) => query.where("status", "expired").orWhere("expires_at", "<=", now))
            .count("id as count")
            .first(),
        trx.from("merchant_memory_retrievals").where("tenant_id", tenantId()).count("id as count").first(),
        trx.from("merchant_memory_effectiveness").where("tenant_id", tenantId()).avg("usefulness_score as score").first(),
        trx
            .from("merchant_memory_effectiveness")
            .where("tenant_id", tenantId())
            .select(
                trx.raw(
                    "AVG(CASE WHEN repeat_error_avoided = true THEN 1.0 WHEN repeat_error_avoided = false THEN 0.0 END) as rate",
                ),
            )
            .first(),
    ]);
    return {
        engine_version: MERCHANT_MEMORY_VERSION,
        active: Number(active?.count ?? 0),
        superseded: Number(superseded?.count ?? 0),
        expired: Number(expired?.count ?? 0),
        retrievals: Number(retrievals?.count ?? 0),
        average_usefulness: usefulness?.score == null ? null : Number(usefulness.score),
        repeat_error_avoidance_rate: repeatAvoidance?.rate == null ? null : Number(repeatAvoidance.rate),
    };
}

export async function listMemories() {
    return currentTrx().from("merchant_memories").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(200);
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
    ensureEvidenceAndPrivacy(input);
    for (const source of input.sources) await validateSource(source);
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
            status: "active",
            visibility_scope: input.visibility_scope ?? "admin_agent",
            sensitivity_level: input.sensitivity_level ?? "internal",
            aggregation_level: input.aggregation_level ?? "aggregate",
            retention_class: input.retention_class ?? "business_learning",
            effective_from: parseMoment(input.effective_from, true)!.toSQL(),
            expires_at: parseMoment(input.expires_at)?.toSQL() ?? null,
            last_validated_at: DateTime.utc().toSQL(),
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
    if (predecessor.memory_class !== input.memory_class) {
        throw new Exception("Superseding memory must preserve its memory class", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_CLASS_MISMATCH",
        });
    }
    const successor = await createMemory(input, actor);
    const next = await memoryByPublicId(successor.public_id);
    const now = DateTime.utc().toSQL();
    await currentTrx().table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        predecessor_memory_id: predecessor.id,
        successor_memory_id: next.id,
        relation: "supersedes",
        reason: input.lineage_reason,
        created_by_user_id: Number(actor.id),
        created_at: now,
    });
    await currentTrx()
        .from("merchant_memories")
        .where({ tenant_id: tenantId(), id: predecessor.id })
        .update({ status: "superseded", updated_at: now });
    return getMemory(successor.public_id);
}

function lexicalMatchScore(row: Record<string, unknown>, queryText: string) {
    const tokens = queryText
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 2)
        .slice(0, 12);
    if (!tokens.length) return 1;
    const text = `${row.title ?? ""} ${row.context ?? ""} ${row.reason ?? ""} ${row.lesson ?? ""}`.toLowerCase();
    return tokens.filter((token) => text.includes(token)).length / tokens.length;
}

export async function retrieve(input: MerchantMemoryRetrievalInput) {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const active = trx.from("merchant_memories as m").where("m.tenant_id", tenantId()).where("m.status", "active");
    if (input.memory_classes?.length) active.whereIn("m.memory_class", input.memory_classes);
    const allCandidates = await active
        .clone()
        .whereExists((query) => {
            query.select(trx.raw("1")).from("merchant_memory_sources as s").whereRaw("s.memory_id = m.id").where("s.tenant_id", tenantId());
        })
        .select("m.*")
        .limit(300);
    const expiredCount = allCandidates.filter((row) => row.expires_at && DateTime.fromJSDate(new Date(row.expires_at)) <= DateTime.utc()).length;
    const live = allCandidates.filter((row) => !row.expires_at || DateTime.fromJSDate(new Date(row.expires_at)) > DateTime.utc());
    let permissionExcluded = 0;
    const permissionAllowed = live.filter((row) => {
        if (input.requester_type === "human") return true;
        const allowed = row.visibility_scope === "admin_agent" && row.sensitivity_level !== "sensitive";
        if (!allowed) permissionExcluded += 1;
        return allowed;
    });
    const ranked = permissionAllowed
        .map((row) => ({ row, score: lexicalMatchScore(row, input.query_text) * 0.5 + Number(row.confidence) * 0.25 + Number(row.strength) * 0.25 }))
        .filter(({ score }) => !input.query_text.trim() || score > 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    const rows = ranked.map(({ row }) => row);
    const withSources = [];
    for (const memory of rows) {
        const sources = await trx.from("merchant_memory_sources").where("tenant_id", tenantId()).where("memory_id", memory.id).orderBy("id", "asc");
        withSources.push({ ...memory, retrieval_score: ranked.find((item) => item.row.id === memory.id)?.score ?? 0, sources });
    }
    const [superseded] = await trx.from("merchant_memories").where({ tenant_id: tenantId(), status: "superseded" }).count("id as count");
    const [retrieval] = await trx
        .table("merchant_memory_retrievals")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            requester_type: input.requester_type,
            requester_reference: input.requester_reference ?? null,
            purpose: input.purpose,
            query_hash: merchantMemoryQueryHash({ query: input.query_text.trim().toLowerCase(), purpose: input.purpose }),
            filters: JSON.stringify({ memory_classes: input.memory_classes ?? [], engine_version: MERCHANT_MEMORY_VERSION }),
            returned_memory_ids: JSON.stringify(rows.map((row) => Number(row.id))),
            candidate_count: allCandidates.length,
            result_count: rows.length,
            source_linked_count: withSources.filter((row) => row.sources.length > 0).length,
            expired_excluded_count: expiredCount,
            superseded_excluded_count: Number(superseded?.count ?? 0),
            permission_excluded_count: permissionExcluded,
            retrieved_at: now,
        })
        .returning(["id", "public_id"]);
    return { retrieval_public_id: retrieval.public_id, engine_version: MERCHANT_MEMORY_VERSION, memories: withSources };
}

export async function recordEffectiveness(publicId: string, input: EffectivenessInput, actor: User) {
    const memory = await memoryByPublicId(publicId);
    let retrievalId: number | null = null;
    if (input.retrieval_public_id) {
        const retrieval = await currentTrx()
            .from("merchant_memory_retrievals")
            .where("tenant_id", tenantId())
            .where("public_id", input.retrieval_public_id)
            .first();
        if (!retrieval) throw new Exception("Memory retrieval not found", { status: 404, code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND" });
        const returned = new Set((JSON.parse(String(retrieval.returned_memory_ids ?? "[]")) as number[]).map(Number));
        if (!returned.has(Number(memory.id))) {
            throw new Exception("Effectiveness may only be recorded for a memory returned by that retrieval", {
                status: 422,
                code: "E_MERCHANT_MEMORY_EFFECTIVENESS_SCOPE",
            });
        }
        retrievalId = Number(retrieval.id);
    }
    if (input.source_outcome_record_id) {
        const outcome = await currentTrx()
            .from("intelligence_outcome_records")
            .where({ tenant_id: tenantId(), id: input.source_outcome_record_id })
            .first();
        if (!outcome) {
            throw new Exception("Outcome evidence does not belong to this merchant", {
                status: 422,
                code: "E_MERCHANT_MEMORY_OUTCOME_SCOPE",
            });
        }
    }
    const repeatErrorAvoided = input.repeat_error_avoided ?? input.effect_kind === "prevented_repeat_error";
    const [row] = await currentTrx()
        .table("merchant_memory_effectiveness")
        .insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            retrieval_id: retrievalId,
            effect_kind: input.effect_kind,
            usefulness_score: input.usefulness_score ?? null,
            repeat_error_avoided: repeatErrorAvoided,
            decision_reference: input.decision_reference ?? null,
            outcome_reference: input.outcome_reference ?? null,
            source_outcome_record_id: input.source_outcome_record_id ?? null,
            notes: input.notes ?? null,
            measured_at: DateTime.utc().toSQL(),
            recorded_by_user_id: Number(actor.id),
        })
        .returning("id");
    return { id: row.id };
}
