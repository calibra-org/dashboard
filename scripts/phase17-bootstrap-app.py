from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"phase17 app bootstrap: anchor not found in {path}: {old!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")


# Add pre-experiment baseline fields used by the power contract.
replace(
    "apps/api/database/migrations/1765000000000_create_phase17_experimentation_tables.ts",
    'table.decimal("minimum_detectable_effect", 18, 8).nullable();',
    'table.decimal("minimum_detectable_effect", 18, 8).nullable();\n            table.decimal("baseline_mean", 18, 8).nullable();\n            table.decimal("baseline_variance", 18, 8).nullable();',
)

replace(
    "apps/api/app/validators/admin/experimentation_validator.ts",
    'minimum_detectable_effect: vine.number().optional().nullable(),',
    'minimum_detectable_effect: vine.number().optional().nullable(),\n    baseline_mean: vine.number().optional().nullable(),\n    baseline_variance: vine.number().min(0).optional().nullable(),',
)

write("apps/api/app/services/experimentation/experiment_service.ts", r'''
import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";
import { assignDeterministically, signExposureToken, verifyExposureToken } from "#services/experimentation/assignment";
import { assertTwoArmAllocation, canTransition, type ExperimentStatus } from "#services/experimentation/domain";
import { applyCuped, compareMeans, estimateTwoArmSampleSize, sampleRatioMismatch } from "#services/experimentation/statistics";

export interface CreateMetricInput {
    key: string;
    name_fa: string;
    name_en?: string | null;
    kind: string;
    value_type: string;
    analysis_unit: string;
    business_definition_fa: string;
    source_contract?: Record<string, unknown>;
    observation_window_hours?: number;
    expected_freshness_minutes?: number;
}

export interface CreateExperimentInput {
    key: string;
    name_fa: string;
    hypothesis_fa: string;
    surface: string;
    randomization_unit: string;
    analysis_unit: string;
    identity_policy: string;
    primary_metric_id: number;
    traffic_basis_points?: number;
    layer_id?: number | null;
    analysis_method?: "fixed_horizon";
    alpha?: number;
    target_power?: number;
    minimum_detectable_effect?: number | null;
    baseline_mean?: number | null;
    baseline_variance?: number | null;
    minimum_duration_hours?: number;
    observation_window_hours?: number;
    cuped_enabled?: boolean;
    eligibility?: Record<string, unknown>;
    variants: Array<{ key: string; name_fa: string; is_control: boolean; allocation_basis_points: number; parameters?: Record<string, unknown> }>;
}

type Row = Record<string, any>;

function number(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function json<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
        try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return value as T;
}

function tenantSecret(): string {
    const base = process.env.APP_KEY;
    if (!base) throw new Exception("APP_KEY is required for experiment exposure tokens", { status: 500, code: "E_EXPERIMENT_SECRET" });
    return `${base}:phase17:${String(currentTenantId())}`;
}

function subjectHash(subjectKey: string): string {
    return createHash("sha256").update(`${String(currentTenantId())}:${subjectKey}`).digest("hex");
}

function stats(values: number[]) {
    const n = values.length;
    if (n === 0) return { n: 0, mean: 0, variance: 0 };
    const mean = values.reduce((sum, value) => sum + value, 0) / n;
    const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
    return { n, mean, variance };
}

export default class ExperimentService {
    async list() {
        const trx = currentTrx();
        const rows = await trx.from("experiments as e")
            .leftJoin("experiment_revisions as r", function joinRevision() {
                this.on("r.experiment_id", "=", "e.id").andOn("r.revision", "=", "e.current_revision");
            })
            .leftJoin("experiment_metrics as m", "m.id", "r.primary_metric_id")
            .select("e.*", "r.analysis_method", "r.randomization_unit", "r.analysis_unit", "r.traffic_basis_points", "m.key as primary_metric_key", "m.name_fa as primary_metric_name_fa")
            .orderBy("e.updated_at", "desc");
        return { data: rows };
    }

    async get(id: number) {
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("id", id).first();
        if (!experiment) throw new Exception("Experiment not found", { status: 404, code: "E_EXPERIMENT_NOT_FOUND" });
        const revision = await trx.from("experiment_revisions").where("experiment_id", id).where("revision", experiment.current_revision).first();
        const variants = revision ? await trx.from("experiment_variants").where("experiment_revision_id", revision.id).orderBy("id") : [];
        const metric = revision ? await trx.from("experiment_metrics").where("id", revision.primary_metric_id).first() : null;
        const [snapshots, diagnostics, decisions, audit] = await Promise.all([
            revision ? trx.from("experiment_analysis_snapshots").where("experiment_revision_id", revision.id).orderBy("analysis_version", "desc").limit(20) : [],
            revision ? trx.from("experiment_diagnostics").where("experiment_revision_id", revision.id).orderBy("created_at", "desc").limit(50) : [],
            trx.from("experiment_decisions").where("experiment_id", id).orderBy("created_at", "desc").limit(20),
            trx.from("admin_audit_log").where("entity_kind", "experiment").where("entity_id", id).orderBy("occurred_at", "desc").limit(50),
        ]);
        return { data: { experiment, revision, variants, metric, snapshots, diagnostics, decisions, audit } };
    }

    async listMetrics() {
        return { data: await currentTrx().from("experiment_metrics").where("is_active", true).orderBy("name_fa") };
    }

    async createMetric(input: CreateMetricInput) {
        const trx = currentTrx();
        const existing = await trx.from("experiment_metrics").where("key", input.key).where("is_active", true).orderBy("version", "desc").first();
        const version = existing ? number(existing.version) + 1 : 1;
        const [row] = await trx.table("experiment_metrics").insert({
            tenant_id: String(currentTenantId()), key: input.key, name_fa: input.name_fa, name_en: input.name_en ?? null,
            kind: input.kind, value_type: input.value_type, analysis_unit: input.analysis_unit,
            business_definition_fa: input.business_definition_fa, source_contract: JSON.stringify(input.source_contract ?? {}),
            observation_window_hours: input.observation_window_hours ?? 168,
            expected_freshness_minutes: input.expected_freshness_minutes ?? 60, version,
        }).returning("*");
        return { data: row };
    }

    async listLayers() {
        return { data: await currentTrx().from("experiment_layers").where("is_active", true).orderBy("name_fa") };
    }

    async listHoldouts() {
        return { data: await currentTrx().from("experiment_holdouts").where("is_active", true).orderBy("name_fa") };
    }

    async create(input: CreateExperimentInput, actorId: number | null) {
        assertTwoArmAllocation(input.variants);
        if (input.variants.filter((item) => item.is_control).length !== 1) throw new Exception("Exactly one control variant is required", { status: 422, code: "E_EXPERIMENT_CONTROL" });
        const trx = currentTrx();
        const metric = await trx.from("experiment_metrics").where("id", input.primary_metric_id).where("is_active", true).first();
        if (!metric) throw new Exception("Primary metric not found", { status: 422, code: "E_EXPERIMENT_METRIC" });
        if (input.layer_id) {
            const layer = await trx.from("experiment_layers").where("id", input.layer_id).where("is_active", true).first();
            if (!layer || layer.collision_policy !== "hard") throw new Exception("V1 supports active hard-isolation layers only", { status: 422, code: "E_EXPERIMENT_LAYER" });
        }
        const [experiment] = await trx.table("experiments").insert({ tenant_id: String(currentTenantId()), key: input.key, name_fa: input.name_fa, hypothesis_fa: input.hypothesis_fa, surface: input.surface, owner_user_id: actorId }).returning("*");
        const [revision] = await trx.table("experiment_revisions").insert({
            tenant_id: String(currentTenantId()), experiment_id: experiment.id, revision: 1,
            randomization_unit: input.randomization_unit, analysis_unit: input.analysis_unit, identity_policy: input.identity_policy,
            traffic_basis_points: input.traffic_basis_points ?? 10000, primary_metric_id: input.primary_metric_id, layer_id: input.layer_id ?? null,
            analysis_method: input.analysis_method ?? "fixed_horizon", alpha: input.alpha ?? 0.05, target_power: input.target_power ?? 0.8,
            minimum_detectable_effect: input.minimum_detectable_effect ?? null, baseline_mean: input.baseline_mean ?? null,
            baseline_variance: input.baseline_variance ?? null, minimum_duration_hours: input.minimum_duration_hours ?? 168,
            observation_window_hours: input.observation_window_hours ?? metric.observation_window_hours ?? 168,
            cuped_enabled: input.cuped_enabled ?? false, eligibility: JSON.stringify(input.eligibility ?? {}),
        }).returning("*");
        await trx.table("experiment_variants").insert(input.variants.map((variant) => ({
            tenant_id: String(currentTenantId()), experiment_revision_id: revision.id, key: variant.key, name_fa: variant.name_fa,
            is_control: variant.is_control, allocation_basis_points: variant.allocation_basis_points, parameters: JSON.stringify(variant.parameters ?? {}),
        })));
        return this.get(number(experiment.id));
    }

    async preflight(id: number) {
        const detail = (await this.get(id)).data;
        const { experiment, revision, variants, metric } = detail;
        const blockers: string[] = [];
        const warnings: string[] = [];
        if (!revision || !metric) blockers.push("تعریف معیار اصلی یا نسخه آزمایش ناقص است.");
        if (variants.length !== 2 || variants.filter((item: Row) => item.is_control).length !== 1) blockers.push("نسخه V1 دقیقاً به یک کنترل و یک مداخله نیاز دارد.");
        const allocation = variants.reduce((sum: number, item: Row) => sum + number(item.allocation_basis_points), 0);
        if (allocation !== 10000) blockers.push("مجموع تخصیص واریانت‌ها باید ۱۰۰٪ باشد.");
        if (revision?.layer_id) {
            const layer = await currentTrx().from("experiment_layers").where("id", revision.layer_id).first();
            if (!layer || layer.collision_policy !== "hard") blockers.push("لایه آزمایش باید فعال و از نوع جداسازی سخت باشد.");
        }
        let baselineVariance = revision?.baseline_variance === null ? null : number(revision?.baseline_variance);
        const baselineMean = revision?.baseline_mean === null ? null : number(revision?.baseline_mean);
        if (baselineVariance === null && metric?.value_type === "binary" && baselineMean !== null && baselineMean > 0 && baselineMean < 1) baselineVariance = baselineMean * (1 - baselineMean);
        const control = variants.find((item: Row) => item.is_control);
        const mde = revision?.minimum_detectable_effect === null ? null : number(revision?.minimum_detectable_effect);
        const power = baselineMean !== null && baselineVariance !== null && mde !== null && control
            ? estimateTwoArmSampleSize({ baselineMean, baselineVariance, minimumDetectableEffect: mde, alpha: number(revision.alpha), power: number(revision.target_power), controlAllocationBasisPoints: number(control.allocation_basis_points) })
            : null;
        if (!power) blockers.push("برنامه توان آماری کامل نیست؛ خط پایه، واریانس یا MDE معتبر ثبت نشده است.");
        if (revision?.cuped_enabled) warnings.push("CUPED فقط در صورت وجود covariate پیش‌آزمایش با پوشش کافی اعمال می‌شود و در غیر این صورت fallback ثبت خواهد شد.");
        const result = { status: blockers.length ? "blocked" : warnings.length ? "warning" : "ready", blockers, warnings, power_plan: power };
        await currentTrx().from("experiment_revisions").where("id", revision.id).update({ preflight: JSON.stringify(result), power_plan: JSON.stringify(power ?? {}) });
        return { data: result };
    }

    async transition(id: number, to: ExperimentStatus, actorId: number | null) {
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("id", id).forUpdate().first();
        if (!experiment) throw new Exception("Experiment not found", { status: 404, code: "E_EXPERIMENT_NOT_FOUND" });
        const from = String(experiment.status) as ExperimentStatus;
        if (!canTransition(from, to)) throw new Exception(`Invalid experiment transition ${from} -> ${to}`, { status: 409, code: "E_EXPERIMENT_TRANSITION" });
        const revision = await trx.from("experiment_revisions").where("experiment_id", id).where("revision", experiment.current_revision).forUpdate().first();
        if (["ready_for_review", "approved", "running"].includes(to)) {
            const preflight = (await this.preflight(id)).data;
            if (preflight.status === "blocked") throw new Exception("Experiment preflight is blocked", { status: 422, code: "E_EXPERIMENT_PREFLIGHT" });
        }
        const update: Row = { status: to, updated_at: DateTime.utc().toSQL() };
        if (to === "running" && !experiment.started_at) update.started_at = DateTime.utc().toSQL();
        if (["completed", "killed", "invalidated"].includes(to)) update.stopped_at = DateTime.utc().toSQL();
        if (to === "archived") update.archived_at = DateTime.utc().toSQL();
        await trx.from("experiments").where("id", id).update(update);
        const revisionUpdate: Row = { status: to };
        if (to === "ready_for_review") { revisionUpdate.submitted_at = DateTime.utc().toSQL(); revisionUpdate.submitted_by_user_id = actorId; }
        if (to === "approved") { revisionUpdate.approved_at = DateTime.utc().toSQL(); revisionUpdate.approved_by_user_id = actorId; }
        await trx.from("experiment_revisions").where("id", revision.id).update(revisionUpdate);
        return this.get(id);
    }

    async evaluate(experimentKey: string, subjectKey: string) {
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("key", experimentKey).where("status", "running").first();
        if (!experiment) return { data: { eligible: false, reason: "not_running" } };
        const revision = await trx.from("experiment_revisions").where("experiment_id", experiment.id).where("revision", experiment.current_revision).first();
        const variants = await trx.from("experiment_variants").where("experiment_revision_id", revision.id).orderBy("id");
        const hashed = subjectHash(subjectKey);
        const existing = await trx.from("experiment_assignments as a").join("experiment_variants as v", "v.id", "a.variant_id").where("a.experiment_revision_id", revision.id).where("a.subject_hash", hashed).select("a.*", "v.key as variant_key", "v.parameters").first();
        if (existing) return { data: this.assignmentResponse(experiment, revision, existing, existing.variant_key, json(existing.parameters, {})) };
        let layerRange: { start: number; end: number } | null = null;
        if (revision.layer_id) {
            const allocation = await trx.from("experiment_layer_allocations").where("layer_id", revision.layer_id).where("experiment_revision_id", revision.id).first();
            if (!allocation) return { data: { eligible: false, reason: "layer_not_allocated" } };
            layerRange = { start: number(allocation.bucket_start), end: number(allocation.bucket_end) };
        }
        const result = assignDeterministically({
            tenantId: String(currentTenantId()), experimentId: number(experiment.id), revision: number(revision.revision), subjectKey: hashed,
            salt: "phase17-v1", trafficBasisPoints: number(revision.traffic_basis_points), layerRange,
            variants: variants.map((item: Row) => ({ id: number(item.id), key: String(item.key), allocation_basis_points: number(item.allocation_basis_points), parameters: json(item.parameters, {}) })),
        });
        if (!result.eligible || !result.variant) return { data: { eligible: false, reason: "outside_allocation" } };
        await trx.table("experiment_assignments").insert({ tenant_id: String(currentTenantId()), experiment_id: experiment.id, experiment_revision_id: revision.id, variant_id: result.variant.id, subject_hash: hashed, bucket: result.bucket }).onConflict(["tenant_id", "experiment_revision_id", "subject_hash"]).ignore();
        const assignment = await trx.from("experiment_assignments").where("experiment_revision_id", revision.id).where("subject_hash", hashed).first();
        return { data: this.assignmentResponse(experiment, revision, assignment, result.variant.key, result.variant.parameters) };
    }

    private assignmentResponse(experiment: Row, revision: Row, assignment: Row, variantKey: string, parameters: Record<string, unknown>) {
        const payload = { tenant_id: String(currentTenantId()), assignment_id: number(assignment.id), experiment_id: number(experiment.id), revision_id: number(revision.id), variant_id: number(assignment.variant_id), issued_at: Date.now() };
        return { eligible: true, experiment_key: experiment.key, revision: number(revision.revision), assignment_id: number(assignment.id), variant_key: variantKey, parameters, exposure_token: signExposureToken(payload, tenantSecret()) };
    }

    async logExposure(token: string, exposureKey: string, surface: string, context: Record<string, unknown> = {}) {
        const payload = verifyExposureToken(token, tenantSecret());
        if (!payload || String(payload.tenant_id) !== String(currentTenantId())) throw new Exception("Invalid exposure token", { status: 422, code: "E_EXPOSURE_TOKEN" });
        const assignmentId = number(payload.assignment_id);
        const assignment = await currentTrx().from("experiment_assignments").where("id", assignmentId).first();
        if (!assignment) throw new Exception("Assignment not found", { status: 404, code: "E_EXPERIMENT_ASSIGNMENT" });
        await currentTrx().table("experiment_exposures").insert({ tenant_id: String(currentTenantId()), assignment_id: assignmentId, exposure_key: exposureKey, surface, context: JSON.stringify(context) }).onConflict(["tenant_id", "exposure_key"]).ignore();
        return { data: { accepted: true } };
    }

    async recordOutcome(input: { assignmentId: number; metricId: number; value: number; preExperimentValue?: number | null; sourceEventKey: string; occurredAt: string }) {
        await currentTrx().table("experiment_outcomes").insert({ tenant_id: String(currentTenantId()), assignment_id: input.assignmentId, metric_id: input.metricId, value: input.value, pre_experiment_value: input.preExperimentValue ?? null, source_event_key: input.sourceEventKey, occurred_at: input.occurredAt }).onConflict(["tenant_id", "metric_id", "source_event_key"]).ignore();
    }

    async analyze(id: number, cutoff?: string) {
        const trx = currentTrx();
        const detail = (await this.get(id)).data;
        const { experiment, revision, variants, metric } = detail;
        if (!revision || !metric) throw new Exception("Experiment revision is incomplete", { status: 422, code: "E_EXPERIMENT_INCOMPLETE" });
        if (!["completed", "killed", "analyzing"].includes(experiment.status)) throw new Exception("Experiment must be completed or killed before analysis", { status: 409, code: "E_EXPERIMENT_ANALYSIS_STATE" });
        const dataCutoff = cutoff ? DateTime.fromISO(cutoff, { setZone: true }).toUTC() : DateTime.utc();
        if (!dataCutoff.isValid) throw new Exception("Invalid data cutoff", { status: 422, code: "E_EXPERIMENT_CUTOFF" });
        if (experiment.status !== "analyzing") await trx.from("experiments").where("id", id).update({ status: "analyzing" });
        const assignments = await trx.from("experiment_assignments").where("experiment_revision_id", revision.id).select("id", "variant_id");
        const assignmentIds = assignments.map((item: Row) => number(item.id));
        const outcomes = assignmentIds.length ? await trx.from("experiment_outcomes").whereIn("assignment_id", assignmentIds).where("metric_id", metric.id).where("occurred_at", "<=", dataCutoff.toSQL()!).select("assignment_id", "value", "pre_experiment_value") : [];
        const byAssignment = new Map(assignments.map((item: Row) => [number(item.id), number(item.variant_id)]));
        const arms = variants.map((variant: Row) => {
            const rows = outcomes.filter((row: Row) => byAssignment.get(number(row.assignment_id)) === number(variant.id)).map((row: Row) => ({ outcome: number(row.value), covariate: row.pre_experiment_value === null ? null : number(row.pre_experiment_value) }));
            const cuped = revision.cuped_enabled ? applyCuped(rows) : { values: rows.map((row) => row.outcome), variance_reduction: null, applied: false, reason: "disabled" };
            return { variant, rows, cuped, stats: stats(cuped.values) };
        });
        const control = arms.find((arm) => arm.variant.is_control);
        const treatment = arms.find((arm) => !arm.variant.is_control);
        if (!control || !treatment) throw new Exception("Two-arm design is invalid", { status: 422, code: "E_EXPERIMENT_ARMS" });
        const observedAssignments = variants.map((variant: Row) => assignments.filter((item: Row) => number(item.variant_id) === number(variant.id)).length);
        const expected = variants.map((variant: Row) => number(variant.allocation_basis_points));
        const srm = sampleRatioMismatch(observedAssignments, expected);
        const comparison = compareMeans(control.stats, treatment.stats, number(revision.alpha));
        const maturityCutoff = DateTime.fromJSDate(new Date(experiment.stopped_at ?? Date.now())).plus({ hours: number(revision.observation_window_hours) });
        const maturity = DateTime.utc() >= maturityCutoff ? "mature" : "outcome_not_mature";
        const freshnessMinutes = metric.expected_freshness_minutes ?? 60;
        const latestOutcome = outcomes.length ? await trx.from("experiment_outcomes").whereIn("assignment_id", assignmentIds).where("metric_id", metric.id).max("recorded_at as latest").first() : null;
        const freshness = latestOutcome?.latest && DateTime.fromJSDate(new Date(latestOutcome.latest)).plus({ minutes: number(freshnessMinutes) }) >= DateTime.utc() ? "fresh" : outcomes.length ? "stale" : "no_data";
        const analysisVersionRow = await trx.from("experiment_analysis_snapshots").where("experiment_revision_id", revision.id).max("analysis_version as max").first();
        const analysisVersion = number(analysisVersionRow?.max) + 1;
        const result = {
            primary_metric: { id: number(metric.id), key: metric.key, version: number(metric.version) },
            control: { variant_id: number(control.variant.id), n: control.stats.n, mean: control.stats.mean },
            treatment: { variant_id: number(treatment.variant.id), n: treatment.stats.n, mean: treatment.stats.mean },
            effect: comparison,
            cuped: { control: { applied: control.cuped.applied, variance_reduction: control.cuped.variance_reduction, reason: control.cuped.reason }, treatment: { applied: treatment.cuped.applied, variance_reduction: treatment.cuped.variance_reduction, reason: treatment.cuped.reason } },
        };
        const guardrailStatus = "pass";
        const [snapshot] = await trx.table("experiment_analysis_snapshots").insert({
            tenant_id: String(currentTenantId()), experiment_id: id, experiment_revision_id: revision.id, analysis_version: analysisVersion,
            method: revision.analysis_method, data_cutoff: dataCutoff.toSQL(), maturity, srm_status: srm.severe ? "fail" : "pass",
            guardrail_status: guardrailStatus, freshness_status: freshness, result: JSON.stringify(result), diagnostics: JSON.stringify({ srm, observed_assignments: observedAssignments, expected_basis_points: expected }),
        }).returning("*");
        if (srm.severe) await this.addDiagnostic(revision.id, "srm", "critical", "نسبت نمونه مشاهده‌شده با تخصیص مورد انتظار سازگار نیست؛ تا رفع علت، نتیجه برای تصمیم علّی معتبر نیست.", { srm });
        if (revision.cuped_enabled && (!control.cuped.applied || !treatment.cuped.applied)) await this.addDiagnostic(revision.id, "cuped_fallback", "warning", "CUPED به‌دلیل کیفیت یا پوشش covariate پیش‌آزمایش اعمال نشد و تحلیل خام استفاده شد.", { control: control.cuped.reason, treatment: treatment.cuped.reason });
        let recommendation = "insufficient_evidence";
        if (srm.severe) recommendation = "invalid_experiment";
        else if (maturity !== "mature" || freshness !== "fresh" || !comparison) recommendation = "continue";
        else if (comparison.ci_low > 0) recommendation = "replicate";
        else if (comparison.ci_high < 0) recommendation = "roll_back";
        const [decision] = await trx.table("experiment_decisions").insert({ tenant_id: String(currentTenantId()), experiment_id: id, analysis_snapshot_id: snapshot.id, recommendation }).returning("*");
        if (!srm.severe && maturity === "mature" && freshness === "fresh" && comparison) {
            await trx.table("causal_evidence").insert({ tenant_id: String(currentTenantId()), experiment_id: id, analysis_snapshot_id: snapshot.id, evidence_strength: "randomized", intervention_key: `${experiment.key}:r${revision.revision}`, population_context: JSON.stringify({ surface: experiment.surface, eligibility: json(revision.eligibility, {}) }), effect: JSON.stringify(comparison), limitations: JSON.stringify(recommendation === "replicate" ? ["نتیجه برای این زمینه و جمعیت معتبر است؛ تعمیم نیازمند replication است."] : ["نتیجه قطعی برای ship ایجاد نکرده است."]), validity_status: "valid" }).onConflict(["tenant_id", "analysis_snapshot_id"]).ignore();
        }
        return { data: { snapshot, recommendation: decision.recommendation, result } };
    }

    async evidence() {
        return { data: await currentTrx().from("causal_evidence as c").join("experiments as e", "e.id", "c.experiment_id").select("c.*", "e.key as experiment_key", "e.name_fa as experiment_name_fa", "e.surface").orderBy("c.created_at", "desc").limit(200) };
    }

    async diagnostics() {
        return { data: await currentTrx().from("experiment_diagnostics as d").join("experiment_revisions as r", "r.id", "d.experiment_revision_id").join("experiments as e", "e.id", "r.experiment_id").select("d.*", "e.key as experiment_key", "e.name_fa as experiment_name_fa").orderBy("d.created_at", "desc").limit(200) };
    }

    async overview() {
        const trx = currentTrx();
        const statuses = await trx.from("experiments").groupBy("status").select("status").count("id as count");
        const [assignments, exposures, critical, evidence] = await Promise.all([
            trx.from("experiment_assignments").count("id as count").first(),
            trx.from("experiment_exposures").count("id as count").first(),
            trx.from("experiment_diagnostics").where("status", "open").whereIn("severity", ["critical", "error"]).count("id as count").first(),
            trx.from("causal_evidence").where("validity_status", "valid").count("id as count").first(),
        ]);
        const assigned = number(assignments?.count);
        const exposed = number(exposures?.count);
        return { data: { statuses: Object.fromEntries(statuses.map((row: Row) => [row.status, number(row.count)])), assignments: assigned, exposures: exposed, exposure_join_rate: assigned ? exposed / assigned : null, critical_diagnostics: number(critical?.count), valid_evidence: number(evidence?.count) } };
    }

    async recordDecision(id: number, actualDecision: string, reasonFa: string, actorId: number | null) {
        const latest = await currentTrx().from("experiment_decisions").where("experiment_id", id).orderBy("created_at", "desc").first();
        if (!latest) throw new Exception("No analysis recommendation exists", { status: 409, code: "E_EXPERIMENT_NO_RECOMMENDATION" });
        await currentTrx().from("experiment_decisions").where("id", latest.id).update({ actual_decision: actualDecision, reason_fa: reasonFa, decided_by_user_id: actorId });
        const experiment = await currentTrx().from("experiments").where("id", id).first();
        if (experiment?.status === "analyzing") await currentTrx().from("experiments").where("id", id).update({ status: "decided" });
        return this.get(id);
    }

    private async addDiagnostic(revisionId: number, kind: string, severity: string, messageFa: string, details: Record<string, unknown>) {
        await currentTrx().table("experiment_diagnostics").insert({ tenant_id: String(currentTenantId()), experiment_revision_id: revisionId, kind, severity, message_fa: messageFa, details: JSON.stringify(details) });
    }
}
''')

write("apps/api/app/controllers/admin/experimentation_controller.ts", r'''
import type { HttpContext } from "@adonisjs/core/http";
import { recordAudit } from "#services/admin_audit_log_service";
import ExperimentService from "#services/experimentation/experiment_service";
import { experimentAnalysisValidator, experimentCreateValidator, experimentDecisionValidator, experimentMetricCreateValidator, experimentTransitionValidator } from "#validators/admin/experimentation_validator";

function id(ctx: HttpContext): number { return Number(ctx.params.id); }
async function actor(ctx: HttpContext): Promise<number | null> { try { return Number((await ctx.auth.authenticate()).id); } catch { return null; } }

export default class ExperimentationController {
    private service = new ExperimentService();
    async overview() { return this.service.overview(); }
    async index() { return this.service.list(); }
    async show(ctx: HttpContext) { return this.service.get(id(ctx)); }
    async metrics() { return this.service.listMetrics(); }
    async layers() { return this.service.listLayers(); }
    async holdouts() { return this.service.listHoldouts(); }
    async evidence() { return this.service.evidence(); }
    async diagnostics() { return this.service.diagnostics(); }

    async createMetric(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentMetricCreateValidator);
        const result = await this.service.createMetric(payload);
        await recordAudit({ ctx, action: "experiment.metric.created", entityKind: "experiment_metric", entityId: result.data.id, payload: { key: result.data.key, version: result.data.version }, strict: true });
        ctx.response.status(201); return result;
    }

    async create(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentCreateValidator);
        const result = await this.service.create(payload, await actor(ctx));
        await recordAudit({ ctx, action: "experiment.created", entityKind: "experiment", entityId: result.data.experiment.id, payload: { key: result.data.experiment.key }, strict: true });
        ctx.response.status(201); return result;
    }

    async preflight(ctx: HttpContext) { return this.service.preflight(id(ctx)); }

    async submit(ctx: HttpContext) { return this.transition(ctx, "ready_for_review", "experiment.review_submitted"); }
    async approve(ctx: HttpContext) { return this.transition(ctx, "approved", "experiment.approved"); }
    async start(ctx: HttpContext) { return this.transition(ctx, "running", "experiment.started"); }
    async pause(ctx: HttpContext) { return this.transition(ctx, "paused", "experiment.paused"); }
    async resume(ctx: HttpContext) { return this.transition(ctx, "running", "experiment.resumed"); }
    async stop(ctx: HttpContext) { return this.transition(ctx, "completed", "experiment.stopped"); }
    async kill(ctx: HttpContext) { return this.transition(ctx, "killed", "experiment.killed"); }
    async archive(ctx: HttpContext) { return this.transition(ctx, "archived", "experiment.archived"); }

    async analyze(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentAnalysisValidator);
        const result = await this.service.analyze(id(ctx), payload.data_cutoff);
        await recordAudit({ ctx, action: "experiment.analysis.completed", entityKind: "experiment", entityId: id(ctx), payload: { recommendation: result.data.recommendation, snapshot_id: result.data.snapshot.id }, strict: true });
        return result;
    }

    async decide(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentDecisionValidator);
        const result = await this.service.recordDecision(id(ctx), payload.actual_decision, payload.reason_fa, await actor(ctx));
        await recordAudit({ ctx, action: "experiment.decision.recorded", entityKind: "experiment", entityId: id(ctx), payload, strict: true });
        return result;
    }

    private async transition(ctx: HttpContext, to: any, action: string) {
        const payload = await ctx.request.validateUsing(experimentTransitionValidator);
        const result = await this.service.transition(id(ctx), to, await actor(ctx));
        await recordAudit({ ctx, action, entityKind: "experiment", entityId: id(ctx), payload: { to, reason_fa: payload.reason_fa ?? null }, strict: true });
        return result;
    }
}
''')

write("apps/api/app/controllers/experimentation_runtime_controller.ts", r'''
import type { HttpContext } from "@adonisjs/core/http";
import ExperimentService from "#services/experimentation/experiment_service";
import { experimentExposureValidator, experimentRuntimeEvaluateValidator } from "#validators/admin/experimentation_validator";

export default class ExperimentationRuntimeController {
    private service = new ExperimentService();
    async evaluate(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentRuntimeEvaluateValidator);
        return this.service.evaluate(payload.experiment_key, payload.subject_key);
    }
    async expose(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentExposureValidator);
        return this.service.logExposure(payload.exposure_token, payload.exposure_key, payload.surface, payload.context ?? {});
    }
}
''')

write("apps/api/start/routes/admin_experiments.ts", r'''
import router from "@adonisjs/core/services/router";
import { adminWriteLimiter } from "#start/limiter";
import { middleware } from "#start/kernel";

const controller = () => import("#controllers/admin/experimentation_controller");

router.group(() => {
    router.get("/overview", [controller, "overview"]);
    router.get("/", [controller, "index"]);
    router.post("/", [controller, "create"]).use(adminWriteLimiter);
    router.get("/metrics", [controller, "metrics"]);
    router.post("/metrics", [controller, "createMetric"]).use(adminWriteLimiter);
    router.get("/layers", [controller, "layers"]);
    router.get("/holdouts", [controller, "holdouts"]);
    router.get("/evidence", [controller, "evidence"]);
    router.get("/diagnostics", [controller, "diagnostics"]);
    router.get("/:id", [controller, "show"]);
    router.post("/:id/preflight", [controller, "preflight"]).use(adminWriteLimiter);
    router.post("/:id/submit", [controller, "submit"]).use(adminWriteLimiter);
    router.post("/:id/approve", [controller, "approve"]).use(adminWriteLimiter);
    router.post("/:id/start", [controller, "start"]).use(adminWriteLimiter);
    router.post("/:id/pause", [controller, "pause"]).use(adminWriteLimiter);
    router.post("/:id/resume", [controller, "resume"]).use(adminWriteLimiter);
    router.post("/:id/stop", [controller, "stop"]).use(adminWriteLimiter);
    router.post("/:id/kill", [controller, "kill"]).use(adminWriteLimiter);
    router.post("/:id/analyze", [controller, "analyze"]).use(adminWriteLimiter);
    router.post("/:id/decision", [controller, "decide"]).use(adminWriteLimiter);
    router.post("/:id/archive", [controller, "archive"]).use(adminWriteLimiter);
}).prefix("/api/v1/admin/experiments").use(middleware.auth()).use(middleware.admin());
''')

write("apps/api/start/routes/experimentation_runtime.ts", r'''
import router from "@adonisjs/core/services/router";
import { contentPublicLimiter } from "#start/limiter";

const controller = () => import("#controllers/experimentation_runtime_controller");
router.group(() => {
    router.post("/evaluate", [controller, "evaluate"]).use(contentPublicLimiter);
    router.post("/exposures", [controller, "expose"]).use(contentPublicLimiter);
}).prefix("/api/v1/experimentation");
''')

replace(
    "apps/api/start/routes.ts",
    'await import("./routes/admin_insights.js");',
    'await import("./routes/admin_insights.js");\nawait import("./routes/admin_experiments.js");',
)
replace(
    "apps/api/start/routes.ts",
    'await import("./routes/support_api.js");',
    'await import("./routes/support_api.js");\nawait import("./routes/experimentation_runtime.js");',
)

write("apps/admin/src/lib/queries/experiments.ts", r'''
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

type AnyRecord = Record<string, any>;
export interface ExperimentOverview { statuses: Record<string, number>; assignments: number; exposures: number; exposure_join_rate: number | null; critical_diagnostics: number; valid_evidence: number; }
export interface ExperimentDetail { experiment: AnyRecord; revision: AnyRecord; variants: AnyRecord[]; metric: AnyRecord | null; snapshots: AnyRecord[]; diagnostics: AnyRecord[]; decisions: AnyRecord[]; audit: AnyRecord[]; }

export function useExperimentOverview() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "overview", locale], queryFn: () => apiGet<{data: ExperimentOverview}>("experiments/overview", { locale }) }); }
export function useExperiments() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "list", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments", { locale }) }); }
export function useExperiment(id: number) { const locale = useLocale(); return useQuery({ queryKey: ["experiments", id, locale], queryFn: () => apiGet<{data: ExperimentDetail}>(`experiments/${id}`, { locale }), enabled: Number.isFinite(id) && id > 0 }); }
export function useExperimentMetrics() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "metrics", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments/metrics", { locale }) }); }
export function useExperimentLayers() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "layers", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments/layers", { locale }) }); }
export function useExperimentHoldouts() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "holdouts", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments/holdouts", { locale }) }); }
export function useExperimentEvidence() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "evidence", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments/evidence", { locale }) }); }
export function useExperimentDiagnostics() { const locale = useLocale(); return useQuery({ queryKey: ["experiments", "diagnostics", locale], queryFn: () => apiGet<{data: AnyRecord[]}>("experiments/diagnostics", { locale }) }); }

export function useExperimentMutation(path: string, method: "POST"|"PATCH" = "POST") {
    const locale = useLocale(); const client = useQueryClient();
    return useMutation({ mutationFn: (body?: unknown) => apiMutate<any>(method, path, { locale, body }), onSuccess: () => client.invalidateQueries({ queryKey: ["experiments"] }) });
}
export function useCreateExperiment() { return useExperimentMutation("experiments"); }
export function useCreateExperimentMetric() { return useExperimentMutation("experiments/metrics"); }
''')

write("apps/admin/messages/experiments/fa.json", r'''
{
  "Experiments": {
    "title": "مرکز آزمایش‌ها و شواهد علّی",
    "subtitle": "تغییرها را با تخصیص کنترل‌شده، مواجهه واقعی، معیار نسخه‌دار و دروازه‌های اعتماد اندازه‌گیری کنید.",
    "newExperiment": "آزمایش جدید",
    "overview": "نمای کلی",
    "registry": "آزمایش‌ها",
    "metrics": "رجیستری معیارها",
    "layersHoldouts": "لایه‌ها و هولدآوت‌ها",
    "diagnostics": "سلامت و تشخیص",
    "evidence": "حافظه شواهد علّی",
    "empty": "هنوز داده‌ای ثبت نشده است.",
    "loading": "در حال بارگذاری…",
    "error": "دریافت داده ناموفق بود.",
    "help": {
      "overview": "این صفحه وضعیت عملیاتی آزمایش‌ها، کیفیت اتصال Assignment به Exposure و هشدارهای اعتماد را از داده واقعی نمایش می‌دهد.",
      "assignments": "Assignment یعنی موتور آزمایش یک واریانت را به واحد تصادفی‌سازی اختصاص داده است؛ این مقدار به‌تنهایی Exposure نیست.",
      "exposures": "Exposure فقط وقتی ثبت می‌شود که کاربر واقعاً درمان/تغییر را دریافت کرده باشد و توکن امضاشده معتبر باشد.",
      "join": "نسبت Exposureهای ثبت‌شده به Assignmentها. افت غیرعادی می‌تواند نشانه مشکل delivery یا telemetry باشد.",
      "srm": "SRM ناسازگاری نسبت نمونه مشاهده‌شده با تخصیص مورد انتظار است و تا رفع علت، نتیجه علّی را غیرقابل اعتماد می‌کند.",
      "metric": "معیار نسخه‌دار، معنی کسب‌وکاری، واحد تحلیل، منبع داده، پنجره مشاهده و تازگی مورد انتظار را ثابت می‌کند.",
      "layer": "Layer فضای باکت مشترک یک سطح است و از هم‌پوشانی ناخواسته آزمایش‌ها جلوگیری می‌کند. V1 فقط جداسازی سخت را فعال می‌کند.",
      "holdout": "Holdout بخشی پایدار از جمعیت را خارج از مداخله نگه می‌دارد تا اثر افزایشی سیستم‌های طولانی‌مدت قابل سنجش باشد.",
      "evidence": "شواهد علّی نتیجه معتبر و زمینه‌مند را همراه عدم‌قطعیت و محدودیت نگه می‌دارند؛ نتیجه Null و منفی نیز حذف نمی‌شود.",
      "preflight": "پیش‌بررسی، معیار، طراحی دو بازویی، تخصیص، Layer و برنامه توان آماری را قبل از بازبینی کنترل می‌کند.",
      "approve": "تأیید، طراحی فعلی را مجاز برای اجرا می‌کند؛ تغییر طراحی باید در Revision جدید انجام شود.",
      "kill": "توقف اضطراری فوراً آزمایش را از اجرای جدید خارج می‌کند و دلیل/عامل در Audit ثبت می‌شود.",
      "analyze": "تحلیل یک Snapshot تغییرناپذیر با data cutoff، SRM، تازگی، عدم‌قطعیت و وضعیت CUPED ایجاد می‌کند.",
      "decision": "تصمیم واقعی اپراتور از پیشنهاد آماری جدا ثبت می‌شود تا سیستم هیچ‌وقت Recommendation را با Action یکی نگیرد."
    }
  },
  "Nav": { "experiments": "آزمایش‌ها" }
}
''')

write("apps/admin/messages/experiments/en.json", r'''
{
  "Experiments": {
    "title": "Experiments & Causal Evidence",
    "subtitle": "Measure interventions with controlled assignment, real exposure, versioned metrics and trust gates.",
    "newExperiment": "New experiment",
    "overview": "Overview",
    "registry": "Experiments",
    "metrics": "Metric registry",
    "layersHoldouts": "Layers & holdouts",
    "diagnostics": "Health & diagnostics",
    "evidence": "Causal evidence",
    "empty": "No data yet.",
    "loading": "Loading…",
    "error": "Data could not be loaded.",
    "help": {
      "overview": "Operational status and trust health from real experiment data.", "assignments": "A variant assignment; not the same as exposure.", "exposures": "A verified treatment delivery event.", "join": "Exposure-to-assignment join rate.", "srm": "Sample Ratio Mismatch blocks trusted causal decisions until diagnosed.", "metric": "Versioned business and data contract for a metric.", "layer": "Shared bucket namespace; V1 enables hard isolation only.", "holdout": "Persistent untreated population for incrementality.", "evidence": "Durable context-bound causal findings.", "preflight": "Validates design and power before review.", "approve": "Approves the current immutable design for launch.", "kill": "Emergency stop recorded in audit.", "analyze": "Creates an immutable analysis snapshot.", "decision": "Records the operator decision separately from the recommendation."
    }
  },
  "Nav": { "experiments": "Experiments" }
}
''')

replace(
    "apps/admin/src/lib/i18n/request.ts",
    'const operations = (await import(`../../../messages/operations/${locale}.json`)).default;',
    'const operations = (await import(`../../../messages/operations/${locale}.json`)).default;\n    const experiments = (await import(`../../../messages/experiments/${locale}.json`)).default;',
)
replace(
    "apps/admin/src/lib/i18n/request.ts",
    '...operations,\n            Nav: {',
    '...operations,\n            ...experiments,\n            Nav: {',
)
replace(
    "apps/admin/src/lib/i18n/request.ts",
    '...tickets.Nav,\n            },',
    '...tickets.Nav,\n                ...experiments.Nav,\n            },',
)

# Sidebar placement: one top-level analytics entry, no arbitrary submenus.
replace(
    "apps/admin/src/components/Sidebar.tsx",
    '{ href: "/analytics", labelKey: "analyticsOverview", icon: BarChart3 },',
    '{ href: "/analytics", labelKey: "analyticsOverview", icon: BarChart3 },\n            { href: "/analytics/experiments", labelKey: "experiments", icon: ChartNoAxesCombined },',
)

write("apps/admin/src/views/experiments/experiment-ui.tsx", r'''
"use client";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { cn } from "#/lib/utils";
import type { ReactNode } from "react";

export function HelpLabel({ children, help, className }: { children: ReactNode; help: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5", className)}>{children}<HelperTooltip>{help}</HelperTooltip></span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="grid min-h-32 place-items-center rounded-lg border border-dashed bg-muted/15 px-6 text-center text-sm text-muted-foreground">{children}</div>;
}
''')

write("apps/admin/src/views/experiments/experiments-workspace-view.tsx", r'''
"use client";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Link } from "#/lib/i18n/navigation";
import { useExperimentDiagnostics, useExperimentEvidence, useExperimentHoldouts, useExperimentLayers, useExperimentMetrics, useExperimentOverview, useExperiments } from "#/lib/queries/experiments";
import { useTranslations } from "next-intl";
import { EmptyState, HelpLabel } from "./experiment-ui";

function n(value: number | null | undefined) { return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(value ?? 0); }
function statusFa(value: string) { return ({draft:"پیش‌نویس",ready_for_review:"آماده بازبینی",approved:"تأییدشده",scheduled:"زمان‌بندی‌شده",running:"در حال اجرا",paused:"مکث",completed:"پایان‌یافته",analyzing:"در حال تحلیل",decided:"تصمیم ثبت‌شده",archived:"بایگانی",killed:"توقف اضطراری",invalidated:"نامعتبر",cancelled:"لغوشده"} as Record<string,string>)[value] ?? value; }

export function ExperimentsWorkspaceView() {
  const t = useTranslations("Experiments"); const overview = useExperimentOverview(); const experiments = useExperiments(); const metrics = useExperimentMetrics(); const layers = useExperimentLayers(); const holdouts = useExperimentHoldouts(); const diagnostics = useExperimentDiagnostics(); const evidence = useExperimentEvidence();
  if (overview.isPending) return <div className="text-sm text-muted-foreground">{t("loading")}</div>;
  if (overview.isError || !overview.data) return <div className="text-sm text-destructive">{t("error")}</div>;
  const o = overview.data.data;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-semibold text-xl tracking-tight"><HelpLabel help={t("help.overview")}>{t("title")}</HelpLabel></h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p></div><Button asChild><Link href="/analytics/experiments/new">{t("newExperiment")}</Link></Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Stat title="در حال اجرا" help="تعداد آزمایش‌هایی که هم‌اکنون Assignment جدید تولید می‌کنند." value={n(o.statuses.running)} />
      <Stat title="Assignment" help={t("help.assignments")} value={n(o.assignments)} />
      <Stat title="Exposure" help={t("help.exposures")} value={n(o.exposures)} />
      <Stat title="نرخ اتصال" help={t("help.join")} value={o.exposure_join_rate === null ? "—" : `${n(o.exposure_join_rate * 100)}٪`} />
      <Stat title="هشدار بحرانی" help={t("help.srm")} value={n(o.critical_diagnostics)} tone={o.critical_diagnostics ? "danger" : "success"} />
    </div>
    <Card><CardHeader><CardTitle className="text-base"><HelpLabel help="رجیستری مرکزی طراحی‌ها و وضعیت چرخه عمر؛ هر ردیف به داده واقعی backend متصل است.">{t("registry")}</HelpLabel></CardTitle><CardDescription>وضعیت، سطح، معیار اصلی و روش تحلیل</CardDescription></CardHeader><CardContent>{experiments.data?.data?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-muted-foreground"><tr className="border-b"><th className="py-2 text-start">آزمایش</th><th className="py-2 text-start">سطح</th><th className="py-2 text-start">معیار اصلی</th><th className="py-2 text-start">روش</th><th className="py-2 text-start">وضعیت</th></tr></thead><tbody>{experiments.data.data.map((row:any)=><tr key={row.id} className="border-b last:border-0"><td className="py-3"><Link className="font-medium hover:underline" href={`/analytics/experiments/${row.id}` as never}>{row.name_fa}<span className="ms-2 text-xs text-muted-foreground" dir="ltr">{row.key}</span></Link></td><td>{row.surface}</td><td>{row.primary_metric_name_fa ?? "—"}</td><td>Fixed Horizon</td><td><Badge variant="secondary">{statusFa(row.status)}</Badge></td></tr>)}</tbody></table></div> : <EmptyState>{t("empty")}</EmptyState>}</CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-2">
      <Collection title={t("metrics")} help={t("help.metric")} rows={metrics.data?.data ?? []} render={(r:any)=><><span className="font-medium">{r.name_fa}</span><span className="text-xs text-muted-foreground">نسخه {n(r.version)} · {r.kind}</span></>} />
      <Collection title={t("layersHoldouts")} help={`${t("help.layer")} ${t("help.holdout")}`} rows={[...(layers.data?.data ?? []), ...(holdouts.data?.data ?? [])]} render={(r:any)=><><span className="font-medium">{r.name_fa}</span><span className="text-xs text-muted-foreground">{r.collision_policy ? "Layer · جداسازی سخت" : `Holdout · ${n(r.allocation_basis_points/100)}٪`}</span></>} />
      <Collection title={t("diagnostics")} help={t("help.srm")} rows={diagnostics.data?.data ?? []} render={(r:any)=><><span className="font-medium">{r.message_fa}</span><span className="text-xs text-muted-foreground">{r.experiment_name_fa} · {r.severity}</span></>} />
      <Collection title={t("evidence")} help={t("help.evidence")} rows={evidence.data?.data ?? []} render={(r:any)=><><span className="font-medium">{r.experiment_name_fa}</span><span className="text-xs text-muted-foreground">{r.evidence_strength} · {r.validity_status}</span></>} />
    </div>
  </div>;
}

function Stat({title,help,value,tone}:{title:string;help:string;value:string;tone?:"danger"|"success"}) { return <Card><CardHeader className="pb-2"><CardDescription><HelpLabel help={help}>{title}</HelpLabel></CardDescription><CardTitle className={tone === "danger" ? "text-danger text-2xl" : tone === "success" ? "text-success text-2xl" : "text-2xl"}>{value}</CardTitle></CardHeader></Card>; }
function Collection({title,help,rows,render}:{title:string;help:string;rows:any[];render:(row:any)=>React.ReactNode}) { return <Card><CardHeader><CardTitle className="text-base"><HelpLabel help={help}>{title}</HelpLabel></CardTitle></CardHeader><CardContent>{rows.length ? <div className="space-y-2">{rows.slice(0,8).map((r:any,index:number)=><div key={r.id ?? index} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"><div className="flex min-w-0 flex-col gap-0.5">{render(r)}</div></div>)}</div> : <EmptyState>هنوز داده‌ای ثبت نشده است.</EmptyState>}</CardContent></Card>; }
''')

write("apps/admin/src/views/experiments/experiment-builder-view.tsx", r'''
"use client";
import { useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { useRouter } from "#/lib/i18n/navigation";
import { useCreateExperiment, useCreateExperimentMetric, useExperimentMetrics } from "#/lib/queries/experiments";
import { HelpLabel } from "./experiment-ui";

export function ExperimentBuilderView() {
  const router = useRouter(); const metrics = useExperimentMetrics(); const create = useCreateExperiment(); const createMetric = useCreateExperimentMetric();
  const [form,setForm]=useState({key:"",name_fa:"",hypothesis_fa:"",surface:"product_detail",primary_metric_id:"",baseline_mean:"",baseline_variance:"",mde:"",control:"50",cuped:false});
  const [metric,setMetric]=useState({key:"",name_fa:"",business_definition_fa:"",value_type:"binary"});
  const control=Number(form.control); const treatment=100-control; const valid=useMemo(()=>form.key && form.name_fa.length>=3 && form.hypothesis_fa.length>=10 && Number(form.primary_metric_id)>0 && Number(form.mde)>0 && Number(form.baseline_mean)>=0 && control>0 && control<100,[form,control]);
  async function submit(){ if(!valid)return; const result=await create.mutateAsync({key:form.key,name_fa:form.name_fa,hypothesis_fa:form.hypothesis_fa,surface:form.surface,randomization_unit:"visitor",analysis_unit:"visitor",identity_policy:"visitor_sticky_through_login",primary_metric_id:Number(form.primary_metric_id),analysis_method:"fixed_horizon",alpha:0.05,target_power:0.8,minimum_detectable_effect:Number(form.mde),baseline_mean:Number(form.baseline_mean),baseline_variance:form.baseline_variance?Number(form.baseline_variance):null,minimum_duration_hours:168,observation_window_hours:168,cuped_enabled:form.cuped,variants:[{key:"control",name_fa:"کنترل",is_control:true,allocation_basis_points:control*100,parameters:{}},{key:"treatment",name_fa:"مداخله",is_control:false,allocation_basis_points:treatment*100,parameters:{}}]}); router.push(`/analytics/experiments/${result.data.experiment.id}` as never); }
  async function addMetric(){ const created=await createMetric.mutateAsync({key:metric.key,name_fa:metric.name_fa,kind:"primary",value_type:metric.value_type,analysis_unit:"visitor",business_definition_fa:metric.business_definition_fa,source_contract:{producer:"server_domain_adapter"},observation_window_hours:168,expected_freshness_minutes:60}); setForm(v=>({...v,primary_metric_id:String(created.data.id)})); await metrics.refetch(); }
  return <div className="space-y-5"><div><h1 className="font-semibold text-xl tracking-tight">ساخت آزمایش جدید</h1><p className="mt-1 text-sm text-muted-foreground">طراحی V1 دو بازویی است و قبل از اجرا باید Preflight، بازبینی و تأیید را پاس کند.</p></div>
  <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
    <Card><CardHeader><CardTitle className="text-base">طراحی آزمایش</CardTitle><CardDescription>فرضیه، جمعیت، معیار و برنامه تحلیل</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <Field label="کلید آزمایش" help="شناسه پایدار فنی که در runtime برای evaluate استفاده می‌شود."><Input dir="ltr" value={form.key} onChange={e=>setForm(v=>({...v,key:e.target.value}))} placeholder="pdp-compatibility-cta" /></Field>
      <Field label="نام فارسی" help="نام کوتاه و قابل فهم برای اپراتورها و Audit."><Input value={form.name_fa} onChange={e=>setForm(v=>({...v,name_fa:e.target.value}))} /></Field>
      <div className="md:col-span-2"><Field label="فرضیه" help="قبل از مشاهده نتیجه، تغییر، جهت اثر مورد انتظار و دلیل کسب‌وکاری را صریح ثبت کنید."><Textarea rows={3} value={form.hypothesis_fa} onChange={e=>setForm(v=>({...v,hypothesis_fa:e.target.value}))} /></Field></div>
      <Field label="سطح مداخله" help="محل واقعی اعمال Treatment؛ برای تشخیص collision و اعتبار بیرونی استفاده می‌شود."><Input dir="ltr" value={form.surface} onChange={e=>setForm(v=>({...v,surface:e.target.value}))} /></Field>
      <Field label="معیار اصلی" help="نسخه معیار در شروع آزمایش pin می‌شود و بعداً بدون Revision قابل تغییر نیست."><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.primary_metric_id} onChange={e=>setForm(v=>({...v,primary_metric_id:e.target.value}))}><option value="">انتخاب معیار</option>{(metrics.data?.data??[]).map((m:any)=><option key={m.id} value={m.id}>{m.name_fa} · v{m.version}</option>)}</select></Field>
      <Field label="خط پایه" help="میانگین تاریخی معیار پیش از آزمایش؛ برای معیار دودویی عددی بین صفر و یک است."><Input type="number" step="0.0001" dir="ltr" value={form.baseline_mean} onChange={e=>setForm(v=>({...v,baseline_mean:e.target.value}))} /></Field>
      <Field label="واریانس خط پایه" help="برای معیار دودویی از p×(1-p) قابل استخراج است؛ برای معیار پیوسته باید از داده تاریخی معتبر بیاید."><Input type="number" step="0.0001" dir="ltr" value={form.baseline_variance} onChange={e=>setForm(v=>({...v,baseline_variance:e.target.value}))} placeholder="برای معیار دودویی اختیاری" /></Field>
      <Field label="حداقل اثر قابل تشخیص (MDE)" help="کوچک‌ترین اختلاف مطلقی که ارزش تشخیص دارد؛ قبل از اجرا تعیین می‌شود."><Input type="number" step="0.0001" dir="ltr" value={form.mde} onChange={e=>setForm(v=>({...v,mde:e.target.value}))} /></Field>
      <Field label="سهم کنترل" help="نسبت واقعی در محاسبه توان استفاده می‌شود؛ ۲۰/۸۰ مانند ۵۰/۵۰ فرض نمی‌شود."><Input type="number" min="1" max="99" dir="ltr" value={form.control} onChange={e=>setForm(v=>({...v,control:e.target.value}))} /></Field>
      <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3"><div><HelpLabel help="CUPED فقط با covariate پیش‌آزمایش و پوشش کافی اعمال می‌شود؛ در غیر این صورت fallback شفاف ثبت می‌شود.">کاهش واریانس CUPED</HelpLabel><p className="text-xs text-muted-foreground">بدون داده پیش‌آزمایش معتبر، تحلیل خام حفظ می‌شود.</p></div><input type="checkbox" checked={form.cuped} onChange={e=>setForm(v=>({...v,cuped:e.target.checked}))} /></div>
      <div className="md:col-span-2 flex justify-end"><Button disabled={!valid||create.isPending} onClick={submit}>{create.isPending?"در حال ساخت…":"ساخت پیش‌نویس"}</Button></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base"><HelpLabel help="اگر رجیستری خالی است، معیار canonical را همین‌جا تعریف کنید؛ منبع Outcome همچنان باید server-side باشد.">تعریف معیار جدید</HelpLabel></CardTitle><CardDescription>بدون Outcome جعلی از مرورگر</CardDescription></CardHeader><CardContent className="space-y-3"><Field label="کلید" help="شناسه پایدار معیار"><Input dir="ltr" value={metric.key} onChange={e=>setMetric(v=>({...v,key:e.target.value}))}/></Field><Field label="نام فارسی" help="نام کسب‌وکاری معیار"><Input value={metric.name_fa} onChange={e=>setMetric(v=>({...v,name_fa:e.target.value}))}/></Field><Field label="نوع مقدار" help="Binary برای تبدیل/رخداد؛ Continuous برای مقدار عددی پیوسته."><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={metric.value_type} onChange={e=>setMetric(v=>({...v,value_type:e.target.value}))}><option value="binary">دودویی</option><option value="continuous">پیوسته</option></select></Field><Field label="تعریف کسب‌وکاری" help="دقیقاً مشخص کنید numerator/denominator و قواعد ورود/خروج چه هستند."><Textarea rows={4} value={metric.business_definition_fa} onChange={e=>setMetric(v=>({...v,business_definition_fa:e.target.value}))}/></Field><Button variant="outline" className="w-full" disabled={!metric.key||!metric.name_fa||metric.business_definition_fa.length<5||createMetric.isPending} onClick={addMetric}>ثبت معیار نسخه‌دار</Button></CardContent></Card>
  </div></div>;
}
function Field({label,help,children}:{label:string;help:string;children:React.ReactNode}) { return <div className="space-y-1.5"><Label><HelpLabel help={help}>{label}</HelpLabel></Label>{children}</div>; }
''')

write("apps/admin/src/views/experiments/experiment-detail-view.tsx", r'''
"use client";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { useExperiment, useExperimentMutation } from "#/lib/queries/experiments";
import { useState } from "react";
import { EmptyState, HelpLabel } from "./experiment-ui";

const faStatus:Record<string,string>={draft:"پیش‌نویس",ready_for_review:"آماده بازبینی",approved:"تأییدشده",scheduled:"زمان‌بندی‌شده",running:"در حال اجرا",paused:"مکث",completed:"پایان‌یافته",analyzing:"در حال تحلیل",decided:"تصمیم ثبت‌شده",archived:"بایگانی",killed:"توقف اضطراری",invalidated:"نامعتبر",cancelled:"لغوشده"};
export function ExperimentDetailView({id}:{id:number}) { const q=useExperiment(id); if(q.isPending)return <div className="text-sm text-muted-foreground">در حال بارگذاری…</div>; if(q.isError||!q.data)return <div className="text-sm text-destructive">دریافت آزمایش ناموفق بود.</div>; const d=q.data.data; return <Detail id={id} d={d}/>; }
function Detail({id,d}:{id:number;d:any}) { const [reason,setReason]=useState(""); const mutation=useExperimentMutation(`experiments/${id}/preflight`); const action=(name:string)=>useExperimentMutation(`experiments/${id}/${name}`); const submit=action("submit"),approve=action("approve"),start=action("start"),pause=action("pause"),resume=action("resume"),stop=action("stop"),kill=action("kill"),analyze=action("analyze"),archive=action("archive"),decision=action("decision"); const s=d.experiment.status; const run=async(m:any,body:any={reason_fa:reason||null})=>{await m.mutateAsync(body); setReason("");}; const latest=d.snapshots?.[0]; const effect=latest?.result?.effect ?? (typeof latest?.result==="string"?JSON.parse(latest.result)?.effect:null);
 return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="font-semibold text-xl tracking-tight">{d.experiment.name_fa}</h1><Badge variant="secondary">{faStatus[s]??s}</Badge></div><p className="mt-1 text-sm text-muted-foreground" dir="ltr">{d.experiment.key} · Revision {d.revision.revision}</p></div><div className="flex flex-wrap gap-2"><Action label="پیش‌بررسی" help="طراحی و برنامه توان را بدون شروع آزمایش اعتبارسنجی می‌کند." onClick={()=>run(mutation)} show={["draft","ready_for_review","approved"].includes(s)} /><Action label="ارسال برای بازبینی" help="فقط پس از Preflight بدون blocker طراحی را به بازبینی می‌فرستد." onClick={()=>run(submit)} show={s==="draft"}/><Action label="تأیید" help="نسخه طراحی فعلی را مجاز برای اجرا می‌کند؛ تغییر بعدی نیازمند Revision جدید است." onClick={()=>run(approve)} show={s==="ready_for_review"}/><Action label="شروع" help="از این لحظه Assignment جدید تولید می‌شود؛ Exposure همچنان جداگانه ثبت خواهد شد." onClick={()=>run(start)} show={s==="approved"}/><Action label="مکث" help="Assignment جدید را متوقف می‌کند و داده‌های قبلی را حفظ می‌کند." onClick={()=>run(pause)} show={s==="running"}/><Action label="ادامه" help="آزمایش مکث‌شده را با همان Revision ادامه می‌دهد." onClick={()=>run(resume)} show={s==="paused"}/><Action label="پایان" help="اجرای عادی را می‌بندد تا پنجره Outcome و تحلیل تکمیل شود." onClick={()=>run(stop)} show={["running","paused"].includes(s)}/><Action label="توقف اضطراری" help="برای آسیب یا ریسک فوری؛ دلیل و عامل در Audit ثبت می‌شود." tone="danger" onClick={()=>run(kill)} show={["running","paused"].includes(s)} /><Action label="تحلیل" help="Snapshot تغییرناپذیر با data cutoff، SRM، تازگی و عدم‌قطعیت می‌سازد." onClick={()=>run(analyze,{})} show={["completed","killed"].includes(s)}/><Action label="بایگانی" help="آزمایش تصمیم‌گیری‌شده را فقط از جریان فعال خارج می‌کند؛ شواهد حذف نمی‌شوند." onClick={()=>run(archive)} show={s==="decided"}/></div></div>
 <Card><CardHeader><CardTitle className="text-base"><HelpLabel help="فرضیه پیش از مشاهده نتیجه ثبت می‌شود و مبنای تفسیر شواهد است.">فرضیه و طراحی</HelpLabel></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4"><Info label="فرضیه" value={d.experiment.hypothesis_fa}/><Info label="سطح" value={d.experiment.surface}/><Info label="معیار اصلی" value={`${d.metric?.name_fa??"—"} · v${d.metric?.version??"—"}`}/><Info label="واحد تصادفی‌سازی / تحلیل" value={`${d.revision.randomization_unit} / ${d.revision.analysis_unit}`}/><Info label="روش تحلیل" value="Fixed Horizon"/><Info label="حداقل مدت" value={`${d.revision.minimum_duration_hours} ساعت`}/><Info label="پنجره Outcome" value={`${d.revision.observation_window_hours} ساعت`}/><Info label="CUPED" value={d.revision.cuped_enabled?"فعال با fallback شفاف":"غیرفعال"}/></CardContent></Card>
 <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base"><HelpLabel help="Assignment و Exposure دو واقعیت جدا هستند؛ تفاوت غیرعادی بین آن‌ها باید تشخیص داده شود.">واریانت‌ها و تخصیص</HelpLabel></CardTitle></CardHeader><CardContent className="space-y-2">{d.variants.map((v:any)=><div key={v.id} className="flex items-center justify-between rounded-md border p-3"><div><div className="font-medium">{v.name_fa}</div><div className="text-xs text-muted-foreground" dir="ltr">{v.key}</div></div><Badge variant="outline">{v.allocation_basis_points/100}٪</Badge></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base"><HelpLabel help="آخرین Snapshot هرگز بازنویسی نمی‌شود؛ تحلیل مجدد نسخه جدید می‌سازد.">آخرین نتیجه</HelpLabel></CardTitle><CardDescription>{latest?`Snapshot v${latest.analysis_version} · ${latest.maturity}`:"هنوز تحلیلی ثبت نشده است."}</CardDescription></CardHeader><CardContent>{latest?<div className="grid gap-3 sm:grid-cols-2"><Info label="SRM" value={latest.srm_status}/><Info label="تازگی" value={latest.freshness_status}/><Info label="Guardrail" value={latest.guardrail_status}/><Info label="اثر مطلق" value={effect?String(effect.absolute_effect):"—"}/><Info label="بازه اطمینان" value={effect?`${effect.ci_low} تا ${effect.ci_high}`:"—"}/><Info label="p-value" value={effect?String(effect.p_value):"—"}/></div>:<EmptyState>پس از پایان آزمایش و رسیدن Outcome معتبر، تحلیل را اجرا کنید.</EmptyState>}</CardContent></Card></div>
 <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle className="text-base"><HelpLabel help="هشدارهای SRM، CUPED fallback، تازگی و سایر مسائل اعتماد در اینجا جمع می‌شوند.">سلامت و تشخیص</HelpLabel></CardTitle></CardHeader><CardContent>{d.diagnostics.length?<div className="space-y-2">{d.diagnostics.map((x:any)=><div key={x.id} className="rounded-md border p-3"><div className="flex justify-between gap-2"><span className="font-medium">{x.message_fa}</span><Badge variant="secondary">{x.severity}</Badge></div></div>)}</div>:<EmptyState>هشدار بازی ثبت نشده است.</EmptyState>}</CardContent></Card><Card><CardHeader><CardTitle className="text-base"><HelpLabel help="این خط زمانی مستقیماً از admin_audit_log می‌آید و تاریخچه موازی ایجاد نمی‌کند.">خط زمانی عملیات</HelpLabel></CardTitle></CardHeader><CardContent>{d.audit.length?<div className="space-y-2">{d.audit.map((x:any)=><div key={x.id} className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><span>{auditFa(x.action)}</span><span className="text-xs text-muted-foreground" dir="ltr">{String(x.occurred_at??"")}</span></div>)}</div>:<EmptyState>رویداد Audit ثبت نشده است.</EmptyState>}</CardContent></Card></div>
 {d.decisions?.length?<Card><CardHeader><CardTitle className="text-base"><HelpLabel help="Recommendation آماری با تصمیم واقعی یکی نیست؛ ثبت تصمیم واقعی مسئولیت اپراتور/حاکمیت است.">تصمیم</HelpLabel></CardTitle></CardHeader><CardContent><div className="space-y-3"><div>پیشنهاد آخر: <Badge variant="secondary">{d.decisions[0].recommendation}</Badge></div>{!d.decisions[0].actual_decision&&s==="analyzing"?<div className="flex flex-wrap gap-2"><Input className="max-w-xl" value={reason} onChange={e=>setReason(e.target.value)} placeholder="دلیل تصمیم واقعی"/><Button disabled={reason.trim().length<3} onClick={()=>run(decision,{actual_decision:"replicate",reason_fa:reason})}>ثبت تصمیم: تکرار آزمایش</Button></div>:<div>تصمیم واقعی: {d.decisions[0].actual_decision??"ثبت نشده"}</div>}</div></CardContent></Card>:null}
 </div>;
}
function Action({label,help,onClick,show,tone}:{label:string;help:string;onClick:()=>void;show:boolean;tone?:"danger"}) { if(!show)return null; return <span className="inline-flex items-center gap-1"><Button size="sm" variant={tone?"outline":"default"} tone={tone} onClick={onClick}>{label}</Button><HelpLabel help={help}><span className="sr-only">راهنما</span></HelpLabel></span>; }
function Info({label,value}:{label:string;value:string}) { return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>; }
function auditFa(v:string){return ({"experiment.created":"ایجاد آزمایش","experiment.review_submitted":"ارسال برای بازبینی","experiment.approved":"تأیید طراحی","experiment.started":"شروع آزمایش","experiment.paused":"مکث","experiment.resumed":"ادامه","experiment.stopped":"پایان عادی","experiment.killed":"توقف اضطراری","experiment.analysis.completed":"تحلیل و Snapshot","experiment.decision.recorded":"ثبت تصمیم","experiment.archived":"بایگانی"} as Record<string,string>)[v]??v;}
''')

write("apps/admin/src/app/[locale]/(authenticated)/analytics/experiments/page.tsx", r'''
import { setRequestLocale } from "next-intl/server";
import { ExperimentsWorkspaceView } from "#/views/experiments/experiments-workspace-view";
export default async function Page({params}:{params:Promise<{locale:string}>}) { const {locale}=await params; setRequestLocale(locale); return <ExperimentsWorkspaceView/>; }
''')
write("apps/admin/src/app/[locale]/(authenticated)/analytics/experiments/new/page.tsx", r'''
import { setRequestLocale } from "next-intl/server";
import { ExperimentBuilderView } from "#/views/experiments/experiment-builder-view";
export default async function Page({params}:{params:Promise<{locale:string}>}) { const {locale}=await params; setRequestLocale(locale); return <ExperimentBuilderView/>; }
''')
write("apps/admin/src/app/[locale]/(authenticated)/analytics/experiments/[id]/page.tsx", r'''
import { setRequestLocale } from "next-intl/server";
import { ExperimentDetailView } from "#/views/experiments/experiment-detail-view";
export default async function Page({params}:{params:Promise<{locale:string;id:string}>}) { const {locale,id}=await params; setRequestLocale(locale); return <ExperimentDetailView id={Number(id)}/>; }
''')

write("docs/api/reference/openapi/admin.phase17.v1.yaml", r'''
openapi: 3.1.0
info: { title: Calibra Admin Phase 17 API, version: "1.0.0" }
tags:
  - name: Admin / Experiments
    description: Tenant-scoped experiment registry, trust gates, analysis and causal evidence.
paths:
  /api/v1/admin/experiments/overview:
    get: { tags: [Admin / Experiments], operationId: getExperimentOverview, responses: { "200": { description: Experiment health overview } } }
  /api/v1/admin/experiments:
    get: { tags: [Admin / Experiments], operationId: listExperiments, responses: { "200": { description: Experiment registry } } }
    post: { tags: [Admin / Experiments], operationId: createExperiment, responses: { "201": { description: Experiment created } } }
  /api/v1/admin/experiments/metrics:
    get: { tags: [Admin / Experiments], operationId: listExperimentMetrics, responses: { "200": { description: Metric registry } } }
    post: { tags: [Admin / Experiments], operationId: createExperimentMetric, responses: { "201": { description: Metric version created } } }
  /api/v1/admin/experiments/layers:
    get: { tags: [Admin / Experiments], operationId: listExperimentLayers, responses: { "200": { description: Experiment layers } } }
  /api/v1/admin/experiments/holdouts:
    get: { tags: [Admin / Experiments], operationId: listExperimentHoldouts, responses: { "200": { description: Holdouts } } }
  /api/v1/admin/experiments/evidence:
    get: { tags: [Admin / Experiments], operationId: listCausalEvidence, responses: { "200": { description: Causal evidence library } } }
  /api/v1/admin/experiments/diagnostics:
    get: { tags: [Admin / Experiments], operationId: listExperimentDiagnostics, responses: { "200": { description: Trust diagnostics } } }
  /api/v1/admin/experiments/{id}:
    parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ]
    get: { tags: [Admin / Experiments], operationId: getExperiment, responses: { "200": { description: Experiment detail } } }
  /api/v1/admin/experiments/{id}/preflight:
    post: { tags: [Admin / Experiments], operationId: preflightExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Preflight result } } }
  /api/v1/admin/experiments/{id}/submit:
    post: { tags: [Admin / Experiments], operationId: submitExperimentReview, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Submitted } } }
  /api/v1/admin/experiments/{id}/approve:
    post: { tags: [Admin / Experiments], operationId: approveExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Approved } } }
  /api/v1/admin/experiments/{id}/start:
    post: { tags: [Admin / Experiments], operationId: startExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Started } } }
  /api/v1/admin/experiments/{id}/pause:
    post: { tags: [Admin / Experiments], operationId: pauseExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Paused } } }
  /api/v1/admin/experiments/{id}/resume:
    post: { tags: [Admin / Experiments], operationId: resumeExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Resumed } } }
  /api/v1/admin/experiments/{id}/stop:
    post: { tags: [Admin / Experiments], operationId: stopExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Stopped } } }
  /api/v1/admin/experiments/{id}/kill:
    post: { tags: [Admin / Experiments], operationId: killExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Killed } } }
  /api/v1/admin/experiments/{id}/analyze:
    post: { tags: [Admin / Experiments], operationId: analyzeExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Analysis snapshot } } }
  /api/v1/admin/experiments/{id}/decision:
    post: { tags: [Admin / Experiments], operationId: recordExperimentDecision, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Decision recorded } } }
  /api/v1/admin/experiments/{id}/archive:
    post: { tags: [Admin / Experiments], operationId: archiveExperiment, parameters: [ { name: id, in: path, required: true, schema: { type: integer } } ], responses: { "200": { description: Archived } } }
''')

write("docs/api/reference/openapi/storefront.phase17.v1.yaml", r'''
openapi: 3.1.0
info: { title: Calibra Experiment Runtime API, version: "1.0.0" }
tags:
  - name: Experimentation Runtime
    description: Deterministic assignment and signed real-exposure logging. Outcome writes are server-side only.
paths:
  /api/v1/experimentation/evaluate:
    post:
      tags: [Experimentation Runtime]
      operationId: evaluateExperimentAssignment
      responses: { "200": { description: Assignment or ineligible result } }
  /api/v1/experimentation/exposures:
    post:
      tags: [Experimentation Runtime]
      operationId: logExperimentExposure
      responses: { "200": { description: Idempotent exposure accepted } }
''')

replace(
    "docs/api/package.json",
    '"build:json:storefront-completion": "redocly bundle reference/openapi/storefront.completion.v1.yaml -o dist/storefront.completion.v1.json --ext json",',
    '"build:json:storefront-completion": "redocly bundle reference/openapi/storefront.completion.v1.yaml -o dist/storefront.completion.v1.json --ext json",\n        "build:json:storefront-phase17": "redocly bundle reference/openapi/storefront.phase17.v1.yaml -o dist/storefront.phase17.v1.json --ext json",',
)
replace(
    "docs/api/package.json",
    '"build:json:storefront": "pnpm build:json:storefront-base && pnpm build:json:storefront-completion && pnpm build:json:storefront-merge",',
    '"build:json:storefront": "pnpm build:json:storefront-base && pnpm build:json:storefront-completion && pnpm build:json:storefront-phase17 && pnpm build:json:storefront-merge",',
)
replace(
    "docs/api/package.json",
    '"build:json:admin-completion": "redocly bundle reference/openapi/admin.completion.v1.yaml -o dist/admin.completion.v1.json --ext json",',
    '"build:json:admin-completion": "redocly bundle reference/openapi/admin.completion.v1.yaml -o dist/admin.completion.v1.json --ext json",\n        "build:json:admin-phase17": "redocly bundle reference/openapi/admin.phase17.v1.yaml -o dist/admin.phase17.v1.json --ext json",',
)
replace(
    "docs/api/package.json",
    '"build:json:admin": "pnpm build:json:admin-base && pnpm build:json:admin-tickets && pnpm build:json:admin-ticket-omnichannel && pnpm build:json:admin-phase5 && pnpm build:json:admin-runtime-sync && pnpm build:json:admin-completion && pnpm build:json:admin-merge",',
    '"build:json:admin": "pnpm build:json:admin-base && pnpm build:json:admin-tickets && pnpm build:json:admin-ticket-omnichannel && pnpm build:json:admin-phase5 && pnpm build:json:admin-runtime-sync && pnpm build:json:admin-completion && pnpm build:json:admin-phase17 && pnpm build:json:admin-merge",',
)

replace(
    "docs/api/scripts/merge-admin-spec.js",
    'const completion = JSON.parse(readFileSync(resolve(root, "dist/admin.completion.v1.json"), "utf8"));',
    'const completion = JSON.parse(readFileSync(resolve(root, "dist/admin.completion.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase17.v1.json"), "utf8"));',
)
replace(
    "docs/api/scripts/merge-admin-spec.js",
    '[completion, "CompletionOverlay"],',
    '[completion, "CompletionOverlay"],\n    [phase17, "Phase17Overlay"],',
)
replace(
    "docs/api/scripts/merge-storefront-spec.js",
    'const completion = JSON.parse(readFileSync(resolve(root, "dist/storefront.completion.v1.json"), "utf8"));',
    'const completion = JSON.parse(readFileSync(resolve(root, "dist/storefront.completion.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));',
)
replace(
    "docs/api/scripts/merge-storefront-spec.js",
    'base.paths = mergeRecord(base.paths, completion.paths, "paths");',
    'base.paths = mergeRecord(base.paths, completion.paths, "paths");\nbase.paths = mergeRecord(base.paths, phase17.paths, "phase17 paths");',
)
replace(
    "docs/api/scripts/merge-storefront-spec.js",
    'for (const [section, values] of Object.entries(completion.components ?? {})) {',
    'for (const source of [completion, phase17]) for (const [section, values] of Object.entries(source.components ?? {})) {',
)
replace(
    "docs/api/scripts/merge-storefront-spec.js",
    'for (const tag of completion.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);',
    'for (const source of [completion, phase17]) for (const tag of source.tags ?? []) if (!tags.some((item) => item?.name === tag?.name)) tags.push(tag);',
)

print("Phase 17 app bootstrap wrote service, controllers, routes, Persian UI, i18n and OpenAPI overlays")
