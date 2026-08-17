import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import User from "#models/user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const TABLES = [
    "intelligence_outcome_records",
    "intelligence_action_records",
    "intelligence_decisions",
    "intelligence_evidence_links",
    "intelligence_cases",
];

async function resetIntelligence() {
    const admin = db.connection("postgres_admin");
    for (const table of TABLES) await admin.from(table).delete();
}

async function createAdmin(email: string) {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
}

async function seedCase() {
    const now = DateTime.utc().toSQL()!;
    const [row] = await db
        .connection("postgres_admin")
        .table("intelligence_cases")
        .insert({
            tenant_id: TEST_TENANT_ID,
            stable_key: "test:decision-memory",
            kind: "risk",
            domain: "support",
            lifecycle_stage: "proposed",
            signal_state: "open",
            severity: "high",
            title_fa: "عبور از SLA",
            title_en: "SLA breach",
            summary_fa: "شاهد تست",
            summary_en: "Test evidence",
            recommended_action_fa: "بازبینی صف",
            recommended_action_en: "Review queue",
            action_route: "/tickets/inbox",
            signal_snapshot: JSON.stringify({ source: "test" }),
            observation_snapshot: JSON.stringify({}),
            anomaly_snapshot: JSON.stringify({}),
            urgency: 0.78,
            priority_score: 78,
            score_mode: "provisional",
            ranking_policy_version: "phase10.v1.available-components",
            score_components: JSON.stringify({ urgency: { available: true, raw: 0.78 } }),
            missing_components: JSON.stringify(["expectedValue", "confidence"]),
            freshness_at: now,
            first_seen_at: now,
            last_seen_at: now,
            version: 1,
            created_at: now,
            updated_at: now,
        })
        .returning("*");
    return row;
}

test.group("Phase 10 decision intelligence", (group) => {
    group.each.setup(resetIntelligence);

    test("records an immutable decision and creates only a human deep-link action plan", async ({ client, assert }) => {
        const admin = await createAdmin("phase10-decision@calibra.dev");
        const seeded = await seedCase();
        const response = await client
            .post(`/api/v1/admin/intelligence/cases/${seeded.id}/decisions`)
            .withGuard("api")
            .loginAs(admin)
            .json({ decision: "accept", reason: "Evidence reviewed by operator", version: 1 });
        response.assertStatus(200);

        const database = db.connection("postgres_admin");
        const decision = await database.from("intelligence_decisions").where("case_id", seeded.id).first();
        assert.equal(decision.decision, "accept");
        assert.equal(decision.case_version, 1);
        const action = await database.from("intelligence_action_records").where("case_id", seeded.id).first();
        assert.equal(action.status, "planned");
        assert.equal(action.action_kind, "deep_link");
        assert.equal(action.action_route, "/tickets/inbox");
    });

    test("rejects stale decisions with an optimistic concurrency conflict", async ({ client }) => {
        const admin = await createAdmin("phase10-conflict@calibra.dev");
        const seeded = await seedCase();
        await db.connection("postgres_admin").from("intelligence_cases").where("id", seeded.id).update({ version: 2 });
        const response = await client
            .post(`/api/v1/admin/intelligence/cases/${seeded.id}/decisions`)
            .withGuard("api")
            .loginAs(admin)
            .json({ decision: "watch", reason: "Keep monitoring", version: 1 });
        response.assertStatus(409);
    });

    test("appends a measured outcome without fabricating attribution confidence", async ({ client, assert }) => {
        const admin = await createAdmin("phase10-outcome@calibra.dev");
        const seeded = await seedCase();
        const response = await client
            .post(`/api/v1/admin/intelligence/cases/${seeded.id}/outcomes`)
            .withGuard("api")
            .loginAs(admin)
            .json({ metric_name: "sla_breach_count", baseline_value: 8, observed_value: 3, observed_at: DateTime.utc().toISO() });
        response.assertStatus(200);
        const outcome = await db
            .connection("postgres_admin")
            .from("intelligence_outcome_records")
            .where("case_id", seeded.id)
            .first();
        assert.equal(Number(outcome.delta), -5);
        assert.isNull(outcome.attribution_confidence);
        const intelligenceCase = await db.connection("postgres_admin").from("intelligence_cases").where("id", seeded.id).first();
        assert.equal(intelligenceCase.lifecycle_stage, "measured");
    });
});
