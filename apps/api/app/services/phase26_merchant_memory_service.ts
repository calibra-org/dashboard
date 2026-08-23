import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { requireApprovedAgentPrincipal } from "#services/merchant_memory/permissions";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const MERCHANT_MEMORY_VERSION = "merchant-memory-v1.1.0";

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
        | "phase10_action"
        | "phase10_outcome"
        | "phase11_approval"
        | "phase11_policy"
        | "phase17_experiment"
        | "phase17_analysis"
        | "phase22_plan"
        | "phase22_outcome_hook"
        | "phase25_portfolio_run"
        | "phase25_portfolio_outcome"
        | "phase25_rebalance";
    source_record_ref: string;
    evidence_role: "supporting" | "contradicting" | "outcome" | "approval" | "context";
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
    confidence: number;
    strength: number;
    privacy_mode: "aggregated" | "redacted" | "restricted";
    visibility_scope: "tenant_admin" | "approved_agents" | "restricted_humans";
    purpose_tags?: string[];
    valid_from: string;
    expires_at?: string | null;
    evidence: MemoryEvidenceInput[];
};

export type MemoryReplacementInput = Omit<MemoryCreateInput, "stable_key">;

export type MemoryRetrieveInput = {
    requester_type: "human" | "agent" | "system";
    requester_ref?: string | null;
    purpose: string;
    query: string;
    memory_classes?: MemoryClass[];
    min_confidence?: number;
    include_history?: boolean;
    limit?: number;
};

type MemoryRow = {
    id: number;
    public_id: string;
    memory_class: MemoryClass;
    stable_key: string;
    version: number | string;
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

type CanonicalEvidence = {
    source_type: MemoryEvidenceInput["source_type"];
    source_authority: string;
    source_record_ref: string;
    evidence_role: MemoryEvidenceInput["evidence_role"];
    content_hash: string;
    source_metadata: Record<string, unknown>;
    observed_at: string | null;
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

function parsePositiveId(ref: string, code: string) {
    const id = Number(ref);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Exception("Canonical evidence reference must be a positive numeric identifier", {
            status: 422,
            code,
        });
    }
    return id;
}

function isRestricted(row: Pick<MemoryRow, "privacy_mode" | "visibility_scope">) {
    return row.privacy_mode === "restricted" || row.visibility_scope === "restricted_humans";
}

function publicMemory(row: MemoryRow, evidence: unknown[] = [], lineage: unknown[] = []) {
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
        lineage,
    };
}

function assertPrivacy(input: Pick<MemoryCreateInput, "memory_class" | "privacy_mode" | "visibility_scope" | "purpose_tags">) {
    if (input.privacy_mode === "restricted" && input.visibility_scope !== "restricted_humans") {
        throw new Exception("Restricted merchant memory must remain human-restricted", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RESTRICTED_SCOPE",
        });
    }
    if (input.visibility_scope === "approved_agents" && input.privacy_mode === "restricted") {
        throw new Exception("Restricted merchant memory cannot be exposed to agents", {
            status: 422,
            code: "E_MERCHANT_MEMORY_AGENT_RESTRICTED",
        });
    }
    if (input.memory_class === "customer_segment_behavior" && (input.purpose_tags ?? []).includes("customer_level_raw")) {
        throw new Exception("Raw customer-level sensitive memory must not enter merchant memory", {
            status: 422,
            code: "E_MERCHANT_MEMORY_RAW_CUSTOMER_MEMORY_FORBIDDEN",
        });
    }
}

async function canonicalEvidence(input: MemoryEvidenceInput): Promise<CanonicalEvidence> {
    const trx = currentTrx();
    const tenant = tenantId();
    let row: Record<string, unknown> | undefined;
    let authority = "";
    let safeMetadata: Record<string, unknown> = {};

    if (input.source_type === "phase10_case") {
        authority = "intelligence_cases";
        row = await trx.from(authority).where("tenant_id", tenant).where("stable_key", input.source_record_ref).first();
        if (row) safeMetadata = { stable_key: row.stable_key, kind: row.kind, domain: row.domain, version: row.version };
    } else if (input.source_type === "phase10_decision") {
        authority = "intelligence_decisions";
        const id = parsePositiveId(input.source_record_ref, "E_MERCHANT_MEMORY_PHASE10_DECISION_REF");
        row = await trx.from(authority).where("tenant_id", tenant).where("id", id).first();
        if (row) safeMetadata = { id: row.id, case_id: row.case_id, decision: row.decision, case_version: row.case_version };
    } else if (input.source_type === "phase10_action") {
        authority = "intelligence_action_records";
        const id = parsePositiveId(input.source_record_ref, "E_MERCHANT_MEMORY_PHASE10_ACTION_REF");
        row = await trx.from(authority).where("tenant_id", tenant).where("id", id).first();
        if (row) safeMetadata = { id: row.id, case_id: row.case_id, decision_id: row.decision_id, action_kind: row.action_kind, status: row.status };
    } else if (input.source_type === "phase10_outcome") {
        authority = "intelligence_outcome_records";
        const id = parsePositiveId(input.source_record_ref, "E_MERCHANT_MEMORY_PHASE10_OUTCOME_REF");
        row = await trx.from(authority).where("tenant_id", tenant).where("id", id).first();
        if (row) safeMetadata = { id: row.id, case_id: row.case_id, action_record_id: row.action_record_id, metric_name: row.metric_name, observed_at: row.observed_at };
    } else if (input.source_type === "phase11_approval") {
        authority = "governance_approval_requests";
        row = await trx.from(authority).where("tenant_id", tenant).where("reference", input.source_record_ref).first();
        if (row) safeMetadata = { reference: row.reference, action_key: row.action_key, resource_type: row.resource_type, resource_id: row.resource_id, status: row.status };
    } else if (input.source_type === "phase11_policy") {
        authority = "governance_policy_versions";
        const [policyKey, versionText] = input.source_record_ref.split("@");
        const version = Number(versionText);
        if (!policyKey || !Number.isSafeInteger(version) || version <= 0) {
            throw new Exception("Phase 11 policy evidence must use policy_key@version", {
                status: 422,
                code: "E_MERCHANT_MEMORY_PHASE11_POLICY_REF",
            });
        }
        row = await trx.from(authority).where("tenant_id", tenant).where("policy_key", policyKey).where("version", version).first();
        if (row) safeMetadata = { policy_key: row.policy_key, version: row.version, effect: row.effect, action_pattern: row.action_pattern };
    } else if (input.source_type === "phase17_experiment") {
        authority = "experiments";
        row = await trx.from(authority).where("tenant_id", tenant).where("experiment_key", input.source_record_ref).first();
        if (row) safeMetadata = { experiment_key: row.experiment_key, status: row.status, risk_level: row.risk_level, version: row.version };
    } else if (input.source_type === "phase17_analysis") {
        authority = "experiment_analysis_runs";
        const id = parsePositiveId(input.source_record_ref, "E_MERCHANT_MEMORY_PHASE17_ANALYSIS_REF");
        row = await trx.from(authority).where("tenant_id", tenant).where("id", id).first();
        if (row) safeMetadata = { id: row.id, experiment_id: row.experiment_id, analysis_version: row.analysis_version, status: row.status, created_at: row.created_at };
    } else if (input.source_type === "phase22_plan") {
        authority = "agent_plans";
        row = await trx.from(authority).where("tenant_id", tenant).where("public_id", input.source_record_ref).first();
        if (row) safeMetadata = { public_id: row.public_id, agent_identity_id: row.agent_identity_id, status: row.status, version: row.version };
    } else if (input.source_type === "phase22_outcome_hook") {
        authority = "agent_outcome_hooks";
        row = await trx.from(authority).where("tenant_id", tenant).where("public_id", input.source_record_ref).first();
        if (row) safeMetadata = { public_id: row.public_id, plan_id: row.plan_id, metric_key: row.metric_key, status: row.status };
    } else if (input.source_type === "phase25_portfolio_run") {
        authority = "growth_portfolio_runs";
        row = await trx.from(authority).where("tenant_id", tenant).where("public_id", input.source_record_ref).first();
        if (row) safeMetadata = { public_id: row.public_id, plan_id: row.plan_id, plan_version: row.plan_version, solver_version: row.solver_version, status: row.status };
    } else if (input.source_type === "phase25_portfolio_outcome") {
        authority = "growth_portfolio_outcomes";
        const id = parsePositiveId(input.source_record_ref, "E_MERCHANT_MEMORY_PHASE25_OUTCOME_REF");
        row = await trx.from(authority).where("tenant_id", tenant).where("id", id).first();
        if (row) safeMetadata = { id: row.id, run_id: row.run_id, measured_at: row.measured_at, attribution_confidence: row.attribution_confidence };
    } else if (input.source_type === "phase25_rebalance") {
        authority = "growth_portfolio_rebalance_events";
        row = await trx.from(authority).where("tenant_id", tenant).where("public_id", input.source_record_ref).first();
        if (row) safeMetadata = { public_id: row.public_id, plan_id: row.plan_id, trigger_kind: row.trigger_kind, status: row.status, approval_reference: row.approval_reference };
    }

    if (!row || !authority) {
        throw new Exception("Merchant memory evidence source was not found in its canonical authority", {
            status: 422,
            code: "E_MERCHANT_MEMORY_SOURCE_NOT_FOUND",
        });
    }

    const canonicalHash = sha256({ authority, source_record_ref: input.source_record_ref, safeMetadata });
    if (input.content_hash && input.content_hash !== canonicalHash) {
        throw new Exception("Merchant memory evidence integrity hash does not match the canonical source snapshot", {
            status: 409,
            code: "E_MERCHANT_MEMORY_EVIDENCE_HASH_MISMATCH",
        });
    }

    return {
        source_type: input.source_type,
        source_authority: authority,
        source_record_ref: input.source_record_ref,
        evidence_role: input.evidence_role,
        content_hash: canonicalHash,
        source_metadata: safeMetadata,
        observed_at: input.observed_at ?? null,
    };
}

async function evidenceFor(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_evidence")
        .where("tenant_id", tenantId())
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

async function lineageFor(memoryIds: number[]) {
    if (!memoryIds.length) return new Map<number, unknown[]>();
    const rows = await currentTrx()
        .from("merchant_memory_lineage")
        .where("tenant_id", tenantId())
        .where((builder) => builder.whereIn("from_memory_id", memoryIds).orWhereIn("to_memory_id", memoryIds))
        .orderBy("id", "asc");
    const grouped = new Map<number, unknown[]>();
    for (const row of rows) {
        const edge = {
            relation: row.relation,
            reason: row.reason,
            from_memory_id: Number(row.from_memory_id),
            to_memory_id: Number(row.to_memory_id),
            evidence_refs: list(row.evidence_refs),
            created_at: new Date(row.created_at).toISOString(),
        };
        for (const id of [Number(row.from_memory_id), Number(row.to_memory_id)]) {
            if (!memoryIds.includes(id)) continue;
            const current = grouped.get(id) ?? [];
            current.push(edge);
            grouped.set(id, current);
        }
    }
    return grouped;
}

async function insertEvidence(memoryId: number, input: MemoryEvidenceInput) {
    const evidence = await canonicalEvidence(input);
    await currentTrx().table("merchant_memory_evidence").insert({
        tenant_id: tenantId(),
        memory_id: memoryId,
        source_type: evidence.source_type,
        source_authority: evidence.source_authority,
        source_record_ref: evidence.source_record_ref,
        evidence_role: evidence.evidence_role,
        content_hash: evidence.content_hash,
        source_metadata: JSON.stringify(evidence.source_metadata),
        observed_at: evidence.observed_at,
    });
    return evidence;
}

async function insertMemory(input: MemoryCreateInput, actor: User, version: number) {
    assertPrivacy(input);
    const canonical: CanonicalEvidence[] = [];
    for (const evidence of input.evidence) canonical.push(await canonicalEvidence(evidence));
    const publicId = randomUUID();
    const [record] = await currentTrx()
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
            confidence: input.confidence,
            strength: input.strength,
            privacy_mode: input.privacy_mode,
            visibility_scope: input.visibility_scope,
            purpose_tags: JSON.stringify(input.purpose_tags ?? []),
            status: "active",
            valid_from: input.valid_from,
            expires_at: input.expires_at ?? null,
            last_confirmed_at: input.valid_from,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    for (const evidence of canonical) {
        await currentTrx().table("merchant_memory_evidence").insert({
            tenant_id: tenantId(),
            memory_id: record.id,
            source_type: evidence.source_type,
            source_authority: evidence.source_authority,
            source_record_ref: evidence.source_record_ref,
            evidence_role: evidence.evidence_role,
            content_hash: evidence.content_hash,
            source_metadata: JSON.stringify(evidence.source_metadata),
            observed_at: evidence.observed_at,
        });
    }
    const evidence = await evidenceFor([Number(record.id)]);
    return { row: record as MemoryRow, value: publicMemory(record as MemoryRow, evidence.get(Number(record.id)) ?? []) };
}

export async function expireDueMemory() {
    const changed = await currentTrx()
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("status", "active")
        .whereNotNull("expires_at")
        .where("expires_at", "<=", DateTime.utc().toSQL())
        .update({ status: "expired", updated_at: DateTime.utc().toSQL() });
    return { expired: Number(changed) };
}

export async function overview() {
    await expireDueMemory();
    const trx = currentTrx();
    const [classRows, statusRows, retrievals, effectiveness] = await Promise.all([
        trx.from("merchant_memory_records").where("tenant_id", tenantId()).select("memory_class").count("id as count").groupBy("memory_class"),
        trx.from("merchant_memory_records").where("tenant_id", tenantId()).select("status").count("id as count").groupBy("status"),
        trx.from("merchant_memory_retrieval_events").where("tenant_id", tenantId()).where("retrieved_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL()).count("id as count").first(),
        trx
            .from("merchant_memory_effectiveness")
            .where("tenant_id", tenantId())
            .where("measured_at", ">=", DateTime.utc().minus({ days: 30 }).toSQL())
            .select(trx.raw("AVG(usefulness) AS usefulness"))
            .select(trx.raw("SUM(CASE WHEN repeat_error_avoided IS TRUE THEN 1 ELSE 0 END) AS repeat_error_avoided"))
            .first(),
    ]);
    return {
        version: MERCHANT_MEMORY_VERSION,
        by_class: Object.fromEntries(classRows.map((row) => [row.memory_class, num(row.count)])),
        by_status: Object.fromEntries(statusRows.map((row) => [row.status, num(row.count)])),
        retrievals_30d: num(retrievals?.count),
        usefulness_30d: effectiveness?.usefulness == null ? null : num(effectiveness.usefulness),
        repeat_errors_avoided_30d: num(effectiveness?.repeat_error_avoided),
    };
}

export async function memoryAccessClass(publicId: string) {
    const row = await currentTrx()
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .select("privacy_mode", "visibility_scope")
        .first();
    if (!row) throw new Exception("Merchant memory record not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    return { restricted: row.privacy_mode === "restricted" || row.visibility_scope === "restricted_humans" };
}

export async function listMemories(
    filters: { memory_class?: string; status?: string; limit?: number } = {},
    allowRestricted = false,
) {
    await expireDueMemory();
    const limit = Math.min(100, Math.max(1, Number(filters.limit ?? 50)));
    let query = currentTrx().from("merchant_memory_records").where("tenant_id", tenantId());
    if (!allowRestricted) query = query.whereNot("privacy_mode", "restricted").whereNot("visibility_scope", "restricted_humans");
    if (filters.memory_class) query = query.where("memory_class", filters.memory_class);
    if (filters.status) query = query.where("status", filters.status);
    const rows = (await query.orderBy("updated_at", "desc").limit(limit)) as MemoryRow[];
    const evidence = await evidenceFor(rows.map((row) => Number(row.id)));
    const lineage = await lineageFor(rows.map((row) => Number(row.id)));
    return rows.map((row) => publicMemory(row, evidence.get(Number(row.id)) ?? [], lineage.get(Number(row.id)) ?? []));
}

export async function memoryDetail(publicId: string, allowRestricted = false) {
    await expireDueMemory();
    const row = (await currentTrx()
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .first()) as MemoryRow | undefined;
    if (!row || (isRestricted(row) && !allowRestricted)) {
        throw new Exception("Merchant memory record not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    const evidence = await evidenceFor([Number(row.id)]);
    const lineage = await lineageFor([Number(row.id)]);
    return publicMemory(row, evidence.get(Number(row.id)) ?? [], lineage.get(Number(row.id)) ?? []);
}

export async function createMemory(input: MemoryCreateInput, actor: User) {
    const existing = await currentTrx()
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("stable_key", input.stable_key)
        .first();
    if (existing) {
        throw new Exception("Existing merchant memory keys must evolve through the lineage workflow", {
            status: 409,
            code: "E_MERCHANT_MEMORY_LINEAGE_REQUIRED",
        });
    }
    return (await insertMemory(input, actor, 1)).value;
}

export async function addEvidence(publicId: string, input: MemoryEvidenceInput, allowRestricted = false) {
    const memory = (await currentTrx()
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .first()) as MemoryRow | undefined;
    if (!memory || (isRestricted(memory) && !allowRestricted)) {
        throw new Exception("Merchant memory record not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    await insertEvidence(Number(memory.id), input);
    return memoryDetail(publicId, allowRestricted);
}

function scoreMemory(row: MemoryRow, query: string) {
    const tokens = words(query);
    const haystack = `${row.context} ${row.reason} ${row.lesson} ${row.decision ?? ""} ${row.action ?? ""} ${row.outcome ?? ""}`.toLocaleLowerCase("fa");
    const lexical = tokens.length ? tokens.filter((token) => haystack.includes(token)).length / tokens.length : 0;
    const confidence = num(row.confidence);
    const strength = num(row.strength);
    const confirmedAt = DateTime.fromJSDate(new Date(row.last_confirmed_at ?? row.valid_from));
    const ageDays = Math.max(0, DateTime.utc().diff(confirmedAt, "days").days);
    const freshness = 1 / (1 + ageDays / 90);
    const total = lexical * 0.5 + confidence * 0.2 + strength * 0.2 + freshness * 0.1;
    return {
        total: Number(total.toFixed(6)),
        components: {
            lexical: Number(lexical.toFixed(6)),
            confidence: Number(confidence.toFixed(6)),
            strength: Number(strength.toFixed(6)),
            freshness: Number(freshness.toFixed(6)),
        },
    };
}

async function visibilityPredicate(input: MemoryRetrieveInput, allowRestricted: boolean) {
    if (input.requester_type === "agent") {
        if (!input.requester_ref) {
            throw new Exception("Agent merchant-memory retrieval requires an approved principal reference", {
                status: 403,
                code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",
            });
        }
        await requireApprovedAgentPrincipal(input.requester_ref);
        return (row: MemoryRow) => row.visibility_scope === "approved_agents" && row.privacy_mode !== "restricted";
    }
    if (input.requester_type === "system") {
        return (row: MemoryRow) =>
            row.visibility_scope !== "restricted_humans" && row.privacy_mode !== "restricted";
    }
    return (row: MemoryRow) => allowRestricted || !isRestricted(row);
}

export async function retrieveMemory(input: MemoryRetrieveInput, options: { allowRestricted?: boolean } = {}) {
    await expireDueMemory();
    const trx = currentTrx();
    const limit = Math.min(50, Math.max(1, input.limit ?? 12));
    const includeHistory = Boolean(input.include_history && input.requester_type === "human");
    let query = trx.from("merchant_memory_records").where("tenant_id", tenantId());
    if (input.memory_classes?.length) query = query.whereIn("memory_class", input.memory_classes);
    if (input.min_confidence != null) query = query.where("confidence", ">=", input.min_confidence);
    const allCandidates = (await query.orderBy("updated_at", "desc").limit(500)) as MemoryRow[];
    const expiredFiltered = includeHistory ? 0 : allCandidates.filter((row) => row.status === "expired").length;
    const statusFiltered = includeHistory ? allCandidates : allCandidates.filter((row) => row.status === "active");
    const evidence = await evidenceFor(statusFiltered.map((row) => Number(row.id)));
    const sourceLinked = statusFiltered.filter((row) => (evidence.get(Number(row.id)) ?? []).length > 0);
    const canSee = await visibilityPredicate(input, Boolean(options.allowRestricted));
    const visible = sourceLinked.filter(canSee);
    const ranked = visible
        .map((row) => ({ row, score: scoreMemory(row, input.query) }))
        .sort((left, right) => right.score.total - left.score.total || num(right.row.version) - num(left.row.version))
        .slice(0, limit);
    const lineage = await lineageFor(ranked.map((item) => Number(item.row.id)));
    const data = ranked.map((item) => ({
        ...publicMemory(item.row, evidence.get(Number(item.row.id)) ?? [], lineage.get(Number(item.row.id)) ?? []),
        retrieval_score: item.score,
    }));
    const retrievalPublicId = randomUUID();
    await trx.table("merchant_memory_retrieval_events").insert({
        tenant_id: tenantId(),
        public_id: retrievalPublicId,
        requester_type: input.requester_type,
        requester_ref: input.requester_ref ?? null,
        purpose: input.purpose,
        query_hash: sha256(input.query),
        filters: JSON.stringify({
            memory_classes: input.memory_classes ?? [],
            min_confidence: input.min_confidence ?? null,
            include_history: includeHistory,
        }),
        returned_memory_public_ids: JSON.stringify(data.map((memory) => memory.public_id)),
        permission_filtered_count: sourceLinked.length - visible.length,
        expired_filtered_count: expiredFiltered,
        source_coverage: data.length ? 1 : 0,
        result_count: data.length,
        retrieved_at: DateTime.utc().toISO(),
    });
    return {
        retrieval_public_id: retrievalPublicId,
        result_count: data.length,
        source_coverage: data.length ? 1 : 0,
        permission_filtered_count: sourceLinked.length - visible.length,
        expired_filtered_count: expiredFiltered,
        data,
    };
}

async function assertNoLineageCycle(fromId: number, toId: number) {
    const rows = await currentTrx().rawQuery(
        `WITH RECURSIVE chain(id) AS (
            SELECT to_memory_id FROM merchant_memory_lineage WHERE tenant_id = ? AND from_memory_id = ?
            UNION
            SELECT l.to_memory_id FROM merchant_memory_lineage l JOIN chain c ON l.from_memory_id = c.id WHERE l.tenant_id = ?
        ) SELECT 1 FROM chain WHERE id = ? LIMIT 1`,
        [tenantId(), toId, tenantId(), fromId],
    );
    if (rows.rows?.length) {
        throw new Exception("Merchant memory lineage cycle is not allowed", {
            status: 409,
            code: "E_MERCHANT_MEMORY_LINEAGE_CYCLE",
        });
    }
}

export async function supersedeMemory(
    publicId: string,
    relation: "supersedes" | "refines" | "contradicts" | "revalidates",
    reason: string,
    replacement: MemoryReplacementInput,
    actor: User,
    allowRestricted = false,
) {
    const trx = currentTrx();
    const predecessor = (await trx
        .from("merchant_memory_records")
        .where("tenant_id", tenantId())
        .where("public_id", publicId)
        .first()) as MemoryRow | undefined;
    if (!predecessor || (isRestricted(predecessor) && !allowRestricted)) {
        throw new Exception("Merchant memory record not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
    }
    if (predecessor.status === "revoked") {
        throw new Exception("Revoked merchant memory cannot be evolved", {
            status: 409,
            code: "E_MERCHANT_MEMORY_REVOKED",
        });
    }
    const nextVersion = num(predecessor.version) + 1;
    const created = await insertMemory({ ...replacement, stable_key: predecessor.stable_key }, actor, nextVersion);
    await assertNoLineageCycle(Number(predecessor.id), Number(created.row.id));
    await trx.table("merchant_memory_lineage").insert({
        tenant_id: tenantId(),
        from_memory_id: predecessor.id,
        to_memory_id: created.row.id,
        relation,
        reason,
        evidence_refs: JSON.stringify(
            created.value.evidence.map((item) => ({
                source_type: (item as Record<string, unknown>).source_type,
                source_record_ref: (item as Record<string, unknown>).source_record_ref,
            })),
        ),
        created_by_user_id: Number(actor.id),
    });
    if (relation !== "contradicts") {
        await trx
            .from("merchant_memory_records")
            .where("tenant_id", tenantId())
            .where("id", predecessor.id)
            .update({ status: "superseded", updated_at: DateTime.utc().toSQL() });
    }
    return memoryDetail(created.row.public_id, allowRestricted || isRestricted(created.row));
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
    const retrieval = await trx
        .from("merchant_memory_retrieval_events")
        .where("tenant_id", tenantId())
        .where("public_id", retrievalPublicId)
        .first();
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

export async function effectiveness() {
    const trx = currentTrx();
    const [summary, total] = await Promise.all([
        trx
            .from("merchant_memory_effectiveness")
            .where("tenant_id", tenantId())
            .select(trx.raw("AVG(usefulness) AS usefulness"))
            .select(trx.raw("AVG(attribution_confidence) AS attribution_confidence"))
            .select(trx.raw("SUM(CASE WHEN memory_applied IS TRUE THEN 1 ELSE 0 END) AS memory_applied"))
            .select(trx.raw("SUM(CASE WHEN repeat_error_avoided IS TRUE THEN 1 ELSE 0 END) AS repeat_error_avoided"))
            .select(trx.raw("COALESCE(SUM(realized_impact_minor), 0) AS realized_impact_minor"))
            .first(),
        trx.from("merchant_memory_effectiveness").where("tenant_id", tenantId()).count("id as count").first(),
    ]);
    return {
        observations: num(total?.count),
        usefulness: summary?.usefulness == null ? null : num(summary.usefulness),
        attribution_confidence: summary?.attribution_confidence == null ? null : num(summary.attribution_confidence),
        memory_applied: num(summary?.memory_applied),
        repeat_errors_avoided: num(summary?.repeat_error_avoided),
        realized_impact_minor: num(summary?.realized_impact_minor),
    };
}
