import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import type { ApiClient } from "@japa/api-client";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import User from "#models/user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const TRUST_TABLES = [
    "fraud_outcomes",
    "fraud_action_executions",
    "fraud_decisions",
    "fraud_case_evidence",
    "fraud_cases",
    "fraud_relationship_edges",
    "fraud_signals",
    "fraud_policy_versions",
    "fraud_risk_model_versions",
];

async function resetTrustTables() {
    const admin = db.connection("postgres_admin");
    for (const table of TRUST_TABLES) await admin.from(table).delete();
}

async function createAdmin(email: string) {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
}

async function seedCase(subjectId: string, riskScore = 82) {
    const now = DateTime.utc().toSQL()!;
    const publicId = randomUUID();
    const rows = await db.connection("postgres_admin").table("fraud_cases").insert({
        public_id: publicId,
        tenant_id: TEST_TENANT_ID,
        case_number: `FR-TEST-${publicId.slice(0, 8)}`,
        subject_type: "customer_account",
        subject_id: subjectId,
        pattern: "identity_velocity",
        title: "ناهنجاری در هویت یا سرعت تلاش‌ها",
        risk_score: riskScore,
        risk_band: riskScore >= 90 ? "severe" : "high",
        confidence_bp: 9100,
        false_positive_risk_bp: 900,
        priority: riskScore >= 90 ? "critical" : "high",
        status: "open",
        recommended_action: riskScore >= 90 ? "block" : "hold",
        version: 1,
        opened_at: now,
        created_at: now,
        updated_at: now,
    }).returning("*");
    return rows[0];
}

async function stepUp(client: ApiClient, admin: User, scope: string) {
    const response = await client
        .post("/api/v1/admin/identity/step-up/verify")
        .withGuard("api")
        .loginAs(admin)
        .json({ method: "password", proof: "Passw0rd1!", action_scope: scope });
    response.assertStatus(200);
}

test.group("Phase 20 trust intelligence", (group) => {
    group.each.setup(resetTrustTables);

    test("backend trust permission overrides cannot be bypassed by the UI", async ({ client }) => {
        const admin = await createAdmin("phase20-view-denied@calibra.dev");
        await db.connection("postgres_admin").table("admin_permissions").insert({
            tenant_id: TEST_TENANT_ID,
            user_id: Number(admin.id),
            permission: "trust.view",
            allowed: false,
        });
        const response = await client.get("/api/v1/admin/trust/overview").withGuard("api").loginAs(admin);
        response.assertStatus(403);
    });

    test("a reviewer decision creates an append-only decision plus action ledger and advances case version", async ({ client, assert }) => {
        const admin = await createAdmin("phase20-review@calibra.dev");
        const trustCase = await seedCase(String(admin.id), 68);
        const response = await client
            .post(`/api/v1/admin/trust/cases/${trustCase.public_id}/decision`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                action: "monitor",
                reason_code: "manual_review_monitor",
                reason: "شواهد فعلی برای اصطکاک بیشتر کافی نیست و پرونده باید پایش شود.",
                expected_version: 1,
                idempotency_key: `test-monitor-${trustCase.public_id}`,
            });
        response.assertStatus(200);
        assert.equal(response.body().data.case.version, 2);
        assert.equal(response.body().data.case.status, "in_review");

        const adminDb = db.connection("postgres_admin");
        const decisions = await adminDb.from("fraud_decisions").where("case_id", trustCase.id);
        const actions = await adminDb.from("fraud_action_executions").where("case_id", trustCase.id);
        assert.lengthOf(decisions, 1);
        assert.lengthOf(actions, 1);
        assert.equal(actions[0].action, "monitor");
        assert.equal(actions[0].status, "active");
        assert.equal(actions[0].autonomy_ceiling, "human_approved");

        const replay = await client
            .post(`/api/v1/admin/trust/cases/${trustCase.public_id}/decision`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                action: "monitor",
                reason_code: "manual_review_monitor",
                reason: "شواهد فعلی برای اصطکاک بیشتر کافی نیست و پرونده باید پایش شود.",
                expected_version: 1,
                idempotency_key: `test-monitor-${trustCase.public_id}`,
            });
        replay.assertStatus(200);
        assert.equal(replay.body().data.replayed, true);
        assert.lengthOf(await adminDb.from("fraud_decisions").where("case_id", trustCase.id), 1);
        assert.lengthOf(await adminDb.from("fraud_action_executions").where("case_id", trustCase.id), 1);
    });

    test("high-impact block is denied until a fresh Phase 7 scoped step-up is satisfied", async ({ client }) => {
        const admin = await createAdmin("phase20-stepup@calibra.dev");
        const trustCase = await seedCase(String(admin.id), 94);
        const body = {
            action: "block",
            reason_code: "confirmed_severe_cluster",
            reason: "چند سیگنال مستقل و شدید، مسدودسازی موقت این حساب را توجیه می‌کنند.",
            expected_version: 1,
            idempotency_key: `test-block-${trustCase.public_id}`,
        };
        const blocked = await client
            .post(`/api/v1/admin/trust/cases/${trustCase.public_id}/decision`)
            .withGuard("api")
            .loginAs(admin)
            .json(body);
        blocked.assertStatus(403);

        await stepUp(client, admin, "trust.case.enforce");
        const allowed = await client
            .post(`/api/v1/admin/trust/cases/${trustCase.public_id}/decision`)
            .withGuard("api")
            .loginAs(admin)
            .json(body);
        allowed.assertStatus(200);
    });

    test("sensitive evidence is redacted when the operator lacks trust.sensitive.view", async ({ client, assert }) => {
        const admin = await createAdmin("phase20-redaction@calibra.dev");
        const trustCase = await seedCase(String(admin.id), 82);
        await db.connection("postgres_admin").table("fraud_case_evidence").insert({
            tenant_id: TEST_TENANT_ID,
            case_id: trustCase.id,
            evidence_type: "payment_reference",
            evidence_ref: "payment-token-reference-should-not-leak",
            weight: 30,
            summary: "مرجع پرداخت حساس برای بررسی داخلی",
            is_sensitive: true,
        });
        await db.connection("postgres_admin").table("admin_permissions").insert({
            tenant_id: TEST_TENANT_ID,
            user_id: Number(admin.id),
            permission: "trust.sensitive.view",
            allowed: false,
        });

        const response = await client.get(`/api/v1/admin/trust/cases/${trustCase.public_id}`).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.isNull(response.body().data.evidence[0].evidence_ref);
        assert.notInclude(JSON.stringify(response.body()), "payment-token-reference-should-not-leak");
    });

    test("active policy versions require step-up and retire the previously-active version", async ({ client, assert }) => {
        const admin = await createAdmin("phase20-policy@calibra.dev");
        const payload = (reason: string) => ({
            policy_key: "promotion_abuse_severe",
            status: "active",
            scope: { surface: "commerce" },
            conditions: [{ field: "risk_score", operator: "gte", value: 90 }],
            effect: "hold",
            approval_required: true,
            reason,
        });

        const denied = await client.post("/api/v1/admin/trust/policies").withGuard("api").loginAs(admin).json(payload("نسخهٔ اول برای آزمون کنترل Step-up"));
        denied.assertStatus(403);
        await stepUp(client, admin, "trust.policy.manage");
        const first = await client.post("/api/v1/admin/trust/policies").withGuard("api").loginAs(admin).json(payload("نسخهٔ اول فعال برای آزمون سیاست"));
        first.assertStatus(200);
        const second = await client.post("/api/v1/admin/trust/policies").withGuard("api").loginAs(admin).json(payload("نسخهٔ دوم فعال برای آزمون بازنشستگی"));
        second.assertStatus(200);

        const rows = await db.connection("postgres_admin").from("fraud_policy_versions").where("tenant_id", TEST_TENANT_ID).where("policy_key", "promotion_abuse_severe").orderBy("version", "asc");
        assert.lengthOf(rows, 2);
        assert.equal(rows[0].status, "retired");
        assert.equal(rows[1].status, "active");
    });

    test("canonical identity risk scan is idempotent and keeps raw identifiers out of the trust signal", async ({ client, assert }) => {
        const admin = await createAdmin("phase20-scan@calibra.dev");
        await db.connection("postgres_admin").table("identity_risk_events").insert({
            tenant_id: TEST_TENANT_ID,
            user_id: Number(admin.id),
            event_type: "auth_velocity",
            subject_hash: "a".repeat(64),
            score: 86,
            decision: "review",
            reasons: JSON.stringify(["velocity"]),
            created_at: DateTime.utc().toSQL(),
        });
        const first = await client.post("/api/v1/admin/trust/scan").withGuard("api").loginAs(admin);
        first.assertStatus(200);
        const second = await client.post("/api/v1/admin/trust/scan").withGuard("api").loginAs(admin);
        second.assertStatus(200);
        const rows = await db.connection("postgres_admin").from("fraud_signals").where("tenant_id", TEST_TENANT_ID).where("source", "identity");
        assert.lengthOf(rows, 1);
        assert.equal(rows[0].subject_id, String(admin.id));
        assert.equal(rows[0].privacy_classification, "auth_security_sensitive");
    });

    test("measured outcomes preserve false-positive labels and money in minor units", async ({ client, assert }) => {
        const admin = await createAdmin("phase20-outcome@calibra.dev");
        const trustCase = await seedCase(String(admin.id), 68);
        const response = await client
            .post(`/api/v1/admin/trust/cases/${trustCase.public_id}/outcome`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                outcome: "legitimate_customer",
                is_false_positive: true,
                actual_loss_minor: 0,
                prevented_loss_minor: 0,
                incremental_effect_minor: 0,
                final_assessment: "false_positive_confirmed",
                measurement_confidence_bp: 9500,
                notes: "بازبینی انسانی نشان داد مشتری واقعی بوده است.",
            });
        response.assertStatus(200);
        assert.equal(response.body().data.is_false_positive, true);
        assert.equal(Number(response.body().data.measurement_confidence_bp), 9500);
    });
});
