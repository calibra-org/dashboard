from pathlib import Path

root = Path(__file__).resolve().parents[1]

def patch(path: str, old: str, new: str, count: int = 1):
    p = root / path
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Phase 17 completeness anchor missing in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count), encoding="utf-8")

# --- Shared layer namespace: the layer bucket must not be experiment-specific. ---
patch(
    "apps/api/app/services/experimentation/assignment.ts",
    "    layerRange?: { start: number; end: number } | null;\n}",
    "    layerRange?: { start: number; end: number } | null;\n    layerNamespace?: string | null;\n}",
)
patch(
    "apps/api/app/services/experimentation/assignment.ts",
    "    const namespace = `${input.tenantId}:${input.experimentId}:${input.revision}:${input.salt}`;\n    const bucket = stableBucket(namespace, input.subjectKey);",
    "    const namespace = `${input.tenantId}:${input.experimentId}:${input.revision}:${input.salt}`;\n    const trafficNamespace = input.layerNamespace\n        ? `${input.tenantId}:layer:${input.layerNamespace}:${input.salt}`\n        : namespace;\n    const bucket = stableBucket(trafficNamespace, input.subjectKey);",
)

# --- Add guardrail bindings table to the tenant/RLS schema. ---
patch(
    "apps/api/database/migrations/1765000000000_create_phase17_experimentation_tables.ts",
    '    "experiment_variants",',
    '    "experiment_metric_bindings",\n    "experiment_variants",',
)
patch(
    "apps/api/database/migrations/1765000000000_create_phase17_experimentation_tables.ts",
    '        this.schema.createTable("experiment_variants", (table) => {',
    '''        this.schema.createTable("experiment_metric_bindings", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.bigInteger("metric_id").unsigned().notNullable().references("id").inTable("experiment_metrics").onDelete("RESTRICT");
            table.string("role", 24).notNullable();
            table.string("harm_direction", 16).nullable();
            table.decimal("warn_threshold", 18, 8).nullable();
            table.decimal("stop_threshold", 18, 8).nullable();
            table.string("automatic_action", 16).notNullable().defaultTo("none");
            table.timestamps(true, true);
            table.unique(["tenant_id", "experiment_revision_id", "metric_id", "role"], { indexName: "experiment_metric_bindings_unique" });
        });

        this.schema.createTable("experiment_variants", (table) => {''',
)

# --- Validators for guardrails, layers and holdouts. ---
patch(
    "apps/api/app/validators/admin/experimentation_validator.ts",
    "    variants: vine.array(vine.object({",
    '''    guardrails: vine.array(vine.object({
        metric_id: vine.number().positive().withoutDecimals(),
        harm_direction: vine.enum(["increase", "decrease"] as const),
        warn_threshold: vine.number().min(0).optional().nullable(),
        stop_threshold: vine.number().min(0).optional().nullable(),
        automatic_action: vine.enum(["none", "pause", "kill"] as const).optional(),
    })).maxLength(8).optional(),
    variants: vine.array(vine.object({''',
)
patch(
    "apps/api/app/validators/admin/experimentation_validator.ts",
    "export const experimentTransitionValidator = vine.compile",
    '''export const experimentLayerCreateValidator = vine.compile(vine.object({
    key: vine.string().trim().minLength(2).maxLength(120),
    name_fa: vine.string().trim().minLength(2).maxLength(180),
    surface: vine.string().trim().minLength(2).maxLength(120),
    randomization_unit: vine.enum(RANDOMIZATION_UNITS),
}));

export const experimentHoldoutCreateValidator = vine.compile(vine.object({
    key: vine.string().trim().minLength(2).maxLength(120),
    name_fa: vine.string().trim().minLength(2).maxLength(180),
    kind: vine.enum(["experiment", "layer", "feature_family", "platform", "global"] as const),
    randomization_unit: vine.enum(RANDOMIZATION_UNITS),
    allocation_basis_points: vine.number().min(1).max(5000).withoutDecimals(),
    scope: jsonRecord,
}));

export const experimentTransitionValidator = vine.compile''',
)

# --- Service input contract and helpers. ---
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "import { assignDeterministically, signExposureToken, verifyExposureToken } from \"#services/experimentation/assignment\";",
    "import { assignDeterministically, signExposureToken, stableBucket, verifyExposureToken } from \"#services/experimentation/assignment\";",
)
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "    variants: Array<{ key: string; name_fa: string; is_control: boolean; allocation_basis_points: number; parameters?: Record<string, unknown> }>;",
    '''    guardrails?: Array<{ metric_id: number; harm_direction: "increase" | "decrease"; warn_threshold?: number | null; stop_threshold?: number | null; automatic_action?: "none" | "pause" | "kill" }>;
    variants: Array<{ key: string; name_fa: string; is_control: boolean; allocation_basis_points: number; parameters?: Record<string, unknown> }>;''',
)

# Create layers/holdouts from real admin APIs.
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "    async listHoldouts() {\n        return { data: await currentTrx().from(\"experiment_holdouts\").where(\"is_active\", true).orderBy(\"name_fa\") };\n    }",
    '''    async listHoldouts() {
        return { data: await currentTrx().from("experiment_holdouts").where("is_active", true).orderBy("name_fa") };
    }

    async createLayer(input: { key: string; name_fa: string; surface: string; randomization_unit: string }) {
        const [row] = await currentTrx().table("experiment_layers").insert({
            tenant_id: String(currentTenantId()), key: input.key, name_fa: input.name_fa,
            surface: input.surface, randomization_unit: input.randomization_unit,
            collision_policy: "hard", bucket_start: 0, bucket_end: 9999,
        }).returning("*");
        return { data: row };
    }

    async createHoldout(input: { key: string; name_fa: string; kind: string; randomization_unit: string; allocation_basis_points: number; scope?: Record<string, unknown> }) {
        const [row] = await currentTrx().table("experiment_holdouts").insert({
            tenant_id: String(currentTenantId()), key: input.key, name_fa: input.name_fa, kind: input.kind,
            randomization_unit: input.randomization_unit, allocation_basis_points: input.allocation_basis_points,
            scope: JSON.stringify(input.scope ?? {}),
        }).returning("*");
        return { data: row };
    }''',
)

# Persist guardrail bindings and allocate a collision-free layer range on creation.
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    '''        await trx.table("experiment_variants").insert(input.variants.map((variant) => ({
            tenant_id: String(currentTenantId()), experiment_revision_id: revision.id, key: variant.key, name_fa: variant.name_fa,
            is_control: variant.is_control, allocation_basis_points: variant.allocation_basis_points, parameters: JSON.stringify(variant.parameters ?? {}),
        })));
        return this.get(number(experiment.id));''',
    '''        await trx.table("experiment_variants").insert(input.variants.map((variant) => ({
            tenant_id: String(currentTenantId()), experiment_revision_id: revision.id, key: variant.key, name_fa: variant.name_fa,
            is_control: variant.is_control, allocation_basis_points: variant.allocation_basis_points, parameters: JSON.stringify(variant.parameters ?? {}),
        })));
        if (input.guardrails?.length) {
            const metricIds = input.guardrails.map((item) => item.metric_id);
            const existingMetrics = await trx.from("experiment_metrics").whereIn("id", metricIds).where("is_active", true).select("id");
            if (existingMetrics.length !== new Set(metricIds).size) throw new Exception("One or more guardrail metrics are invalid", { status: 422, code: "E_EXPERIMENT_GUARDRAIL_METRIC" });
            await trx.table("experiment_metric_bindings").insert(input.guardrails.map((item) => ({
                tenant_id: String(currentTenantId()), experiment_revision_id: revision.id, metric_id: item.metric_id,
                role: "guardrail", harm_direction: item.harm_direction, warn_threshold: item.warn_threshold ?? null,
                stop_threshold: item.stop_threshold ?? null, automatic_action: item.automatic_action ?? "none",
            })));
        }
        if (revision.layer_id) await this.allocateLayerRange(number(revision.id), number(revision.layer_id), number(revision.traffic_basis_points));
        return this.get(number(experiment.id));''',
)

# Add allocation, holdout, revision and guardrail evaluation methods before runtime evaluate.
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "    async evaluate(experimentKey: string, subjectKey: string) {",
    '''    private async allocateLayerRange(revisionId: number, layerId: number, width: number) {
        const trx = currentTrx();
        const layer = await trx.from("experiment_layers").where("id", layerId).where("is_active", true).first();
        if (!layer || layer.collision_policy !== "hard") throw new Exception("Layer is unavailable", { status: 422, code: "E_EXPERIMENT_LAYER" });
        const allocations = await trx.from("experiment_layer_allocations as a")
            .join("experiment_revisions as r", "r.id", "a.experiment_revision_id")
            .where("a.layer_id", layerId).whereIn("r.status", ["ready_for_review", "approved", "scheduled", "running", "paused"])
            .select("a.bucket_start", "a.bucket_end").orderBy("a.bucket_start");
        let start = number(layer.bucket_start);
        const endLimit = number(layer.bucket_end);
        for (const allocation of allocations) {
            if (start + width - 1 < number(allocation.bucket_start)) break;
            start = Math.max(start, number(allocation.bucket_end) + 1);
        }
        const end = start + width - 1;
        if (end > endLimit) throw new Exception("Layer has insufficient free traffic range", { status: 409, code: "E_EXPERIMENT_LAYER_CAPACITY" });
        await trx.table("experiment_layer_allocations").insert({ tenant_id: String(currentTenantId()), layer_id: layerId, experiment_revision_id: revisionId, bucket_start: start, bucket_end: end });
    }

    private holdoutApplies(scopeValue: unknown, experiment: Row): boolean {
        const scope = json<Record<string, unknown>>(scopeValue, {});
        const keys = Array.isArray(scope.experiment_keys) ? scope.experiment_keys.map(String) : [];
        const surfaces = Array.isArray(scope.surfaces) ? scope.surfaces.map(String) : [];
        if (!keys.length && !surfaces.length) return true;
        return keys.includes(String(experiment.key)) || surfaces.includes(String(experiment.surface));
    }

    private async heldOut(experiment: Row, revision: Row, hashedSubject: string): Promise<Row | null> {
        const trx = currentTrx();
        const holdouts = await trx.from("experiment_holdouts").where("is_active", true).where("randomization_unit", revision.randomization_unit).select("*");
        for (const holdout of holdouts) {
            if (!this.holdoutApplies(holdout.scope, experiment)) continue;
            const bucket = stableBucket(`${String(currentTenantId())}:holdout:${String(holdout.id)}:phase17-v1`, hashedSubject);
            if (bucket >= number(holdout.allocation_basis_points)) continue;
            await trx.table("experiment_holdout_memberships").insert({ tenant_id: String(currentTenantId()), holdout_id: holdout.id, subject_hash: hashedSubject }).onConflict(["tenant_id", "holdout_id", "subject_hash"]).ignore();
            return holdout;
        }
        return null;
    }

    async createRevision(id: number) {
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("id", id).forUpdate().first();
        if (!experiment) throw new Exception("Experiment not found", { status: 404, code: "E_EXPERIMENT_NOT_FOUND" });
        if (["scheduled", "running", "paused", "analyzing"].includes(String(experiment.status))) throw new Exception("Active experiment cannot be revised", { status: 409, code: "E_EXPERIMENT_REVISION_ACTIVE" });
        const current = await trx.from("experiment_revisions").where("experiment_id", id).where("revision", experiment.current_revision).first();
        const variants = await trx.from("experiment_variants").where("experiment_revision_id", current.id).select("*");
        const bindings = await trx.from("experiment_metric_bindings").where("experiment_revision_id", current.id).select("*");
        const nextRevision = number(current.revision) + 1;
        const [created] = await trx.table("experiment_revisions").insert({
            tenant_id: String(currentTenantId()), experiment_id: id, revision: nextRevision, status: "draft",
            randomization_unit: current.randomization_unit, analysis_unit: current.analysis_unit, identity_policy: current.identity_policy,
            traffic_basis_points: current.traffic_basis_points, primary_metric_id: current.primary_metric_id, layer_id: current.layer_id,
            analysis_method: current.analysis_method, alpha: current.alpha, target_power: current.target_power,
            minimum_detectable_effect: current.minimum_detectable_effect, baseline_mean: current.baseline_mean, baseline_variance: current.baseline_variance,
            minimum_duration_hours: current.minimum_duration_hours, observation_window_hours: current.observation_window_hours,
            cuped_enabled: current.cuped_enabled, eligibility: JSON.stringify(json(current.eligibility, {})),
        }).returning("*");
        await trx.table("experiment_variants").insert(variants.map((variant: Row) => ({ tenant_id: String(currentTenantId()), experiment_revision_id: created.id, key: variant.key, name_fa: variant.name_fa, is_control: variant.is_control, allocation_basis_points: variant.allocation_basis_points, parameters: JSON.stringify(json(variant.parameters, {})) })));
        if (bindings.length) await trx.table("experiment_metric_bindings").insert(bindings.map((binding: Row) => ({ tenant_id: String(currentTenantId()), experiment_revision_id: created.id, metric_id: binding.metric_id, role: binding.role, harm_direction: binding.harm_direction, warn_threshold: binding.warn_threshold, stop_threshold: binding.stop_threshold, automatic_action: binding.automatic_action })));
        if (created.layer_id) await this.allocateLayerRange(number(created.id), number(created.layer_id), number(created.traffic_basis_points));
        await trx.from("experiments").where("id", id).update({ current_revision: nextRevision, status: "draft", started_at: null, stopped_at: null, archived_at: null });
        return this.get(id);
    }

    private async evaluateGuardrails(revision: Row, assignments: Row[], variants: Row[], dataCutoff: DateTime) {
        const trx = currentTrx();
        const bindings = await trx.from("experiment_metric_bindings").where("experiment_revision_id", revision.id).where("role", "guardrail").select("*");
        if (!bindings.length) return { status: "not_configured", results: [] as Row[] };
        const byAssignment = new Map(assignments.map((item: Row) => [number(item.id), number(item.variant_id)]));
        const assignmentIds = assignments.map((item: Row) => number(item.id));
        const controlVariant = variants.find((item: Row) => item.is_control);
        const treatmentVariant = variants.find((item: Row) => !item.is_control);
        const results: Row[] = [];
        let breached = false;
        for (const binding of bindings) {
            const outcomes = assignmentIds.length ? await trx.from("experiment_outcomes").whereIn("assignment_id", assignmentIds).where("metric_id", binding.metric_id).where("occurred_at", "<=", dataCutoff.toSQL()!).select("assignment_id", "value") : [];
            const controlValues = outcomes.filter((row: Row) => byAssignment.get(number(row.assignment_id)) === number(controlVariant.id)).map((row: Row) => number(row.value));
            const treatmentValues = outcomes.filter((row: Row) => byAssignment.get(number(row.assignment_id)) === number(treatmentVariant.id)).map((row: Row) => number(row.value));
            const comparison = compareMeans(stats(controlValues), stats(treatmentValues), number(revision.alpha));
            const stopThreshold = binding.stop_threshold === null ? null : number(binding.stop_threshold);
            const warnThreshold = binding.warn_threshold === null ? null : number(binding.warn_threshold);
            let state = "pass";
            if (!comparison) state = "insufficient_data";
            else if (binding.harm_direction === "increase" && stopThreshold !== null && comparison.ci_low > stopThreshold) state = "breach";
            else if (binding.harm_direction === "decrease" && stopThreshold !== null && comparison.ci_high < -stopThreshold) state = "breach";
            else if (binding.harm_direction === "increase" && warnThreshold !== null && comparison.ci_low > warnThreshold) state = "warning";
            else if (binding.harm_direction === "decrease" && warnThreshold !== null && comparison.ci_high < -warnThreshold) state = "warning";
            if (state === "breach") breached = true;
            results.push({ metric_id: number(binding.metric_id), state, harm_direction: binding.harm_direction, automatic_action: binding.automatic_action, effect: comparison });
        }
        return { status: breached ? "breach" : results.some((item) => item.state === "warning") ? "warning" : "pass", results };
    }

    async checkGuardrails(id: number) {
        const trx = currentTrx();
        const experiment = await trx.from("experiments").where("id", id).forUpdate().first();
        if (!experiment || !["running", "paused"].includes(String(experiment.status))) throw new Exception("Guardrails can be checked only for a live experiment", { status: 409, code: "E_EXPERIMENT_GUARDRAIL_STATE" });
        const revision = await trx.from("experiment_revisions").where("experiment_id", id).where("revision", experiment.current_revision).first();
        const assignments = await trx.from("experiment_assignments").where("experiment_revision_id", revision.id).select("id", "variant_id");
        const variants = await trx.from("experiment_variants").where("experiment_revision_id", revision.id).select("*");
        const evaluation = await this.evaluateGuardrails(revision, assignments, variants, DateTime.utc());
        for (const result of evaluation.results.filter((item) => item.state === "breach")) {
            await trx.table("experiment_guardrail_events").insert({ tenant_id: String(currentTenantId()), experiment_revision_id: revision.id, metric_id: result.metric_id, severity: "critical", action: result.automatic_action, evidence: JSON.stringify(result) });
        }
        const actions = evaluation.results.filter((item) => item.state === "breach").map((item) => item.automatic_action);
        if (actions.includes("kill")) await trx.from("experiments").where("id", id).update({ status: "killed", stopped_at: DateTime.utc().toSQL() });
        else if (actions.includes("pause") && experiment.status === "running") await trx.from("experiments").where("id", id).update({ status: "paused" });
        return { data: evaluation };
    }

    async evaluate(experimentKey: string, subjectKey: string) {''',
)

# Holdout check and shared layer namespace in runtime evaluate.
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "        const hashed = subjectHash(subjectKey);\n        const existing = await trx.from(\"experiment_assignments as a\")",
    "        const hashed = subjectHash(subjectKey);\n        const holdout = await this.heldOut(experiment, revision, hashed);\n        if (holdout) return { data: { eligible: false, reason: \"holdout\", holdout_key: holdout.key } };\n        const existing = await trx.from(\"experiment_assignments as a\")",
)
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "            salt: \"phase17-v1\", trafficBasisPoints: number(revision.traffic_basis_points), layerRange,",
    "            salt: \"phase17-v1\", trafficBasisPoints: number(revision.traffic_basis_points), layerRange, layerNamespace: revision.layer_id ? String(revision.layer_id) : null,",
)

# Analyze real configured guardrails rather than hardcoded PASS.
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    '        const guardrailStatus = "pass";',
    '        const guardrails = await this.evaluateGuardrails(revision, assignments, variants, dataCutoff);\n        const guardrailStatus = guardrails.status;',
)
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    "            cuped: { control: { applied: control.cuped.applied, variance_reduction: control.cuped.variance_reduction, reason: control.cuped.reason }, treatment: { applied: treatment.cuped.applied, variance_reduction: treatment.cuped.variance_reduction, reason: treatment.cuped.reason } },",
    "            cuped: { control: { applied: control.cuped.applied, variance_reduction: control.cuped.variance_reduction, reason: control.cuped.reason }, treatment: { applied: treatment.cuped.applied, variance_reduction: treatment.cuped.variance_reduction, reason: treatment.cuped.reason } },\n            guardrails: guardrails.results,",
)
patch(
    "apps/api/app/services/experimentation/experiment_service.ts",
    '        else if (maturity !== "mature" || freshness !== "fresh" || !comparison) recommendation = "continue";',
    '        else if (guardrailStatus === "breach") recommendation = "roll_back";\n        else if (maturity !== "mature" || freshness !== "fresh" || !comparison) recommendation = "continue";',
)

# --- Admin controllers: creation/management endpoints and strict audit. ---
patch(
    "apps/api/app/controllers/admin/experimentation_controller.ts",
    'import { experimentAnalysisValidator, experimentCreateValidator, experimentDecisionValidator, experimentMetricCreateValidator, experimentTransitionValidator } from "#validators/admin/experimentation_validator";',
    'import { experimentAnalysisValidator, experimentCreateValidator, experimentDecisionValidator, experimentHoldoutCreateValidator, experimentLayerCreateValidator, experimentMetricCreateValidator, experimentTransitionValidator } from "#validators/admin/experimentation_validator";',
)
patch(
    "apps/api/app/controllers/admin/experimentation_controller.ts",
    "    async layers() { return this.service.listLayers(); }\n    async holdouts() { return this.service.listHoldouts(); }",
    '''    async layers() { return this.service.listLayers(); }
    async holdouts() { return this.service.listHoldouts(); }
    async createLayer(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentLayerCreateValidator);
        const result = await this.service.createLayer(payload);
        await recordAudit({ ctx, action: "experiment.layer.created", entityKind: "experiment_layer", entityId: result.data.id, payload: { key: result.data.key }, strict: true });
        ctx.response.status(201); return result;
    }
    async createHoldout(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(experimentHoldoutCreateValidator);
        const result = await this.service.createHoldout(payload);
        await recordAudit({ ctx, action: "experiment.holdout.created", entityKind: "experiment_holdout", entityId: result.data.id, payload: { key: result.data.key, allocation_basis_points: result.data.allocation_basis_points }, strict: true });
        ctx.response.status(201); return result;
    }''',
)
patch(
    "apps/api/app/controllers/admin/experimentation_controller.ts",
    "    async preflight(ctx: HttpContext) { return this.service.preflight(id(ctx)); }",
    '''    async preflight(ctx: HttpContext) { return this.service.preflight(id(ctx)); }
    async revision(ctx: HttpContext) {
        const result = await this.service.createRevision(id(ctx));
        await recordAudit({ ctx, action: "experiment.revision.created", entityKind: "experiment", entityId: id(ctx), payload: { revision: result.data.revision.revision }, strict: true });
        return result;
    }
    async guardrails(ctx: HttpContext) {
        const result = await this.service.checkGuardrails(id(ctx));
        await recordAudit({ ctx, action: "experiment.guardrails.checked", entityKind: "experiment", entityId: id(ctx), payload: { status: result.data.status }, strict: true });
        return result;
    }''',
)

# Routes.
patch(
    "apps/api/start/routes/admin_experiments.ts",
    '    router.get("/layers", [controller, "layers"]);\n    router.get("/holdouts", [controller, "holdouts"]);',
    '    router.get("/layers", [controller, "layers"]);\n    router.post("/layers", [controller, "createLayer"]).use(adminWriteLimiter);\n    router.get("/holdouts", [controller, "holdouts"]);\n    router.post("/holdouts", [controller, "createHoldout"]).use(adminWriteLimiter);',
)
patch(
    "apps/api/start/routes/admin_experiments.ts",
    '    router.post("/:id/preflight", [controller, "preflight"]).use(adminWriteLimiter);',
    '    router.post("/:id/preflight", [controller, "preflight"]).use(adminWriteLimiter);\n    router.post("/:id/revision", [controller, "revision"]).use(adminWriteLimiter);\n    router.post("/:id/guardrails/check", [controller, "guardrails"]).use(adminWriteLimiter);',
)

# Query mutations.
patch(
    "apps/admin/src/lib/queries/experiments.ts",
    'export function useCreateExperimentMetric() { return useExperimentMutation("experiments/metrics"); }',
    'export function useCreateExperimentMetric() { return useExperimentMutation("experiments/metrics"); }\nexport function useCreateExperimentLayer() { return useExperimentMutation("experiments/layers"); }\nexport function useCreateExperimentHoldout() { return useExperimentMutation("experiments/holdouts"); }',
)

# Builder: include one optional real guardrail selector.
patch(
    "apps/admin/src/views/experiments/experiment-builder-view.tsx",
    'const [form,setForm]=useState({key:"",name_fa:"",hypothesis_fa:"",surface:"product_detail",primary_metric_id:"",baseline_mean:"",baseline_variance:"",mde:"",control:"50",cuped:false});',
    'const [form,setForm]=useState({key:"",name_fa:"",hypothesis_fa:"",surface:"product_detail",primary_metric_id:"",baseline_mean:"",baseline_variance:"",mde:"",control:"50",cuped:false,guardrail_metric_id:"",guardrail_direction:"increase",guardrail_stop:""});',
)
patch(
    "apps/admin/src/views/experiments/experiment-builder-view.tsx",
    'cuped_enabled:form.cuped,variants:[',
    'cuped_enabled:form.cuped,guardrails:form.guardrail_metric_id&&form.guardrail_stop?[{metric_id:Number(form.guardrail_metric_id),harm_direction:form.guardrail_direction,stop_threshold:Number(form.guardrail_stop),automatic_action:"pause"}]:[],variants:[',
)
patch(
    "apps/admin/src/views/experiments/experiment-builder-view.tsx",
    '<div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3"><div><HelpLabel help="CUPED فقط با covariate پیش‌آزمایش و پوشش کافی اعمال می‌شود؛ در غیر این صورت fallback شفاف ثبت می‌شود.">کاهش واریانس CUPED</HelpLabel>',
    '''<Field label="معیار Guardrail" help="معیار محافظ مستقل از معیار اصلی؛ اگر بازه اطمینان عبور از آستانه آسیب را تأیید کند، نتیجه Winner محسوب نمی‌شود."><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.guardrail_metric_id} onChange={e=>setForm(v=>({...v,guardrail_metric_id:e.target.value}))}><option value="">بدون Guardrail</option>{(metrics.data?.data??[]).filter((m:any)=>String(m.id)!==form.primary_metric_id).map((m:any)=><option key={m.id} value={m.id}>{m.name_fa} · v{m.version}</option>)}</select></Field>
      <Field label="آستانه توقف Guardrail" help="اثر مطلق زیان‌بار که باید با بازه اطمینان پشتیبانی شود؛ صرف point estimate برای توقف کافی نیست."><Input type="number" step="0.0001" dir="ltr" value={form.guardrail_stop} onChange={e=>setForm(v=>({...v,guardrail_stop:e.target.value}))} disabled={!form.guardrail_metric_id}/></Field>
      <Field label="جهت آسیب Guardrail" help="افزایش یعنی بیشترشدن معیار آسیب است (مثل خطای Checkout)؛ کاهش یعنی کم‌شدن معیار آسیب است."><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={form.guardrail_direction} onChange={e=>setForm(v=>({...v,guardrail_direction:e.target.value}))}><option value="increase">افزایش زیان‌بار است</option><option value="decrease">کاهش زیان‌بار است</option></select></Field>
      <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3"><div><HelpLabel help="CUPED فقط با covariate پیش‌آزمایش و پوشش کافی اعمال می‌شود؛ در غیر این صورت fallback شفاف ثبت می‌شود.">کاهش واریانس CUPED</HelpLabel>''',
)

# Detail actions: real guardrail check and revision.
patch(
    "apps/admin/src/views/experiments/experiment-detail-view.tsx",
    'const submit=action("submit"),approve=action("approve"),start=action("start"),pause=action("pause"),resume=action("resume"),stop=action("stop"),kill=action("kill"),analyze=action("analyze"),archive=action("archive"),decision=action("decision");',
    'const submit=action("submit"),approve=action("approve"),start=action("start"),pause=action("pause"),resume=action("resume"),stop=action("stop"),kill=action("kill"),guardrails=action("guardrails/check"),revision=action("revision"),analyze=action("analyze"),archive=action("archive"),decision=action("decision");',
)
patch(
    "apps/admin/src/views/experiments/experiment-detail-view.tsx",
    '<Action label="پایان" help="اجرای عادی را می‌بندد تا پنجره Outcome و تحلیل تکمیل شود." onClick={()=>run(stop)} show={["running","paused"].includes(s)}/>',
    '<Action label="بررسی Guardrail" help="معیارهای محافظ را با داده فعلی و بازه اطمینان ارزیابی می‌کند؛ در صورت breach و سیاست Pause/Kill، وضعیت آزمایش واقعاً تغییر می‌کند." onClick={()=>run(guardrails,{})} show={["running","paused"].includes(s)}/><Action label="پایان" help="اجرای عادی را می‌بندد تا پنجره Outcome و تحلیل تکمیل شود." onClick={()=>run(stop)} show={["running","paused"].includes(s)}/>',
)
patch(
    "apps/admin/src/views/experiments/experiment-detail-view.tsx",
    '<Action label="بایگانی" help="آزمایش تصمیم‌گیری‌شده را فقط از جریان فعال خارج می‌کند؛ شواهد حذف نمی‌شوند." onClick={()=>run(archive)} show={s==="decided"}/>',
    '<Action label="نسخه جدید" help="طراحی قبلی و شواهدش را حفظ می‌کند و یک Revision تازه Draft می‌سازد؛ تغییر Allocation یا معیار روی اجرای زنده انجام نمی‌شود." onClick={()=>run(revision,{})} show={["decided","archived"].includes(s)}/><Action label="بایگانی" help="آزمایش تصمیم‌گیری‌شده را فقط از جریان فعال خارج می‌کند؛ شواهد حذف نمی‌شوند." onClick={()=>run(archive)} show={s==="decided"}/>',
)

# Workspace management forms for actual Layer/Holdout creation, no dead buttons.
patch(
    "apps/admin/src/views/experiments/experiments-workspace-view.tsx",
    'import { useExperimentDiagnostics, useExperimentEvidence, useExperimentHoldouts, useExperimentLayers, useExperimentMetrics, useExperimentOverview, useExperiments } from "#/lib/queries/experiments";',
    'import { useCreateExperimentHoldout, useCreateExperimentLayer, useExperimentDiagnostics, useExperimentEvidence, useExperimentHoldouts, useExperimentLayers, useExperimentMetrics, useExperimentOverview, useExperiments } from "#/lib/queries/experiments";\nimport { Input } from "#/components/ui/input";\nimport { useState } from "react";',
)
patch(
    "apps/admin/src/views/experiments/experiments-workspace-view.tsx",
    '  const t = useTranslations("Experiments"); const overview = useExperimentOverview();',
    '  const t = useTranslations("Experiments"); const overview = useExperimentOverview(); const createLayer = useCreateExperimentLayer(); const createHoldout = useCreateExperimentHoldout(); const [layerForm,setLayerForm]=useState({key:"",name_fa:"",surface:"product_detail"}); const [holdoutForm,setHoldoutForm]=useState({key:"",name_fa:"",allocation:"5"});',
)
patch(
    "apps/admin/src/views/experiments/experiments-workspace-view.tsx",
    '    </div>\n  </div>;',
    '''    </div>
    <Card><CardHeader><CardTitle className="text-base"><HelpLabel help={`${t("help.layer")} ${t("help.holdout")}`}>مدیریت واقعی Layer و Holdout</HelpLabel></CardTitle><CardDescription>V1 فقط Layer با جداسازی سخت می‌سازد؛ Holdout به‌صورت پایدار و tenant-scoped اعمال می‌شود.</CardDescription></CardHeader><CardContent className="grid gap-4 xl:grid-cols-2"><div className="space-y-2 rounded-lg border p-3"><div className="font-medium">ساخت Layer</div><Input dir="ltr" placeholder="pdp.presentation" value={layerForm.key} onChange={e=>setLayerForm(v=>({...v,key:e.target.value}))}/><Input placeholder="نام فارسی Layer" value={layerForm.name_fa} onChange={e=>setLayerForm(v=>({...v,name_fa:e.target.value}))}/><Input dir="ltr" placeholder="product_detail" value={layerForm.surface} onChange={e=>setLayerForm(v=>({...v,surface:e.target.value}))}/><Button variant="outline" disabled={!layerForm.key||!layerForm.name_fa||createLayer.isPending} onClick={()=>createLayer.mutate({key:layerForm.key,name_fa:layerForm.name_fa,surface:layerForm.surface,randomization_unit:"visitor"})}>ثبت Layer سخت</Button></div><div className="space-y-2 rounded-lg border p-3"><div className="font-medium">ساخت Holdout پایدار</div><Input dir="ltr" placeholder="recommendation-global" value={holdoutForm.key} onChange={e=>setHoldoutForm(v=>({...v,key:e.target.value}))}/><Input placeholder="نام فارسی Holdout" value={holdoutForm.name_fa} onChange={e=>setHoldoutForm(v=>({...v,name_fa:e.target.value}))}/><Input type="number" min="0.01" max="50" step="0.01" dir="ltr" value={holdoutForm.allocation} onChange={e=>setHoldoutForm(v=>({...v,allocation:e.target.value}))}/><Button variant="outline" disabled={!holdoutForm.key||!holdoutForm.name_fa||createHoldout.isPending} onClick={()=>createHoldout.mutate({key:holdoutForm.key,name_fa:holdoutForm.name_fa,kind:"global",randomization_unit:"visitor",allocation_basis_points:Math.round(Number(holdoutForm.allocation)*100),scope:{}})}>ثبت Holdout</Button></div></CardContent></Card>
  </div>;''',
)

# Unit test for shared layer traffic namespace across experiment ids.
patch(
    "apps/api/tests/unit/experimentation/assignment.spec.ts",
    '    test("signed exposure token rejects tampering", ({ assert }) => {',
    '''    test("layer traffic bucket is shared across experiment ids", ({ assert }) => {
        const first = assignDeterministically({ tenantId: "9", experimentId: 17, revision: 1, subjectKey: "same-subject", salt: "phase17", trafficBasisPoints: 10000, variants, layerRange: { start: 0, end: 2999 }, layerNamespace: "7" });
        const second = assignDeterministically({ tenantId: "9", experimentId: 18, revision: 4, subjectKey: "same-subject", salt: "phase17", trafficBasisPoints: 10000, variants, layerRange: { start: 0, end: 2999 }, layerNamespace: "7" });
        assert.equal(first.bucket, second.bucket);
        assert.equal(first.eligible, second.eligible);
    });

    test("signed exposure token rejects tampering", ({ assert }) => {''',
)

print("Phase 17 completeness: shared layers, persistent holdouts, real guardrails, revisions and management UI wired")
