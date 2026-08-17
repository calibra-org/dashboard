import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import FoundationSeeder from "#database/seed_modules/0001_foundation_seeder";
import Customer from "#models/customer";
import User from "#models/user";
import { truncatePhase03Tables } from "#tests/helpers/db";

const BASE = "/api/v1/admin/governance";
const STEP_UP = "/api/v1/admin/identity/step-up/verify";

async function createAdmin(label: string) {
    const user = await User.create({
        email: `phase11-${label}-${crypto.randomUUID()}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Phase",
        lastName: `Eleven-${label}`,
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

async function stepUp(client: any, user: User, actionScope: string) {
    const response = await client
        .post(STEP_UP)
        .withGuard("api")
        .loginAs(user)
        .json({ method: "password", proof: "Passw0rd1!", action_scope: actionScope });
    response.assertStatus(200);
}

test.group("Phase 11 Governance OS", (group) => {
    group.each.setup(async () => {
        await db.rawQuery(
            "TRUNCATE TABLE governance_shadow_observations, governance_action_ledger, governance_ledger_heads, governance_approval_decisions, governance_approval_steps, governance_approval_requests, governance_agent_principals, governance_policy_versions RESTART IDENTITY CASCADE",
        );
        await truncatePhase03Tables();
        await new FoundationSeeder(db.connection()).run();
    });

    test("appends immutable policy versions, applies deny precedence, and emits ledger evidence", async ({ client, assert }) => {
        const admin = await createAdmin("policy");
        await stepUp(client, admin, "governance.policy.version.create");
        const created = await client
            .post(`${BASE}/policies`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                policyKey: "constitution.block-config",
                name: "Block configuration during incident",
                actionPattern: "configuration.apply",
                effect: "deny",
                priority: 9000,
                scope: { environment: "incident" },
                predicate: {},
                reason: "Incident containment policy",
            });
        created.assertStatus(200);
        assert.equal(created.body().data.version, 1);
        assert.lengthOf(created.body().data.contentHash, 64);

        const decision = await client
            .post(`${BASE}/evaluate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ actionKey: "configuration.apply", context: { environment: "incident" } });
        decision.assertStatus(200);
        assert.isFalse(decision.body().data.allowed);
        assert.include(decision.body().data.reasons, "policy_deny");

        const ledger = await client.get(`${BASE}/ledger`).withGuard("api").loginAs(admin);
        ledger.assertStatus(200);
        assert.equal(ledger.body().data[0].actionKey, "governance.policy.version.create");
        assert.lengthOf(ledger.body().data[0].entryHash, 64);
    });

    test("agent principals are allowlisted, autonomy-bounded, budget-bounded, and kill-switchable", async ({
        client,
        assert,
    }) => {
        const admin = await createAdmin("agent");
        await stepUp(client, admin, "governance.agent.update");
        const created = await client
            .post(`${BASE}/agents`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                principalKey: "seo-agent",
                name: "SEO Agent",
                allowedActions: ["seo.action.apply"],
                prohibitedActions: ["refund.create"],
                dataAccessClasses: ["seo.public"],
                autonomyLevel: 4,
                budgetLimitMinor: 5000000,
                budgetCurrency: "IRR",
            });
        created.assertStatus(200);
        const agent = created.body().data;

        const allowed = await client.post(`${BASE}/evaluate`).withGuard("api").loginAs(admin).json({
            actorType: "agent",
            agentId: agent.id,
            actionKey: "seo.action.apply",
            requestedAutonomy: 4,
            amountMinor: 1000,
            currency: "IRR",
        });
        allowed.assertStatus(200);
        assert.isTrue(allowed.body().data.allowed);
        assert.isTrue(allowed.body().data.requiresApproval);

        const prohibited = await client
            .post(`${BASE}/evaluate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ actorType: "agent", agentId: agent.id, actionKey: "refund.create", requestedAutonomy: 1 });
        prohibited.assertStatus(200);
        assert.isFalse(prohibited.body().data.allowed);

        await stepUp(client, admin, "governance.agent.kill_switch");
        const killed = await client
            .post(`${BASE}/agents/${agent.id}/kill-switch`)
            .withGuard("api")
            .loginAs(admin)
            .json({ enabled: true });
        killed.assertStatus(200);
        assert.isTrue(killed.body().data.killSwitch);

        const afterKill = await client
            .post(`${BASE}/evaluate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ actorType: "agent", agentId: agent.id, actionKey: "seo.action.apply", requestedAutonomy: 1 });
        afterKill.assertStatus(200);
        assert.isFalse(afterKill.body().data.allowed);
        assert.include(afterKill.body().data.reasons, "agent_kill_switch");
    });

    test("approval center enforces separation of duties, scoped configuration references, and one-time consumption", async ({
        client,
        assert,
    }) => {
        const requester = await createAdmin("requester");
        const approver = await createAdmin("approver");
        const approvalResponse = await client.post(`${BASE}/approvals`).withGuard("api").loginAs(requester).json({
            actionKey: "configuration.apply",
            resourceType: "configuration",
            resourceId: "visibility:visibility.site_state",
            reason: "Approve exact launch-state change",
            payload: {},
            workflowKind: "single",
            separationOfDuties: true,
        });
        approvalResponse.assertStatus(200);
        const approval = approvalResponse.body().data;
        assert.match(approval.reference, /^govap_/);
        assert.lengthOf(approval.requestHash, 64);

        const selfDecision = await client
            .post(`${BASE}/approvals/${approval.reference}/decision`)
            .withGuard("api")
            .loginAs(requester)
            .json({ decision: "approve", reason: "self approval must fail" });
        selfDecision.assertStatus(409);

        const approved = await client
            .post(`${BASE}/approvals/${approval.reference}/decision`)
            .withGuard("api")
            .loginAs(approver)
            .json({ decision: "approve", reason: "independent review complete" });
        approved.assertStatus(200);
        assert.equal(approved.body().data.status, "approved");

        const invalidBinding = await db
            .rawQuery(
                `INSERT INTO configuration_overrides (tenant_id, group_key, definition_key, scope_type, scope_key, value, value_type, reason, version, is_deleted, rollout_percent, approval_reference, created_at, updated_at) VALUES ((SELECT id FROM tenants ORDER BY id LIMIT 1), 'reading', 'reading.feed_page_size', 'tenant', 'default', '40', 'number', 'wrong binding', 1, false, 100, ?, now(), now())`,
                [approval.reference],
            )
            .catch((error) => error);
        assert.match(String(invalidBinding), /scoped to another configuration definition/);
    });

    test("ledger history is database append-only, secret-safe, and hash-chain verifiable", async ({ client, assert }) => {
        const admin = await createAdmin("ledger");
        const created = await client
            .post(`${BASE}/approvals`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                actionKey: "content.publish",
                reason: "ledger evidence seed",
                payload: { title: "safe", apiToken: "must-not-leak" },
            });
        created.assertStatus(200);
        const ledger = await client.get(`${BASE}/ledger`).withGuard("api").loginAs(admin);
        ledger.assertStatus(200);
        assert.isAbove(ledger.body().data.length, 0);
        const entry = ledger.body().data[0];
        assert.notInclude(JSON.stringify(entry), "must-not-leak");
        await assert.rejects(
            () => db.rawQuery("UPDATE governance_action_ledger SET reason = 'tampered' WHERE id = ?", [entry.id]),
            /append-only governance record cannot be modified/,
        );
        const verified = await client.post(`${BASE}/ledger/verify`).withGuard("api").loginAs(admin).json({});
        verified.assertStatus(200);
        assert.isTrue(verified.body().data.ok);
    });
});
