import { createHash, randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type User from "#models/user";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const RUNNER_VERSION = "synthetic-commerce-v1.0.0";
const RECOMMENDED_PERSONAS = [
    "new-buyer",
    "returning-loyal",
    "expert-technical",
    "price-sensitive",
    "urgent-buyer",
    "b2b-like",
    "mobile-low-bandwidth",
    "fa-typo-heavy-search",
    "accessibility",
    "suspicious-bot",
    "legitimate-ai-shopping-agent",
];
const CRITICAL_JOURNEY = [
    "homepage",
    "search",
    "pdp",
    "cart",
    "checkout",
    "payment",
    "fulfillment-promise",
    "support",
];

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function hash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function tenantId() {
    return Number(currentTenantId());
}

async function environmentByPublicId(publicId: string) {
    return currentTrx()
        .from("synthetic_commerce_environments")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
}

async function assertSyntheticEnvironment(publicId: string) {
    const environment = await environmentByPublicId(publicId);
    if (!environment) {
        throw new Exception("Synthetic environment not found", {
            status: 404,
            code: "E_SYNTHETIC_ENV_NOT_FOUND",
        });
    }
    const prefix = `synthetic:${tenantId()}:`;
    if (
        !environment.is_synthetic ||
        environment.provider_mode !== "stubbed" ||
        environment.analytics_mode !== "isolated" ||
        !String(environment.namespace).startsWith(prefix)
    ) {
        throw new Exception("Synthetic environment isolation boundary rejected", {
            status: 409,
            code: "E_SYNTHETIC_ISOLATION_REQUIRED",
        });
    }
    return environment;
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [environments, personas, scenarios, runs, aggregate, latestRuns] = await Promise.all([
        trx.from("synthetic_commerce_environments").where("tenant_id", tenant).count("* as c").first(),
        trx.from("synthetic_commerce_personas").where("tenant_id", tenant).count("* as c").first(),
        trx.from("synthetic_commerce_scenarios").where("tenant_id", tenant).count("* as c").first(),
        trx.from("synthetic_commerce_runs").where("tenant_id", tenant).count("* as c").first(),
        trx
            .from("synthetic_commerce_runs")
            .where("tenant_id", tenant)
            .whereIn("status", ["passed", "failed", "blocked"])
            .select(
                trx.raw("COALESCE(AVG(journey_coverage),0)::numeric AS coverage"),
                trx.raw("COALESCE(SUM(failed_gates),0)::integer AS regressions"),
                trx.raw("COALESCE(SUM(false_alarm_gates),0)::integer AS false_alarms"),
                trx.raw("COALESCE(SUM(total_gates),0)::integer AS total_gates"),
                trx.raw("COALESCE(SUM(passed_gates),0)::integer AS passed_gates"),
            )
            .first(),
        trx.from("synthetic_commerce_runs").where("tenant_id", tenant).orderBy("created_at", "desc").limit(8),
    ]);
    const totalGates = Number(aggregate?.total_gates ?? 0);
    return {
        runner_version: RUNNER_VERSION,
        isolation: {
            synthetic_only: true,
            providers: "stubbed",
            analytics: "isolated",
            production_mutation: false,
        },
        counts: {
            environments: Number(environments?.c ?? 0),
            personas: Number(personas?.c ?? 0),
            scenarios: Number(scenarios?.c ?? 0),
            runs: Number(runs?.c ?? 0),
        },
        metrics: {
            journey_coverage: Number(aggregate?.coverage ?? 0),
            regressions_caught: Number(aggregate?.regressions ?? 0),
            false_alarms: Number(aggregate?.false_alarms ?? 0),
            gate_pass_rate: totalGates > 0 ? Number(aggregate?.passed_gates ?? 0) / totalGates : 0,
        },
        recommended_personas: RECOMMENDED_PERSONAS,
        critical_journey: CRITICAL_JOURNEY,
        latest_runs: latestRuns,
    };
}

export async function listEnvironments() {
    return currentTrx()
        .from("synthetic_commerce_environments")
        .where("tenant_id", tenantId())
        .orderBy("updated_at", "desc");
}

export async function createEnvironment(input: { name: string }, actor: User) {
    const trx = currentTrx();
    const tenant = tenantId();
    const publicId = randomUUID();
    const now = DateTime.utc().toSQL();
    const rows = await trx
        .table("synthetic_commerce_environments")
        .insert({
            public_id: publicId,
            tenant_id: tenant,
            name: input.name,
            namespace: `synthetic:${tenant}:${publicId}`,
            status: "active",
            is_synthetic: true,
            provider_mode: "stubbed",
            analytics_mode: "isolated",
            created_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function listPersonas() {
    return currentTrx()
        .from("synthetic_commerce_personas")
        .where("tenant_id", tenantId())
        .orderBy("updated_at", "desc");
}

export async function createPersona(
    input: {
        name: string;
        archetype: string;
        locale?: string;
        device_profile?: string;
        network_profile?: string;
        behavior_profile?: Record<string, unknown>;
        accessibility_profile?: Record<string, unknown>;
    },
    actor: User,
) {
    const now = DateTime.utc().toSQL();
    const rows = await currentTrx()
        .table("synthetic_commerce_personas")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            name: input.name,
            archetype: input.archetype,
            locale: input.locale ?? "fa-IR",
            device_profile: input.device_profile ?? "desktop",
            network_profile: input.network_profile ?? "normal",
            behavior_profile: JSON.stringify(input.behavior_profile ?? {}),
            accessibility_profile: JSON.stringify(input.accessibility_profile ?? {}),
            version: 1,
            active: true,
            created_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function listSeeds() {
    return currentTrx()
        .from("synthetic_commerce_seed_versions")
        .where("tenant_id", tenantId())
        .orderBy("created_at", "desc");
}

export async function createSeed(
    input: {
        environment_public_id: string;
        name: string;
        seed: number;
        fixture_manifest: Record<string, unknown>;
    },
    actor: User,
) {
    const trx = currentTrx();
    const environment = await assertSyntheticEnvironment(input.environment_public_id);
    const latest = await trx
        .from("synthetic_commerce_seed_versions")
        .where({ tenant_id: tenantId(), environment_id: environment.id, name: input.name })
        .max("version as version")
        .first();
    const version = Number(latest?.version ?? 0) + 1;
    const rows = await trx
        .table("synthetic_commerce_seed_versions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            environment_id: environment.id,
            name: input.name,
            version,
            seed: input.seed,
            fixture_hash: hash({ seed: input.seed, manifest: input.fixture_manifest }),
            fixture_manifest: JSON.stringify(input.fixture_manifest),
            status: "draft",
            created_by_user_id: actor.id,
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return rows[0];
}

export async function freezeSeed(publicId: string) {
    const trx = currentTrx();
    const seed = await trx
        .from("synthetic_commerce_seed_versions")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!seed) {
        throw new Exception("Synthetic seed not found", {
            status: 404,
            code: "E_SYNTHETIC_SEED_NOT_FOUND",
        });
    }
    await trx
        .from("synthetic_commerce_seed_versions")
        .where({ tenant_id: tenantId(), id: seed.id })
        .update({ status: "frozen", frozen_at: DateTime.utc().toSQL() });
    return trx.from("synthetic_commerce_seed_versions").where({ tenant_id: tenantId(), id: seed.id }).first();
}

export async function listScenarios() {
    const trx = currentTrx();
    return trx
        .from("synthetic_commerce_scenarios as s")
        .leftJoin("synthetic_commerce_personas as p", "p.id", "s.persona_id")
        .leftJoin("synthetic_commerce_seed_versions as sv", "sv.id", "s.seed_version_id")
        .where("s.tenant_id", tenantId())
        .select(
            "s.*",
            "p.name as persona_name",
            "p.archetype as persona_archetype",
            "sv.name as seed_name",
            "sv.version as seed_version",
        )
        .orderBy("s.updated_at", "desc");
}

export async function createScenario(
    input: {
        environment_public_id: string;
        persona_public_id: string;
        seed_public_id: string;
        title: string;
        journey_key: string;
        steps: string[];
        gate_policy?: Record<string, unknown>;
    },
    actor: User,
) {
    const trx = currentTrx();
    const environment = await assertSyntheticEnvironment(input.environment_public_id);
    const [persona, seed] = await Promise.all([
        trx
            .from("synthetic_commerce_personas")
            .where({ tenant_id: tenantId(), public_id: input.persona_public_id, active: true })
            .first(),
        trx
            .from("synthetic_commerce_seed_versions")
            .where({
                tenant_id: tenantId(),
                public_id: input.seed_public_id,
                environment_id: environment.id,
                status: "frozen",
            })
            .first(),
    ]);
    if (!persona) {
        throw new Exception("Synthetic persona not found", {
            status: 404,
            code: "E_SYNTHETIC_PERSONA_NOT_FOUND",
        });
    }
    if (!seed) {
        throw new Exception("A frozen seed version from the same synthetic environment is required", {
            status: 409,
            code: "E_SYNTHETIC_FROZEN_SEED_REQUIRED",
        });
    }
    const now = DateTime.utc().toSQL();
    const rows = await trx
        .table("synthetic_commerce_scenarios")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            environment_id: environment.id,
            persona_id: persona.id,
            seed_version_id: seed.id,
            title: input.title,
            journey_key: input.journey_key,
            steps: JSON.stringify(input.steps),
            gate_policy: JSON.stringify(input.gate_policy ?? {}),
            status: "ready",
            version: 1,
            created_by_user_id: actor.id,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function listRuns() {
    const trx = currentTrx();
    return trx
        .from("synthetic_commerce_runs as r")
        .leftJoin("synthetic_commerce_scenarios as s", "s.id", "r.scenario_id")
        .where("r.tenant_id", tenantId())
        .select("r.*", "s.title as scenario_title", "s.journey_key")
        .orderBy("r.created_at", "desc")
        .limit(100);
}

export async function queueRun(scenarioPublicId: string, actor: User) {
    const trx = currentTrx();
    const scenario = await trx
        .from("synthetic_commerce_scenarios")
        .where({ tenant_id: tenantId(), public_id: scenarioPublicId, status: "ready" })
        .first();
    if (!scenario) {
        throw new Exception("Synthetic scenario not found", {
            status: 404,
            code: "E_SYNTHETIC_SCENARIO_NOT_FOUND",
        });
    }
    const environment = await trx
        .from("synthetic_commerce_environments")
        .where({ tenant_id: tenantId(), id: scenario.environment_id })
        .first();
    if (!environment) {
        throw new Exception("Synthetic environment not found", {
            status: 404,
            code: "E_SYNTHETIC_ENV_NOT_FOUND",
        });
    }
    await assertSyntheticEnvironment(environment.public_id);
    const seed = await trx
        .from("synthetic_commerce_seed_versions")
        .where({ tenant_id: tenantId(), id: scenario.seed_version_id, status: "frozen" })
        .first();
    if (!seed) {
        throw new Exception("Synthetic run requires a frozen seed version", {
            status: 409,
            code: "E_SYNTHETIC_FROZEN_SEED_REQUIRED",
        });
    }
    const inputHash = hash({
        scenario: scenario.public_id,
        version: scenario.version,
        seed: seed.fixture_hash,
        runner: RUNNER_VERSION,
    });
    const existing = await trx
        .from("synthetic_commerce_runs")
        .where({
            tenant_id: tenantId(),
            scenario_id: scenario.id,
            scenario_version: scenario.version,
            seed_version_id: seed.id,
            input_hash: inputHash,
        })
        .first();
    if (existing) return runDetail(existing.public_id);
    const rows = await trx
        .table("synthetic_commerce_runs")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            environment_id: environment.id,
            scenario_id: scenario.id,
            scenario_version: scenario.version,
            seed_version_id: seed.id,
            runner_version: RUNNER_VERSION,
            input_hash: inputHash,
            status: "queued",
            created_by_user_id: actor.id,
            created_at: DateTime.utc().toSQL(),
        })
        .returning("*");
    return {
        ...rows[0],
        isolation_namespace: environment.namespace,
        fixture_hash: seed.fixture_hash,
    };
}

export async function runDetail(publicId: string) {
    const trx = currentTrx();
    const run = await trx
        .from("synthetic_commerce_runs")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!run) {
        throw new Exception("Synthetic run not found", {
            status: 404,
            code: "E_SYNTHETIC_RUN_NOT_FOUND",
        });
    }
    const [gates, artifacts] = await Promise.all([
        trx
            .from("synthetic_commerce_gate_results")
            .where({ tenant_id: tenantId(), run_id: run.id })
            .orderBy("id"),
        trx
            .from("synthetic_commerce_artifacts")
            .where({ tenant_id: tenantId(), run_id: run.id })
            .orderBy("id"),
    ]);
    return { ...run, gates, artifacts };
}

export async function reportRun(
    publicId: string,
    input: {
        journey_coverage: number;
        gates: Array<Record<string, unknown>>;
        artifacts?: Array<Record<string, unknown>>;
    },
) {
    const trx = currentTrx();
    const run = await trx
        .from("synthetic_commerce_runs")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!run) {
        throw new Exception("Synthetic run not found", {
            status: 404,
            code: "E_SYNTHETIC_RUN_NOT_FOUND",
        });
    }
    if (!["queued", "running"].includes(run.status)) {
        throw new Exception("Synthetic run is immutable after completion", {
            status: 409,
            code: "E_SYNTHETIC_RUN_IMMUTABLE",
        });
    }
    const environment = await trx
        .from("synthetic_commerce_environments")
        .where({ tenant_id: tenantId(), id: run.environment_id })
        .first();
    if (!environment) {
        throw new Exception("Synthetic environment not found", {
            status: 404,
            code: "E_SYNTHETIC_ENV_NOT_FOUND",
        });
    }
    await assertSyntheticEnvironment(environment.public_id);

    const now = DateTime.utc().toSQL();
    const gateIds = new Map<string, number>();
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let falseAlarms = 0;
    for (const gate of input.gates) {
        const status = String(gate.status);
        if (status === "pass") passed += 1;
        if (status === "fail") failed += 1;
        if (status === "blocked") blocked += 1;
        if (gate.is_false_alarm === true) falseAlarms += 1;
        const rows = await trx
            .table("synthetic_commerce_gate_results")
            .insert({
                tenant_id: tenantId(),
                run_id: run.id,
                gate_key: gate.gate_key,
                category: gate.category,
                severity: gate.severity,
                status,
                expected: gate.expected,
                observed: gate.observed ?? null,
                evidence: JSON.stringify(gate.evidence ?? {}),
                is_false_alarm: gate.is_false_alarm ?? false,
                created_at: now,
            })
            .returning(["id", "gate_key"]);
        gateIds.set(String(rows[0].gate_key), Number(rows[0].id));
    }

    for (const artifact of input.artifacts ?? []) {
        const storageKey = String(artifact.storage_key);
        if (!storageKey.startsWith(`phase24/${publicId}/`)) {
            throw new Exception("Artifact storage key must stay inside the Phase 24 run namespace", {
                status: 422,
                code: "E_SYNTHETIC_ARTIFACT_NAMESPACE",
            });
        }
        await trx.table("synthetic_commerce_artifacts").insert({
            public_id: randomUUID(),
            tenant_id: tenantId(),
            run_id: run.id,
            gate_result_id: artifact.gate_key ? gateIds.get(String(artifact.gate_key)) ?? null : null,
            kind: artifact.kind,
            name: artifact.name,
            storage_key: storageKey,
            checksum_sha256: artifact.checksum_sha256,
            mime_type: artifact.mime_type,
            metadata: JSON.stringify(artifact.metadata ?? {}),
            created_at: now,
        });
    }

    const finalStatus = failed > 0 ? "failed" : blocked > 0 ? "blocked" : "passed";
    await trx
        .from("synthetic_commerce_runs")
        .where({ tenant_id: tenantId(), id: run.id })
        .update({
            status: finalStatus,
            total_gates: input.gates.length,
            passed_gates: passed,
            failed_gates: failed,
            blocked_gates: blocked,
            false_alarm_gates: falseAlarms,
            journey_coverage: input.journey_coverage,
            started_at: run.started_at ?? now,
            completed_at: now,
        });
    return runDetail(publicId);
}
