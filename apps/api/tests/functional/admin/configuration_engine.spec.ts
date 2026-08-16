import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import FoundationSeeder from "#database/seed_modules/0001_foundation_seeder";
import Customer from "#models/customer";
import User from "#models/user";
import SettingsService from "#services/settings_service";
import { truncatePhase03Tables } from "#tests/helpers/db";

const BASE = "/api/v1/admin/settings/configuration";

async function createAdmin() {
    const user = await User.create({
        email: `phase6-${crypto.randomUUID()}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Phase",
        lastName: "Six",
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

test.group("Phase 6 Configuration OS engine", (group) => {
    group.each.setup(async () => {
        await db.rawQuery(
            "TRUNCATE TABLE configuration_url_redirect_history, configuration_overrides, configuration_revisions RESTART IDENTITY CASCADE",
        );
        await truncatePhase03Tables();
        await new FoundationSeeder(db.connection()).run();
        await new SettingsService().clearCache();
    });

    test("resolves Global → Tenant → Market → Channel → Environment → Temporary and reports origin", async ({ client, assert }) => {
        const admin = await createAdmin();
        const apply = async (scope_type: string, scope_key: string | undefined, value: number) =>
            client
                .put(`${BASE}/groups/reading`)
                .withGuard("api")
                .loginAs(admin)
                .json({ key: "reading.feed_page_size", scope_type, scope_key, value, reason: `set ${scope_type}`, expected_version: 0 });

        (await apply("tenant", undefined, 25)).assertStatus(200);
        (await apply("market", "ir", 30)).assertStatus(200);
        (await apply("channel", "web", 35)).assertStatus(200);
        (await apply("environment", "production", 40)).assertStatus(200);
        (await apply("temporary", "campaign", 45)).assertStatus(200);

        const response = await client
            .get(`${BASE}/groups/reading`)
            .qs({ market: "ir", channel: "web", environment: "production", temporary: "campaign" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        const item = response
            .body()
            .data.definitions.find((candidate: { definition: { key: string } }) => candidate.definition.key === "reading.feed_page_size");
        assert.equal(item.value, 45);
        assert.equal(item.origin.scope_type, "temporary");
        assert.deepEqual(
            item.resolution_chain.map((step: { scope_type: string }) => step.scope_type),
            ["global", "tenant", "market", "channel", "environment", "temporary"],
        );
    });

    test("rejects invalid values and stale optimistic versions", async ({ client, assert }) => {
        const admin = await createAdmin();
        const invalid = await client.put(`${BASE}/groups/reading`).withGuard("api").loginAs(admin).json({
            key: "reading.feed_page_size",
            scope_type: "tenant",
            value: 500,
            reason: "outside validated range",
            expected_version: 0,
        });
        invalid.assertStatus(422);

        const first = await client.put(`${BASE}/groups/reading`).withGuard("api").loginAs(admin).json({
            key: "reading.feed_page_size",
            scope_type: "tenant",
            value: 30,
            reason: "valid versioned change",
            expected_version: 0,
        });
        first.assertStatus(200);

        const stale = await client.put(`${BASE}/groups/reading`).withGuard("api").loginAs(admin).json({
            key: "reading.feed_page_size",
            scope_type: "tenant",
            value: 31,
            reason: "stale concurrent write",
            expected_version: 0,
        });
        stale.assertStatus(422);
        assert.include(JSON.stringify(stale.body()), "configuration.version_conflict");
    });

    test("high-risk URL changes require a fresh preview and append immutable redirect evidence", async ({ client, assert }) => {
        const admin = await createAdmin();
        const change = {
            key: "urls.category_base",
            scope_type: "tenant",
            value: "/shop-category",
            reason: "SEO URL migration",
            expected_version: 0,
        };

        const direct = await client.put(`${BASE}/groups/urls`).withGuard("api").loginAs(admin).json(change);
        direct.assertStatus(422);

        const preview = await client.post(`${BASE}/groups/urls/preview`).withGuard("api").loginAs(admin).json(change);
        preview.assertStatus(200);
        assert.equal(preview.body().data.requires_preview, true);
        assert.isArray(preview.body().data.impact.evidence);

        const applied = await client
            .put(`${BASE}/groups/urls`)
            .withGuard("api")
            .loginAs(admin)
            .json({ ...change, preview_hash: preview.body().data.preview_hash });
        applied.assertStatus(200);

        const evidence = await client.get(`${BASE}/url-redirects`).withGuard("api").loginAs(admin);
        evidence.assertStatus(200);
        assert.equal(evidence.body().data[0].definition_key, "urls.category_base");
        assert.equal(evidence.body().data[0].reason, "SEO URL migration");
    });

    test("secret-class values reject plaintext and blueprints expose references without secret material", async ({ client, assert }) => {
        const admin = await createAdmin();
        const plaintext = await client.put(`${BASE}/groups/integrations`).withGuard("api").loginAs(admin).json({
            key: "integrations.webhook_secret_ref",
            scope_type: "tenant",
            value: "never-store-me",
            reason: "invalid plaintext secret",
            expected_version: 0,
        });
        plaintext.assertStatus(422);

        const change = {
            key: "integrations.webhook_secret_ref",
            scope_type: "tenant",
            value: { env_ref: "CALIBRA_WEBHOOK_SECRET" },
            reason: "bind runtime secret reference",
            expected_version: 0,
        };
        const preview = await client.post(`${BASE}/groups/integrations/preview`).withGuard("api").loginAs(admin).json(change);
        preview.assertStatus(200);
        const applied = await client
            .put(`${BASE}/groups/integrations`)
            .withGuard("api")
            .loginAs(admin)
            .json({ ...change, preview_hash: preview.body().data.preview_hash });
        applied.assertStatus(200);

        const blueprint = await client.get(`${BASE}/blueprint`).withGuard("api").loginAs(admin);
        blueprint.assertStatus(200);
        const serialized = JSON.stringify(blueprint.body());
        assert.notInclude(serialized, "never-store-me");
        assert.include(serialized, "CALIBRA_WEBHOOK_SECRET");
        assert.include(serialized, '"configured":true');
    });

    test("critical launch controls require both fresh preview and governance approval reference", async ({ client }) => {
        const admin = await createAdmin();
        const change = {
            key: "visibility.site_state",
            scope_type: "tenant",
            value: "private",
            reason: "planned private launch",
            expected_version: 0,
        };
        const preview = await client.post(`${BASE}/groups/visibility/preview`).withGuard("api").loginAs(admin).json(change);
        preview.assertStatus(200);

        const missingApproval = await client
            .put(`${BASE}/groups/visibility`)
            .withGuard("api")
            .loginAs(admin)
            .json({ ...change, preview_hash: preview.body().data.preview_hash });
        missingApproval.assertStatus(422);

        const approvedChange = { ...change, approval_reference: "CAB-2026-08-16" };
        const approvedPreview = await client
            .post(`${BASE}/groups/visibility/preview`)
            .withGuard("api")
            .loginAs(admin)
            .json(approvedChange);
        approvedPreview.assertStatus(200);
        const applied = await client
            .put(`${BASE}/groups/visibility`)
            .withGuard("api")
            .loginAs(admin)
            .json({ ...approvedChange, preview_hash: approvedPreview.body().data.preview_hash });
        applied.assertStatus(200);
    });

    test("rollback restores an override baseline and appends a forward rollback revision", async ({ client, assert }) => {
        const admin = await createAdmin();
        const applied = await client.put(`${BASE}/groups/reading`).withGuard("api").loginAs(admin).json({
            key: "reading.feed_page_size",
            scope_type: "tenant",
            value: 40,
            reason: "temporary page size",
            expected_version: 0,
        });
        applied.assertStatus(200);

        const history = await client.get(`${BASE}/history`).qs({ scope: "reading" }).withGuard("api").loginAs(admin);
        history.assertStatus(200);
        const baseline = history.body().data.find((item: { source: string }) => item.source === "baseline");
        assert.exists(baseline);

        const rollback = await client
            .post(`${BASE}/history/reading/${baseline.revision}/rollback`)
            .withGuard("api")
            .loginAs(admin);
        rollback.assertStatus(200);
        assert.equal(rollback.body().data.source, "rollback");
        assert.equal(rollback.body().data.rollback_of_revision, baseline.revision);

        const current = await client.get(`${BASE}/groups/reading`).withGuard("api").loginAs(admin);
        const item = current
            .body()
            .data.definitions.find((candidate: { definition: { key: string } }) => candidate.definition.key === "reading.feed_page_size");
        assert.equal(item.value, 20);
        assert.equal(item.origin.source, "default");
    });

    test("configuration tables are FORCE RLS protected and tax simulator fails closed on invalid input", async ({ client, assert }) => {
        const admin = await createAdmin();
        const policy = await db.rawQuery(
            "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('configuration_overrides', 'configuration_url_redirect_history') ORDER BY relname",
        );
        assert.lengthOf(policy.rows, 2);
        assert.isTrue(policy.rows.every((row: { relrowsecurity: boolean }) => row.relrowsecurity));
        assert.isTrue(policy.rows.every((row: { relforcerowsecurity: boolean }) => row.relforcerowsecurity));

        const invalidTax = await client
            .post(`${BASE}/tax/simulate`)
            .withGuard("api")
            .loginAs(admin)
            .json({ amount_minor: -1, tax_class_id: 0 });
        invalidTax.assertStatus(422);
    });
});
