import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

export const NETWORK_MIN_COHORT_FLOOR = 5;
export const NETWORK_ALGORITHM_VERSION = "phase27-network-v1";

const FORBIDDEN_RAW_KEYS = /(^|_)(raw|record|records|customer|user|email|phone|address|name|order|payment|session|ip)(_|$)/i;
const AGGREGATE_REF_PATTERN = /^(aggregate|report|metric|decision|experiment|portfolio|quality|trust):[A-Za-z0-9._:/-]{2,200}$/;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function tenantId(): number {
    return Number(currentTenantId());
}

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stable(item)]),
        );
    }
    return value;
}

function hash(value: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(stable(value)))
        .digest("hex");
}

function json(value: unknown): string {
    return JSON.stringify(value ?? {});
}

function parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

export function assertAggregateOnlyNetworkPayload(value: unknown, path = "payload"): void {
    if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
            assertAggregateOnlyNetworkPayload(item, `${path}[${index}]`);
        }
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            if (FORBIDDEN_RAW_KEYS.test(key) && key !== "record_count") {
                throw new Exception(`Raw or identifying field is forbidden in network aggregate payload: ${path}.${key}`, {
                    status: 422,
                    code: "E_NETWORK_RAW_FIELD_FORBIDDEN",
                });
            }
            assertAggregateOnlyNetworkPayload(item, `${path}.${key}`);
        }
        return;
    }
    if (typeof value === "string" && (EMAIL_LIKE.test(value) || PHONE_LIKE.test(value))) {
        throw new Exception(`PII-shaped value is forbidden in network aggregate payload: ${path}`, {
            status: 422,
            code: "E_NETWORK_PII_VALUE_FORBIDDEN",
        });
    }
}

export function normalizeAggregateRefs(refs: readonly string[] = []): string[] {
    const normalized = [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))].sort();
    for (const ref of normalized) {
        if (!AGGREGATE_REF_PATTERN.test(ref) || EMAIL_LIKE.test(ref) || PHONE_LIKE.test(ref)) {
            throw new Exception("Network contribution source references must point to aggregate artifacts only", {
                status: 422,
                code: "E_NETWORK_SOURCE_REF_INVALID",
            });
        }
    }
    return normalized;
}

export function networkMetricDefinitionDigest(input: {
    metric_key: string;
    unit: string;
    numerator_definition: string;
    denominator_definition?: string | null;
    aggregation: string;
    period_grain: string;
    minimum_records_per_contribution: number;
    value_min: number;
    value_max: number;
}): string {
    return hash({
        metric_key: input.metric_key,
        unit: input.unit,
        numerator_definition: input.numerator_definition,
        denominator_definition: input.denominator_definition ?? null,
        aggregation: input.aggregation,
        period_grain: input.period_grain,
        minimum_records_per_contribution: input.minimum_records_per_contribution,
        value_min: input.value_min,
        value_max: input.value_max,
    });
}

export function normalizeNetworkPrivacyPolicy(input: {
    opted_in: boolean;
    minimum_cohort_size: number;
    privacy_method: "aggregate_threshold" | "laplace_dp" | "secure_aggregate";
    privacy_parameters?: { epsilon?: number; max_cumulative_epsilon?: number };
}) {
    if (input.minimum_cohort_size < NETWORK_MIN_COHORT_FLOOR) {
        throw new Exception(`Network cohort must contain at least ${NETWORK_MIN_COHORT_FLOOR} tenants`, {
            status: 422,
            code: "E_NETWORK_COHORT_TOO_SMALL",
        });
    }
    const parameters: Record<string, unknown> = {
        privacy_unit: "tenant_aggregate_value",
        membership_protected: false,
        algorithm_version: NETWORK_ALGORITHM_VERSION,
    };
    if (input.privacy_method === "laplace_dp") {
        const epsilon = Number(input.privacy_parameters?.epsilon);
        const maxCumulativeEpsilon = Number(input.privacy_parameters?.max_cumulative_epsilon ?? epsilon);
        if (!(epsilon > 0 && epsilon <= 10) || !(maxCumulativeEpsilon >= epsilon && maxCumulativeEpsilon <= 100)) {
            throw new Exception("Laplace privacy requires bounded epsilon and cumulative budget", {
                status: 422,
                code: "E_NETWORK_DP_BUDGET_INVALID",
            });
        }
        parameters.epsilon = epsilon;
        parameters.max_cumulative_epsilon = maxCumulativeEpsilon;
        parameters.adjacency = "replace_one_tenant_aggregate_value";
    }
    return parameters;
}

async function activeParticipation() {
    const policy = await currentTrx()
        .from("network_participation_policies")
        .where("tenant_id", tenantId())
        .orderBy("version", "desc")
        .first();
    if (!policy || !policy.opted_in) {
        throw new Exception("Tenant has not opted in to network intelligence", {
            status: 409,
            code: "E_NETWORK_NOT_OPTED_IN",
        });
    }
    const purposes = parseJsonArray(policy.purpose_scopes);
    if (!purposes.includes("benchmarking")) {
        throw new Exception("Active network policy does not authorize benchmarking", {
            status: 409,
            code: "E_NETWORK_PURPOSE_NOT_AUTHORIZED",
        });
    }
    return policy;
}

export async function networkOverview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const participation = await trx
        .from("network_participation_policies")
        .where("tenant_id", tenant)
        .orderBy("version", "desc")
        .first();
    const [contributions, publications, definitions, approvedSecurityReviews] = await Promise.all([
        trx.from("network_contributions").where("tenant_id", tenant).count("* as count").first(),
        trx.from("network_benchmark_publications").where("tenant_id", tenant).count("* as count").first(),
        trx.from("network_metric_definitions").where({ tenant_id: tenant, active: true }).count("* as count").first(),
        trx.from("network_security_reviews").where({ tenant_id: tenant, status: "approved" }).count("* as count").first(),
    ]);
    return {
        participation: participation ?? null,
        kpis: {
            contributions: Number(contributions?.count ?? 0),
            publications: Number(publications?.count ?? 0),
            active_metric_definitions: Number(definitions?.count ?? 0),
            approved_security_reviews: Number(approvedSecurityReviews?.count ?? 0),
        },
    };
}

export async function setParticipation(input: {
    opted_in: boolean;
    legal_basis?: string;
    terms_version?: string;
    purpose_scopes: string[];
    minimum_cohort_size: number;
    privacy_method: "aggregate_threshold" | "laplace_dp" | "secure_aggregate";
    privacy_parameters?: { epsilon?: number; max_cumulative_epsilon?: number };
    reason: string;
    actorUserId: number;
}) {
    if (input.opted_in && (!input.legal_basis || !input.terms_version || input.purpose_scopes.length === 0)) {
        throw new Exception("Opt-in requires legal basis, terms version and purpose", {
            status: 422,
            code: "E_NETWORK_OPT_IN_CONTRACT_REQUIRED",
        });
    }
    const privacyParameters = normalizeNetworkPrivacyPolicy(input);
    const trx = currentTrx();
    const tenant = tenantId();
    const latest = await trx.from("network_participation_policies").where("tenant_id", tenant).max("version as version").first();
    const version = Number(latest?.version ?? 0) + 1;
    const canonical = {
        version,
        opted_in: input.opted_in,
        legal_basis: input.legal_basis ?? null,
        terms_version: input.terms_version ?? null,
        purpose_scopes: input.purpose_scopes,
        minimum_cohort_size: input.minimum_cohort_size,
        privacy_method: input.privacy_method,
        privacy_parameters: privacyParameters,
    };
    const [row] = await trx
        .table("network_participation_policies")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            ...canonical,
            purpose_scopes: json(input.purpose_scopes),
            privacy_parameters: json(privacyParameters),
            policy_digest: hash(canonical),
            reason: input.reason,
            created_by_user_id: input.actorUserId,
            effective_at: DateTime.utc().toSQL(),
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return row;
}

export async function saveMetricDefinition(input: {
    metric_key: string;
    version?: number;
    unit: string;
    numerator_definition: string;
    denominator_definition?: string;
    aggregation: string;
    period_grain: string;
    minimum_records_per_contribution: number;
    value_min: number;
    value_max: number;
    reason: string;
    actorUserId: number;
}) {
    if (!(input.value_min < input.value_max)) {
        throw new Exception("Network metric bounds must satisfy value_min < value_max", {
            status: 422,
            code: "E_NETWORK_METRIC_BOUNDS_INVALID",
        });
    }
    const trx = currentTrx();
    const tenant = tenantId();
    const latest = await trx
        .from("network_metric_definitions")
        .where({ tenant_id: tenant, metric_key: input.metric_key })
        .max("version as version")
        .first();
    const nextVersion = Number(latest?.version ?? 0) + 1;
    if (input.version !== undefined && input.version !== nextVersion) {
        throw new Exception(`Metric definition version must be ${nextVersion}`, {
            status: 409,
            code: "E_NETWORK_METRIC_VERSION_CONFLICT",
        });
    }
    const digest = networkMetricDefinitionDigest(input);
    await trx
        .from("network_metric_definitions")
        .where({ tenant_id: tenant, metric_key: input.metric_key, active: true })
        .update({ active: false });
    const [row] = await trx
        .table("network_metric_definitions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            metric_key: input.metric_key,
            version: nextVersion,
            unit: input.unit,
            numerator_definition: input.numerator_definition,
            denominator_definition: input.denominator_definition ?? null,
            aggregation: input.aggregation,
            period_grain: input.period_grain,
            minimum_records_per_contribution: input.minimum_records_per_contribution,
            value_min: input.value_min,
            value_max: input.value_max,
            privacy_class: "aggregate",
            definition_digest: digest,
            active: true,
            reason: input.reason,
            created_by_user_id: input.actorUserId,
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return row;
}

export async function listMetricDefinitions() {
    return currentTrx()
        .from("network_metric_definitions")
        .where({ tenant_id: tenantId(), active: true })
        .orderBy("metric_key", "asc");
}

export async function contributeAggregate(input: {
    metric_key: string;
    metric_version: number;
    period_key: string;
    segment_key?: string;
    aggregate_value: number;
    numerator?: number;
    denominator?: number;
    record_count: number;
    source_aggregate_refs?: string[];
}) {
    await activeParticipation();
    assertAggregateOnlyNetworkPayload(input);
    const trx = currentTrx();
    const tenant = tenantId();
    const definition = await trx
        .from("network_metric_definitions")
        .where({ tenant_id: tenant, metric_key: input.metric_key, version: input.metric_version, active: true })
        .first();
    if (!definition) {
        throw new Exception("Active network metric definition not found", {
            status: 404,
            code: "E_NETWORK_METRIC_DEFINITION_NOT_FOUND",
        });
    }
    if (input.record_count < Number(definition.minimum_records_per_contribution)) {
        throw new Exception("Contribution has too few local records", {
            status: 422,
            code: "E_NETWORK_LOCAL_THRESHOLD",
        });
    }
    const minimum = Number(definition.value_min);
    const maximum = Number(definition.value_max);
    if (input.aggregate_value < minimum || input.aggregate_value > maximum) {
        throw new Exception("Contribution value is outside the approved metric bounds", {
            status: 422,
            code: "E_NETWORK_CONTRIBUTION_OUT_OF_BOUNDS",
        });
    }
    const refs = normalizeAggregateRefs(input.source_aggregate_refs);
    const segmentKey = input.segment_key ?? "all";
    const canonical = {
        metric_key: input.metric_key,
        metric_version: input.metric_version,
        definition_digest: String(definition.definition_digest),
        period_key: input.period_key,
        segment_key: segmentKey,
        aggregate_value: input.aggregate_value,
        numerator: input.numerator ?? null,
        denominator: input.denominator ?? null,
        record_count: input.record_count,
        source_aggregate_refs: refs,
    };
    const now = DateTime.utc().toSQL();
    const payload = {
        definition_digest: String(definition.definition_digest),
        aggregate_value: input.aggregate_value,
        numerator: input.numerator ?? null,
        denominator: input.denominator ?? null,
        record_count: input.record_count,
        contribution_digest: hash(canonical),
        source_aggregate_refs: json(refs),
        updated_at: now,
    };
    const conflictColumns = ["tenant_id", "metric_key", "metric_version", "period_key", "segment_key"];
    const [row] = await trx
        .table("network_contributions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            metric_key: input.metric_key,
            metric_version: input.metric_version,
            period_key: input.period_key,
            segment_key: segmentKey,
            created_at: now,
            ...payload,
        })
        .onConflict(conflictColumns)
        .merge(payload)
        .returning("*");
    return row;
}

export async function listContributions() {
    return currentTrx().from("network_contributions").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(100);
}

export async function listBenchmarks() {
    return currentTrx()
        .from("network_benchmark_publications")
        .where("tenant_id", tenantId())
        .whereRaw("cohort_size >= minimum_cohort_size")
        .orderBy("published_at", "desc")
        .limit(100);
}

export async function requestOwnExport(input: { scope: "participation" | "contributions" | "all"; actorUserId: number }) {
    const trx = currentTrx();
    const tenant = tenantId();
    const includeParticipation = input.scope === "participation" || input.scope === "all";
    const includeContributions = input.scope === "contributions" || input.scope === "all";
    const [participation, contributions, publications] = await Promise.all([
        includeParticipation
            ? trx.from("network_participation_policies").where("tenant_id", tenant).orderBy("version", "desc")
            : Promise.resolve([]),
        includeContributions ? trx.from("network_contributions").where("tenant_id", tenant) : Promise.resolve([]),
        input.scope === "all" ? trx.from("network_benchmark_publications").where("tenant_id", tenant) : Promise.resolve([]),
    ]);
    const manifest = {
        schema_version: 1,
        scope: input.scope,
        participation,
        own_contributions: contributions,
        received_publications: publications,
        contains_peer_raw_records: false,
        excluded_data_classes: ["peer_raw_records", "peer_identifiers", "cross_tenant_contribution_rows"],
    };
    const manifestDigest = hash(manifest);
    const now = DateTime.utc().toSQL();
    const [row] = await trx
        .table("network_export_requests")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenant,
            scope: input.scope,
            status: "completed",
            manifest: json(manifest),
            manifest_digest: manifestDigest,
            requested_by_user_id: input.actorUserId,
            created_at: now,
            completed_at: now,
        })
        .returning("*");
    return row;
}

export async function recordSecurityReview(input: {
    review_type: string;
    status: "approved" | "changes_required" | "rejected";
    artifact_ref: string;
    findings?: unknown[];
    decision: string;
    actorUserId: number;
}) {
    assertAggregateOnlyNetworkPayload({ artifact_ref: input.artifact_ref });
    const [row] = await currentTrx()
        .table("network_security_reviews")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            review_type: input.review_type,
            status: input.status,
            artifact_ref: input.artifact_ref,
            findings: json(input.findings ?? []),
            decision: input.decision,
            reviewed_by_user_id: input.actorUserId,
            reviewed_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return row;
}
