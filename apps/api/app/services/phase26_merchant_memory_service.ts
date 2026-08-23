import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const RETRIEVAL_POLICY_VERSION = "merchant-memory-v1.0.0";

const SECRET_KEY = /(secret|token|password|credential|authorization|cookie|otp|proof|api.?key|private.?key)/i;
const CUSTOMER_RAW_KEY = /(email|phone|mobile|address|postal|national.?id|full.?name|first.?name|last.?name)/i;

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
    source_type:
        | "phase10_case"
        | "phase10_decision"
        | "phase10_outcome"
        | "phase11_policy"
        | "phase11_approval"
        | "phase11_ledger"
        | "phase17_experiment"
        | "phase17_analysis"
        | "phase22_plan"
        | "phase22_conflict"
        | "phase22_outcome"
        | "phase25_run"
        | "phase25_outcome"
        | "phase25_rebalance";
    source_stable_key: string;
    relation?: "supports" | "contradicts" | "context" | "outcome" | "approval" | "experiment" | "portfolio" | "orchestration";
};

export type CreateMemoryInput = {
    memory_class: MemoryClass;
    subject_scope: "merchant" | "supplier" | "campaign" | "pricing" | "customer_segment" | "product" | "architecture" | "policy";
    subject_key?: string | null;
    title: string;
    context: string;
    observed_signals?: unknown[];
    decision?: string | null;
    reason?: string | null;
    alternatives_rejected?: unknown[];
    actor_approvals?: unknown[];
    action?: string | null;
    outcome?: string | null;
    lesson: string;
    confidence: number;
    strength: number;
    sensitivity?: "internal" | "restricted" | "sensitive";
    access_scope?: "merchant_internal" | "decision_center" | "copilot" | "governance_only";
    retention_class?: string;
    contains_customer_level_data?: boolean;
    aggregated_fact?: boolean;
    effective_at?: string;
    expires_at?: string | null;
    evidence: MemoryEvidenceInput[];
};

export type RetrieveMemoryInput = {
    query: string;
    principal_type: "human" | "agent" | "system";
    principal_id: string;
    purpose: string;
    access_scope: "merchant_internal" | "decision_center" | "copilot" | "governance_only";
    memory_classes?: MemoryClass[];
    subject_scope?: CreateMemoryInput["subject_scope"];
    subject_key?: string;
    limit?: number;
    include_history?: boolean;
};

type Row = Record<string, any>;

type SourceDefinition = {
    table: string;
    key: string;
    domain: string;
    select: string[];
    version?: string;
    observedAt?: string;
};

const SOURCES: Record<MemoryEvidenceInput["source_type"], SourceDefinition> = {
    phase10_case: {
        table: "intelligence_cases",
        key: "stable_key",
        domain: "decision_intelligence",
        select: ["id", "stable_key", "kind", "domain", "lifecycle_stage", "signal_state", "severity", "title_en", "summary_en", "recommended_action_en", "priority_score", "score_mode", "version", "freshness_at", "updated_at"],
        version: "version",
        observedAt: "freshness_at",
    },
    phase10_decision: {
        table: "intelligence_decisions",
        key: "id",
        domain: "decision_intelligence",
        select: ["id", "case_id", "decision", "reason", "case_version", "created_at"],
        version: "case_version",
        observedAt: "created_at",
    },
    phase10_outcome: {
        table: "intelligence_outcome_records",
        key: "id",
        domain: "decision_intelligence",
        select: ["id", "case_id", "action_record_id", "metric_name", "baseline_value", "observed_value", "delta", "measurement_window", "attribution_confidence", "observed_at"],
        observedAt: "observed_at",
    },
    phase11_policy: {
        table: "governance_policy_versions",
        key: "content_hash",
        domain: "governance",
        select: ["id", "policy_key", "version", "name", "action_pattern", "effect", "priority", "enabled", "effective_from", "effective_until", "reason", "content_hash", "created_at"],
        version: "version",
        observedAt: "created_at",
    },
    phase11_approval: {
        table: "governance_approval_requests",
        key: "reference",
        domain: "governance",
        select: ["id", "reference", "action_key", "resource_type", "resource_id", "reason", "status", "approved_at", "rejected_at", "executed_at", "updated_at"],
        observedAt: "updated_at",
    },
    phase11_ledger: {
        table: "governance_action_ledger",
        key: "entry_hash",
        domain: "governance",
        select: ["id", "sequence", "event_id", "action_key", "resource_type", "resource_id", "reason", "approval_references", "result_status", "result", "entry_hash", "occurred_at"],
        observedAt: "occurred_at",
    },
    phase17_experiment: {
        table: "experiments",
        key: "experiment_key",
        domain: "experimentation",
        select: ["id", "experiment_key", "name", "hypothesis", "surface", "status", "risk_level", "primary_metric_key", "analysis_method", "approval_reference", "version", "started_at", "stopped_at", "updated_at"],
        version: "version",
        observedAt: "updated_at",
    },
    phase17_analysis: {
        table: "experiment_analysis_runs",
        key: "id",
        domain: "experimentation",
        select: ["id", "experiment_id", "analysis_version", "status", "srm_detected", "causal_strength", "conclusion", "data_cutoff_at", "created_at"],
        version: "analysis_version",
        observedAt: "created_at",
    },
    phase22_plan: {
        table: "agent_plans",
        key: "public_id",
        domain: "orchestration",
        select: ["id", "public_id", "agent_identity_id", "status", "goal", "constraints", "evidence", "expected_outcomes", "risk", "policy_evaluation", "approval_requirement", "verification_plan", "learning_plan", "version", "updated_at"],
        version: "version",
        observedAt: "updated_at",
    },
    phase22_conflict: {
        table: "agent_conflicts",
        key: "public_id",
        domain: "orchestration",
        select: ["id", "public_id", "plan_id", "conflict_summary", "objective_key", "priority_order", "alternatives", "resolution", "resolved_by", "created_at"],
        observedAt: "created_at",
    },
    phase22_outcome: {
        table: "agent_outcome_hooks",
        key: "public_id",
        domain: "orchestration",
        select: ["id", "public_id", "plan_id", "metric_key", "evaluate_after", "baseline", "predicted", "actual", "status", "created_at"],
        observedAt: "created_at",
    },
    phase25_run: {
        table: "growth_portfolio_runs",
        key: "public_id",
        domain: "growth_portfolio",
        select: ["id", "public_id", "plan_id", "plan_version", "solver_version", "input_hash", "status", "expected_value_p10_minor", "expected_value_p50_minor", "expected_value_p90_minor", "resource_utilization", "dependency_plan", "trigger_context", "generated_at"],
        version: "plan_version",
        observedAt: "generated_at",
    },
    phase25_outcome: {
        table: "growth_portfolio_outcomes",
        key: "id",
        domain: "growth_portfolio",
        select: ["id", "run_id", "expected_value_minor", "realized_value_minor", "realization_ratio", "attribution_confidence", "measurement_window", "source_outcome_ids", "measured_at"],
        observedAt: "measured_at",
    },
    phase25_rebalance: {
        table: "growth_portfolio_rebalance_events",
        key: "public_id",
        domain: "growth_portfolio",
        select: ["id", "public_id", "plan_id", "from_run_id", "proposed_run_id", "trigger_kind", "trigger_snapshot", "protected_active_case_ids", "approval_reference", "status", "detected_at", "applied_at"],
        observedAt: "detected_at",
    },
};

const tenantId = () => Number(currentTenantId());

function canonical(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (typeof value === "object") {
        const row = value as Record<string, unknown>;
        return `{${Object.keys(row)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function sha256(value: unknown) {
    return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

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

function containsRawCustomerKeys(value: unknown, depth = 0): boolean {
    if (depth > 5 || value == null) return false;
    if (Array.isArray(value)) return value.some((item) => containsRawCustomerKeys(item, depth + 1));
    if (typeof value !== "object") return false;
    return Object.entries(value as Record<string, unknown>).some(
        ([key, item]) => CUSTOMER_RAW_KEY.test(key) || containsRawCustomerKeys(item, depth + 1),
    );
}

function tokens(value: string) {
    return [...new Set(value.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((item) => item.length > 1))];
}

function rowStatus(row: Row) {
    if (row.status === "superseded" || row.status === "archived") return String(row.status);
    if (row.expires_at && DateTime.fromJSDate(new Date(row.expires_at)) <= DateTime.utc()) return "expired";
    return String(row.status);
}

function present(row: Row) {
    return {
        ...row,
        id: undefined,
        tenant_id: undefined,
        status: rowStatus(row),
        confidence: Number(row.confidence),
        strength: Number(row.strength),
    };
}

async function requireMemory(publicId: string) {
    const row = await currentTrx().from("merchant_memories").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!row) throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    return row;
}

async function resolveEvidence(input: MemoryEvidenceInput) {
    const definition = SOURCES[input.source_type];
    const query = currentTrx().from(definition.table).where("tenant_id", tenantId());
    if (definition.key === "id") {
        const id = Number(input.source_stable_key);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new Exception("Invalid merchant memory evidence identifier", {
                status: 422,
                code: "E_MERCHANT_MEMORY_EVIDENCE_ID",
            });
        }
        query.where(definition.key, id);
    } else {
        query.where(definition.key, input.source_stable_key);
    }
    const row = await query.select(definition.select).first();
    if (!row) {
        throw new Exception("Merchant memory evidence source was not found in this tenant", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EVIDENCE_NOT_FOUND",
        });
    }
    const snapshot = safeEvidence(row) as Record<string, unknown>;
    return {
        source_domain: definition.domain,
        source_type: input.source_type,
        source_stable_key: input.source_stable_key,
        source_record_id: row.id == null ? null : String(row.id),
        source_version: definition.version && row[definition.version] != null ? String(row[definition.version]) : null,
        source_integrity_hash: sha256(snapshot),
        relation: input.relation ?? "supports",
        evidence_summary: snapshot,
        observed_at: definition.observedAt && row[definition.observedAt] ? new Date(row[definition.observedAt]) : null,
    };
}

function assertPrivacy(input: CreateMemoryInput, evidence: Array<{ evidence_summary: unknown }>) {
    const containsCustomerData = input.contains_customer_level_data === true;
    const aggregated = input.aggregated_fact !== false;
    if (containsCustomerData && !aggregated && input.sensitivity === "internal") {
        throw new Exception("Raw customer-level memory must be restricted or sensitive", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RAW_CUSTOMER_RESTRICTED",
        });
    }
    if (!containsCustomerData && evidence.some((item) => containsRawCustomerKeys(item.evidence_summary))) {
        throw new Exception("Evidence contains customer-level fields; classify the memory explicitly", {
            status: 422,
            code: "E_MERCHANT_MEMORY_CUSTOMER_CLASSIFICATION_REQUIRED",
        });
    }
}

export async function overview() {
    const now = new Date();
    const trx = currentTrx();
    const [all, retrievals, feedback] = await Promise.all([
        trx.from("merchant_memories").where("tenant_id", tenantId()).select("status", "expires_at", "memory_class"),
        trx.from("merchant_memory_retrieval_events").where("tenant_id", tenantId()).count("id as count").first(),
        trx
            .from("merchant_memory_effectiveness_observations")
            .where("tenant_id", tenantId())
            .select("useful", "repeat_error_avoided", "stale_memory_avoided"),
    ]);
    const active = all.filter((row) => row.status === "active" && (!row.expires_at || new Date(row.expires_at) > now));
    const usefulRated = feedback.filter((row) => row.useful != null);
    const repeatRated = feedback.filter((row) => row.repeat_error_avoided != null);
    return {
        total_memories: all.length,
        active_memories: active.length,
        superseded_memories: all.filter((row) => row.status === "superseded").length,
        expired_memories: all.filter((row) => row.status === "expired" || (row.expires_at && new Date(row.expires_at) <= now)).length,
        retrieval_count: Number(retrievals?.count ?? 0),
        retrieval_usefulness_rate:
            usefulRated.length === 0 ? null : usefulRated.filter((row) => row.useful === true).length / usefulRated.length,
        repeat_error_avoidance_rate:
            repeatRated.length === 0
                ? null
                : repeatRated.filter((row) => row.repeat_error_avoided === true).length / repeatRated.length,
        stale_memory_avoidance_count: feedback.filter((row) => row.stale_memory_avoided === true).length,
        by_class: Object.fromEntries(
            [...new Set(all.map((row) => String(row.memory_class)))].map((key) => [
                key,
                all.filter((row) => String(row.memory_class) === key).length,
            ]),
        ),
        retrieval_policy_version: RETRIEVAL_POLICY_VERSION,
    };
}

export async function listMemories(filters: {
    status?: string;
    memory_class?: string;
    subject_scope?: string;
    subject_key?: string;
    limit?: number;
} = {}) {
    const query = currentTrx().from("merchant_memories").where("tenant_id", tenantId());
    if (filters.status) query.where("status", filters.status);
    if (filters.memory_class) query.where("memory_class", filters.memory_class);
    if (filters.subject_scope) query.where("subject_scope", filters.subject_scope);
    if (filters.subject_key) query.where("subject_key", filters.subject_key);
    const rows = await query.orderBy("effective_at", "desc").limit(Math.min(200, Math.max(1, Number(filters.limit ?? 100))));
    return rows.map(present);
}

export async function memoryDetail(publicId: string) {
    const row = await requireMemory(publicId);
    const [sources, inbound, outbound] = await Promise.all([
        currentTrx().from("merchant_memory_evidence_links").where({ tenant_id: tenantId(), memory_id: row.id }).orderBy("id"),
        currentTrx()
            .from("merchant_memory_lineage as lineage")
            .join("merchant_memories as previous", "previous.id", "lineage.from_memory_id")
            .where({ "lineage.tenant_id": tenantId(), "lineage.to_memory_id": row.id })
            .select("lineage.relation", "lineage.reason", "lineage.evidence_delta", "lineage.created_at", "previous.public_id as from_public_id", "previous.title as from_title"),
        currentTrx()
            .from("merchant_memory_lineage as lineage")
            .join("merchant_memories as next", "next.id", "lineage.to_memory_id")
            .where({ "lineage.tenant_id": tenantId(), "lineage.from_memory_id": row.id })
            .select("lineage.relation", "lineage.reason", "lineage.evidence_delta", "lineage.created_at", "next.public_id as to_public_id", "next.title as to_title"),
    ]);
    return { ...present(row), evidence: sources, lineage: { inbound, outbound } };
}

export async function createMemory(input: CreateMemoryInput, actor: User) {
    if (!input.evidence?.length) {
        throw new Exception("Merchant memory requires at least one source-linked evidence record", {
            status: 422,
            code: "E_MERCHANT_MEMORY_EVIDENCE_REQUIRED",
        });
    }
    const evidence = await Promise.all(input.evidence.map(resolveEvidence));
    assertPrivacy(input, evidence);
    const publicId = randomUUID();
    const now = DateTime.utc();
    const [row] = await currentTrx()
        .table("merchant_memories")
        .insert({
            public_id: publicId,
            tenant_id: tenantId(),
            memory_class: input.memory_class,
            subject_scope: input.subject_scope,
            subject_key: input.subject_key ?? null,
            title: input.title,
            context: input.context,
            observed_signals: JSON.stringify(safeEvidence(input.observed_signals ?? [])),
            decision: input.decision ?? null,
            reason: input.reason ?? null,
            alternatives_rejected: JSON.stringify(safeEvidence(input.alternatives_rejected ?? [])),
            actor_approvals: JSON.stringify(safeEvidence(input.actor_approvals ?? [])),
            action: input.action ?? null,
            outcome: input.outcome ?? null,
            lesson: input.lesson,
            confidence: input.confidence,
            strength: input.strength,
            status: "active",
            sensitivity: input.sensitivity ?? "internal",
            access_scope: input.access_scope ?? "merchant_internal",
            retention_class: input.retention_class ?? "business_learning",
            contains_customer_level_data: input.contains_customer_level_data ?? false,
            aggregated_fact: input.aggregated_fact ?? true,
            effective_at: input.effective_at ? new Date(input.effective_at) : now.toJSDate(),
            expires_at: input.expires_at ? new Date(input.expires_at) : null,
            last_validated_at: now.toJSDate(),
            version: 1,
            created_by_user_id: actor.id,
            created_at: now.toJSDate(),
            updated_at: now.toJSDate(),
        })
        .returning(["id"]);
    await currentTrx().table("merchant_memory_evidence_links").insert(
        evidence.map((item) => ({
            tenant_id: tenantId(),
            memory_id: row.id,
            ...item,
            evidence_summary: JSON.stringify(item.evidence_summary),
            created_at: now.toJSDate(),
        })),
    );
    return memoryDetail(publicId);
}

export async function supersedeMemory(
    predecessorPublicId: string,
    input: CreateMemoryInput & { relation: "supersedes" | "contradicts" | "refines" | "reaffirms"; lineage_reason: string },
    actor: User,
) {
    const predecessor = await requireMemory(predecessorPublicId);
    if (rowStatus(predecessor) !== "active") {
        throw new Exception("Only active merchant memory may be superseded or refined", {
            status: 409,
            code: "E_MERCHANT_MEMORY_PREDECESSOR_INACTIVE",
        });
    }
    const successor = await createMemory(input, actor);
    const successorRow = await requireMemory(successor.public_id);
    await currentTrx().table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: predecessor.id,
        to_memory_id: successorRow.id,
        relation: input.relation,
        reason: input.lineage_reason,
        evidence_delta: JSON.stringify(
            (successor.evidence ?? []).map((item: Row) => ({ source_type: item.source_type, source_stable_key: item.source_stable_key })),
        ),
        created_by_user_id: actor.id,
        created_at: new Date(),
    });
    if (input.relation === "supersedes") {
        await currentTrx()
            .from("merchant_memories")
            .where({ tenant_id: tenantId(), id: predecessor.id })
            .update({ status: "superseded", updated_at: new Date() });
    }
    return memoryDetail(successor.public_id);
}

function accessAllowed(row: Row, input: RetrieveMemoryInput) {
    if (input.principal_type !== "human" && row.access_scope === "governance_only") return false;
    if (input.principal_type === "agent" && row.sensitivity !== "internal") return false;
    if (input.principal_type === "agent" && row.contains_customer_level_data && !row.aggregated_fact) return false;
    if (input.access_scope === "copilot" && !["copilot", "merchant_internal"].includes(row.access_scope)) return false;
    if (input.access_scope === "decision_center" && !["decision_center", "merchant_internal"].includes(row.access_scope)) return false;
    if (input.access_scope === "governance_only" && row.access_scope !== "governance_only") return false;
    return true;
}

function relevance(row: Row, queryTokens: string[]) {
    const haystack = tokens(`${row.title ?? ""} ${row.context ?? ""} ${row.lesson ?? ""} ${row.reason ?? ""} ${row.subject_key ?? ""}`);
    const overlap = queryTokens.filter((token) => haystack.includes(token)).length / Math.max(1, queryTokens.length);
    const confidence = Number(row.confidence ?? 0.5);
    const strength = Number(row.strength ?? 0.5);
    const ageDays = Math.max(0, DateTime.utc().diff(DateTime.fromJSDate(new Date(row.effective_at)), "days").days);
    const freshness = 1 / (1 + ageDays / 180);
    return overlap * 0.58 + confidence * 0.16 + strength * 0.16 + freshness * 0.1;
}

export async function retrieveMemories(input: RetrieveMemoryInput) {
    const queryTokens = tokens(input.query);
    const baseQuery = currentTrx().from("merchant_memories").where("tenant_id", tenantId());
    if (input.memory_classes?.length) baseQuery.whereIn("memory_class", input.memory_classes);
    if (input.subject_scope) baseQuery.where("subject_scope", input.subject_scope);
    if (input.subject_key) baseQuery.where("subject_key", input.subject_key);
    const rows = await baseQuery.orderBy("effective_at", "desc").limit(500);
    const expired = rows.filter((row) => rowStatus(row) === "expired");
    const superseded = rows.filter((row) => rowStatus(row) === "superseded");
    const candidates = rows.filter((row) => {
        const status = rowStatus(row);
        if (!input.include_history && status !== "active") return false;
        return status !== "archived";
    });
    const permissionFiltered = candidates.filter((row) => !accessAllowed(row, input));
    const permitted = candidates.filter((row) => accessAllowed(row, input));
    const ranked = permitted
        .map((row) => ({ row, score: relevance(row, queryTokens) }))
        .filter((item) => queryTokens.length === 0 || item.score > 0.1)
        .sort((a, b) => b.score - a.score || new Date(b.row.effective_at).getTime() - new Date(a.row.effective_at).getTime())
        .slice(0, Math.min(50, Math.max(1, Number(input.limit ?? 10))));

    const results = await Promise.all(
        ranked.map(async ({ row, score }) => {
            const evidence = await currentTrx()
                .from("merchant_memory_evidence_links")
                .where({ tenant_id: tenantId(), memory_id: row.id })
                .select("source_domain", "source_type", "source_stable_key", "source_record_id", "source_version", "source_integrity_hash", "relation", "evidence_summary", "observed_at")
                .orderBy("id");
            return { ...present(row), retrieval_score: Number(score.toFixed(6)), evidence };
        }),
    );

    const retrievalPublicId = randomUUID();
    await currentTrx().table("merchant_memory_retrieval_events").insert({
        public_id: retrievalPublicId,
        tenant_id: tenantId(),
        principal_type: input.principal_type,
        principal_id: input.principal_id,
        purpose: input.purpose,
        access_scope: input.access_scope,
        query_hash: sha256(input.query.trim().toLocaleLowerCase()),
        filters: JSON.stringify({
            memory_classes: input.memory_classes ?? [],
            subject_scope: input.subject_scope ?? null,
            subject_key: input.subject_key ?? null,
            include_history: input.include_history ?? false,
            policy_version: RETRIEVAL_POLICY_VERSION,
        }),
        returned_memory_public_ids: JSON.stringify(results.map((item) => item.public_id)),
        result_count: results.length,
        expired_filtered_count: input.include_history ? 0 : expired.length,
        permission_filtered_count: permissionFiltered.length,
        superseded_filtered_count: input.include_history ? 0 : superseded.length,
        retrieved_at: new Date(),
    });
    return {
        retrieval_public_id: retrievalPublicId,
        retrieval_policy_version: RETRIEVAL_POLICY_VERSION,
        results,
        filtered: {
            expired: input.include_history ? 0 : expired.length,
            superseded: input.include_history ? 0 : superseded.length,
            permission: permissionFiltered.length,
        },
    };
}

export async function listRetrievals(limit = 100) {
    return currentTrx()
        .from("merchant_memory_retrieval_events")
        .where("tenant_id", tenantId())
        .orderBy("retrieved_at", "desc")
        .limit(Math.min(200, Math.max(1, Number(limit))));
}

export async function recordEffectiveness(
    retrievalPublicId: string,
    input: {
        observation_kind: "retrieval_feedback" | "decision_followup" | "incident_followup" | "supersession_quality";
        useful?: boolean | null;
        accepted?: boolean | null;
        repeat_error_avoided?: boolean | null;
        stale_memory_avoided?: boolean | null;
        notes?: string | null;
    },
    actor: User,
) {
    const retrieval = await currentTrx()
        .from("merchant_memory_retrieval_events")
        .where({ tenant_id: tenantId(), public_id: retrievalPublicId })
        .first();
    if (!retrieval) {
        throw new Exception("Merchant memory retrieval not found", {
            status: 404,
            code: "E_MERCHANT_MEMORY_RETRIEVAL_NOT_FOUND",
        });
    }
    const [row] = await currentTrx()
        .table("merchant_memory_effectiveness_observations")
        .insert({
            tenant_id: tenantId(),
            retrieval_event_id: retrieval.id,
            observation_kind: input.observation_kind,
            useful: input.useful ?? null,
            accepted: input.accepted ?? null,
            repeat_error_avoided: input.repeat_error_avoided ?? null,
            stale_memory_avoided: input.stale_memory_avoided ?? null,
            notes: input.notes ?? null,
            recorded_by_user_id: actor.id,
            observed_at: new Date(),
        })
        .returning(["id", "observation_kind", "useful", "accepted", "repeat_error_avoided", "stale_memory_avoided", "notes", "observed_at"]);
    return row;
}
