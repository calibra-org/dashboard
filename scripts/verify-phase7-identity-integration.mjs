import { existsSync, readFileSync } from "node:fs";

function read(path) {
    if (!existsSync(path)) throw new Error(`missing Phase 7 file: ${path}`);
    return readFileSync(path, "utf8");
}

function requireText(path, needles) {
    const source = read(path);
    for (const needle of needles) if (!source.includes(needle)) throw new Error(`${path} is missing invariant: ${needle}`);
    return source;
}

const migration = requireText("apps/api/database/migrations/1763000000000_create_identity_verification_platform.ts", [
    "identity_verifications",
    "identity_verification_challenges",
    "identity_provider_attempts",
    "identity_credentials",
    "identity_sessions",
    "identity_security_events",
    "ENABLE ROW LEVEL SECURITY",
    "FORCE ROW LEVEL SECURITY",
    "tenant_isolation",
]);

for (const table of ["identity_verifications", "identity_credentials", "identity_sessions", "identity_security_events"]) {
    if (!migration.includes(table)) throw new Error(`RLS migration does not cover ${table}`);
}

requireText("apps/api/app/services/identity/verification.ts", [
    "secret_hash",
    "resend_cooldown_seconds",
    "per_identifier_10m_limit",
    "per_ip_10m_limit",
    "daily_send_limit",
    "daily_spend_limit_minor",
    "forUpdate()",
]);
requireText("apps/api/app/services/identity/providers.ts", [
    "normalizedProviderBaseUrl",
    "https://edge.ippanel.com",
    "identity_provider_attempts",
    "delivery_unknown",
    "ippanel_recipient_report",
]);
requireText("apps/api/app/services/identity/step_up.ts", ["action_scope", "recovery_code", "totp", "password"]);
requireText("apps/api/app/services/identity/sessions.ts", [
    "auth_access_tokens",
    "User.accessTokens.delete",
    "identity.session.revoked",
]);
requireText("apps/api/app/services/identity/webauthn.ts", ["tenant_domains", "tls_status", "createPublicKey", "verify"]);
requireText("apps/api/app/services/identity/permissions.ts", [
    "identity.sms.manage",
    "identity.providers.manage",
    "identity.sessions.revoke",
]);

const unsafeLoggingFiles = [
    "apps/api/app/controllers/auth/password_forgot_controller.ts",
    "apps/api/app/controllers/auth/otp_controller.ts",
    "apps/api/app/services/identity/providers.ts",
    "apps/api/app/services/identity/verification.ts",
];
for (const path of unsafeLoggingFiles) {
    const source = read(path);
    for (const pattern of [
        /logger\.(?:info|warn|error|debug)\([^\n]*(?:code|token|secret|message)\s*:/i,
        /console\.log\([^\n]*(?:code|token|secret)/i,
    ]) {
        if (pattern.test(source)) throw new Error(`potential plaintext secret logging in ${path}`);
    }
}

const adminRoutes = requireText("apps/api/start/routes/admin_identity.ts", [
    "/overview",
    "/verifications",
    "/providers",
    "/delivery",
    "/risk",
    "/analytics",
    "/settings",
    "/sms/settings",
    "/step-up/verify",
]);
if (!adminRoutes.includes("middleware.auth") || !adminRoutes.includes("middleware.admin"))
    throw new Error("admin identity routes are not auth/admin gated");
requireText("apps/api/start/routes/account_identity.ts", [
    "/sessions",
    "/credentials",
    "/totp/begin",
    "/recovery-codes",
    "/passkeys/begin",
]);
requireText("apps/api/start/routes/auth.ts", ["/otp/resend", "/passkeys/begin", "otpIdentifierLimiter"]);

const pagePaths = [
    "overview",
    "verifications",
    "methods",
    "policies",
    "providers",
    "delivery",
    "risk",
    "credentials",
    "sessions",
    "step-up",
    "audit",
    "analytics",
    "settings",
    "settings/sms",
];
for (const route of pagePaths) read(`apps/admin/src/app/[locale]/(authenticated)/identity/${route}/page.tsx`);
const workspace = requireText("apps/admin/src/features/identity/IdentityWorkspace.tsx", [
    "HelperTooltip",
    "SensitiveAction",
    "identity/provider",
    "مدیریت Provider",
    "ذخیره تنظیمات SMS",
]);
if (/mock|prototype/i.test(workspace)) throw new Error("production Identity workspace contains mock/prototype marker");

requireText("docs/api/reference/openapi/admin.identity.v1.yaml", [
    "/api/v1/admin/identity/overview",
    "/api/v1/admin/identity/step-up/verify",
]);
requireText("docs/api/reference/openapi/storefront.identity.v1.yaml", [
    "/api/v1/auth/passkeys/begin",
    "/api/v1/account/identity/sessions",
]);
requireText("docs/api/reference/openapi/storefront.v1.yaml", ["/api/v1/auth/otp/resend"]);

read("apps/api/tests/functional/identity/phase7_identity.spec.ts");
console.log("Phase 7 identity integration invariants: PASS");
