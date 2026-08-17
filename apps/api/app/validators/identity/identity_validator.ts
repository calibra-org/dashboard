import vine from "@vinejs/vine";

export const verificationResendValidator = vine.compile(vine.object({ verification_id: vine.string().uuid() }));

export const identityStepUpValidator = vine.compile(
    vine.object({
        method: vine.enum(["password", "totp", "recovery_code"]),
        proof: vine.string().trim().minLength(4).maxLength(512),
        action_scope: vine.string().trim().minLength(2).maxLength(120),
    }),
);

export const identityProviderValidator = vine.compile(
    vine.object({
        provider_key: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_-]{1,79}$/),
        channel: vine.enum(["sms", "email"]),
        driver: vine.enum(["ippanel", "log", "mail"]),
        enabled: vine.boolean(),
        is_primary: vine.boolean(),
        priority: vine.number().min(1).max(1000),
        sender_id: vine.string().trim().maxLength(120).nullable().optional(),
        base_url: vine.string().trim().maxLength(500).nullable().optional(),
        api_token: vine.string().trim().maxLength(1000).optional(),
        timeout_ms: vine.number().min(1000).max(30000).optional(),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const identityPolicyValidator = vine.compile(
    vine.object({
        policy_key: vine
            .string()
            .trim()
            .regex(/^[a-z0-9][a-z0-9_.-]{1,99}$/),
        purpose: vine.string().trim().minLength(2).maxLength(80),
        enabled: vine.boolean(),
        methods: vine
            .array(vine.enum(["sms_otp", "email_otp", "passkey", "totp", "recovery_code", "password"]))
            .minLength(1)
            .maxLength(6),
        code_length: vine.number().min(4).max(8).optional(),
        ttl_seconds: vine.number().min(60).max(3600).optional(),
        max_attempts: vine.number().min(1).max(20).optional(),
        resend_cooldown_seconds: vine.number().min(10).max(900).optional(),
        risk_block_score: vine.number().min(1).max(100).optional(),
        step_up_freshness_seconds: vine.number().min(60).max(3600).optional(),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const identitySettingsValidator = vine.compile(
    vine.object({
        passkeys: vine.boolean().optional(),
        totp_enrollment: vine.boolean().optional(),
        recovery_codes_generation: vine.boolean().optional(),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const identitySmsSettingsValidator = vine.compile(
    vine.object({
        sms_enabled: vine.boolean().optional(),
        daily_send_limit: vine.number().min(1).max(1_000_000).optional(),
        daily_spend_limit_minor: vine.number().min(0).max(9_000_000_000).optional(),
        per_identifier_10m_limit: vine.number().min(1).max(1000).optional(),
        per_ip_10m_limit: vine.number().min(1).max(10000).optional(),
        per_device_10m_limit: vine.number().min(1).max(10000).optional(),
        resend_10m_limit: vine.number().min(1).max(1000).optional(),
        resend_cooldown_seconds: vine.number().min(10).max(900).optional(),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const identityAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().positive(),
        preset: vine.enum(["owner", "security", "support", "viewer"]),
        reason: vine.string().trim().minLength(4).maxLength(500),
    }),
);

export const identityCredentialRevokeValidator = vine.compile(
    vine.object({ reason: vine.string().trim().minLength(4).maxLength(500) }),
);

export const identitySessionRevokeValidator = vine.compile(
    vine.object({ reason: vine.string().trim().minLength(4).maxLength(500) }),
);

export const identityTotpConfirmValidator = vine.compile(vine.object({ code: vine.string().trim().fixedLength(6) }));

export const identityPasskeyRegistrationValidator = vine.compile(
    vine.object({
        verification_id: vine.string().uuid(),
        credential_id: vine.string().trim().minLength(8).maxLength(2048),
        client_data_json: vine.string().trim().minLength(8),
        authenticator_data: vine.string().trim().minLength(8),
        public_key_spki: vine.string().trim().minLength(8),
        label: vine.string().trim().maxLength(200).optional(),
        transports: vine.array(vine.string().trim().maxLength(40)).maxLength(8).optional(),
    }),
);

export const identityPasskeyAuthenticationValidator = vine.compile(
    vine.object({
        verification_id: vine.string().uuid(),
        credential_id: vine.string().trim().minLength(8).maxLength(2048),
        client_data_json: vine.string().trim().minLength(8),
        authenticator_data: vine.string().trim().minLength(8),
        signature: vine.string().trim().minLength(8),
    }),
);
