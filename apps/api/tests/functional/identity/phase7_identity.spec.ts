import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";
import { DateTime } from "luxon";

import User from "#models/user";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const TABLES = [
    "identity_security_events",
    "identity_risk_events",
    "identity_sessions",
    "identity_credentials",
    "identity_provider_attempts",
    "identity_verification_challenges",
    "identity_verifications",
    "identity_policies",
    "identity_provider_configs",
    "admin_permissions",
];

async function resetIdentityTables() {
    const admin = db.connection("postgres_admin");
    for (const table of TABLES) await admin.from(table).delete();
    const now = DateTime.utc().toSQL()!;
    await admin.table("identity_provider_configs").insert({
        tenant_id: TEST_TENANT_ID,
        provider_key: "legacy-log-sms",
        channel: "sms",
        driver: "log",
        enabled: true,
        is_primary: true,
        priority: 900,
        configuration: JSON.stringify({}),
        capabilities: JSON.stringify({ send: true, simulated: true, delivery_lookup: false }),
        health_state: "unknown",
        consecutive_failures: 0,
        created_at: now,
        updated_at: now,
    });
}

async function createAdmin(email: string) {
    return User.create({ email, passwordHash: "Passw0rd1!", role: "admin", locale: "fa" });
}

test.group("Phase 7 identity platform", (group) => {
    group.each.setup(resetIdentityTables);

    test("OTP request creates a tenant-scoped verification ledger without exposing plaintext", async ({ client, assert }) => {
        const response = await client.post("/api/v1/auth/otp/request").json({ identifier: "09120008888", channel: "sms" });
        response.assertStatus(200);
        const verificationId = response.body().data.verification_id as string;
        assert.match(verificationId, /^[0-9a-f-]{36}$/i);
        assert.notProperty(response.body().data, "code");

        const verification = await db
            .connection("postgres_admin")
            .from("identity_verifications")
            .where("tenant_id", TEST_TENANT_ID)
            .where("public_id", verificationId)
            .first();
        assert.exists(verification);
        assert.exists(verification.identifier_hash);
        assert.match(String(verification.identifier_hash), /^[0-9a-f]{64}$/i);
        assert.notEqual(String(verification.identifier_hash), "09120008888");
        assert.match(String(verification.identifier_masked), /[•*]/);

        const challenge = await db
            .connection("postgres_admin")
            .from("identity_verification_challenges")
            .where("verification_id", verification.id)
            .first();
        assert.exists(challenge?.secret_hash);
        assert.notProperty(challenge, "code");
    });

    test("resend rotates the challenge generation and supersedes the previous challenge", async ({ client, assert }) => {
        const identifier = "09120007777";
        const first = await client.post("/api/v1/auth/otp/request").json({ identifier, channel: "sms" });
        first.assertStatus(200);
        const publicId = first.body().data.verification_id as string;

        const verificationBeforeResend = await db
            .connection("postgres_admin")
            .from("identity_verifications")
            .where("tenant_id", TEST_TENANT_ID)
            .where("public_id", publicId)
            .firstOrFail();
        await db
            .connection("postgres_admin")
            .from("identity_verification_challenges")
            .where("verification_id", verificationBeforeResend.id)
            .where("state", "active")
            .update({ created_at: DateTime.utc().minus({ minutes: 2 }).toSQL() });
        const resend = await client.post("/api/v1/auth/otp/resend").json({ verification_id: publicId, identifier });
        resend.assertStatus(200);

        const verification = await db
            .connection("postgres_admin")
            .from("identity_verifications")
            .where("tenant_id", TEST_TENANT_ID)
            .where("public_id", publicId)
            .firstOrFail();
        const challenges = await db
            .connection("postgres_admin")
            .from("identity_verification_challenges")
            .where("verification_id", verification.id)
            .orderBy("generation", "asc");
        assert.lengthOf(challenges, 2);
        assert.equal(Number(challenges[1].generation), Number(challenges[0].generation) + 1);
        assert.equal(String(challenges[0].state), "superseded");
        assert.equal(String(challenges[1].state), "active");
        assert.notEqual(String(challenges[0].secret_hash), String(challenges[1].secret_hash));
    });

    test("admin permission override is enforced by the backend", async ({ client }) => {
        const admin = await createAdmin("identity-permissions@calibra.dev");
        await db
            .connection("postgres_admin")
            .table("admin_permissions")
            .insert({
                tenant_id: TEST_TENANT_ID,
                user_id: Number(admin.id),
                permission: "identity.view",
                allowed: false,
            });
        const response = await client.get("/api/v1/admin/identity/overview").withGuard("api").loginAs(admin);
        response.assertStatus(403);
    });

    test("password step-up unlocks a sensitive settings mutation", async ({ client, assert }) => {
        const admin = await createAdmin("identity-step-up@calibra.dev");
        const blocked = await client
            .patch("/api/v1/admin/identity/settings")
            .withGuard("api")
            .loginAs(admin)
            .json({ passkeys: false, reason: "security regression test" });
        blocked.assertStatus(403);

        const stepUp = await client
            .post("/api/v1/admin/identity/step-up/verify")
            .withGuard("api")
            .loginAs(admin)
            .json({ method: "password", proof: "Passw0rd1!", action_scope: "identity.settings.manage" });
        stepUp.assertStatus(200);

        const updated = await client
            .patch("/api/v1/admin/identity/settings")
            .withGuard("api")
            .loginAs(admin)
            .json({ passkeys: false, reason: "security regression test" });
        updated.assertStatus(200);
        assert.equal(updated.body().data.passkeys, false);
    });

    test("provider credential remains write-only in admin responses", async ({ client, assert }) => {
        const admin = await createAdmin("identity-provider@calibra.dev");
        const stepUp = await client
            .post("/api/v1/admin/identity/step-up/verify")
            .withGuard("api")
            .loginAs(admin)
            .json({ method: "password", proof: "Passw0rd1!", action_scope: "identity.provider.manage" });
        stepUp.assertStatus(200);

        const saved = await client.put("/api/v1/admin/identity/providers").withGuard("api").loginAs(admin).json({
            provider_key: "ippanel",
            channel: "sms",
            driver: "ippanel",
            enabled: true,
            is_primary: true,
            priority: 10,
            sender_id: "+983000505",
            base_url: "https://edge.ippanel.com",
            api_token: "test-secret-token",
            reason: "configure test provider",
        });
        saved.assertStatus(200);
        assert.equal(saved.body().data.credential_configured, true);
        assert.notProperty(saved.body().data, "api_token");
        assert.notInclude(JSON.stringify(saved.body()), "test-secret-token");
    });
});
