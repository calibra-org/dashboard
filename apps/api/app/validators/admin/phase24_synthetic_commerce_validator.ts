import vine from "@vinejs/vine";

const publicId = vine.string().uuid();

export const createSyntheticEnvironmentValidator = vine.compile(
    vine.object({ name: vine.string().trim().minLength(3).maxLength(160) }),
);

export const createSyntheticPersonaValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(3).maxLength(160),
        archetype: vine.string().trim().minLength(3).maxLength(64),
        locale: vine.string().trim().maxLength(16).optional(),
        device_profile: vine.enum(["desktop", "mobile", "tablet"]).optional(),
        network_profile: vine.enum(["normal", "slow-4g", "low-bandwidth"]).optional(),
        behavior_profile: vine.record(vine.any()).optional(),
        accessibility_profile: vine.record(vine.any()).optional(),
    }),
);

export const createSyntheticSeedValidator = vine.compile(
    vine.object({
        environment_public_id: publicId,
        name: vine.string().trim().minLength(3).maxLength(160),
        seed: vine.number().min(1).max(2147483647),
        fixture_manifest: vine.record(vine.any()),
    }),
);

export const createSyntheticScenarioValidator = vine.compile(
    vine.object({
        environment_public_id: publicId,
        persona_public_id: publicId,
        seed_public_id: publicId,
        title: vine.string().trim().minLength(3).maxLength(180),
        journey_key: vine.string().trim().minLength(3).maxLength(80),
        steps: vine.array(vine.string().trim().minLength(2).maxLength(80)).minLength(1).maxLength(24),
        gate_policy: vine.record(vine.any()).optional(),
    }),
);

export const reportSyntheticRunValidator = vine.compile(
    vine.object({
        journey_coverage: vine.number().min(0).max(1),
        gates: vine
            .array(
                vine.object({
                    gate_key: vine.string().trim().minLength(3).maxLength(96),
                    category: vine.string().trim().minLength(3).maxLength(64),
                    severity: vine.enum(["info", "low", "medium", "high", "critical"]),
                    status: vine.enum(["pass", "fail", "blocked"]),
                    expected: vine.string().trim().minLength(1).maxLength(2000),
                    observed: vine.string().trim().maxLength(4000).nullable().optional(),
                    evidence: vine.record(vine.any()).optional(),
                    is_false_alarm: vine.boolean().optional(),
                }),
            )
            .minLength(1)
            .maxLength(128),
        artifacts: vine
            .array(
                vine.object({
                    gate_key: vine.string().trim().maxLength(96).nullable().optional(),
                    kind: vine.enum(["screenshot", "trace", "log", "network", "snapshot"]),
                    name: vine.string().trim().minLength(1).maxLength(180),
                    storage_key: vine.string().trim().minLength(3).maxLength(512),
                    checksum_sha256: vine.string().trim().fixedLength(64),
                    mime_type: vine.string().trim().minLength(3).maxLength(96),
                    metadata: vine.record(vine.any()).optional(),
                }),
            )
            .maxLength(256)
            .optional(),
    }),
);
