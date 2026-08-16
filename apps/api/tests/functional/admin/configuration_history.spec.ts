import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import FoundationSeeder from "#database/seed_modules/0001_foundation_seeder";
import CurrenciesSeeder from "#database/seed_modules/0013_currencies_seeder";
import Customer from "#models/customer";
import User from "#models/user";
import SettingsService from "#services/settings_service";
import { truncatePhase03Tables } from "#tests/helpers/db";

async function createAdmin() {
    const user = await User.create({ email: "admin@calibra.dev", passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
    await Customer.create({ userId: user.id, firstName: "Admin", lastName: "User", countryDefault: "IR", status: "active" });
    return user;
}

async function createCustomer() {
    return User.create({ email: "shopper@calibra.dev", passwordHash: "Passw0rd1!", role: "customer", locale: "fa" });
}

const BASE = "/api/v1/admin/settings/configuration";
const MASTER_GROUPS = [
    "general",
    "publishing",
    "reading",
    "community",
    "media",
    "urls",
    "catalog",
    "inventory",
    "tax",
    "shipping",
    "payments",
    "checkout",
    "notifications",
    "privacy",
    "visibility",
    "integrations",
    "infrastructure",
    "change_management",
];

test.group("admin configuration revisions", (group) => {
    group.each.setup(async () => {
        await db.rawQuery(
            "TRUNCATE TABLE configuration_url_redirect_history, configuration_overrides, configuration_revisions RESTART IDENTITY CASCADE",
        );
        await truncatePhase03Tables();
        const client = db.connection();
        await new FoundationSeeder(client).run();
        await new CurrenciesSeeder(client).run();
        await new SettingsService().clearCache();
    });

    test("registry exposes the complete canonical Phase 6 configuration groups", async ({ client, assert }) => {
        const admin = await createAdmin();
        const res = await client.get(`${BASE}/registry`).withGuard("api").loginAs(admin);
        res.assertStatus(200);
        const body = res.body() as {
            data: Array<{ key: string; mode: string; history_enabled: boolean; definition_count: number }>;
        };
        assert.deepEqual(
            body.data.map((item) => item.key),
            MASTER_GROUPS,
        );
        assert.isTrue(body.data.every((item) => item.history_enabled));
        assert.isTrue(body.data.every((item) => item.definition_count > 0));
        assert.isFalse(body.data.some((item) => ["account", "email", "advanced", "datetime", "branding"].includes(item.key)));
    });

    test("history endpoints require admin authorization", async ({ client }) => {
        const anonymous = await client.get(`${BASE}/history`);
        anonymous.assertStatus(401);
        const customer = await createCustomer();
        const forbidden = await client.get(`${BASE}/history`).withGuard("api").loginAs(customer);
        forbidden.assertStatus(403);
    });

    test("first changed PATCH records baseline plus diff and same-value PATCH appends none", async ({ client, assert }) => {
        const admin = await createAdmin();
        const settingsUrl = "/api/v1/admin/settings/datetime";
        await client.patch(settingsUrl).withGuard("api").loginAs(admin).json({ date_format: "yyyy/MM/dd" });
        const first = await client.get(`${BASE}/history?scope=datetime`).withGuard("api").loginAs(admin);
        first.assertStatus(200);
        const data = (first.body() as { data: Array<{ revision: number; source: string; changed_keys: string[] }> }).data;
        assert.lengthOf(data, 2);
        assert.equal(data[0].revision, 2);
        assert.equal(data[0].source, "update");
        assert.include(data[0].changed_keys, "datetime.date_format");
        assert.equal(data[1].revision, 1);
        assert.equal(data[1].source, "baseline");
        assert.deepEqual(data[1].changed_keys, []);

        await client.patch(settingsUrl).withGuard("api").loginAs(admin).json({ date_format: "yyyy/MM/dd" });
        const second = await client.get(`${BASE}/history?scope=datetime`).withGuard("api").loginAs(admin);
        assert.lengthOf((second.body() as { data: unknown[] }).data, 2);
    });

    test("rollback can restore the pre-first-change baseline and appends a rollback revision", async ({ client, assert }) => {
        const admin = await createAdmin();
        const settingsUrl = "/api/v1/admin/settings/datetime";
        await client.patch(settingsUrl).withGuard("api").loginAs(admin).json({ date_format: "yyyy/MM/dd" });
        await client.patch(settingsUrl).withGuard("api").loginAs(admin).json({ date_format: "dd-MM-yyyy" });

        const rollback = await client.post(`${BASE}/history/datetime/1/rollback`).withGuard("api").loginAs(admin);
        rollback.assertStatus(200);
        const rollbackBody = rollback.body() as {
            data: { revision: number; source: string; rollback_of_revision: number };
            meta: { changed: boolean };
        };
        assert.equal(rollbackBody.data.revision, 4);
        assert.equal(rollbackBody.data.source, "rollback");
        assert.equal(rollbackBody.data.rollback_of_revision, 1);
        assert.isTrue(rollbackBody.meta.changed);

        const current = await client.get(settingsUrl).withGuard("api").loginAs(admin);
        current.assertStatus(200);
        assert.equal((current.body() as { data: { date_format: string } }).data.date_format, "d MMMM yyyy");

        const detail = await client.get(`${BASE}/history/datetime/4`).withGuard("api").loginAs(admin);
        detail.assertStatus(200);
        assert.include(
            (detail.body() as { data: { diff: Array<{ key: string }> } }).data.diff.map((item) => item.key),
            "datetime.date_format",
        );
    });
});
