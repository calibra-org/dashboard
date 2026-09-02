import vine from "@vinejs/vine";

const reason = vine.string().trim().minLength(3).maxLength(2000);
const jsonRecord = vine.record(vine.any());
const language = vine.enum(["typescript", "javascript", "css", "html", "json"] as const);
const runtime = vine.enum(["storefront", "admin", "server", "worker", "build"] as const);
const risk = vine.enum(["low", "medium", "high", "critical"] as const);
const environment = vine.enum(["preview", "staging", "production"] as const);
const outcome = vine.enum(["success", "failure", "skipped", "blocked"] as const);
const snippetKey = vine
    .string()
    .trim()
    .minLength(2)
    .maxLength(120)
    .regex(/^[a-z0-9._~-]+$/);

export const snippetCreateValidator = vine.compile(
    vine.object({
        snippet_key: snippetKey,
        name: vine.string().trim().minLength(2).maxLength(190),
        description: vine.string().trim().maxLength(4000).optional(),
        language,
        runtime,
        placement: vine.string().trim().minLength(2).maxLength(80),
        risk_level: risk,
        source: vine.string(),
        conditions: jsonRecord,
        capabilities: vine.array(vine.string().trim().minLength(1).maxLength(120)),
        reason,
    }),
);

export const snippetUpdateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(190).optional(),
        description: vine.string().trim().maxLength(4000).optional(),
        language: language.optional(),
        runtime: runtime.optional(),
        placement: vine.string().trim().minLength(2).maxLength(80).optional(),
        risk_level: risk.optional(),
        source: vine.string().optional(),
        conditions: jsonRecord.optional(),
        capabilities: vine.array(vine.string().trim().minLength(1).maxLength(120)).optional(),
        reason,
    }),
);

export const snippetPublishValidator = vine.compile(
    vine.object({
        environment,
        rollout_percent: vine.number().min(1).max(100).withoutDecimals(),
        idempotency_key: vine.string().trim().minLength(8).maxLength(190),
        reason,
    }),
);

export const snippetActionValidator = vine.compile(vine.object({ reason }));

export const snippetRollbackValidator = vine.compile(
    vine.object({
        revision: vine.number().min(1).withoutDecimals(),
        environment,
        rollout_percent: vine.number().min(1).max(100).withoutDecimals(),
        idempotency_key: vine.string().trim().minLength(8).maxLength(190),
        reason,
    }),
);

export const snippetSimulationValidator = vine.compile(vine.object({ context: jsonRecord }));

export const snippetExecutionObservationValidator = vine.compile(
    vine.object({
        snippet_public_id: vine.string().trim().uuid(),
        consumer_key: vine.string().trim().minLength(2).maxLength(120),
        outcome,
        duration_ms: vine.number().min(0).max(3_600_000).withoutDecimals().optional(),
        request_id: vine.string().trim().maxLength(120).optional(),
        evidence: jsonRecord,
    }),
);

export const snippetSettingsValidator = vine.compile(
    vine.object({
        production_publish_requires_step_up: vine.boolean().optional(),
        auto_quarantine_threshold: vine.number().min(1).max(20).withoutDecimals().optional(),
        default_environment: environment.optional(),
        max_rollout_percent: vine.number().min(1).max(100).withoutDecimals().optional(),
        reason,
    }),
);

export const snippetSafeModeValidator = vine.compile(vine.object({ reason }));
