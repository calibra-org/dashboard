import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import { bootstrapRoles } from "#services/db_roles";
import env from "#start/env";

const APP_CONNECTION = "phase11_governance_rls_app";
const APP_USER = "calibra_app";
const APP_PASSWORD = "calibra_app";
const ADMIN_USER = "calibra_admin";
const ADMIN_PASSWORD = "calibra_admin";
const TENANT_A = 911001;
const TENANT_B = 911002;
const TABLES = [
    "governance_policy_versions",
    "governance_agent_principals",
    "governance_approval_requests",
    "governance_approval_steps",
    "governance_approval_decisions",
    "governance_ledger_heads",
    "governance_action_ledger",
    "governance_shadow_observations",
];

test.group("Phase 11 Governance RLS isolation", (group) => {
    group.setup(async () => {
        const su = db.connection();
        await bootstrapRoles(su, {
            appUser: APP_USER,
            appPassword: APP_PASSWORD,
            adminUser: ADMIN_USER,
            adminPassword: ADMIN_PASSWORD,
        });
        const plan = await su.from("plans").orderBy("id", "asc").first();
        if (!plan) throw new Error("foundation plan is required for Phase 11 RLS test");
        const now = new Date().toISOString();
        for (const [id, slug] of [
            [TENANT_A, "phase11-rls-a"],
            [TENANT_B, "phase11-rls-b"],
        ] as const) {
            await su
                .table("tenants")
                .insert({
                    id,
                    slug,
                    name: slug,
                    status: "active",
                    plan_id: Number(plan.id),
                    db_tier: "shared",
                    template_key: "default",
                    currency_code: "IRR",
                    primary_locale: "fa",
                    created_at: now,
                    updated_at: now,
                })
                .onConflict("id")
                .ignore();
        }
        const row = (tenantId: number, key: string) => ({
            tenant_id: tenantId,
            policy_key: key,
            version: 1,
            name: key,
            action_pattern: "configuration.apply",
            effect: "deny",
            priority: 100,
            reason: "rls isolation evidence",
            content_hash: String(tenantId).padEnd(64, "1").slice(0, 64),
            created_at: now,
        });
        await su
            .table("governance_policy_versions")
            .insert([row(TENANT_A, "rls.a1"), row(TENANT_A, "rls.a2"), row(TENANT_B, "rls.b1")]);
        db.manager.add(APP_CONNECTION, {
            client: "pg",
            connection: {
                host: env.get("DB_HOST"),
                port: env.get("DB_PORT"),
                user: APP_USER,
                password: APP_PASSWORD,
                database: env.get("DB_DATABASE"),
            },
        });
        return async () => {
            // The test database is disposable and the global migration teardown removes these rows.
            // Deleting the tenants here would cascade into immutable governance history and is
            // intentionally rejected by the append-only trigger we are validating.
            await db.manager.close(APP_CONNECTION, true);
        };
    });

    test("all Governance OS tenant tables FORCE RLS", async ({ assert }) => {
        const rows = await db.rawQuery(
            "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY(?) ORDER BY relname",
            [TABLES],
        );
        assert.lengthOf(rows.rows, TABLES.length);
        assert.isTrue(rows.rows.every((row: { relrowsecurity: boolean }) => row.relrowsecurity));
        assert.isTrue(rows.rows.every((row: { relforcerowsecurity: boolean }) => row.relforcerowsecurity));
    });

    test("calibra_app fails closed without tenant context and sees only selected tenant", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        const unset = await app.rawQuery("SELECT count(*)::int AS count FROM governance_policy_versions");
        assert.equal(Number(unset.rows[0].count), 0);
        const countFor = (tenantId: number) =>
            app.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
                const result = await trx.rawQuery("SELECT count(*)::int AS count FROM governance_policy_versions");
                return Number(result.rows[0].count);
            });
        assert.equal(await countFor(TENANT_A), 2);
        assert.equal(await countFor(TENANT_B), 1);
    });

    test("WITH CHECK rejects a cross-tenant governance write", async ({ assert }) => {
        const app = db.connection(APP_CONNECTION);
        let rejected = false;
        try {
            await app.transaction(async (trx) => {
                await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(TENANT_A)]);
                await trx.table("governance_policy_versions").insert({
                    tenant_id: TENANT_B,
                    policy_key: "rls.must-fail",
                    version: 1,
                    name: "must fail",
                    action_pattern: "configuration.apply",
                    effect: "deny",
                    priority: 100,
                    reason: "wrong tenant",
                    content_hash: "f".repeat(64),
                });
            });
        } catch {
            rejected = true;
        }
        assert.isTrue(rejected, "Governance OS must reject tenant_id values that differ from app.current_tenant");
    });
});
