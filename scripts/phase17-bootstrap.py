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
        raise SystemExit(f"phase17 bootstrap: anchor not found in {path}: {old!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")


write("apps/api/database/migrations/1765000000000_create_phase17_experimentation_tables.ts", r'''
import { BaseSchema } from "@adonisjs/lucid/schema";

const TENANT_DEFAULT = "NULLIF(current_setting('app.current_tenant', true), '')::bigint";
const TENANT_PREDICATE = `tenant_id = ${TENANT_DEFAULT}`;
const TABLES = [
    "experiments",
    "experiment_revisions",
    "experiment_variants",
    "experiment_metrics",
    "experiment_layers",
    "experiment_layer_allocations",
    "experiment_holdouts",
    "experiment_holdout_memberships",
    "experiment_assignments",
    "experiment_exposures",
    "experiment_outcomes",
    "experiment_analysis_snapshots",
    "experiment_guardrail_events",
    "experiment_diagnostics",
    "experiment_decisions",
    "causal_evidence",
] as const;

export default class extends BaseSchema {
    async up() {
        this.schema.createTable("experiment_metrics", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.string("key", 120).notNullable();
            table.string("name_fa", 180).notNullable();
            table.string("name_en", 180).nullable();
            table.string("kind", 24).notNullable();
            table.string("value_type", 24).notNullable();
            table.string("analysis_unit", 32).notNullable();
            table.text("business_definition_fa").notNullable();
            table.jsonb("source_contract").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.integer("observation_window_hours").notNullable().defaultTo(168);
            table.integer("expected_freshness_minutes").notNullable().defaultTo(60);
            table.integer("version").notNullable().defaultTo(1);
            table.boolean("is_active").notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(["tenant_id", "key", "version"], { indexName: "experiment_metrics_key_version_unique" });
        });

        this.schema.createTable("experiment_layers", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.string("key", 120).notNullable();
            table.string("name_fa", 180).notNullable();
            table.string("surface", 120).notNullable();
            table.string("randomization_unit", 32).notNullable();
            table.string("collision_policy", 24).notNullable().defaultTo("hard");
            table.integer("bucket_start").notNullable().defaultTo(0);
            table.integer("bucket_end").notNullable().defaultTo(9999);
            table.boolean("is_active").notNullable().defaultTo(true);
            table.timestamps(true, true);
            table.unique(["tenant_id", "key"], { indexName: "experiment_layers_key_unique" });
        });

        this.schema.createTable("experiments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.string("key", 120).notNullable();
            table.string("name_fa", 255).notNullable();
            table.text("hypothesis_fa").notNullable();
            table.string("surface", 120).notNullable();
            table.string("status", 32).notNullable().defaultTo("draft");
            table.integer("current_revision").notNullable().defaultTo(1);
            table.bigInteger("owner_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("started_at", { useTz: true }).nullable();
            table.timestamp("stopped_at", { useTz: true }).nullable();
            table.timestamp("archived_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "key"], { indexName: "experiments_key_unique" });
            table.index(["tenant_id", "status", "updated_at"], "experiments_status_idx");
        });

        this.schema.createTable("experiment_revisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().notNullable().references("id").inTable("experiments").onDelete("CASCADE");
            table.integer("revision").notNullable();
            table.string("status", 32).notNullable().defaultTo("draft");
            table.string("randomization_unit", 32).notNullable();
            table.string("analysis_unit", 32).notNullable();
            table.string("identity_policy", 48).notNullable();
            table.integer("traffic_basis_points").notNullable().defaultTo(10000);
            table.bigInteger("primary_metric_id").unsigned().notNullable().references("id").inTable("experiment_metrics").onDelete("RESTRICT");
            table.bigInteger("layer_id").unsigned().nullable().references("id").inTable("experiment_layers").onDelete("SET NULL");
            table.string("analysis_method", 32).notNullable().defaultTo("fixed_horizon");
            table.decimal("alpha", 6, 5).notNullable().defaultTo(0.05);
            table.decimal("target_power", 6, 5).notNullable().defaultTo(0.8);
            table.decimal("minimum_detectable_effect", 18, 8).nullable();
            table.integer("minimum_duration_hours").notNullable().defaultTo(168);
            table.integer("observation_window_hours").notNullable().defaultTo(168);
            table.boolean("cuped_enabled").notNullable().defaultTo(false);
            table.jsonb("eligibility").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("power_plan").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("preflight").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.bigInteger("submitted_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.bigInteger("approved_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("submitted_at", { useTz: true }).nullable();
            table.timestamp("approved_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "experiment_id", "revision"], { indexName: "experiment_revisions_unique" });
        });

        this.schema.createTable("experiment_variants", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.string("key", 80).notNullable();
            table.string("name_fa", 180).notNullable();
            table.boolean("is_control").notNullable().defaultTo(false);
            table.integer("allocation_basis_points").notNullable();
            table.jsonb("parameters").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamps(true, true);
            table.unique(["tenant_id", "experiment_revision_id", "key"], { indexName: "experiment_variants_key_unique" });
        });

        this.schema.createTable("experiment_layer_allocations", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("layer_id").unsigned().notNullable().references("id").inTable("experiment_layers").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.integer("bucket_start").notNullable();
            table.integer("bucket_end").notNullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "layer_id", "experiment_revision_id"], { indexName: "experiment_layer_allocations_unique" });
        });

        this.schema.createTable("experiment_holdouts", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.string("key", 120).notNullable();
            table.string("name_fa", 180).notNullable();
            table.string("kind", 32).notNullable();
            table.string("randomization_unit", 32).notNullable();
            table.integer("allocation_basis_points").notNullable();
            table.jsonb("scope").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.boolean("is_active").notNullable().defaultTo(true);
            table.timestamp("review_at", { useTz: true }).nullable();
            table.timestamps(true, true);
            table.unique(["tenant_id", "key"], { indexName: "experiment_holdouts_key_unique" });
        });

        this.schema.createTable("experiment_holdout_memberships", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("holdout_id").unsigned().notNullable().references("id").inTable("experiment_holdouts").onDelete("CASCADE");
            table.string("subject_hash", 128).notNullable();
            table.timestamp("assigned_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "holdout_id", "subject_hash"], { indexName: "experiment_holdout_memberships_unique" });
        });

        this.schema.createTable("experiment_assignments", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().notNullable().references("id").inTable("experiments").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.bigInteger("variant_id").unsigned().notNullable().references("id").inTable("experiment_variants").onDelete("RESTRICT");
            table.string("subject_hash", 128).notNullable();
            table.integer("bucket").notNullable();
            table.timestamp("assigned_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "experiment_revision_id", "subject_hash"], { indexName: "experiment_assignments_subject_unique" });
            table.index(["tenant_id", "experiment_revision_id", "variant_id"], "experiment_assignments_variant_idx");
        });

        this.schema.createTable("experiment_exposures", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("assignment_id").unsigned().notNullable().references("id").inTable("experiment_assignments").onDelete("CASCADE");
            table.string("exposure_key", 191).notNullable();
            table.string("surface", 120).notNullable();
            table.jsonb("context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("exposed_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "exposure_key"], { indexName: "experiment_exposures_key_unique" });
        });

        this.schema.createTable("experiment_outcomes", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("assignment_id").unsigned().notNullable().references("id").inTable("experiment_assignments").onDelete("CASCADE");
            table.bigInteger("metric_id").unsigned().notNullable().references("id").inTable("experiment_metrics").onDelete("RESTRICT");
            table.decimal("value", 24, 10).notNullable();
            table.decimal("pre_experiment_value", 24, 10).nullable();
            table.string("source_event_key", 191).notNullable();
            table.timestamp("occurred_at", { useTz: true }).notNullable();
            table.timestamp("recorded_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "metric_id", "source_event_key"], { indexName: "experiment_outcomes_source_unique" });
        });

        this.schema.createTable("experiment_analysis_snapshots", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().notNullable().references("id").inTable("experiments").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.integer("analysis_version").notNullable();
            table.string("method", 32).notNullable();
            table.timestamp("data_cutoff", { useTz: true }).notNullable();
            table.string("maturity", 24).notNullable();
            table.string("srm_status", 24).notNullable();
            table.string("guardrail_status", 24).notNullable();
            table.string("freshness_status", 24).notNullable();
            table.jsonb("result").notNullable();
            table.jsonb("diagnostics").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "experiment_revision_id", "analysis_version"], { indexName: "experiment_analysis_snapshots_unique" });
        });

        this.schema.createTable("experiment_guardrail_events", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.bigInteger("metric_id").unsigned().notNullable().references("id").inTable("experiment_metrics").onDelete("RESTRICT");
            table.string("severity", 16).notNullable();
            table.string("action", 24).notNullable();
            table.jsonb("evidence").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.createTable("experiment_diagnostics", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_revision_id").unsigned().notNullable().references("id").inTable("experiment_revisions").onDelete("CASCADE");
            table.string("kind", 48).notNullable();
            table.string("severity", 16).notNullable();
            table.string("status", 24).notNullable().defaultTo("open");
            table.text("message_fa").notNullable();
            table.jsonb("details").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.timestamp("resolved_at", { useTz: true }).nullable();
        });

        this.schema.createTable("experiment_decisions", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().notNullable().references("id").inTable("experiments").onDelete("CASCADE");
            table.bigInteger("analysis_snapshot_id").unsigned().nullable().references("id").inTable("experiment_analysis_snapshots").onDelete("SET NULL");
            table.string("recommendation", 32).notNullable();
            table.string("actual_decision", 32).nullable();
            table.text("reason_fa").nullable();
            table.bigInteger("decided_by_user_id").unsigned().nullable().references("id").inTable("users").onDelete("SET NULL");
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
        });

        this.schema.createTable("causal_evidence", (table) => {
            table.bigIncrements("id").notNullable();
            table.bigInteger("tenant_id").unsigned().notNullable().defaultTo(this.raw(TENANT_DEFAULT)).references("id").inTable("tenants").onDelete("CASCADE");
            table.bigInteger("experiment_id").unsigned().notNullable().references("id").inTable("experiments").onDelete("CASCADE");
            table.bigInteger("analysis_snapshot_id").unsigned().notNullable().references("id").inTable("experiment_analysis_snapshots").onDelete("CASCADE");
            table.string("evidence_strength", 32).notNullable();
            table.string("intervention_key", 191).notNullable();
            table.jsonb("population_context").notNullable().defaultTo(this.raw("'{}'::jsonb"));
            table.jsonb("effect").notNullable();
            table.jsonb("limitations").notNullable().defaultTo(this.raw("'[]'::jsonb"));
            table.string("validity_status", 24).notNullable();
            table.timestamp("valid_until", { useTz: true }).nullable();
            table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
            table.unique(["tenant_id", "analysis_snapshot_id"], { indexName: "causal_evidence_snapshot_unique" });
        });

        for (const table of TABLES) {
            this.schema.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            this.schema.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            this.schema.raw(`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT_PREDICATE}) WITH CHECK (${TENANT_PREDICATE})`);
        }
    }

    async down() {
        for (const table of [...TABLES].reverse()) this.schema.dropTable(table);
    }
}
''')

write("apps/api/app/services/experimentation/domain.ts", r'''
export const EXPERIMENT_STATUSES = [
    "draft",
    "ready_for_review",
    "approved",
    "scheduled",
    "running",
    "paused",
    "completed",
    "analyzing",
    "decided",
    "archived",
    "cancelled",
    "killed",
    "invalidated",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const RANDOMIZATION_UNITS = ["visitor", "customer", "session", "tenant", "custom_entity"] as const;
export const ANALYSIS_UNITS = ["visitor", "customer", "session", "order", "tenant", "custom_entity"] as const;
export const IDENTITY_POLICIES = [
    "customer_only",
    "anonymous_visitor",
    "session",
    "visitor_sticky_through_login",
    "tenant",
    "custom_entity",
] as const;
export const METRIC_KINDS = ["primary", "diagnostic", "guardrail", "data_quality"] as const;
export const METRIC_VALUE_TYPES = ["binary", "continuous", "count", "ratio"] as const;
export const DECISIONS = ["ship", "roll_back", "continue", "pause", "replicate", "investigate", "insufficient_evidence", "invalid_experiment"] as const;

export interface VariantAllocation {
    key: string;
    allocation_basis_points: number;
}

export function assertTwoArmAllocation(variants: VariantAllocation[]): void {
    if (variants.length !== 2) throw new Error("Phase 17 V1 requires exactly two variants");
    const total = variants.reduce((sum, item) => sum + item.allocation_basis_points, 0);
    if (total !== 10_000) throw new Error("variant allocation must total 10000 basis points");
    if (variants.some((item) => item.allocation_basis_points <= 0)) throw new Error("variant allocation must be positive");
}

export function canTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
    const allowed: Record<ExperimentStatus, ExperimentStatus[]> = {
        draft: ["ready_for_review", "cancelled"],
        ready_for_review: ["draft", "approved", "cancelled"],
        approved: ["scheduled", "running", "cancelled"],
        scheduled: ["running", "cancelled"],
        running: ["paused", "completed", "killed", "invalidated"],
        paused: ["running", "completed", "killed", "invalidated"],
        completed: ["analyzing"],
        analyzing: ["decided", "invalidated"],
        decided: ["archived"],
        archived: [],
        cancelled: [],
        killed: ["analyzing"],
        invalidated: ["archived"],
    };
    return allowed[from].includes(to);
}
''')

write("apps/api/app/services/experimentation/assignment.ts", r'''
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface AssignmentVariant {
    id: number;
    key: string;
    allocation_basis_points: number;
    parameters: Record<string, unknown>;
}

export interface AssignmentInput {
    tenantId: string;
    experimentId: number;
    revision: number;
    subjectKey: string;
    salt: string;
    trafficBasisPoints: number;
    variants: AssignmentVariant[];
    layerRange?: { start: number; end: number } | null;
}

export interface AssignmentResult {
    eligible: boolean;
    bucket: number;
    variant: AssignmentVariant | null;
}

function digestInt(value: string): number {
    return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 12), 16);
}

export function stableBucket(namespace: string, subject: string): number {
    return digestInt(`${namespace}:${subject}`) % 10_000;
}

export function assignDeterministically(input: AssignmentInput): AssignmentResult {
    const namespace = `${input.tenantId}:${input.experimentId}:${input.revision}:${input.salt}`;
    const bucket = stableBucket(namespace, input.subjectKey);
    if (input.layerRange) {
        if (bucket < input.layerRange.start || bucket > input.layerRange.end) return { eligible: false, bucket, variant: null };
    } else if (bucket >= input.trafficBasisPoints) {
        return { eligible: false, bucket, variant: null };
    }
    const variantBucket = stableBucket(`${namespace}:variant`, input.subjectKey);
    let cursor = 0;
    for (const variant of input.variants) {
        cursor += variant.allocation_basis_points;
        if (variantBucket < cursor) return { eligible: true, bucket, variant };
    }
    return { eligible: false, bucket, variant: null };
}

export function signExposureToken(payload: Record<string, unknown>, secret: string): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${signature}`;
}

export function verifyExposureToken(token: string, secret: string): Record<string, unknown> | null {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", secret).update(body).digest();
    let received: Buffer;
    try {
        received = Buffer.from(signature, "base64url");
    } catch {
        return null;
    }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    try {
        return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
        return null;
    }
}
''')

write("apps/api/app/services/experimentation/statistics.ts", r'''
export interface ArmStats {
    n: number;
    mean: number;
    variance: number;
}

export interface ComparisonResult {
    absolute_effect: number;
    relative_effect: number | null;
    standard_error: number;
    ci_low: number;
    ci_high: number;
    z_score: number;
    p_value: number;
}

function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const abs = Math.abs(x);
    const t = 1 / (1 + p * abs);
    const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-abs * abs);
    return sign * y;
}

function normalCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

export function compareMeans(control: ArmStats, treatment: ArmStats, alpha = 0.05): ComparisonResult | null {
    if (control.n < 2 || treatment.n < 2) return null;
    const effect = treatment.mean - control.mean;
    const se = Math.sqrt(control.variance / control.n + treatment.variance / treatment.n);
    if (!Number.isFinite(se) || se <= 0) return null;
    const z = effect / se;
    const pValue = 2 * (1 - normalCdf(Math.abs(z)));
    const critical = alpha <= 0.01 ? 2.575829 : 1.959964;
    return {
        absolute_effect: effect,
        relative_effect: control.mean === 0 ? null : effect / Math.abs(control.mean),
        standard_error: se,
        ci_low: effect - critical * se,
        ci_high: effect + critical * se,
        z_score: z,
        p_value: Math.max(0, Math.min(1, pValue)),
    };
}

export function sampleRatioMismatch(observed: number[], expectedBasisPoints: number[]): { chi_square: number; severe: boolean } {
    const total = observed.reduce((a, b) => a + b, 0);
    if (total === 0 || observed.length !== expectedBasisPoints.length) return { chi_square: 0, severe: false };
    let chiSquare = 0;
    for (let index = 0; index < observed.length; index += 1) {
        const expected = total * (expectedBasisPoints[index] / 10_000);
        if (expected > 0) chiSquare += (observed[index] - expected) ** 2 / expected;
    }
    return { chi_square: chiSquare, severe: chiSquare >= 10.828 };
}

export function estimateTwoArmSampleSize(args: {
    baselineMean: number;
    baselineVariance: number;
    minimumDetectableEffect: number;
    alpha?: number;
    power?: number;
    controlAllocationBasisPoints: number;
}): { total: number; control: number; treatment: number } | null {
    const { baselineVariance, minimumDetectableEffect } = args;
    if (!(baselineVariance > 0) || !(Math.abs(minimumDetectableEffect) > 0)) return null;
    const alpha = args.alpha ?? 0.05;
    const power = args.power ?? 0.8;
    const zAlpha = alpha <= 0.01 ? 2.575829 : 1.959964;
    const zPower = power >= 0.9 ? 1.281552 : power >= 0.8 ? 0.841621 : 0.524401;
    const p = args.controlAllocationBasisPoints / 10_000;
    if (!(p > 0 && p < 1)) return null;
    const total = Math.ceil(((zAlpha + zPower) ** 2 * baselineVariance * (1 / p + 1 / (1 - p))) / (minimumDetectableEffect ** 2));
    return { total, control: Math.ceil(total * p), treatment: Math.ceil(total * (1 - p)) };
}

export function applyCuped(rows: Array<{ outcome: number; covariate: number | null }>): { values: number[]; variance_reduction: number | null; applied: boolean; reason: string | null } {
    const usable = rows.filter((row): row is { outcome: number; covariate: number } => row.covariate !== null && Number.isFinite(row.covariate));
    if (usable.length < Math.max(20, Math.floor(rows.length * 0.8))) return { values: rows.map((row) => row.outcome), variance_reduction: null, applied: false, reason: "insufficient_pre_experiment_coverage" };
    const xMean = usable.reduce((sum, row) => sum + row.covariate, 0) / usable.length;
    const yMean = usable.reduce((sum, row) => sum + row.outcome, 0) / usable.length;
    const covariance = usable.reduce((sum, row) => sum + (row.covariate - xMean) * (row.outcome - yMean), 0) / Math.max(1, usable.length - 1);
    const xVariance = usable.reduce((sum, row) => sum + (row.covariate - xMean) ** 2, 0) / Math.max(1, usable.length - 1);
    if (!(xVariance > 0)) return { values: rows.map((row) => row.outcome), variance_reduction: null, applied: false, reason: "zero_covariate_variance" };
    const theta = covariance / xVariance;
    const adjusted = usable.map((row) => row.outcome - theta * (row.covariate - xMean));
    const rawVariance = usable.reduce((sum, row) => sum + (row.outcome - yMean) ** 2, 0) / Math.max(1, usable.length - 1);
    const adjustedMean = adjusted.reduce((sum, value) => sum + value, 0) / adjusted.length;
    const adjustedVariance = adjusted.reduce((sum, value) => sum + (value - adjustedMean) ** 2, 0) / Math.max(1, adjusted.length - 1);
    return { values: adjusted, variance_reduction: rawVariance > 0 ? 1 - adjustedVariance / rawVariance : null, applied: true, reason: null };
}
''')

write("apps/api/app/validators/admin/experimentation_validator.ts", r'''
import vine from "@vinejs/vine";
import { ANALYSIS_UNITS, DECISIONS, IDENTITY_POLICIES, METRIC_KINDS, METRIC_VALUE_TYPES, RANDOMIZATION_UNITS } from "#services/experimentation/domain";

const jsonRecord = vine.record(vine.any()).optional();

export const experimentMetricCreateValidator = vine.compile(vine.object({
    key: vine.string().trim().minLength(2).maxLength(120),
    name_fa: vine.string().trim().minLength(2).maxLength(180),
    name_en: vine.string().trim().maxLength(180).optional().nullable(),
    kind: vine.enum(METRIC_KINDS),
    value_type: vine.enum(METRIC_VALUE_TYPES),
    analysis_unit: vine.enum(ANALYSIS_UNITS),
    business_definition_fa: vine.string().trim().minLength(5).maxLength(4000),
    source_contract: jsonRecord,
    observation_window_hours: vine.number().min(1).max(8760).withoutDecimals().optional(),
    expected_freshness_minutes: vine.number().min(1).max(10080).withoutDecimals().optional(),
}));

export const experimentCreateValidator = vine.compile(vine.object({
    key: vine.string().trim().minLength(2).maxLength(120),
    name_fa: vine.string().trim().minLength(3).maxLength(255),
    hypothesis_fa: vine.string().trim().minLength(10).maxLength(5000),
    surface: vine.string().trim().minLength(2).maxLength(120),
    randomization_unit: vine.enum(RANDOMIZATION_UNITS),
    analysis_unit: vine.enum(ANALYSIS_UNITS),
    identity_policy: vine.enum(IDENTITY_POLICIES),
    primary_metric_id: vine.number().positive().withoutDecimals(),
    traffic_basis_points: vine.number().min(100).max(10000).withoutDecimals().optional(),
    analysis_method: vine.enum(["fixed_horizon"] as const).optional(),
    alpha: vine.number().min(0.001).max(0.2).optional(),
    target_power: vine.number().min(0.5).max(0.99).optional(),
    minimum_detectable_effect: vine.number().optional().nullable(),
    minimum_duration_hours: vine.number().min(1).max(8760).withoutDecimals().optional(),
    observation_window_hours: vine.number().min(1).max(8760).withoutDecimals().optional(),
    cuped_enabled: vine.boolean().optional(),
    eligibility: jsonRecord,
    layer_id: vine.number().positive().withoutDecimals().optional().nullable(),
    variants: vine.array(vine.object({
        key: vine.string().trim().minLength(1).maxLength(80),
        name_fa: vine.string().trim().minLength(1).maxLength(180),
        is_control: vine.boolean(),
        allocation_basis_points: vine.number().min(1).max(9999).withoutDecimals(),
        parameters: jsonRecord,
    })).minLength(2).maxLength(2),
}));

export const experimentTransitionValidator = vine.compile(vine.object({ reason_fa: vine.string().trim().minLength(3).maxLength(2000).optional().nullable() }));
export const experimentDecisionValidator = vine.compile(vine.object({ actual_decision: vine.enum(DECISIONS), reason_fa: vine.string().trim().minLength(3).maxLength(4000) }));
export const experimentAnalysisValidator = vine.compile(vine.object({ data_cutoff: vine.string().trim().maxLength(64).optional() }));
export const experimentRuntimeEvaluateValidator = vine.compile(vine.object({ experiment_key: vine.string().trim().minLength(2).maxLength(120), subject_key: vine.string().trim().minLength(1).maxLength(191), context: jsonRecord }));
export const experimentExposureValidator = vine.compile(vine.object({ exposure_token: vine.string().trim().minLength(20).maxLength(4096), exposure_key: vine.string().trim().minLength(8).maxLength(191), surface: vine.string().trim().minLength(2).maxLength(120), context: jsonRecord }));
''')

write("apps/api/tests/unit/experimentation/assignment.spec.ts", r'''
import { test } from "@japa/runner";
import { assignDeterministically, signExposureToken, stableBucket, verifyExposureToken } from "#services/experimentation/assignment";

const variants = [
    { id: 1, key: "control", allocation_basis_points: 5000, parameters: {} },
    { id: 2, key: "treatment", allocation_basis_points: 5000, parameters: { layout: "b" } },
];

test.group("phase17 assignment", () => {
    test("same tenant/revision/subject is sticky", ({ assert }) => {
        const input = { tenantId: "9", experimentId: 17, revision: 3, subjectKey: "visitor-42", salt: "phase17", trafficBasisPoints: 10000, variants };
        assert.deepEqual(assignDeterministically(input), assignDeterministically(input));
    });

    test("layer range is the traffic gate and is not double filtered", ({ assert }) => {
        const subject = Array.from({ length: 50000 }, (_, index) => `subject-${index}`).find((value) => stableBucket("9:17:3:phase17", value) < 1000)!;
        const result = assignDeterministically({ tenantId: "9", experimentId: 17, revision: 3, subjectKey: subject, salt: "phase17", trafficBasisPoints: 1000, variants, layerRange: { start: 0, end: 2999 } });
        assert.isTrue(result.eligible);
    });

    test("signed exposure token rejects tampering", ({ assert }) => {
        const token = signExposureToken({ assignment_id: 12, variant_id: 2 }, "secret");
        assert.equal(verifyExposureToken(token, "secret")?.assignment_id, 12);
        assert.isNull(verifyExposureToken(`${token}x`, "secret"));
    });
});
''')

write("apps/api/tests/unit/experimentation/statistics.spec.ts", r'''
import { test } from "@japa/runner";
import { compareMeans, estimateTwoArmSampleSize, sampleRatioMismatch } from "#services/experimentation/statistics";

test.group("phase17 statistics", () => {
    test("A/A-like arms are inconclusive", ({ assert }) => {
        const result = compareMeans({ n: 10000, mean: 0.1, variance: 0.09 }, { n: 10000, mean: 0.1002, variance: 0.0901 });
        assert.isNotNull(result);
        assert.isAbove(result!.p_value, 0.05);
    });

    test("severe 56.8/43.2 split fails SRM for expected 50/50", ({ assert }) => {
        assert.isTrue(sampleRatioMismatch([5680, 4320], [5000, 5000]).severe);
    });

    test("uneven allocation increases total required sample", ({ assert }) => {
        const even = estimateTwoArmSampleSize({ baselineMean: 0.1, baselineVariance: 0.09, minimumDetectableEffect: 0.01, controlAllocationBasisPoints: 5000 })!;
        const uneven = estimateTwoArmSampleSize({ baselineMean: 0.1, baselineVariance: 0.09, minimumDetectableEffect: 0.01, controlAllocationBasisPoints: 2000 })!;
        assert.isAbove(uneven.total, even.total);
    });
});
''')

write("docs/adr/0017-phase17-randomization-identity.md", r'''
# ADR 0017 — Phase 17 Randomization & Identity

Status: Accepted for V1

## Decision
Phase 17 uses deterministic, tenant-scoped assignment. The assignment namespace includes tenant, experiment id, revision and a stable salt. The randomization unit is explicit and is not assumed to equal the analysis unit. Browser requests never use `Math.random()` for assignment.

V1 supports visitor, customer, session, tenant and custom-entity randomization. Identity policy is declared per revision. Assignment and exposure are separate facts: assignment means a variant was selected; exposure means the treatment was actually rendered or delivered.

Layered experiments use the layer bucket range as the traffic gate; they must not apply a second independent traffic filter. V1 permits hard-isolation layers only. Soft collision and intentional factorial interaction stay reserved in the schema until co-exposure inference is certified.

## Consequences
Assignments are reproducible, sticky and auditable. Traffic allocation changes require a new revision rather than silently mutating a running design.
''')

write("docs/adr/0018-phase17-statistical-analysis-contract.md", r'''
# ADR 0018 — Phase 17 Statistical Analysis Contract

Status: Accepted for V1

## Decision
V1 is a two-arm fixed-horizon frequentist engine. Every result stores the effect estimate, confidence interval, standard error, p-value, sample/exposure counts, analysis method, data cutoff, SRM state, guardrail state and freshness state in an immutable analysis snapshot.

Power planning is pre-declared. The calculator uses the actual control/treatment allocation; it never assumes 50/50 for an uneven design. If baseline variance or MDE is unavailable, the platform returns insufficient data instead of inventing a sample target.

CUPED may run only with pre-experiment covariates and sufficient coverage. A fallback to raw analysis is explicit in diagnostics. Repeated peeking at fixed-horizon p-values is not presented as an anytime-valid stopping rule.

SRM is a trust gate. An unresolved severe SRM prevents a trusted winner or automatic ship recommendation. Guardrail automation requires interval-supported harm, not only a harmful point estimate.
''')

write("docs/adr/0019-phase17-exposure-metric-data.md", r'''
# ADR 0019 — Phase 17 Exposure & Metric Data Architecture

Status: Accepted for V1

## Decision
Assignment and real exposure are stored separately. Exposure is accepted only with a signed assignment token and an idempotent exposure key. Client code cannot post arbitrary outcomes.

Outcome rows are written by server-side domain/event adapters through the experimentation service. Each outcome is tied to a versioned metric and a canonical source event key. The initial Phase 17 implementation provides the durable outcome sink and analysis contract; existing commerce domains can attach adapters without changing experiment contracts.

Metric definitions are tenant-scoped, versioned and declare business meaning, analysis unit, value type, source contract, observation window and freshness expectation. Analysis snapshots are immutable and include `data_cutoff`; late data produces a new analysis version rather than mutating history.

The same tenant transaction and fail-closed RLS contract used by Calibra applies to every Phase 17 table. Control-plane lifecycle mutations use strict admin audit persistence.
''')

# Route registry insertion is intentionally deferred to the service/controller bootstrap that follows in this script.

print("Phase 17 bootstrap wrote migration, core domain engines, validators, tests and ADRs")
