import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const SECRET_KEY = /(secret|token|password|credential|authorization|cookie|otp|proof|api.?key|private.?key)/i;
const MEMORY_CLASSES = new Set([
    "operational_incident",
    "supplier_lesson",
    "campaign_lesson",
    "pricing_lesson",
    "customer_segment_behavior",
    "product_quality",
    "architecture_process_decision",
    "policy_precedent",
]);

const SOURCE_TABLES = new Map<string, { table: string; idColumn: string }>([
    ["phase10.intelligence_case", { table: "intelligence_cases", idColumn: "id" }],
    ["phase10.intelligence_decision", { table: "intelligence_decisions", idColumn: "id" }],
    ["phase10.intelligence_action", { table: "intelligence_action_records", idColumn: "id" }],
    ["phase10.intelligence_outcome", { table: "intelligence_outcome_records", idColumn: "id" }],
    ["phase11.governance_approval", { table: "governance_approval_requests", idColumn: "id" }],
    ["phase11.governance_ledger", { table: "governance_action_ledger", idColumn: "id" }],
    ["phase17.experiment", { table: "experiments", idColumn: "id" }],
    ["phase17.experiment_analysis", { table: "experiment_analysis_runs", idColumn: "id" }],
    ["phase17.causal_knowledge", { table: "experiment_causal_knowledge", idColumn: "id" }],
    ["phase22.agent_plan", { table: "agent_plans", idColumn: "id" }],
    ["phase22.agent_tool_run", { table: "agent_tool_runs", idColumn: "id" }],
    ["phase22.agent_outcome_hook", { table: "agent_outcome_hooks", idColumn: "id" }],
    ["phase25.portfolio_run", { table: "growth_portfolio_runs", idColumn: "id" }],
    ["phase25.portfolio_outcome", { table: "growth_portfolio_outcomes", idColumn: "id" }],
    ["phase25.rebalance_event", { table: "growth_portfolio_rebalance_events", idColumn: "id" }],
]);

export type MerchantMemorySourceInput = {
    source_domain: "phase10" | "phase11" | "phase17" | "phase22" | "phase25";
    source_kind: string;
    source_id?: string | number | null;
    source_route?: string | null;
    source_version?: string | null;
    evidence_role?: "primary" | "supporting" | "contradicting" | "outcome" | "approval" | "action";
    evidence_snapshot?: Record<string, unknown>;
    freshness_at?: string;
};

export type MerchantMemoryInput = {
    memory_key: string;
    memory_class: string;
    subject_scope?: "merchant" | "aggregate" | "segment" | "supplier" | "product" | "process" | "policy";
    subject_key?: string | null;
    title: string;
    context?: Record<string, unknown>;
    observed_signals?: unknown[];
    decision?: string | null;
    reason: string;
    alternatives_rejected?: unknown[];
    actor_snapshot?: Record<string, unknown>;
    approval_references?: unknown[];
    action_snapshot?: Record<string, unknown>;
    outcome_snapshot?: Record<string, unknown>;
    lesson: string;
    confidence: number;
    strength?: number;
    sensitivity?: "aggregate" | "internal" | "restricted";
    retention_class?: "short" | "standard" | "extended" | "legal_hold";
    minimum_role?: "agent" | "admin";
    relevant_from?: string;
    expires_at?: string | null;
    sources: MerchantMemorySourceInput[];
};

export type MerchantMemoryRetrieveInput = {
    query: string;
    purpose: string;
    requester_kind: "human" | "agent" | "system";
    requester_id?: string | null;
    memory_class?: string | null;
    subject_scope?: string | null;
    subject_key?: string | null;
    limit?: number;
};

const tenantId = () => Number(currentTenantId());

function safeEvidence(value: unknown, depth = 0): unknown {
    if (depth > 6) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeEvidence(item, depth + 1));
    if (value && typeof value === "object") {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
            output[key] = SECRET_KEY.test(key) ? "[redacted]" : safeEvidence(item, depth + 1);
        }
        return output;
    }
    if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
    return value;
}

function canonical(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function sha256(value: unknown) {
    return createHash("sha256").update(canonical(value)).digest("hex");
}

function tokenize(value: string) {
    return new Set(
        value
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}_-]+/gu, " ")
            .split(/\s+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2)
            .slice(0, 80),
    );
}

function lexicalScore(query: Set<string>, text: string) {
    if (query.size === 0) return 0;
    const haystack = tokenize(text);
    let overlap = 0;
    for (const token of query) if (haystack.has(token)) overlap += 1;
    return overlap / query.size;
}

function validateInput(input: MerchantMemoryInput) {
    if (!MEMORY_CLASSES.has(input.memory_class)) {
        throw new Exception("Unsupported merchant memory class", { status: 422, code: "E_MERCHANT_MEMORY_CLASS" });
    }
    if (!input.memory_key.trim() || !input.title.trim() || !input.reason.trim() || !input.lesson.trim()) {
        throw new Exception("Merchant memory requires key, title, reason and lesson", {
            status: 422,
            code: "E_MERCHANT_MEMORY_REQUIRED",
        });
    }
    if (input.confidence < 0 || input.confidence > 1 || (input.strength ?? 0.5) < 0 || (input.strength ?? 0.5) > 1) {
        throw new Exception("Merchant memory confidence and strength must be between 0 and 1", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SCORE",
        });
    }
    if (!input.sources.length) {
        throw new Exception("Merchant memory must have at least one source", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_REQUIRED",
        });
    }
    if (input.sensitivity === "restricted") {
        if (input.minimum_role !== "admin" || !input.expires_at) {
            throw new Exception("Restricted memory requires admin-only access and an expiry", {
                status: 422,
                code: "E_MERCHANT_MEMORY_RESTRICTED_RETENTION",
            });
        }
        const expiry = DateTime.fromISO(input.expires_at);
        if (!expiry.isValid || expiry.diffNow("days").days > 90) {
            throw new Exception("Restricted memory expiry must be valid and within 90 days", {
                status: 422,
                code: "E_MERCHANT_MEMORY_RESTRICTED_EXPIRY",
            });
        }
    }
}

async function validateSource(source: MerchantMemorySourceInput) {
    const key = `${source.source_domain}.${source.source_kind}`;
    const mapping = SOURCE_TABLES.get(key);
    if (!mapping) {
        throw new Exception(`Unsupported merchant memory source: ${key}`, {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_UNSUPPORTED",
        });
    }
    if (source.source_id == null) {
        throw new Exception("Canonical merchant memory source requires source_id", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_ID_REQUIRED",
        });
    }
    const row = await currentTrx()
        .from(mapping.table)
        .where("tenant_id", tenantId())
        .where(mapping.idColumn, Number(source.source_id))
        .first();
    if (!row) {
        throw new Exception("Merchant memory source was not found in the current tenant", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
        });
    }
    return row;
}

async function sourcesFor(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, any[]>();
    const rows = await currentTrx()
        .from("merchant_memory_sources")
        .where("tenant_id", tenantId())
        .whereIn("memory_id", memoryIds)
        .orderBy("freshness_at", "desc");
    const map = new Map<number, any[]>();
    for (const row of rows) {
        const current = map.get(Number(row.memory_id)) ?? [];
        current.push(row);
        map.set(Number(row.memory_id), current);
    }
    return map;
}

export async function createMerchantMemory(input: MerchantMemoryInput, actor: User | null) {
    validateInput(input);
    const validatedSources: Array<{ input: MerchantMemorySourceInput; row: Record<string, unknown> }> = [];
    for (const source of input.sources) validatedSources.push({ input: source, row: await validateSource(source) });

    const trx = currentTrx();
    const now = DateTime.utc();
    const latest = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("memory_key", input.memory_key)
        .orderBy("version", "desc")
        .first();
    if (latest?.status === "active") {
        throw new Exception("An active merchant memory already exists for this key; supersede it instead", {
            status: 409,
            code: "E_MERCHANT_MEMORY_ACTIVE_VERSION",
        });
    }

    const [memory] = await trx
        .table("merchant_memories")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            memory_key: input.memory_key.trim(),
            memory_class: input.memory_class,
            subject_scope: input.subject_scope ?? "merchant",
            subject_key: input.subject_key?.trim() || null,
            title: input.title.trim(),
            context: JSON.stringify(safeEvidence(input.context ?? {})),
            observed_signals: JSON.stringify(safeEvidence(input.observed_signals ?? [])),
            decision: input.decision?.trim() || null,
            reason: input.reason.trim(),
            alternatives_rejected: JSON.stringify(safeEvidence(input.alternatives_rejected ?? [])),
            actor_snapshot: JSON.stringify(safeEvidence(input.actor_snapshot ?? {})),
            approval_references: JSON.stringify(safeEvidence(input.approval_references ?? [])),
            action_snapshot: JSON.stringify(safeEvidence(input.action_snapshot ?? {})),
            outcome_snapshot: JSON.stringify(safeEvidence(input.outcome_snapshot ?? {})),
            lesson: input.lesson.trim(),
            confidence: input.confidence,
            strength: input.strength ?? 0.5,
            status: "active",
            sensitivity: input.sensitivity ?? "internal",
            retention_class: input.retention_class ?? "standard",
            minimum_role: input.minimum_role ?? "agent",
            relevant_from: input.relevant_from ? DateTime.fromISO(input.relevant_from).toUTC().toSQL() : now.toSQL(),
            expires_at: input.expires_at ? DateTime.fromISO(input.expires_at).toUTC().toSQL() : null,
            last_confirmed_at: now.toSQL(),
            version: Number(latest?.version ?? 0) + 1,
            created_by_user_id: actor ? Number(actor.id) : null,
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning("*");

    for (const source of validatedSources) {
        const safeSnapshot = safeEvidence(source.input.evidence_snapshot ?? {});
        await trx.table("merchant_memory_sources").insert({
            tenant_id: tenantId(),
            memory_id: memory.id,
            source_domain: source.input.source_domain,
            source_kind: source.input.source_kind,
            source_id: String(source.input.source_id),
            source_route: source.input.source_route ?? null,
            source_version: source.input.source_version ?? null,
            evidence_role: source.input.evidence_role ?? "supporting",
            content_hash: sha256({ source: safeSnapshot, source_id: source.input.source_id, source_version: source.input.source_version }),
            evidence_snapshot: JSON.stringify(safeSnapshot),
            freshness_at: source.input.freshness_at ? DateTime.fromISO(source.input.freshness_at).toUTC().toSQL() : now.toSQL(),
            created_at: now.toSQL(),
        });
    }

    return getMerchantMemory(memory.public_id, "human");
}

export async function getMerchantMemory(publicId: string, requesterKind: "human" | "agent" | "system") {
    const trx = currentTrx();
    const row = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .first();
    if (!row) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    if (requesterKind === "agent" && (row.minimum_role === "admin" || row.sensitivity === "restricted")) {
        throw new Exception("Merchant memory is not available to this requester", {
            status: 403,
            code: "E_MERCHANT_MEMORY_PERMISSION",
        });
    }
    const sources = await sourcesFor([Number(row.id)]);
    return { ...row, sources: sources.get(Number(row.id)) ?? [] };
}

export async function retrieveMerchantMemory(input: MerchantMemoryRetrieveInput, actor: User | null) {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const limit = Math.max(1, Math.min(20, input.limit ?? 8));
    let query = trx.from("merchant_memories").where("tenant_id", tenantId());
    if (input.memory_class) query = query.where("memory_class", input.memory_class);
    if (input.subject_scope) query = query.where("subject_scope", input.subject_scope);
    if (input.subject_key) query = query.where("subject_key", input.subject_key);
    const candidates = await query.orderBy("updated_at", "desc").limit(250);

    let expiredFiltered = 0;
    let permissionFiltered = 0;
    let supersededFiltered = 0;
    const eligible = candidates.filter((row) => {
        if (row.status !== "active") {
            supersededFiltered += 1;
            return false;
        }
        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
            expiredFiltered += 1;
            return false;
        }
        if (input.requester_kind === "agent" && (row.minimum_role === "admin" || row.sensitivity === "restricted")) {
            permissionFiltered += 1;
            return false;
        }
        return true;
    });

    const queryTokens = tokenize(input.query);
    const ranked = eligible
        .map((row) => {
            const text = [row.title, row.reason, row.lesson, row.memory_class, row.subject_key ?? ""].join(" ");
            const lexical = lexicalScore(queryTokens, text);
            const confidence = Number(row.confidence ?? 0);
            const strength = Number(row.strength ?? 0);
            const recencyDays = Math.max(0, (Date.now() - new Date(row.updated_at).getTime()) / 86400000);
            const recency = 1 / (1 + recencyDays / 30);
            return { row, retrieval_score: lexical * 0.6 + confidence * 0.18 + strength * 0.14 + recency * 0.08 };
        })
        .filter((entry) => queryTokens.size === 0 || entry.retrieval_score > 0.05)
        .sort((a, b) => b.retrieval_score - a.retrieval_score)
        .slice(0, limit);

    const sourceMap = await sourcesFor(ranked.map((entry) => Number(entry.row.id)));
    const [event] = await trx
        .table("merchant_memory_retrieval_events")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            requester_kind: input.requester_kind,
            requester_id: input.requester_id ?? (actor ? String(actor.id) : null),
            purpose: input.purpose,
            query_hash: sha256(input.query),
            query_features: JSON.stringify({
                memory_class: input.memory_class ?? null,
                subject_scope: input.subject_scope ?? null,
                subject_key: input.subject_key ?? null,
                token_count: queryTokens.size,
            }),
            retrieved_memory_ids: JSON.stringify(ranked.map((entry) => Number(entry.row.id))),
            result_count: ranked.length,
            expired_filtered_count: expiredFiltered,
            permission_filtered_count: permissionFiltered,
            superseded_filtered_count: supersededFiltered,
            created_at: now,
        })
        .returning("*");

    return {
        retrieval_event_public_id: event.public_id,
        memories: ranked.map((entry) => ({
            ...entry.row,
            retrieval_score: Number(entry.retrieval_score.toFixed(6)),
            sources: sourceMap.get(Number(entry.row.id)) ?? [],
        })),
        filtered: {
            expired: expiredFiltered,
            permission: permissionFiltered,
            superseded: supersededFiltered,
        },
    };
}

export async function supersedeMerchantMemory(
    predecessorPublicId: string,
    input: MerchantMemoryInput & { relationship?: "supersedes" | "refines" | "contradicts"; reason_kind: string; lineage_reason: string },
    actor: User | null,
) {
    const trx = currentTrx();
    const predecessor = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("public_id", predecessorPublicId)
        .first();
    if (!predecessor) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    if (predecessor.status !== "active") {
        throw new Exception("Only active merchant memory can be superseded", {
            status: 409,
            code: "E_MERCHANT_MEMORY_NOT_ACTIVE",
        });
    }
    if (input.memory_key !== predecessor.memory_key) {
        throw new Exception("Successor memory must preserve memory_key lineage", {
            status: 422,
            code: "E_MERCHANT_MEMORY_LINEAGE_KEY",
        });
    }

    await trx.from("merchant_memories").where("id", predecessor.id).update({ status: "superseded", updated_at: DateTime.utc().toSQL() });
    const successor = await createMerchantMemory(input, actor);
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        memory_id: successor.id,
        predecessor_memory_id: predecessor.id,
        relationship: input.relationship ?? "supersedes",
        reason_kind: input.reason_kind,
        reason: input.lineage_reason,
        created_at: DateTime.utc().toSQL(),
        created_by_user_id: actor ? Number(actor.id) : null,
    });
    return getMerchantMemory(successor.public_id, "human");
}

export async function recordMerchantMemoryFeedback(
    retrievalEventPublicId: string,
    input: {
        feedback_kind: "useful" | "not_useful" | "applied" | "ignored" | "harmful";
        usefulness_score?: number | null;
        repeat_error_prevented?: boolean | null;
        decision_changed?: boolean | null;
        applied_memory_public_ids?: string[];
        notes?: string | null;
    },
    actor: User | null,
) {
    const trx = currentTrx();
    const event = await trx
        .from("merchant_memory_retrieval_events")
        .where("tenant_id", tenantId())
        .where("public_id", retrievalEventPublicId)
        .first();
    if (!event) throw new Exception("Merchant memory retrieval event not found", { status: 404, code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND" });
    if (input.usefulness_score != null && (input.usefulness_score < 0 || input.usefulness_score > 1)) {
        throw new Exception("Usefulness score must be between 0 and 1", { status: 422, code: "E_MERCHANT_MEMORY_FEEDBACK_SCORE" });
    }
    const appliedRows = input.applied_memory_public_ids?.length
        ? await trx
              .from("merchant_memories")
              .where("tenant_id", tenantId())
              .whereIn("public_id", input.applied_memory_public_ids)
              .select("id")
        : [];
    await trx.table("merchant_memory_feedback").insert({
        tenant_id: tenantId(),
        retrieval_event_id: event.id,
        feedback_kind: input.feedback_kind,
        usefulness_score: input.usefulness_score ?? null,
        repeat_error_prevented: input.repeat_error_prevented ?? null,
        decision_changed: input.decision_changed ?? null,
        applied_memory_ids: JSON.stringify(appliedRows.map((row) => Number(row.id))),
        notes: input.notes ?? null,
        recorded_by_user_id: actor ? Number(actor.id) : null,
        created_at: DateTime.utc().toSQL(),
    });
    return merchantMemoryOverview();
}

export async function merchantMemoryOverview() {
    const trx = currentTrx();
    const now = DateTime.utc().toSQL();
    const [counts, feedback, retrievals] = await Promise.all([
        trx
            .from("merchant_memories")
            .where("tenant_id", tenantId())
            .select("memory_class", "status")
            .count("id as count")
            .groupBy("memory_class", "status"),
        trx
            .from("merchant_memory_feedback")
            .where("tenant_id", tenantId())
            .select("feedback_kind")
            .count("id as count")
            .avg("usefulness_score as avg_usefulness")
            .groupBy("feedback_kind"),
        trx
            .from("merchant_memory_retrieval_events")
            .where("tenant_id", tenantId())
            .where("created_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL())
            .count("id as count")
            .sum("result_count as result_count")
            .sum("permission_filtered_count as permission_filtered_count")
            .first(),
    ]);
    const expiringSoon = await trx
        .from("merchant_memories")
        .where("tenant_id", tenantId())
        .where("status", "active")
        .whereNotNull("expires_at")
        .where("expires_at", ">", now)
        .where("expires_at", "<=", DateTime.utc().plus({ days: 14 }).toSQL())
        .count("id as count")
        .first();
    return {
        memory_counts: counts,
        feedback,
        retrievals_30d: retrievals ?? { count: 0, result_count: 0, permission_filtered_count: 0 },
        expiring_14d: Number(expiringSoon?.count ?? 0),
        source_authorities: [...SOURCE_TABLES.keys()],
    };
}
