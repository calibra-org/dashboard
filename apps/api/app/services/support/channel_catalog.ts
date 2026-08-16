export const SUPPORT_CHANNELS = [
    "web",
    "email",
    "phone",
    "api",
    "whatsapp",
    "telegram",
    "instagram",
    "rubika",
    "bale",
    "eitaa",
    "sms",
] as const;

export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export const SUPPORT_CHANNEL_STATES = [
    "disabled",
    "configured",
    "connecting",
    "connected",
    "degraded",
    "error",
    "expired",
] as const;
export type SupportChannelState = (typeof SUPPORT_CHANNEL_STATES)[number];

export const SUPPORT_CAPABILITIES = [
    "send_text",
    "receive_text",
    "send_image",
    "receive_image",
    "send_document",
    "receive_document",
    "send_audio",
    "receive_audio",
    "delivery_receipt",
    "read_receipt",
    "reaction",
    "edit",
    "delete",
    "reply",
    "mark_read",
    "templates",
    "webhook",
    "oauth",
    "typing",
    "business_hours",
] as const;
export type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number];

export type CredentialField = {
    key: string;
    label_fa: string;
    label_en: string;
    required: boolean;
    secret: true;
};

export type ConfigurationField = {
    key: string;
    label_fa: string;
    label_en: string;
    required: boolean;
    type: "text" | "url" | "number" | "select" | "boolean";
    options?: Array<{ value: string; label_fa: string; label_en: string }>;
    placeholder?: string;
};

export type SupportProviderDefinition = {
    channel: SupportChannel;
    provider_key: string;
    label_fa: string;
    label_en: string;
    official_api: boolean;
    production_available: boolean;
    availability_note_fa?: string;
    availability_note_en?: string;
    auth_model: "token" | "oauth2" | "credentials" | "internal" | "none";
    credential_fields: CredentialField[];
    configuration_fields: ConfigurationField[];
    capabilities: SupportCapability[];
    requires_webhook_verification: boolean;
    official_sources: string[];
};

const botCapabilities: SupportCapability[] = [
    "send_text",
    "receive_text",
    "send_image",
    "receive_image",
    "send_document",
    "receive_document",
    "send_audio",
    "receive_audio",
    "reply",
    "edit",
    "delete",
    "webhook",
];

export const SUPPORT_PROVIDER_CATALOG: SupportProviderDefinition[] = [
    {
        channel: "whatsapp",
        provider_key: "whatsapp_cloud",
        label_fa: "واتساپ بیزینس",
        label_en: "WhatsApp Business",
        official_api: true,
        production_available: true,
        auth_model: "token",
        credential_fields: [
            { key: "access_token", label_fa: "Access Token", label_en: "Access Token", required: true, secret: true },
            { key: "app_secret", label_fa: "App Secret", label_en: "App Secret", required: true, secret: true },
            {
                key: "webhook_verify_token",
                label_fa: "Webhook Verify Token",
                label_en: "Webhook Verify Token",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [
            { key: "phone_number_id", label_fa: "Phone Number ID", label_en: "Phone Number ID", required: true, type: "text" },
            { key: "waba_id", label_fa: "WABA ID", label_en: "WABA ID", required: true, type: "text" },
            {
                key: "graph_version",
                label_fa: "نسخه Graph API",
                label_en: "Graph API version",
                required: true,
                type: "text",
                placeholder: "vXX.X",
            },
        ],
        capabilities: [
            "send_text",
            "receive_text",
            "send_image",
            "receive_image",
            "send_document",
            "receive_document",
            "send_audio",
            "receive_audio",
            "delivery_receipt",
            "read_receipt",
            "reply",
            "mark_read",
            "templates",
            "webhook",
        ],
        requires_webhook_verification: true,
        official_sources: [
            "https://www.postman.com/meta/whatsapp-business-platform/overview",
            "https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ba8d099d-007e-4b52-b9f2-3cf3c60e4fbc",
            "https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks",
        ],
    },
    {
        channel: "telegram",
        provider_key: "telegram_bot",
        label_fa: "تلگرام",
        label_en: "Telegram",
        official_api: true,
        production_available: true,
        auth_model: "token",
        credential_fields: [
            { key: "bot_token", label_fa: "توکن ربات", label_en: "Bot token", required: true, secret: true },
            {
                key: "webhook_secret_token",
                label_fa: "Webhook Secret Token",
                label_en: "Webhook Secret Token",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [],
        capabilities: [...botCapabilities, "send_image", "send_document", "send_audio", "reaction"],
        requires_webhook_verification: true,
        official_sources: ["https://core.telegram.org/bots/api", "https://core.telegram.org/bots/webhooks"],
    },
    {
        channel: "instagram",
        provider_key: "instagram_messaging",
        label_fa: "اینستاگرام",
        label_en: "Instagram",
        official_api: true,
        production_available: true,
        auth_model: "oauth2",
        credential_fields: [
            { key: "access_token", label_fa: "Access Token", label_en: "Access Token", required: true, secret: true },
            { key: "app_secret", label_fa: "App Secret", label_en: "App Secret", required: true, secret: true },
            {
                key: "webhook_verify_token",
                label_fa: "Webhook Verify Token",
                label_en: "Webhook Verify Token",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [
            {
                key: "ig_user_id",
                label_fa: "Instagram Professional ID",
                label_en: "Instagram Professional ID",
                required: true,
                type: "text",
            },
            {
                key: "login_type",
                label_fa: "روش ورود",
                label_en: "Login type",
                required: true,
                type: "select",
                options: [
                    { value: "instagram_login", label_fa: "Instagram Login", label_en: "Instagram Login" },
                    { value: "facebook_login", label_fa: "Facebook Login", label_en: "Facebook Login" },
                ],
            },
            {
                key: "graph_version",
                label_fa: "نسخه Graph API",
                label_en: "Graph API version",
                required: true,
                type: "text",
                placeholder: "vXX.X",
            },
        ],
        capabilities: ["send_text", "receive_text", "receive_image", "reply", "webhook", "oauth"],
        requires_webhook_verification: true,
        official_sources: [
            "https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api",
            "https://www.postman.com/meta/instagram/folder/23987686-f05b6c9f-a4be-4511-9f88-1cd94828fdf3",
        ],
    },
    {
        channel: "rubika",
        provider_key: "rubika_bot",
        label_fa: "روبیکا",
        label_en: "Rubika",
        official_api: true,
        production_available: true,
        auth_model: "token",
        credential_fields: [
            { key: "bot_token", label_fa: "توکن ربات", label_en: "Bot token", required: true, secret: true },
            {
                key: "webhook_path_secret",
                label_fa: "راز مسیر وب‌هوک Calibra",
                label_en: "Calibra webhook path secret",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [],
        capabilities: [...botCapabilities],
        requires_webhook_verification: true,
        official_sources: ["https://rubika.ir/botapi"],
    },
    {
        channel: "bale",
        provider_key: "bale_bot",
        label_fa: "بله",
        label_en: "Bale",
        official_api: true,
        production_available: true,
        auth_model: "token",
        credential_fields: [
            { key: "bot_token", label_fa: "توکن بازو", label_en: "Bot token", required: true, secret: true },
            {
                key: "webhook_path_secret",
                label_fa: "راز مسیر وب‌هوک Calibra",
                label_en: "Calibra webhook path secret",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [],
        capabilities: [...botCapabilities],
        requires_webhook_verification: true,
        official_sources: ["https://docs.bale.ai/"],
    },
    {
        channel: "eitaa",
        provider_key: "eitaa_official_unverified",
        label_fa: "ایتا",
        label_en: "Eitaa",
        official_api: false,
        production_available: false,
        availability_note_fa:
            "در تاریخ 2026-08-15 قرارداد عمومی Production از مستند رسمی قابل‌بازیابی تأیید نشد؛ اتصال خصوصی/غیررسمی عمداً غیرفعال است.",
        availability_note_en:
            "As of 2026-08-15, a public production contract could not be verified from retrievable official documentation; unofficial/private integration is intentionally disabled.",
        auth_model: "none",
        credential_fields: [],
        configuration_fields: [],
        capabilities: [],
        requires_webhook_verification: false,
        official_sources: ["https://developer.eitaa.com/"],
    },
    {
        channel: "email",
        provider_key: "smtp_imap",
        label_fa: "ایمیل SMTP/IMAP",
        label_en: "SMTP/IMAP Email",
        official_api: true,
        production_available: false,
        availability_note_fa:
            "ارسال SMTP قابل استانداردسازی است، اما inbound IMAP امن به dependency جدید نیاز دارد؛ تا تأیید dependency، این Provider در Production غیرفعال است.",
        availability_note_en:
            "SMTP outbound is standard, but secure IMAP inbound requires a new dependency; this provider remains disabled until that dependency is approved.",
        auth_model: "credentials",
        credential_fields: [
            { key: "username", label_fa: "نام کاربری", label_en: "Username", required: true, secret: true },
            {
                key: "password",
                label_fa: "رمز عبور / App Password",
                label_en: "Password / App password",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [
            { key: "smtp_host", label_fa: "SMTP Host", label_en: "SMTP host", required: true, type: "text" },
            { key: "smtp_port", label_fa: "SMTP Port", label_en: "SMTP port", required: true, type: "number" },
            { key: "smtp_tls", label_fa: "TLS مستقیم SMTP", label_en: "SMTP implicit TLS", required: true, type: "boolean" },
            { key: "imap_host", label_fa: "IMAP Host", label_en: "IMAP host", required: true, type: "text" },
            { key: "imap_port", label_fa: "IMAP Port", label_en: "IMAP port", required: true, type: "number" },
            { key: "imap_tls", label_fa: "TLS مستقیم IMAP", label_en: "IMAP implicit TLS", required: true, type: "boolean" },
            { key: "from_address", label_fa: "آدرس فرستنده", label_en: "From address", required: true, type: "text" },
        ],
        capabilities: ["send_text", "receive_text", "receive_document", "reply"],
        requires_webhook_verification: false,
        official_sources: ["https://www.rfc-editor.org/rfc/rfc5321", "https://www.rfc-editor.org/rfc/rfc9051"],
    },
    {
        channel: "email",
        provider_key: "gmail_api",
        label_fa: "Gmail API",
        label_en: "Gmail API",
        official_api: true,
        production_available: true,
        auth_model: "oauth2",
        credential_fields: [
            { key: "client_id", label_fa: "OAuth Client ID", label_en: "OAuth Client ID", required: true, secret: true },
            {
                key: "client_secret",
                label_fa: "OAuth Client Secret",
                label_en: "OAuth Client Secret",
                required: true,
                secret: true,
            },
            { key: "refresh_token", label_fa: "Refresh Token", label_en: "Refresh Token", required: false, secret: true },
            {
                key: "webhook_path_secret",
                label_fa: "راز مسیر Pub/Sub",
                label_en: "Pub/Sub callback path secret",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [
            { key: "email_address", label_fa: "حساب Gmail", label_en: "Gmail account", required: true, type: "text" },
            { key: "pubsub_topic", label_fa: "Pub/Sub Topic", label_en: "Pub/Sub topic", required: false, type: "text" },
        ],
        capabilities: ["send_text", "receive_text", "receive_document", "reply", "webhook", "oauth"],
        requires_webhook_verification: false,
        official_sources: [
            "https://developers.google.com/workspace/gmail/api/auth/web-server",
            "https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send",
            "https://developers.google.com/workspace/gmail/api/guides/push",
        ],
    },
    {
        channel: "email",
        provider_key: "microsoft_graph_mail",
        label_fa: "Microsoft Graph Mail",
        label_en: "Microsoft Graph Mail",
        official_api: true,
        production_available: true,
        auth_model: "oauth2",
        credential_fields: [
            { key: "client_id", label_fa: "OAuth Client ID", label_en: "OAuth Client ID", required: true, secret: true },
            {
                key: "client_secret",
                label_fa: "OAuth Client Secret",
                label_en: "OAuth Client Secret",
                required: true,
                secret: true,
            },
            { key: "refresh_token", label_fa: "Refresh Token", label_en: "Refresh Token", required: false, secret: true },
            {
                key: "webhook_client_state",
                label_fa: "Webhook Client State",
                label_en: "Webhook Client State",
                required: true,
                secret: true,
            },
        ],
        configuration_fields: [
            {
                key: "tenant",
                label_fa: "Microsoft tenant",
                label_en: "Microsoft tenant",
                required: true,
                type: "text",
                placeholder: "common",
            },
            { key: "mailbox", label_fa: "Mailbox", label_en: "Mailbox", required: true, type: "text" },
        ],
        capabilities: ["send_text", "receive_text", "receive_document", "reply", "webhook", "oauth"],
        requires_webhook_verification: true,
        official_sources: [
            "https://learn.microsoft.com/graph/api/user-sendmail",
            "https://learn.microsoft.com/graph/api/resources/webhooks",
        ],
    },
    {
        channel: "sms",
        provider_key: "sms_provider_required",
        label_fa: "پیامک",
        label_en: "SMS",
        official_api: false,
        production_available: false,
        availability_note_fa:
            "SMS یک Provider واحد نیست. تا زمانی که قرارداد API رسمی Provider انتخابی در Research ثبت و Adapter آن پیاده‌سازی نشود، اتصال Production فعال نمی‌شود.",
        availability_note_en:
            "SMS has no single provider. Production remains unavailable until the selected provider's current official API contract is documented and its adapter is implemented.",
        auth_model: "none",
        credential_fields: [],
        configuration_fields: [],
        capabilities: [],
        requires_webhook_verification: false,
        official_sources: [],
    },
    {
        channel: "api",
        provider_key: "calibra_api",
        label_fa: "API کالیبرا",
        label_en: "Calibra API",
        official_api: true,
        production_available: true,
        auth_model: "internal",
        credential_fields: [],
        configuration_fields: [],
        capabilities: ["send_text", "receive_text", "webhook"],
        requires_webhook_verification: false,
        official_sources: [],
    },
    {
        channel: "web",
        provider_key: "calibra_web",
        label_fa: "وب",
        label_en: "Web",
        official_api: true,
        production_available: true,
        auth_model: "internal",
        credential_fields: [],
        configuration_fields: [],
        capabilities: ["send_text", "receive_text"],
        requires_webhook_verification: false,
        official_sources: [],
    },
    {
        channel: "phone",
        provider_key: "manual_phone",
        label_fa: "تلفن",
        label_en: "Phone",
        official_api: true,
        production_available: true,
        auth_model: "internal",
        credential_fields: [],
        configuration_fields: [],
        capabilities: [],
        requires_webhook_verification: false,
        official_sources: [],
    },
];

export function providerDefinition(channel: string, providerKey?: string | null): SupportProviderDefinition | null {
    const exact = SUPPORT_PROVIDER_CATALOG.find(
        (item) => item.channel === channel && (!providerKey || item.provider_key === providerKey),
    );
    return exact ?? SUPPORT_PROVIDER_CATALOG.find((item) => item.channel === channel) ?? null;
}

export function publicProviderCatalog() {
    return SUPPORT_PROVIDER_CATALOG.map(({ credential_fields, ...item }) => ({
        ...item,
        credential_fields: credential_fields.map((field) => ({ ...field, secret: true as const })),
    }));
}
