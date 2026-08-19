import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";

import { BusinessRuleException, ResourceNotFoundException } from "#exceptions/domain_exceptions";
import {
    chiSquareStatistic,
    deterministicBucket,
    srmDetected,
    subjectHash,
    type VariantAggregate,
    variantEffect,
} from "#services/phase17_statistics";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface VariantInput {
    key: string;
    name: string;
    weight_bps: number;
    is_control?: boolean;
    payload?: Record<string, unknown>;
}

interface ExperimentInput {
    experiment_key: string;
    name: string;
    hypothesis: string;
    surface: string;
    risk_level?: string;
    randomization_unit: string;
    layer_key?: string;
    layer_start_bps?: number;
    layer_end_bps?: number;
    primary_metric_key: string;
    primary_metric_kind?: string;
    secondary_metrics?: string[];
    guardrails?: Array<Record<string, unknown>>;
    eligibility?: Record<string, unknown>;
    exclusions?: string[];
    sample_plan?: Record<string, unknown>;
    analysis_method?: string;
    approval_reference?: string | null;
    variants: VariantInput[];
}

interface ExperimentRow {
    id: number | string;
    experiment_key: string;
    name: string;
    hypothesis: string;
    surface: string;
    status: string;
    risk_level: string;
    randomization_unit: string;
    layer_key: string;
    layer_start_bps: number | string;
    layer_end_bps: number | string;
    salt: string;
    primary_metric_key: string;
    primary_metric_kind: string;
    secondary_metrics: unknown;
    guardrails: unknown;
    eligibility: unknown;
    exclusions: unknown;
    sample_plan: unknown;
    analysis_method: string;
    approval_reference: string | null;
    version: number | string;
    owner_user_id: number | string | null;
    approved_by_user_id: number | string | null;
    approved_at: Date | string | null;
    starts_at: Date | string | null;
    ends_at: Date | string | null;
    started_at: Date | string | null;
    stopped_at: Date | string | null;
    stop_reason: string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

interface VariantRow {
    id: number | string;
    experiment_id: number | string;
    variant_key: string;
    name: string;
    weight_bps: number | string;
    is_control: boolean;
    payload: unknown;
}

const TRANSITIONS: Record<string, readonly string[]> = {
    draft: ["review", "archived"],
    review: ["scheduled", "running", "draft", "archived"],
    scheduled: ["running", "paused", "stopped"],
    running: ["paused", "stopped", "completed"],
    paused: ["running", "stopped", "completed"],
    stopped: ["archived"],
    completed: ["archived"],
    archived: [],
};

function num(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | string | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function publicExperiment(row: ExperimentRow, variants: VariantRow[] = []) {
    return {
        id: num(row.id),
        experiment_key: row.experiment_key,
        name: row.name,
        hypothesis: row.hypothesis,
        surface: row.surface,
        status: row.status,
        risk_level: row.risk_level,
        randomization_unit: row.randomization_unit,
        layer_key: row.layer_key,
        layer_start_bps: num(row.layer_start_bps),
        layer_end_bps: num(row.layer_end_bps),
        primary_metric_key: row.primary_metric_key,
        primary_metric_kind: row.primary_metric_kind,
        secondary_metrics: arrayValue(row.secondary_metrics),
        guardrails: arrayValue(row.guardrails),
        eligibility: objectValue(row.eligibility),
        exclusions: arrayValue(row.exclusions),
        sample_plan: objectValue(row.sample_plan),
        analysis_method: row.analysis_method,
        approval_reference: row.approval_reference,
        version: num(row.version),
        owner_user_id: row.owner_user_id === null ? null : num(row.owner_user_id),
        approved_by_user_id: row.approved_by_user_id === null ? null : num(row.approved_by_user_id),
        approved_at: iso(row.approved_at),
        starts_at: iso(row.starts_at),
        ends_at: iso(row.ends_at),
        started_at: iso(row.started_at),
        stopped_at: iso(row.stopped_at),
        stop_reason: row.stop_reason,
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
        variants: variants.map((variant) => ({
            id: num(variant.id),
            key: variant.variant_key,
            name: variant.name,
            weight_bps: num(variant.weight_bps),
            is_control: Boolean(variant.is_control),
            payload: objectValue(variant.payload),
        })),
    };
}

export class Phase17ExperimentationService {
    async overview() {
        const trx = currentTrx();
        const [statusRows, alertRows, exposureRows, knowledgeRows] = await Promise.all([
            trx.from("experiments").select("status").count("id as count").groupBy("status"),
            trx
                .from("experiment_analysis_runs")
                .whereIn("status", ["srm_detected", "guardrail_breached"])
                .whereRaw("id IN (SELECT MAX(id) FROM experiment_analysis_runs GROUP BY experiment_id)")
                .select("status")
                .count("id as count")
                .groupBy("status"),
            trx
                .from("experiment_exposures")
                .where("occurred_at", ">=", DateTime.utc().minus({ days: 14 }).toSQL())
                .select(trx.raw("date_trunc('day', occurred_at) AS day"))
                .count("id as count")
                .groupByRaw("date_trunc('day', occurred_at)")
                .orderBy("day", "asc"),
            trx.from("experiment_causal_knowledge").count("id as count").first(),
        ]);
        const statuses = Object.fromEntries(statusRows.map((row) => [String(row.status), num(row.count)]));
        const alerts = Object.fromEntries(alertRows.map((row) => [String(row.status), num(row.count)]));
        return {
            data: {
                counts: {
                    running: statuses.running ?? 0,
                    review: statuses.review ?? 0,
                    completed: statuses.completed ?? 0,
                    total: Object.values(statuses).reduce((sum, count) => sum + Number(count), 0),
                    srm_alerts: alerts.srm_detected ?? 0,
                    guardrail_alerts: alerts.guardrail_breached ?? 0,
                    causal_memory: num(knowledgeRows?.count),
                },
                exposures_14d: exposureRows.map((row) => ({
                    day: new Date(row.day).toISOString().slice(0, 10),
                    count: num(row.count),
                })),
                evidence_policy: {
                    assignment_is_not_exposure: true,
                    correlation_is_not_causation: true,
                    causal_claim_requires_randomized_evidence: true,
                },
            },
        };
    }

    async list() {
        const trx = currentTrx();
        const rows = (await trx.from("experiments").orderBy("updated_at", "desc").limit(200)) as ExperimentRow[];
        const ids = rows.map((row) => num(row.id));
        const variants = ids.length
            ? ((await trx.from("experiment_variants").whereIn("experiment_id", ids).orderBy("id", "asc")) as VariantRow[])
            : [];
        const latestAnalysis = ids.length
            ? await trx
                  .from("experiment_analysis_runs as a")
                  .whereIn("a.experiment_id", ids)
                  .whereRaw("a.id IN (SELECT MAX(a2.id) FROM experiment_analysis_runs a2 GROUP BY a2.experiment_id)")
                  .select("a.*")
            : [];
        return {
            data: rows.map((row) => ({
                ...publicExperiment(
                    row,
                    variants.filter((variant) => num(variant.experiment_id) === num(row.id)),
                ),
                latest_analysis: latestAnalysis.find((analysis) => num(analysis.experiment_id) === num(row.id)) ?? null,
            })),
        };
    }

    async show(experimentId: number) {
        const row = (await currentTrx().from("experiments").where("id", experimentId).first()) as ExperimentRow | undefined;
        if (!row) throw new ResourceNotFoundException("Experiment not found");
        const [variants, analysis, assignmentCount, exposureCount] = await Promise.all([
            currentTrx().from("experiment_variants").where("experiment_id", experimentId).orderBy("id", "asc") as Promise<
                VariantRow[]
            >,
            currentTrx().from("experiment_analysis_runs").where("experiment_id", experimentId).orderBy("id", "desc").limit(20),
            currentTrx().from("experiment_assignments").where("experiment_id", experimentId).count("id as count").first(),
            currentTrx().from("experiment_exposures").where("experiment_id", experimentId).count("id as count").first(),
        ]);
        return {
            data: {
                ...publicExperiment(row, variants),
                analysis,
                assignment_count: num(assignmentCount?.count),
                exposure_count: num(exposureCount?.count),
            },
        };
    }

    async create(input: ExperimentInput, actorUserId: number) {
        this.assertVariantPlan(input.variants);
        const start = input.layer_start_bps ?? 0;
        const end = input.layer_end_bps ?? 10000;
        if (end <= start)
            throw new BusinessRuleException("Layer end must be greater than layer start", "experiment.layer.invalid_range");
        await this.assertLayerAvailable(input.layer_key ?? "default", start, end, null);
        const trx = currentTrx();
        const [row] = await trx
            .table("experiments")
            .insert({
                experiment_key: input.experiment_key,
                name: input.name,
                hypothesis: input.hypothesis,
                surface: input.surface,
                risk_level: input.risk_level ?? "medium",
                randomization_unit: input.randomization_unit,
                layer_key: input.layer_key ?? "default",
                layer_start_bps: start,
                layer_end_bps: end,
                salt: randomBytes(24).toString("hex"),
                primary_metric_key: input.primary_metric_key,
                primary_metric_kind: input.primary_metric_kind ?? "binary",
                secondary_metrics: JSON.stringify(input.secondary_metrics ?? []),
                guardrails: JSON.stringify(input.guardrails ?? []),
                eligibility: JSON.stringify(input.eligibility ?? {}),
                exclusions: JSON.stringify(input.exclusions ?? []),
                sample_plan: JSON.stringify(input.sample_plan ?? {}),
                analysis_method: input.analysis_method ?? "fixed_horizon_v1",
                approval_reference: input.approval_reference ?? null,
                owner_user_id: actorUserId,
                created_by_user_id: actorUserId,
            })
            .returning(["id"]);
        const experimentId = num(row?.id);
        await trx.table("experiment_variants").insert(
            input.variants.map((variant) => ({
                experiment_id: experimentId,
                variant_key: variant.key,
                name: variant.name,
                weight_bps: variant.weight_bps,
                is_control: variant.is_control === true,
                payload: JSON.stringify(variant.payload ?? {}),
            })),
        );
        return this.show(experimentId);
    }

    async transition(
        experimentId: number,
        input: {
            status: string;
            expected_version: number;
            reason?: string;
            approval_reference?: string | null;
        },
        actorUserId: number,
    ) {
        const trx = currentTrx();
        const row = (await trx.from("experiments").where("id", experimentId).forUpdate().first()) as ExperimentRow | undefined;
        if (!row) throw new ResourceNotFoundException("Experiment not found");
        const version = num(row.version);
        if (version !== input.expected_version)
            throw new BusinessRuleException("Experiment was changed by another operator", "experiment.version_conflict", {
                current_version: version,
            });
        if (!(TRANSITIONS[row.status] ?? []).includes(input.status))
            throw new BusinessRuleException("Invalid experiment transition", "experiment.transition.invalid", {
                from: row.status,
                to: input.status,
            });
        const approvalReference = input.approval_reference?.trim() || row.approval_reference;
        if (input.status === "running") {
            const variants = (await trx.from("experiment_variants").where("experiment_id", experimentId)) as VariantRow[];
            this.assertVariantPlan(
                variants.map((variant) => ({
                    key: variant.variant_key,
                    name: variant.name,
                    weight_bps: num(variant.weight_bps),
                    is_control: variant.is_control,
                })),
            );
            await this.assertLayerAvailable(row.layer_key, num(row.layer_start_bps), num(row.layer_end_bps), experimentId);
            if (["high", "critical"].includes(row.risk_level) && !approvalReference) {
                throw new BusinessRuleException(
                    "Governance approval reference is required before launch",
                    "experiment.approval.required",
                );
            }
        }
        const now = DateTime.utc().toSQL();
        const patch: Record<string, unknown> = {
            status: input.status,
            version: version + 1,
            approval_reference: approvalReference ?? null,
            updated_at: now,
        };
        if (input.status === "running") {
            patch.started_at = row.started_at ?? now;
            patch.approved_at = row.approved_at ?? now;
            patch.approved_by_user_id = row.approved_by_user_id ?? actorUserId;
        }
        if (["stopped", "completed"].includes(input.status)) {
            patch.stopped_at = now;
            patch.stop_reason = input.reason?.trim() || null;
        }
        await trx.from("experiments").where("id", experimentId).update(patch);
        if (input.status === "completed") await this.captureKnowledge(experimentId);
        return this.show(experimentId);
    }

    async assign(input: { experiment_key: string; subject_type: string; subject_key: string }): Promise<{
        data: {
            assigned: boolean;
            reason?: string;
            assignment_id?: number;
            experiment_key?: string;
            variant_key?: string;
            variant_name?: string;
            payload?: Record<string, unknown>;
            sticky?: boolean;
        };
    }> {
        const trx = currentTrx();
        const experiment = (await trx
            .from("experiments")
            .where("experiment_key", input.experiment_key)
            .where("status", "running")
            .first()) as ExperimentRow | undefined;
        if (!experiment) return { data: { assigned: false, reason: "experiment_not_running" } };
        if (experiment.randomization_unit !== input.subject_type)
            return { data: { assigned: false, reason: "randomization_unit_mismatch" } };
        const tenantId = currentTenantId();
        const hash = subjectHash(tenantId, input.subject_type, input.subject_key);
        const existing = await trx
            .from("experiment_assignments as a")
            .innerJoin("experiment_variants as v", "v.id", "a.variant_id")
            .where("a.experiment_id", num(experiment.id))
            .where("a.subject_type", input.subject_type)
            .where("a.subject_hash", hash)
            .select("a.id", "a.layer_bucket", "a.variant_bucket", "v.variant_key", "v.name", "v.payload")
            .first();
        if (existing)
            return {
                data: {
                    assigned: true,
                    assignment_id: num(existing.id),
                    experiment_key: experiment.experiment_key,
                    variant_key: existing.variant_key,
                    variant_name: existing.name,
                    payload: objectValue(existing.payload),
                    sticky: true,
                },
            };
        if (await this.inPersistentHoldout(input.subject_type, hash, experiment.surface))
            return { data: { assigned: false, reason: "persistent_holdout" } };
        const layerBucket = deterministicBucket([tenantId, experiment.layer_key, input.subject_type, hash]);
        if (layerBucket < num(experiment.layer_start_bps) || layerBucket >= num(experiment.layer_end_bps))
            return { data: { assigned: false, reason: "outside_layer_allocation" } };
        const variants = (await trx
            .from("experiment_variants")
            .where("experiment_id", num(experiment.id))
            .orderBy("id", "asc")) as VariantRow[];
        const variantBucket = deterministicBucket([
            tenantId,
            experiment.experiment_key,
            experiment.salt,
            input.subject_type,
            hash,
        ]);
        let cursor = 0;
        const selected = variants.find((variant) => {
            cursor += num(variant.weight_bps);
            return variantBucket < cursor;
        });
        if (!selected) throw new BusinessRuleException("Variant allocation is invalid", "experiment.variants.allocation");
        const [assignment] = await trx
            .table("experiment_assignments")
            .insert({
                experiment_id: num(experiment.id),
                variant_id: num(selected.id),
                subject_type: input.subject_type,
                subject_hash: hash,
                layer_bucket: layerBucket,
                variant_bucket: variantBucket,
                experiment_version: num(experiment.version),
                assignment_reason: "eligible",
            })
            .onConflict(["tenant_id", "experiment_id", "subject_type", "subject_hash"])
            .ignore()
            .returning(["id"]);
        if (!assignment?.id) return this.assign(input);
        return {
            data: {
                assigned: true,
                assignment_id: num(assignment.id),
                experiment_key: experiment.experiment_key,
                variant_key: selected.variant_key,
                variant_name: selected.name,
                payload: objectValue(selected.payload),
                sticky: false,
            },
        };
    }

    async logExposure(input: {
        exposure_id: string;
        experiment_key: string;
        subject_type: string;
        subject_key: string;
        surface: string;
        placement?: string | null;
        context?: Record<string, unknown>;
        occurred_at: string;
    }) {
        const assignment = await this.assign({
            experiment_key: input.experiment_key,
            subject_type: input.subject_type,
            subject_key: input.subject_key,
        });
        if (!assignment.data.assigned || !assignment.data.assignment_id) return assignment;
        const occurredAt = DateTime.fromISO(input.occurred_at, { setZone: true });
        if (!occurredAt.isValid)
            throw new BusinessRuleException("Invalid exposure occurred_at", "experiment.exposure.invalid_time");
        const trx = currentTrx();
        const row = await trx.from("experiment_assignments").where("id", assignment.data.assignment_id).first();
        await trx
            .table("experiment_exposures")
            .insert({
                experiment_id: num(row.experiment_id),
                assignment_id: assignment.data.assignment_id,
                exposure_id: input.exposure_id,
                surface: input.surface,
                placement: input.placement ?? null,
                context: JSON.stringify(input.context ?? {}),
                occurred_at: occurredAt.toUTC().toSQL(),
            })
            .onConflict(["tenant_id", "exposure_id"])
            .ignore();
        return {
            data: {
                recorded: true,
                assignment_id: assignment.data.assignment_id,
                variant_key: assignment.data.variant_key,
            },
        };
    }

    async logObservation(input: {
        observation_id: string;
        experiment_key: string;
        subject_type: string;
        subject_key: string;
        metric_key: string;
        metric_kind: string;
        value: number;
        currency?: string | null;
        context?: Record<string, unknown>;
        occurred_at: string;
    }) {
        const assignment = await this.assign({
            experiment_key: input.experiment_key,
            subject_type: input.subject_type,
            subject_key: input.subject_key,
        });
        if (!assignment.data.assigned || !assignment.data.assignment_id) return assignment;
        const occurredAt = DateTime.fromISO(input.occurred_at, { setZone: true });
        if (!occurredAt.isValid)
            throw new BusinessRuleException("Invalid observation occurred_at", "experiment.observation.invalid_time");
        const trx = currentTrx();
        const assignmentRow = await trx.from("experiment_assignments").where("id", assignment.data.assignment_id).first();
        const experiment = (await trx.from("experiments").where("id", assignmentRow.experiment_id).first()) as
            | ExperimentRow
            | undefined;
        if (!experiment) throw new ResourceNotFoundException("Experiment not found");
        if (input.metric_key === experiment.primary_metric_key && input.metric_kind !== experiment.primary_metric_kind)
            throw new BusinessRuleException(
                "Primary metric kind does not match the experiment contract",
                "experiment.observation.metric_kind_mismatch",
            );
        if (input.metric_kind === "binary" && input.value !== 0 && input.value !== 1)
            throw new BusinessRuleException("Binary experiment metrics must be 0 or 1", "experiment.observation.binary_value");
        const exposure = await trx
            .from("experiment_exposures")
            .where("assignment_id", assignment.data.assignment_id)
            .where("occurred_at", "<=", occurredAt.toUTC().toSQL())
            .first();
        if (!exposure) return { data: { recorded: false, reason: "no_prior_exposure" } };
        await trx
            .table("experiment_metric_observations")
            .insert({
                experiment_id: num(assignmentRow.experiment_id),
                assignment_id: assignment.data.assignment_id,
                observation_id: input.observation_id,
                metric_key: input.metric_key,
                metric_kind: input.metric_kind,
                value: input.value,
                currency: input.currency?.toUpperCase() ?? null,
                context: JSON.stringify(input.context ?? {}),
                occurred_at: occurredAt.toUTC().toSQL(),
            })
            .onConflict(["tenant_id", "observation_id"])
            .ignore();
        return { data: { recorded: true, assignment_id: assignment.data.assignment_id } };
    }

    async analyze(experimentId: number) {
        const trx = currentTrx();
        const experiment = (await trx.from("experiments").where("id", experimentId).first()) as ExperimentRow | undefined;
        if (!experiment) throw new ResourceNotFoundException("Experiment not found");
        const variants = (await trx
            .from("experiment_variants")
            .where("experiment_id", experimentId)
            .orderBy("id", "asc")) as VariantRow[];
        const assignmentRows = await trx
            .from("experiment_assignments")
            .where("experiment_id", experimentId)
            .select("variant_id")
            .count("id as count")
            .groupBy("variant_id");
        const exposureRows = await trx
            .from("experiment_exposures as e")
            .innerJoin("experiment_assignments as a", "a.id", "e.assignment_id")
            .where("e.experiment_id", experimentId)
            .select("a.variant_id")
            .countDistinct("e.assignment_id as count")
            .groupBy("a.variant_id");
        const observationRows = await trx
            .from("experiment_metric_observations as o")
            .innerJoin("experiment_assignments as a", "a.id", "o.assignment_id")
            .where("o.experiment_id", experimentId)
            .where("o.metric_key", experiment.primary_metric_key)
            .where("o.metric_kind", experiment.primary_metric_kind)
            .select("a.variant_id")
            .count("o.id as observations")
            .sum("o.value as sum")
            .sum(trx.raw("o.value * o.value AS sum_squares"))
            .groupBy("a.variant_id");
        const aggregates: VariantAggregate[] = variants.map((variant) => {
            const assignment = assignmentRows.find((row) => num(row.variant_id) === num(variant.id));
            const exposure = exposureRows.find((row) => num(row.variant_id) === num(variant.id));
            const observation = observationRows.find((row) => num(row.variant_id) === num(variant.id));
            return {
                variantId: num(variant.id),
                variantKey: variant.variant_key,
                isControl: Boolean(variant.is_control),
                expectedShare: num(variant.weight_bps) / 10000,
                assignments: num(assignment?.count),
                exposedSubjects: num(exposure?.count),
                observations: num(observation?.observations),
                sum: num(observation?.sum),
                sumSquares: num(observation?.sum_squares),
            };
        });
        const assignmentStatistic = chiSquareStatistic(
            aggregates.map((row) => row.assignments),
            aggregates.map((row) => row.expectedShare),
        );
        const exposureStatistic = chiSquareStatistic(
            aggregates.map((row) => row.exposedSubjects),
            aggregates.map((row) => row.expectedShare),
        );
        const assignmentSrm = srmDetected(assignmentStatistic, Math.max(1, variants.length - 1));
        const exposureSrm = srmDetected(exposureStatistic, Math.max(1, variants.length - 1));
        const srm = assignmentSrm || exposureSrm;
        const control = aggregates.find((row) => row.isControl) ?? null;
        const variantMetrics = aggregates.map((row) => ({ ...row, effect: variantEffect(row, control) }));
        const guardrailResults = await this.guardrailResults(experimentId, experiment, variants);
        const guardrailBreached = guardrailResults.some((result) => result.breached);
        const totalExposed = aggregates.reduce((sum, row) => sum + row.exposedSubjects, 0);
        const totalPrimaryObservations = aggregates.reduce((sum, row) => sum + row.observations, 0);
        const minSample = num(objectValue(experiment.sample_plan).minimum_exposed_subjects ?? 100);
        const allVariantsObserved = aggregates.every((row) => row.exposedSubjects > 0 && row.observations > 0);
        const enoughOutcomes = totalPrimaryObservations >= Math.max(variants.length, Math.floor(minSample * 0.5));
        const status = srm
            ? "srm_detected"
            : guardrailBreached
              ? "guardrail_breached"
              : totalExposed < minSample || !allVariantsObserved || !enoughOutcomes
                ? "insufficient_data"
                : "healthy";
        const causalStrength =
            status === "healthy"
                ? "randomized_evidence"
                : guardrailBreached && totalExposed >= minSample && !srm
                  ? "randomized_evidence_guardrail_failed"
                  : "insufficient_data";
        const conclusion =
            status === "healthy"
                ? "Randomized evidence is available for the registered primary metric; interpret effect with the fixed-horizon analysis plan."
                : status === "srm_detected"
                  ? "Sample ratio mismatch detected in assignment or exposure. Causal interpretation is blocked until integrity is resolved."
                  : status === "guardrail_breached"
                    ? "A registered guardrail is breached. The experiment must not be declared a winner on the primary metric alone."
                    : "Exposure or primary-outcome coverage is below the registered threshold; no causal conclusion is stored.";
        const cutoff = DateTime.utc();
        const [analysis] = await trx
            .table("experiment_analysis_runs")
            .insert({
                experiment_id: experimentId,
                status,
                srm_detected: srm,
                srm_chi_square: assignmentStatistic,
                variant_metrics: JSON.stringify({
                    variants: variantMetrics,
                    srm: {
                        assignment_chi_square: assignmentStatistic,
                        exposure_chi_square: exposureStatistic,
                        assignment_detected: assignmentSrm,
                        exposure_detected: exposureSrm,
                    },
                }),
                guardrail_results: JSON.stringify(guardrailResults),
                causal_strength: causalStrength,
                conclusion,
                data_cutoff_at: cutoff.toSQL(),
            })
            .returning(["id"]);
        let automaticAction: string | null = null;
        if (guardrailBreached && experiment.status === "running") {
            await trx
                .from("experiments")
                .where("id", experimentId)
                .update({
                    status: "paused",
                    version: num(experiment.version) + 1,
                    stop_reason: "automatic_guardrail_breach",
                    stopped_at: cutoff.toSQL(),
                    updated_at: cutoff.toSQL(),
                });
            automaticAction = "paused_for_guardrail";
        }
        if (["randomized_evidence", "randomized_evidence_guardrail_failed"].includes(causalStrength))
            await this.captureKnowledge(experimentId);
        return {
            data: {
                id: num(analysis?.id),
                status,
                srm_detected: srm,
                srm_chi_square: assignmentStatistic,
                srm: {
                    assignment_chi_square: assignmentStatistic,
                    exposure_chi_square: exposureStatistic,
                    assignment_detected: assignmentSrm,
                    exposure_detected: exposureSrm,
                },
                variant_metrics: variantMetrics,
                guardrail_results: guardrailResults,
                causal_strength: causalStrength,
                conclusion,
                automatic_action: automaticAction,
                data_cutoff_at: cutoff.toISO(),
            },
        };
    }

    async holdouts() {
        const rows = await currentTrx().from("experiment_holdouts").orderBy("updated_at", "desc");
        return {
            data: rows.map((row) => ({
                ...row,
                id: num(row.id),
                allocation_bps: num(row.allocation_bps),
                created_by_user_id: row.created_by_user_id === null ? null : num(row.created_by_user_id),
            })),
        };
    }

    async createHoldout(
        input: { holdout_key: string; name: string; scope: string; allocation_bps: number; purpose: string },
        actorUserId: number,
    ) {
        const [row] = await currentTrx()
            .table("experiment_holdouts")
            .insert({ ...input, salt: randomBytes(24).toString("hex"), created_by_user_id: actorUserId })
            .returning(["id"]);
        return { data: { id: num(row?.id), ...input, status: "active" } };
    }

    async knowledge() {
        const rows = await currentTrx().from("experiment_causal_knowledge").orderBy("last_evaluated_at", "desc").limit(200);
        return {
            data: rows.map((row) => ({
                ...row,
                id: num(row.id),
                experiment_id: row.experiment_id === null ? null : num(row.experiment_id),
                replication_count: num(row.replication_count),
            })),
        };
    }

    async collisions() {
        const rows = await currentTrx()
            .from("experiments")
            .whereIn("status", ["scheduled", "running", "paused"])
            .orderBy("layer_key", "asc")
            .orderBy("layer_start_bps", "asc");
        const collisions: Array<Record<string, unknown>> = [];
        for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
                const left = rows[leftIndex]!;
                const right = rows[rightIndex]!;
                if (left.layer_key !== right.layer_key) break;
                const overlaps =
                    num(left.layer_start_bps) < num(right.layer_end_bps) && num(right.layer_start_bps) < num(left.layer_end_bps);
                if (overlaps)
                    collisions.push({
                        layer_key: left.layer_key,
                        left: {
                            id: num(left.id),
                            key: left.experiment_key,
                            range: [num(left.layer_start_bps), num(left.layer_end_bps)],
                        },
                        right: {
                            id: num(right.id),
                            key: right.experiment_key,
                            range: [num(right.layer_start_bps), num(right.layer_end_bps)],
                        },
                    });
            }
        }
        return { data: collisions };
    }

    private assertVariantPlan(variants: VariantInput[]) {
        const total = variants.reduce((sum, variant) => sum + Number(variant.weight_bps), 0);
        if (total !== 10000)
            throw new BusinessRuleException("Variant weights must total 10000 basis points", "experiment.variants.weight_total", {
                total,
            });
        if (variants.filter((variant) => variant.is_control === true).length !== 1)
            throw new BusinessRuleException("Exactly one control variant is required", "experiment.variants.control_required");
        if (new Set(variants.map((variant) => variant.key)).size !== variants.length)
            throw new BusinessRuleException("Variant keys must be unique", "experiment.variants.duplicate_key");
    }

    private async assertLayerAvailable(layerKey: string, start: number, end: number, excludeId: number | null) {
        let query = currentTrx()
            .from("experiments")
            .where("layer_key", layerKey)
            .whereIn("status", ["scheduled", "running", "paused"])
            .where("layer_start_bps", "<", end)
            .where("layer_end_bps", ">", start);
        if (excludeId) query = query.whereNot("id", excludeId);
        const collision = await query.first();
        if (collision)
            throw new BusinessRuleException(
                "Experiment allocation collides with another active experiment in the same layer",
                "experiment.layer.collision",
                { conflicting_experiment_id: num(collision.id) },
            );
    }

    private async inPersistentHoldout(subjectType: string, hash: string, surface: string): Promise<boolean> {
        const scope =
            surface === "recommendation_rank"
                ? "recommendation"
                : ["email_push", "landing_page", "content_seo"].includes(surface)
                  ? "marketing"
                  : null;
        if (!scope) return false;
        const rows = await currentTrx().from("experiment_holdouts").where("scope", scope).where("status", "active");
        for (const row of rows) {
            const bucket = deterministicBucket([currentTenantId(), row.holdout_key, row.salt, subjectType, hash]);
            const included = bucket < num(row.allocation_bps);
            if (!included) continue;
            await currentTrx()
                .table("experiment_holdout_memberships")
                .insert({ holdout_id: num(row.id), subject_type: subjectType, subject_hash: hash, bucket })
                .onConflict(["tenant_id", "holdout_id", "subject_type", "subject_hash"])
                .ignore();
            return true;
        }
        return false;
    }

    private async guardrailResults(experimentId: number, experiment: ExperimentRow, variants: VariantRow[]) {
        const guardrails = arrayValue(experiment.guardrails).filter((item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object" && !Array.isArray(item)),
        );
        const control = variants.find((variant) => variant.is_control) ?? null;
        if (!control) return [];
        const results: Array<{
            metric_key: string;
            threshold_relative: number;
            control_mean: number | null;
            worst_relative_change: number | null;
            breached: boolean;
        }> = [];
        for (const guardrail of guardrails) {
            const metricKey = String(guardrail.metric_key ?? "");
            const threshold = Number(guardrail.max_relative_increase ?? 0);
            if (!metricKey || !Number.isFinite(threshold) || threshold < 0) continue;
            const rows = await currentTrx()
                .from("experiment_metric_observations as o")
                .innerJoin("experiment_assignments as a", "a.id", "o.assignment_id")
                .where("o.experiment_id", experimentId)
                .where("o.metric_key", metricKey)
                .select("a.variant_id")
                .count("o.id as observations")
                .sum("o.value as sum")
                .groupBy("a.variant_id");
            const controlRow = rows.find((row) => num(row.variant_id) === num(control.id));
            const controlMean = num(controlRow?.observations) > 0 ? num(controlRow?.sum) / num(controlRow?.observations) : null;
            let worst: number | null = null;
            for (const variant of variants.filter((item) => num(item.id) !== num(control.id))) {
                const row = rows.find((item) => num(item.variant_id) === num(variant.id));
                if (controlMean === null || controlMean === 0 || num(row?.observations) === 0) continue;
                const mean = num(row?.sum) / num(row?.observations);
                const relative = (mean - controlMean) / Math.abs(controlMean);
                if (worst === null || relative > worst) worst = relative;
            }
            results.push({
                metric_key: metricKey,
                threshold_relative: threshold,
                control_mean: controlMean,
                worst_relative_change: worst,
                breached: worst !== null && worst > threshold,
            });
        }
        return results;
    }

    private async captureKnowledge(experimentId: number) {
        const trx = currentTrx();
        const experiment = (await trx.from("experiments").where("id", experimentId).first()) as ExperimentRow | undefined;
        if (!experiment) return;
        const analysis = await trx
            .from("experiment_analysis_runs")
            .where("experiment_id", experimentId)
            .orderBy("id", "desc")
            .first();
        if (
            !analysis ||
            !["randomized_evidence", "randomized_evidence_guardrail_failed"].includes(String(analysis.causal_strength))
        )
            return;
        const key = `experiment:${experiment.experiment_key}:${experiment.primary_metric_key}`;
        const existing = await trx.from("experiment_causal_knowledge").where("knowledge_key", key).first();
        const limitations = [
            analysis.status === "guardrail_breached" ? "registered_guardrail_breached" : null,
            "fixed_horizon_analysis",
            "scope_specific_randomized_evidence",
        ].filter(Boolean);
        const payload = {
            experiment_id: experimentId,
            surface: experiment.surface,
            metric_key: experiment.primary_metric_key,
            evidence_strength: "randomized_evidence",
            conclusion: String(analysis.conclusion ?? "Randomized experiment result"),
            effect_snapshot: JSON.stringify({
                variant_metrics: analysis.variant_metrics,
                analysis_version: analysis.analysis_version,
                data_cutoff_at: analysis.data_cutoff_at,
            }),
            limitations: JSON.stringify(limitations),
            replication_count: existing ? num(existing.replication_count) : 1,
            last_evaluated_at: analysis.data_cutoff_at,
            updated_at: DateTime.utc().toSQL(),
        };
        if (existing) await trx.from("experiment_causal_knowledge").where("id", existing.id).update(payload);
        else await trx.table("experiment_causal_knowledge").insert({ knowledge_key: key, ...payload });
    }
}

export const phase17ExperimentationService = new Phase17ExperimentationService();
