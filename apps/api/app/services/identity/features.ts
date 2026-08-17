import SettingsService from "#services/settings_service";

export type IdentityFeature = "passkeys" | "totp_enrollment" | "recovery_codes_generation";

const DEFAULTS: Record<IdentityFeature, boolean> = {
    passkeys: true,
    totp_enrollment: true,
    recovery_codes_generation: true,
};

export async function identityFeatureEnabled(feature: IdentityFeature) {
    return new SettingsService().get("identity", feature, DEFAULTS[feature]);
}

export async function requireIdentityFeature(feature: IdentityFeature) {
    if (await identityFeatureEnabled(feature)) return;
    throw Object.assign(new Error("Identity feature is disabled"), { status: 404, code: "E_IDENTITY_FEATURE_DISABLED" });
}
