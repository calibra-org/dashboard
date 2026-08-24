#!/usr/bin/env node

import { randomBytes, createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const NETWORK_AGGREGATION_ALGORITHM_VERSION = "phase27-network-v1";
export const NETWORK_MIN_COHORT_FLOOR = 5;

const FORBIDDEN_RAW_KEYS = /(^|_)(raw_records?|customer|user|email|phone|address|name|order|payment|session|ip)(_|$)/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE = /(?:\+?\d[\d\s().-]{7,}\d)/;

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, item]) => [key, stable(item)]),
        );
    }
    return value;
}

function digest(value) {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function assertNoRawIdentityFields(value, location = "input") {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertNoRawIdentityFields(item, `${location}[${index}]`));
        return;
    }
    if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            if (FORBIDDEN_RAW_KEYS.test(key) && key !== "record_count") {
                throw new Error(`raw/identity field forbidden at ${location}.${key}`);
            }
            assertNoRawIdentityFields(item, `${location}.${key}`);
        }
        return;
    }
    if (typeof value === "string" && (EMAIL_LIKE.test(value) || PHONE_LIKE.test(value))) {
        throw new Error(`PII-shaped value forbidden at ${location}`);
    }
}

function secureUniform() {
    const bytes = randomBytes(6);
    const integer = bytes.readUIntBE(0, 6);
    return (integer + 0.5) / 2 ** 48;
}

function laplace(scale) {
    const centered = secureUniform() - 0.5;
    return -scale * Math.sign(centered || 1) * Math.log(1 - 2 * Math.abs(centered));
}

function quantile(sorted, ratio) {
    if (sorted.length === 0) return null;
    return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function metricBounds(config, metricKey, metricVersion) {
    const key = `${metricKey}@${metricVersion}`;
    const bounds = config.metric_bounds?.[key];
    const lower = Number(bounds?.lower);
    const upper = Number(bounds?.upper);
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || !(lower < upper)) {
        throw new Error(`trusted metric bounds missing for ${key}`);
    }
    return { lower, upper };
}

function privacyBudget(config, groupKey, epsilon) {
    const max = Number(config.privacy_budget?.max_cumulative_epsilon ?? epsilon);
    const prior = Number(config.privacy_budget?.prior_epsilon_by_group?.[groupKey] ?? 0);
    if (!Number.isFinite(max) || !Number.isFinite(prior) || max <= 0 || prior < 0 || prior + epsilon > max) {
        throw new Error(`privacy budget exceeded for ${groupKey}`);
    }
    return { epsilon_spent: epsilon, epsilon_cumulative: prior + epsilon, max_cumulative_epsilon: max };
}

export function aggregateNetworkBenchmarks(input) {
    assertNoRawIdentityFields(input.contributions ?? [], "contributions");
    const config = input.config ?? {};
    const minimumCohortSize = Number(config.minimum_cohort_size ?? 20);
    if (!Number.isInteger(minimumCohortSize) || minimumCohortSize < NETWORK_MIN_COHORT_FLOOR) {
        throw new Error(`minimum_cohort_size must be at least ${NETWORK_MIN_COHORT_FLOOR}`);
    }
    const privacyMethod = config.privacy_method ?? "aggregate_threshold";
    if (!["aggregate_threshold", "laplace_dp", "secure_aggregate"].includes(privacyMethod)) {
        throw new Error("unsupported privacy_method");
    }
    if (privacyMethod === "secure_aggregate") {
        throw new Error("secure_aggregate requires an external attested aggregation backend and is not simulated locally");
    }
    const sourceBatchRef = String(config.source_batch_ref ?? "").trim();
    if (!/^[A-Za-z0-9._:/-]{3,160}$/.test(sourceBatchRef)) throw new Error("source_batch_ref is required");

    const groups = new Map();
    for (const contribution of input.contributions ?? []) {
        const tenantPseudonym = String(contribution.tenant_pseudonym ?? "");
        const metricKey = String(contribution.metric_key ?? "");
        const metricVersion = Number(contribution.metric_version);
        const periodKey = String(contribution.period_key ?? "");
        const segmentKey = String(contribution.segment_key ?? "all");
        const definitionDigest = String(contribution.definition_digest ?? "");
        const aggregateValue = Number(contribution.aggregate_value);
        const recordCount = Number(contribution.record_count);
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(tenantPseudonym)) throw new Error("tenant_pseudonym must be opaque and stable");
        if (!metricKey || !Number.isInteger(metricVersion) || metricVersion < 1 || !periodKey || !definitionDigest) {
            throw new Error("aggregate contribution metadata is incomplete");
        }
        if (!Number.isFinite(aggregateValue) || !Number.isInteger(recordCount) || recordCount < 1) {
            throw new Error("aggregate contribution value/count is invalid");
        }
        const bounds = metricBounds(config, metricKey, metricVersion);
        if (aggregateValue < bounds.lower || aggregateValue > bounds.upper) {
            throw new Error(`aggregate contribution outside approved bounds for ${metricKey}@${metricVersion}`);
        }
        const key = [metricKey, metricVersion, periodKey, segmentKey].join("|");
        const rows = groups.get(key) ?? [];
        if (rows.some((row) => row.tenant_pseudonym === tenantPseudonym)) {
            throw new Error(`duplicate tenant contribution for ${key}`);
        }
        rows.push({
            tenant_pseudonym: tenantPseudonym,
            metric_key: metricKey,
            metric_version: metricVersion,
            period_key: periodKey,
            segment_key: segmentKey,
            definition_digest: definitionDigest,
            aggregate_value: aggregateValue,
            record_count: recordCount,
        });
        groups.set(key, rows);
    }

    const publications = [];
    for (const [groupKey, rows] of groups) {
        if (rows.length < minimumCohortSize) continue;
        const definitionDigests = new Set(rows.map((row) => row.definition_digest));
        if (definitionDigests.size !== 1) throw new Error(`metric definition mismatch for ${groupKey}`);
        const [metricKey, metricVersionText, periodKey, segmentKey] = groupKey.split("|");
        const metricVersion = Number(metricVersionText);
        const bounds = metricBounds(config, metricKey, metricVersion);
        const values = rows.map((row) => row.aggregate_value).sort((left, right) => left - right);
        const cohortSize = rows.length;
        const rawMean = values.reduce((total, value) => total + value, 0) / cohortSize;
        let benchmarkValue = rawMean;
        let distributionSummary;
        let privacyParameters = {
            privacy_unit: "tenant_aggregate_value",
            membership_protected: false,
            adjacency: "replace_one_tenant_aggregate_value",
            lower_bound: bounds.lower,
            upper_bound: bounds.upper,
        };

        if (privacyMethod === "laplace_dp") {
            const epsilon = Number(config.epsilon);
            if (!Number.isFinite(epsilon) || !(epsilon > 0 && epsilon <= 10)) throw new Error("laplace_dp requires 0 < epsilon <= 10");
            const sensitivity = (bounds.upper - bounds.lower) / cohortSize;
            const noiseScale = sensitivity / epsilon;
            benchmarkValue = Math.min(bounds.upper, Math.max(bounds.lower, rawMean + laplace(noiseScale)));
            distributionSummary = { suppressed: true, reason: "distribution_not_released_under_laplace_dp" };
            privacyParameters = {
                ...privacyParameters,
                epsilon,
                delta: 0,
                sensitivity,
                noise_scale: noiseScale,
                ...privacyBudget(config, groupKey, epsilon),
            };
        } else {
            const distributionThreshold = Math.max(minimumCohortSize * 2, 10);
            distributionSummary =
                cohortSize >= distributionThreshold
                    ? { p25: quantile(values, 0.25), p50: quantile(values, 0.5), p75: quantile(values, 0.75) }
                    : { suppressed: true, reason: "distribution_cohort_too_small", minimum_required: distributionThreshold };
        }

        const publication = {
            metric_key: metricKey,
            metric_version: metricVersion,
            definition_digest: [...definitionDigests][0],
            period_key: periodKey,
            segment_key: segmentKey,
            cohort_size: cohortSize,
            minimum_cohort_size: minimumCohortSize,
            privacy_method: privacyMethod,
            algorithm_version: NETWORK_AGGREGATION_ALGORITHM_VERSION,
            benchmark_value: benchmarkValue,
            distribution_summary: distributionSummary,
            privacy_parameters: privacyParameters,
            source_batch_ref: sourceBatchRef,
        };
        publications.push({ ...publication, publication_digest: digest(publication) });
    }
    return {
        schema_version: 1,
        algorithm_version: NETWORK_AGGREGATION_ALGORITHM_VERSION,
        publications,
        contains_peer_raw_records: false,
    };
}

function runCli() {
    const [inputFile, outputFile] = process.argv.slice(2);
    if (!inputFile || !outputFile) throw new Error("usage: node aggregate-network-benchmarks.mjs input.json output.json");
    const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));
    const output = aggregateNetworkBenchmarks(input);
    fs.writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`wrote ${output.publications.length} privacy-governed publications\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) runCli();
