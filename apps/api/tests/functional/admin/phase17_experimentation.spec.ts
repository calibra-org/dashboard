import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import User from "#models/user";

const TABLES = [
    "experiment_causal_knowledge",
    "experiment_holdout_memberships",
    "experiment_holdouts",
    "experiment_analysis_runs",
    "experiment_metric_observations",
    "experiment_exposures",
    "experiment_assignments",
    "experiment_variants",
    "experiments",
] as const;

async function resetExperiments() {
    const admin = db.connection("postgres_admin");
    for (const table of TABLES) await admin.from(table).delete();
}

async function createAdmin() {
    return User.create({
        email: `phase17-${Date.now()}-${Math.random().toString(16).slice(2)}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
}

function contract(key: string, surface: "checkout" | "price" = "checkout") {
    return {
        experiment_key: key,
        name: "Phase 17 contract",
        hypothesis: "A controlled intervention can improve conversion without violating registered guardrails.",
        surface,
        risk_level: "high",
        randomization_unit: "visitor",
        layer_key: key,
        layer_start_bps: 0,
        layer_end_bps: 10000,
        primary_metric_key: "conversion",
        primary_metric_kind: "binary",
        sample_plan: { minimum_exposed_subjects: 100 },
        variants: [
            { key: "control", name: "Control", weight_bps: 5000, is_control: true },
            { key: "treatment", name: "Treatment", weight_bps: 5000 },
        ],
    };
}

test.group("Phase 17 experimentation", (group) => {
    group.each.setup(resetExperiments);

    test("protects the experiment control plane with admin authentication", async ({ client }) => {
        const response = await client.get("/api/v1/admin/experiments/overview");
        response.assertStatus(401);
    });

    test("creates a versioned experiment contract", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.post("/api/v1/admin/experiments").withGuard("api").loginAs(admin).json(contract("checkout.copy.v1"));
        response.assertStatus(201);
        assert.equal(response.body().data.status, "draft");
        assert.equal(response.body().data.variants.length, 2);
        assert.equal(response.body().data.variants.filter((variant: { is_control: boolean }) => variant.is_control).length, 1);
    });

    test("high risk experiment cannot launch without governance reference", async ({ client }) => {
        const admin = await createAdmin();
        const created = await client.post("/api/v1/admin/experiments").withGuard("api").loginAs(admin).json(contract("price.card.v1", "price"));
        created.assertStatus(201);
        const experimentId = created.body().data.id;
        const review = await client.post(`/api/v1/admin/experiments/${experimentId}/transition`).withGuard("api").loginAs(admin).json({ status: "review", expected_version: 1 });
        review.assertStatus(200);
        const launch = await client.post(`/api/v1/admin/experiments/${experimentId}/transition`).withGuard("api").loginAs(admin).json({ status: "running", expected_version: 2 });
        launch.assertStatus(422);
    });
});
