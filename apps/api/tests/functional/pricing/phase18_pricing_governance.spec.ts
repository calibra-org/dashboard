import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import User from "#models/user";
import { PRICING_PERMISSIONS } from "#services/pricing_permissions";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

let userSequence = 0;

async function createUser(role: "admin" | "customer" = "admin") {
    userSequence += 1;
    return User.create({
        email: `phase18-${role}-${userSequence}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role,
        locale: "fa",
    });
}

async function resetPricingTables() {
    const admin = db.connection("postgres_admin");
    await admin.from("pricing_order_snapshots").delete();
    await admin.from("pricing_policy_actions").delete();
    await admin.from("pricing_proposals").delete();
    await admin.from("pricing_policy_versions").delete();
    await admin.from("pricing_policies").delete();
    await admin.from("admin_permissions").whereIn("permission", [...PRICING_PERMISSIONS]).delete();
    await admin.from("admin_audit_log").where("entity_kind", "pricing_policy").delete();
}

async function createPolicy(client: Parameters<Parameters<typeof test>[1]>[0]["client"], admin: User, key: string) {
    const response = await client
        .post("/api/v1/admin/pricing-brain/policies")
        .withGuard("api")
        .loginAs(admin)
        .json({
            policy_key: key,
            name: `Policy ${key}`,
            objective: "margin_protection",
            currency: "IRR",
            guardrails: { floor_price_minor: 90_000, maximum_discount_percent: 20 },
            evidence: { source: "phase18-functional-test" },
            reason: "create governance test policy",
        });
    response.assertStatus(200);
    response.assertAgainstApiSpec();
    return response.body().data as {
        policy: { id: number };
        version: { id: number; version: number; state: string };
    };
}

async function transition(
    client: Parameters<Parameters<typeof test>[1]>[0]["client"],
    admin: User,
    policyId: number,
    action: string,
    body: Record<string, unknown>,
) {
    return client
        .post(`/api/v1/admin/pricing-brain/policies/${policyId}/actions/${action}`)
        .withGuard("api")
        .loginAs(admin)
        .json(body);
}

test.group("Phase 18 pricing governance", (group) => {
    group.each.setup(resetPricingTables);

    test("non-admin actors cannot read pricing governance", async ({ client }) => {
        const customer = await createUser("customer");
        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(customer);
        response.assertStatus(403);
    });

    test("tenant-scoped pricing.view override denies an admin", async ({ client }) => {
        const admin = await createUser();
        await db.connection("postgres_admin").table("admin_permissions").insert({
            tenant_id: TEST_TENANT_ID,
            user_id: Number(admin.id),
            permission: "pricing.view",
            allowed: false,
        });
        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(admin);
        response.assertStatus(403);
    });

    test("policy creation is versioned and exposed through the documented contract", async ({ client, assert }) => {
        const admin = await createUser();
        const created = await createPolicy(client, admin, "margin-core");
        assert.equal(created.version.version, 1);
        assert.equal(created.version.state, "draft");

        const response = await client.get("/api/v1/admin/pricing-brain/policies").withGuard("api").loginAs(admin);
        response.assertStatus(200);
        response.assertAgainstApiSpec();
        assert.equal(response.body().data.length, 1);
        assert.equal(response.body().data[0].policy_key, "margin-core");
        assert.equal(response.body().data[0].latest_version.version, 1);
    });

    test("proposer cannot self-approve but a second admin can approve and activate", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "dual-control");

        const submitted = await transition(client, proposer, created.policy.id, "submit", {
            expected_version: 1,
            reason: "submit for independent review",
            idempotency_key: "phase18-submit-dual-control",
        });
        submitted.assertStatus(200);
        submitted.assertAgainstApiSpec();
        assert.equal(submitted.body().data.version.state, "review");

        const selfApproval = await transition(client, proposer, created.policy.id, "approve", {
            expected_version: 1,
            reason: "must not self approve",
        });
        selfApproval.assertStatus(422);

        const approved = await transition(client, approver, created.policy.id, "approve", {
            expected_version: 1,
            reason: "independent approval",
            idempotency_key: "phase18-approve-dual-control",
        });
        approved.assertStatus(200);
        approved.assertAgainstApiSpec();
        assert.equal(approved.body().data.version.state, "approved");

        const activated = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "activate approved guardrails",
            idempotency_key: "phase18-activate-dual-control",
        });
        activated.assertStatus(200);
        activated.assertAgainstApiSpec();
        assert.equal(activated.body().data.version.state, "active");
    });

    test("stale expected_version is rejected after a newer draft exists", async ({ client }) => {
        const admin = await createUser();
        const created = await createPolicy(client, admin, "stale-version");

        const version2 = await client
            .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/versions`)
            .withGuard("api")
            .loginAs(admin)
            .json({ reason: "newer draft for stale version regression" });
        version2.assertStatus(200);
        version2.assertAgainstApiSpec();

        const stale = await transition(client, admin, created.policy.id, "submit", {
            expected_version: 1,
            reason: "stale write must fail",
        });
        stale.assertStatus(409);
    });

    test("freeze is idempotent and blocks normal activation transitions", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "freeze-control");

        const submitted = await transition(client, proposer, created.policy.id, "submit", {
            expected_version: 1,
            reason: "submit before freeze",
        });
        submitted.assertStatus(200);
        const approved = await transition(client, approver, created.policy.id, "approve", {
            expected_version: 1,
            reason: "approve before freeze",
        });
        approved.assertStatus(200);

        const freeze = () =>
            client
                .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/freeze`)
                .withGuard("api")
                .loginAs(approver)
                .json({ frozen: true, reason: "emergency freeze regression", idempotency_key: "phase18-freeze-control" });

        const first = await freeze();
        first.assertStatus(200);
        first.assertAgainstApiSpec();
        assert.equal(first.body().replayed, false);
        const replay = await freeze();
        replay.assertStatus(200);
        replay.assertAgainstApiSpec();
        assert.equal(replay.body().replayed, true);

        const blocked = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "frozen activation must fail",
        });
        blocked.assertStatus(409);
    });

    test("rollback restores a previously approved version and records durable audit evidence", async ({ client, assert }) => {
        const proposer = await createUser();
        const approver = await createUser();
        const created = await createPolicy(client, proposer, "rollback-control");

        await transition(client, proposer, created.policy.id, "submit", { expected_version: 1, reason: "submit v1" });
        await transition(client, approver, created.policy.id, "approve", { expected_version: 1, reason: "approve v1" });
        const activeV1 = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 1,
            reason: "activate v1",
        });
        activeV1.assertStatus(200);

        const v2 = await client
            .post(`/api/v1/admin/pricing-brain/policies/${created.policy.id}/versions`)
            .withGuard("api")
            .loginAs(proposer)
            .json({
                guardrails: { floor_price_minor: 95_000, maximum_discount_percent: 15 },
                reason: "tighten margin guardrails",
            });
        v2.assertStatus(200);
        assert.equal(v2.body().data.version, 2);

        await transition(client, proposer, created.policy.id, "submit", { expected_version: 2, reason: "submit v2" });
        await transition(client, approver, created.policy.id, "approve", { expected_version: 2, reason: "approve v2" });
        const activeV2 = await transition(client, approver, created.policy.id, "activate", {
            expected_version: 2,
            reason: "activate v2",
        });
        activeV2.assertStatus(200);

        const rolledBack = await transition(client, approver, created.policy.id, "rollback", {
            expected_version: 2,
            rollback_to_version: 1,
            reason: "guardrail regression detected",
            evidence: { trigger: "post_activation_monitor" },
            correlation_id: "phase18-rollback-correlation",
            idempotency_key: "phase18-rollback-control",
        });
        rolledBack.assertStatus(200);
        rolledBack.assertAgainstApiSpec();
        assert.equal(rolledBack.body().data.version.version, 1);
        assert.equal(rolledBack.body().data.version.state, "active");

        const adminDb = db.connection("postgres_admin");
        const action = await adminDb
            .from("pricing_policy_actions")
            .where("tenant_id", TEST_TENANT_ID)
            .where("policy_id", created.policy.id)
            .where("action", "version.rollback")
            .first();
        assert.exists(action);
        assert.equal(action.reason, "guardrail regression detected");
        assert.equal(action.correlation_id, "phase18-rollback-correlation");

        const audit = await adminDb
            .from("admin_audit_log")
            .where("tenant_id", TEST_TENANT_ID)
            .where("entity_kind", "pricing_policy")
            .where("entity_id", String(created.policy.id))
            .where("action", "pricing.version.rollback")
            .first();
        assert.exists(audit);
    });
});
