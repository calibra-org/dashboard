import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import User from "#models/user";

const TABLES = [
    "planning_approvals",
    "planning_overrides",
    "planning_scenarios",
    "planning_cycles",
    "planning_replenishment_recommendations",
    "planning_forecast_points",
    "planning_forecast_runs",
] as const;

async function resetPlanning() {
    const admin = db.connection("postgres_admin");
    for (const table of TABLES) await admin.from(table).delete();
}

async function createAdmin() {
    return User.create({
        email: `phase13-planning-${Date.now()}-${Math.random().toString(16).slice(2)}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
}

test.group("Phase 13 planning OS", (group) => {
    group.each.setup(resetPlanning);

    test("protects the planning control plane with admin authentication", async ({ client }) => {
        const response = await client.get("/api/v1/admin/planning/health");
        response.assertStatus(401);
    });

    test("discloses hard dependency and execution boundaries", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client.get("/api/v1/admin/planning/health").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().data.economics, "available_not_applied");
        assert.equal(response.body().data.procurement, "phase14_procurement_only");
        assert.equal(response.body().data.source_contract.category, "derived_from_product_category_links_same_forecast_points");
    });

    test("creates a versioned deterministic forecast run without inventing lead time", async ({ client, assert }) => {
        const admin = await createAdmin();
        const response = await client
            .post("/api/v1/admin/planning/forecast/run")
            .withGuard("api")
            .loginAs(admin)
            .json({ history_days: 28, horizon_days: 7, review_period_days: 7, service_level_target: 0.9 });
        response.assertStatus(201);

        const run = response.body().data.run;
        assert.equal(run.status, "completed");
        assert.equal(run.model_code, "calibra_weighted_seasonal_v2");
        assert.equal(run.model_version, "2.0.0");
        assert.isNull(run.default_lead_time_days);
        assert.lengthOf(run.source_hash, 64);
        assert.equal(run.dependency_state.phase12_economics, "available_not_applied");
        assert.equal(run.dependency_state.phase14_procurement, "phase14_procurement_only");

        const categories = await client
            .get(`/api/v1/admin/planning/forecast/categories?run_id=${run.id}`)
            .withGuard("api")
            .loginAs(admin);
        categories.assertStatus(200);
        assert.equal(categories.body().data.basis, "same_versioned_forecast_points");
        assert.equal(categories.body().data.classification_mode, "multi_label_taxonomy");
    });
});
