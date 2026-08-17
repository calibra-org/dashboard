import type { SettingValueType } from "#models/setting";

export const MASTER_CONFIGURATION_GROUPS = [
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
] as const;

export type ConfigurationGroup = (typeof MASTER_CONFIGURATION_GROUPS)[number];
export type ConfigurationScope = ConfigurationGroup | "datetime" | "branding";
export type ConfigurationScopeType = "tenant" | "market" | "channel" | "environment" | "temporary";
export type ConfigurationRiskLevel = "low" | "medium" | "high" | "critical";
export type ConfigurationCapabilityMode = "settings" | "domain" | "hybrid";
export type ConfigurationCategory = "site" | "commerce" | "communications" | "governance" | "developer" | "change_management";
export type ConfigurationStorage = { kind: "override" } | { kind: "settings"; group: string; key: string; readOnly: true };

export interface ConfigurationSettingDefinition {
    key: string;
    group: ConfigurationGroup;
    type: SettingValueType;
    schemaVersion: number;
    defaultValue: unknown;
    allowedScopes: readonly ConfigurationScopeType[];
    validation: { enum?: readonly string[]; min?: number; max?: number; pattern?: string };
    secretClass: "none" | "reference";
    riskLevel: ConfigurationRiskLevel;
    dependencies: readonly string[];
    sideEffectPolicy: "none" | "cache_invalidate" | "redirect_evidence" | "restart_required" | "domain_owned";
    previewCapability: boolean;
    testCapability: boolean;
    restartRequirement: "none" | "api" | "worker" | "storefront";
    approvalPolicy: "none" | "preview_required" | "governance_required";
    deprecationPolicy: "active" | "deprecated";
    migrationPolicy: string;
    requiredPermission: string;
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
    storage: ConfigurationStorage;
    linkedHref?: string;
}

export interface ConfigurationCapability {
    key: ConfigurationGroup;
    category: ConfigurationCategory;
    mode: ConfigurationCapabilityMode;
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
    href: string;
    apiPath: string;
    historyEnabled: boolean;
    definitionCount: number;
}

interface GroupMeta {
    category: ConfigurationCategory;
    mode: ConfigurationCapabilityMode;
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
    href: string;
}

const ALL_SCOPES = ["tenant", "market", "channel", "environment", "temporary"] as const;
const TENANT = ["tenant"] as const;
const TENANT_ENV = ["tenant", "environment"] as const;

type DefinitionOptions = Partial<
    Omit<
        ConfigurationSettingDefinition,
        "key" | "group" | "type" | "defaultValue" | "storage" | "labelFa" | "labelEn" | "descriptionFa" | "descriptionEn"
    >
> & {
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
};

function setting(
    group: ConfigurationGroup,
    key: string,
    type: SettingValueType,
    defaultValue: unknown,
    options: DefinitionOptions,
): ConfigurationSettingDefinition {
    const riskLevel = options.riskLevel ?? "low";
    return {
        key,
        group,
        type,
        schemaVersion: options.schemaVersion ?? 1,
        defaultValue,
        allowedScopes: options.allowedScopes ?? ALL_SCOPES,
        validation: options.validation ?? {},
        secretClass: options.secretClass ?? "none",
        riskLevel,
        dependencies: options.dependencies ?? [],
        sideEffectPolicy: options.sideEffectPolicy ?? "none",
        previewCapability: options.previewCapability ?? true,
        testCapability: options.testCapability ?? true,
        restartRequirement: options.restartRequirement ?? "none",
        approvalPolicy:
            options.approvalPolicy ??
            (riskLevel === "critical" ? "governance_required" : riskLevel === "high" ? "preview_required" : "none"),
        deprecationPolicy: options.deprecationPolicy ?? "active",
        migrationPolicy: options.migrationPolicy ?? "additive/default-preserving",
        requiredPermission: options.requiredPermission ?? `configuration:${group}:write`,
        labelFa: options.labelFa,
        labelEn: options.labelEn,
        descriptionFa: options.descriptionFa,
        descriptionEn: options.descriptionEn,
        storage: { kind: "override" },
        linkedHref: options.linkedHref,
    };
}

function linked(
    group: ConfigurationGroup,
    key: string,
    settingsGroup: string,
    settingsKey: string,
    type: SettingValueType,
    defaultValue: unknown,
    linkedHref: string,
    labelFa: string,
    labelEn: string,
): ConfigurationSettingDefinition {
    return {
        key,
        group,
        type,
        schemaVersion: 1,
        defaultValue,
        allowedScopes: TENANT,
        validation: {},
        secretClass: "none",
        riskLevel: "medium",
        dependencies: [linkedHref],
        sideEffectPolicy: "domain_owned",
        previewCapability: false,
        testCapability: false,
        restartRequirement: "none",
        approvalPolicy: "none",
        deprecationPolicy: "active",
        migrationPolicy: "owned-by-linked-domain",
        requiredPermission: `configuration:${group}:write`,
        labelFa,
        labelEn,
        descriptionFa: "این مقدار در دامنه اصلی خودش مدیریت می‌شود.",
        descriptionEn: "This value is managed by its canonical domain.",
        storage: { kind: "settings", group: settingsGroup, key: settingsKey, readOnly: true },
        linkedHref,
    };
}

export const configurationDefinitions: readonly ConfigurationSettingDefinition[] = [
    linked(
        "general",
        "general.currency",
        "general",
        "currency_display_default",
        "string",
        "IRR",
        "/settings/general",
        "ارز نمایش",
        "Display currency",
    ),
    linked(
        "general",
        "general.date_format",
        "datetime",
        "date_format",
        "string",
        "d MMMM yyyy",
        "/settings/datetime",
        "قالب تاریخ",
        "Date format",
    ),
    linked("general", "general.brand_name", "branding", "name", "string", "Calibra", "/branding", "نام برند", "Brand name"),
    setting("general", "general.support_email", "string", "", {
        labelFa: "ایمیل پشتیبانی",
        labelEn: "Support email",
        descriptionFa: "ایمیل عمومی پشتیبانی فروشگاه.",
        descriptionEn: "Public storefront support email.",
        validation: { pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
    }),
    setting("general", "general.weight_unit", "string", "kg", {
        labelFa: "واحد وزن",
        labelEn: "Weight unit",
        descriptionFa: "واحد نمایش وزن در لایه ارائه.",
        descriptionEn: "Presentation-layer weight unit.",
        validation: { enum: ["kg", "g", "lb", "oz"] },
    }),
    setting("general", "general.dimension_unit", "string", "cm", {
        labelFa: "واحد ابعاد",
        labelEn: "Dimension unit",
        descriptionFa: "واحد نمایش ابعاد در لایه ارائه.",
        descriptionEn: "Presentation-layer dimension unit.",
        validation: { enum: ["mm", "cm", "m", "in"] },
    }),
    setting("publishing", "publishing.default_status", "string", "draft", {
        labelFa: "وضعیت پیش‌فرض انتشار",
        labelEn: "Default publishing status",
        descriptionFa: "وضعیت اولیه محتوای جدید.",
        descriptionEn: "Initial state for newly created content.",
        validation: { enum: ["draft", "review", "published"] },
        dependencies: ["content"],
    }),
    setting("publishing", "publishing.default_locale", "string", "fa", {
        labelFa: "زبان پیش‌فرض",
        labelEn: "Default locale",
        descriptionFa: "زبان پیش‌فرض محتوای جدید.",
        descriptionEn: "Default locale for new content.",
        validation: { enum: ["fa", "en"] },
    }),
    setting("publishing", "publishing.ai_label_required", "boolean", true, {
        labelFa: "برچسب محتوای AI",
        labelEn: "AI content label",
        descriptionFa: "الزام ثبت provenance برای محتوای تولیدشده با AI.",
        descriptionEn: "Require provenance metadata for AI-generated content.",
        dependencies: ["content"],
    }),
    setting("reading", "reading.homepage_mode", "string", "store", {
        labelFa: "حالت صفحه اصلی",
        labelEn: "Homepage mode",
        descriptionFa: "تجربه پیش‌فرض صفحه اصلی.",
        descriptionEn: "Default homepage experience.",
        validation: { enum: ["store", "content", "composable"] },
        riskLevel: "medium",
    }),
    setting("reading", "reading.feed_page_size", "number", 20, {
        labelFa: "تعداد آیتم فید",
        labelEn: "Feed page size",
        descriptionFa: "تعداد آیتم هر صفحه فید.",
        descriptionEn: "Items returned per feed page.",
        validation: { min: 1, max: 100 },
    }),
    setting("reading", "reading.homepage_modules", "json", [], {
        labelFa: "ماژول‌های صفحه اصلی",
        labelEn: "Homepage modules",
        descriptionFa: "رجیستری ترتیب و فعال‌بودن ماژول‌های composable homepage.",
        descriptionEn: "Registry of enabled/ordered composable homepage modules.",
        dependencies: ["storefront", "content"],
        riskLevel: "medium",
    }),
    setting("community", "community.reviews_enabled", "boolean", true, {
        labelFa: "دیدگاه محصول",
        labelEn: "Product reviews",
        descriptionFa: "امکان ثبت دیدگاه محصول.",
        descriptionEn: "Allow product reviews.",
        dependencies: ["reviews"],
    }),
    setting("community", "community.moderation_required", "boolean", true, {
        labelFa: "نیاز به تأیید",
        labelEn: "Moderation required",
        descriptionFa: "محتوای جامعه قبل از انتشار بررسی شود.",
        descriptionEn: "Require review before community content is public.",
        riskLevel: "medium",
    }),
    setting("community", "community.report_escalation_threshold", "number", 3, {
        labelFa: "آستانه ارجاع گزارش",
        labelEn: "Report escalation threshold",
        descriptionFa: "پس از این تعداد گزارش، مورد برای Tickets آماده ارجاع است.",
        descriptionEn: "After this many reports, the case is ready for Tickets escalation.",
        validation: { min: 1, max: 100 },
        dependencies: ["tickets"],
    }),
    linked(
        "media",
        "media.max_upload_mb",
        "media",
        "max_upload_mb",
        "number",
        20,
        "/settings/media",
        "حداکثر بارگذاری",
        "Maximum upload",
    ),
    setting("media", "media.preferred_image_format", "string", "original", {
        labelFa: "فرمت ترجیحی تصویر",
        labelEn: "Preferred image format",
        descriptionFa: "سیاست فرمت پردازش رسانه.",
        descriptionEn: "Preferred media processing format.",
        validation: { enum: ["original", "webp", "avif"] },
        dependencies: ["media"],
    }),
    setting("media", "media.original_retention", "string", "keep", {
        labelFa: "نگهداری فایل اصلی",
        labelEn: "Original retention",
        descriptionFa: "سیاست نگهداری asset اصلی.",
        descriptionEn: "Original asset retention policy.",
        validation: { enum: ["keep", "archive"] },
        dependencies: ["media", "storage"],
    }),
    setting("urls", "urls.product_pattern", "string", "/products/{slug}", {
        labelFa: "الگوی URL محصول",
        labelEn: "Product URL pattern",
        descriptionFa: "الگوی عمومی URL محصول.",
        descriptionEn: "Public product URL pattern.",
        validation: { pattern: "^/[^?#]*\\{slug\\}[^?#]*$" },
        riskLevel: "high",
        dependencies: ["catalog", "seo", "redirects"],
        sideEffectPolicy: "redirect_evidence",
    }),
    setting("urls", "urls.category_base", "string", "/category", {
        labelFa: "پایه دسته‌بندی",
        labelEn: "Category base",
        descriptionFa: "پیشوند URL دسته‌بندی.",
        descriptionEn: "Category URL prefix.",
        validation: { pattern: "^/[a-zA-Z0-9_/-]*$" },
        riskLevel: "high",
        dependencies: ["catalog", "seo", "redirects"],
        sideEffectPolicy: "redirect_evidence",
    }),
    setting("urls", "urls.trailing_slash", "boolean", false, {
        labelFa: "اسلش انتهایی",
        labelEn: "Trailing slash",
        descriptionFa: "سیاست canonical اسلش انتهایی.",
        descriptionEn: "Canonical trailing-slash policy.",
        riskLevel: "high",
        dependencies: ["seo", "redirects"],
        sideEffectPolicy: "redirect_evidence",
    }),
    setting("catalog", "catalog.default_sort", "string", "menu_order", {
        labelFa: "مرتب‌سازی پیش‌فرض",
        labelEn: "Default catalog sort",
        descriptionFa: "فقط سیاست نمایش؛ داده محصول در Catalog می‌ماند.",
        descriptionEn: "Display policy only; product data remains Catalog-owned.",
        validation: { enum: ["menu_order", "newest", "price_asc", "price_desc"] },
        dependencies: ["catalog"],
    }),
    setting("catalog", "catalog.page_size", "number", 24, {
        labelFa: "تعداد محصول در صفحه",
        labelEn: "Catalog page size",
        descriptionFa: "پیش‌فرض صفحه‌بندی کاتالوگ.",
        descriptionEn: "Default catalog pagination size.",
        validation: { min: 1, max: 100 },
        dependencies: ["catalog"],
    }),
    setting("inventory", "inventory.low_stock_threshold", "number", 5, {
        labelFa: "آستانه کمبود",
        labelEn: "Low-stock threshold",
        descriptionFa: "پیش‌فرض هشدار، بدون ساخت stock ledger موازی.",
        descriptionEn: "Alert default without duplicating the stock ledger.",
        validation: { min: 0, max: 100000 },
        dependencies: ["inventory"],
    }),
    setting("inventory", "inventory.reserve_minutes", "number", 15, {
        labelFa: "مدت رزرو موجودی",
        labelEn: "Inventory hold minutes",
        descriptionFa: "پیش‌فرض مدت hold؛ عملیات موجودی در InventoryService می‌ماند.",
        descriptionEn: "Default hold duration; operational inventory stays in InventoryService.",
        validation: { min: 1, max: 1440 },
        dependencies: ["inventory", "checkout"],
    }),
    linked("tax", "tax.enabled", "tax", "enabled", "boolean", false, "/settings/general", "مالیات فعال", "Tax enabled"),
    setting("tax", "tax.display_prices", "string", "exclusive", {
        labelFa: "نمایش مالیات",
        labelEn: "Tax price display",
        descriptionFa: "سیاست نمایش؛ نرخ‌ها در Tax canonical می‌مانند.",
        descriptionEn: "Display policy; rates remain Tax-owned.",
        validation: { enum: ["exclusive", "inclusive"] },
        dependencies: ["tax"],
        riskLevel: "medium",
    }),
    setting("tax", "tax.rounding_policy", "string", "line", {
        labelFa: "سیاست گردکردن",
        labelEn: "Tax rounding policy",
        descriptionFa: "سیاست گردکردن؛ محاسبه توسط Tax domain انجام می‌شود.",
        descriptionEn: "Rounding policy; calculation remains Tax-domain owned.",
        validation: { enum: ["line", "subtotal"] },
        dependencies: ["tax"],
        riskLevel: "high",
    }),
    setting("shipping", "shipping.default_package_weight_g", "number", 500, {
        labelFa: "وزن بسته پیش‌فرض",
        labelEn: "Default package weight",
        descriptionFa: "پیش‌فرض پیکربندی؛ Zone/Method در Shipping می‌ماند.",
        descriptionEn: "Configuration default; zones/methods remain Shipping-owned.",
        validation: { min: 0, max: 1000000 },
        dependencies: ["shipping"],
    }),
    setting("shipping", "shipping.require_phone", "boolean", true, {
        labelFa: "شماره تماس برای ارسال",
        labelEn: "Require phone for shipping",
        descriptionFa: "سیاست Checkout برای سفارش‌های ارسالی.",
        descriptionEn: "Checkout policy for shippable orders.",
        dependencies: ["shipping", "checkout"],
    }),
    setting("payments", "payments.require_verified_gateway", "boolean", true, {
        labelFa: "الزام درگاه تأییدشده",
        labelEn: "Require verified gateway",
        descriptionFa: "سیاست Checkout؛ درگاه و تراکنش در Payments می‌ماند.",
        descriptionEn: "Checkout policy; gateways and transactions remain Payments-owned.",
        dependencies: ["payments", "checkout"],
        riskLevel: "high",
    }),
    setting("payments", "payments.session_timeout_seconds", "number", 900, {
        labelFa: "مهلت نشست پرداخت",
        labelEn: "Payment session timeout",
        descriptionFa: "پیش‌فرض timeout؛ adapter پرداخت source of truth قابلیت‌هاست.",
        descriptionEn: "Timeout default; payment adapters remain the capability source of truth.",
        validation: { min: 60, max: 7200 },
        dependencies: ["payments"],
        riskLevel: "medium",
    }),
    setting("checkout", "checkout.guest_enabled", "boolean", true, {
        labelFa: "خرید مهمان",
        labelEn: "Guest checkout",
        descriptionFa: "اجازه خرید بدون حساب.",
        descriptionEn: "Allow checkout without an account.",
        dependencies: ["checkout", "identity"],
        riskLevel: "medium",
    }),
    setting("checkout", "checkout.account_creation", "string", "optional", {
        labelFa: "ساخت حساب",
        labelEn: "Account creation",
        descriptionFa: "سیاست ساخت حساب در Checkout.",
        descriptionEn: "Account creation policy during checkout.",
        validation: { enum: ["disabled", "optional", "required"] },
        dependencies: ["checkout", "identity"],
        riskLevel: "medium",
    }),
    setting("checkout", "checkout.abandoned_threshold_minutes", "number", 60, {
        labelFa: "آستانه سبد رهاشده",
        labelEn: "Abandoned checkout threshold",
        descriptionFa: "آستانه زمانی اعلام abandoned checkout.",
        descriptionEn: "Time threshold for abandoned-checkout classification.",
        validation: { min: 5, max: 10080 },
        dependencies: ["checkout", "analytics"],
    }),
    setting("notifications", "notifications.order_created_channels", "json", ["email"], {
        labelFa: "کانال سفارش جدید",
        labelEn: "Order-created channels",
        descriptionFa: "پیش‌فرض کانال؛ ارسال و receipt در Messaging می‌ماند.",
        descriptionEn: "Channel policy; delivery and receipts remain Messaging-owned.",
        dependencies: ["messaging"],
        allowedScopes: TENANT,
    }),
    setting("notifications", "notifications.event_registry_version", "number", 1, {
        labelFa: "نسخه رجیستری اعلان",
        labelEn: "Notification registry version",
        descriptionFa: "نسخه قرارداد Event → Audience → Channel → Template.",
        descriptionEn: "Version of the Event → Audience → Channel → Template contract.",
        validation: { min: 1, max: 1000 },
        dependencies: ["messaging"],
    }),
    setting("privacy", "privacy.consent_version", "string", "1", {
        labelFa: "نسخه رضایت",
        labelEn: "Consent version",
        descriptionFa: "نسخه سیاست رضایت کاربر.",
        descriptionEn: "User-consent policy version.",
        dependencies: ["identity", "consent"],
        riskLevel: "high",
    }),
    setting("privacy", "privacy.data_retention_days", "number", 365, {
        labelFa: "نگهداری داده",
        labelEn: "Data retention days",
        descriptionFa: "سیاست نگهداری؛ حذف عملیاتی حاکمیتی است.",
        descriptionEn: "Retention policy; destructive execution is governance-owned.",
        validation: { min: 1, max: 3650 },
        dependencies: ["privacy", "governance"],
        riskLevel: "high",
    }),
    setting("visibility", "visibility.site_state", "string", "live", {
        labelFa: "وضعیت سایت",
        labelEn: "Site state",
        descriptionFa: "کنترل وضعیت انتشار عمومی سایت.",
        descriptionEn: "Control the public launch state.",
        validation: { enum: ["live", "coming_soon", "maintenance", "private", "staff_only", "password_protected", "scheduled"] },
        riskLevel: "critical",
        dependencies: ["storefront", "seo"],
        sideEffectPolicy: "cache_invalidate",
        allowedScopes: TENANT,
    }),
    setting("visibility", "visibility.robots_policy", "string", "index", {
        labelFa: "سیاست ربات",
        labelEn: "Robots policy",
        descriptionFa: "سیاست index/noindex سطح سایت.",
        descriptionEn: "Site-level index/noindex policy.",
        validation: { enum: ["index", "noindex"] },
        riskLevel: "critical",
        dependencies: ["seo"],
        allowedScopes: TENANT,
    }),
    setting("integrations", "integrations.webhook_timeout_ms", "number", 5000, {
        labelFa: "مهلت وبهوک",
        labelEn: "Webhook timeout",
        descriptionFa: "timeout پیش‌فرض integration.",
        descriptionEn: "Default integration webhook timeout.",
        validation: { min: 500, max: 30000 },
        dependencies: ["webhooks"],
    }),
    setting("integrations", "integrations.webhook_secret_ref", "json", null, {
        labelFa: "مرجع راز وبهوک",
        labelEn: "Webhook secret reference",
        descriptionFa: "فقط نام متغیر محیطی ذخیره می‌شود؛ مقدار راز ذخیره نمی‌شود.",
        descriptionEn: "Only an environment variable reference is stored; secret material is never persisted.",
        secretClass: "reference",
        riskLevel: "high",
        dependencies: ["webhooks", "secrets"],
        allowedScopes: TENANT_ENV,
    }),
    setting("infrastructure", "infrastructure.cache_ttl_seconds", "number", 300, {
        labelFa: "TTL کش",
        labelEn: "Cache TTL",
        descriptionFa: "پیش‌فرض زیرساختی با نیاز به تأیید؛ اعمال runtime جداگانه است.",
        descriptionEn: "Restricted infrastructure default; runtime application is separately controlled.",
        validation: { min: 0, max: 86400 },
        riskLevel: "critical",
        restartRequirement: "api",
        sideEffectPolicy: "restart_required",
        allowedScopes: TENANT_ENV,
        requiredPermission: "configuration:infrastructure:write",
    }),
    setting("infrastructure", "infrastructure.worker_concurrency", "number", 4, {
        labelFa: "همزمانی Worker",
        labelEn: "Worker concurrency",
        descriptionFa: "پیش‌فرض Worker؛ اعمال deployment خارج از موتور است.",
        descriptionEn: "Worker default; deployment application stays outside this engine.",
        validation: { min: 1, max: 64 },
        riskLevel: "critical",
        restartRequirement: "worker",
        sideEffectPolicy: "restart_required",
        allowedScopes: TENANT_ENV,
        requiredPermission: "configuration:infrastructure:write",
    }),
    setting("change_management", "change_management.default_rollout_percent", "number", 100, {
        labelFa: "درصد انتشار پیش‌فرض",
        labelEn: "Default rollout percent",
        descriptionFa: "پیش‌فرض staged rollout.",
        descriptionEn: "Default staged-rollout percentage.",
        validation: { min: 1, max: 100 },
        allowedScopes: TENANT,
    }),
    setting("change_management", "change_management.rollback_window_days", "number", 30, {
        labelFa: "پنجره بازگردانی",
        labelEn: "Rollback window",
        descriptionFa: "پنجره عملیاتی؛ تاریخچه immutable حذف نمی‌شود.",
        descriptionEn: "Operational window; immutable history is never deleted.",
        validation: { min: 1, max: 3650 },
        allowedScopes: TENANT,
    }),
];

const GROUP_META: Record<ConfigurationGroup, GroupMeta> = {
    general: {
        category: "site",
        mode: "hybrid",
        labelFa: "عمومی و هویت سایت",
        labelEn: "General & Site Identity",
        descriptionFa: "هویت، منطقه، ارز و سیاست‌های عمومی سایت",
        descriptionEn: "Identity, regional, currency and general site policy",
        href: "/settings/general",
    },
    publishing: {
        category: "site",
        mode: "settings",
        labelFa: "انتشار",
        labelEn: "Publishing",
        descriptionFa: "پیش‌فرض‌های نوشتن و انتشار محتوا",
        descriptionEn: "Writing and publishing defaults",
        href: "/settings/configuration/publishing",
    },
    reading: {
        category: "site",
        mode: "settings",
        labelFa: "خواندن و صفحه اصلی",
        labelEn: "Reading & Homepage",
        descriptionFa: "صفحه اصلی، فید و ماژول‌های composable",
        descriptionEn: "Homepage, feed and composable modules",
        href: "/settings/configuration/reading",
    },
    community: {
        category: "communications",
        mode: "settings",
        labelFa: "دیدگاه و جامعه",
        labelEn: "Discussion & Community",
        descriptionFa: "دیدگاه، بازبینی و moderation",
        descriptionEn: "Review, discussion and moderation policy",
        href: "/settings/configuration/community",
    },
    media: {
        category: "site",
        mode: "hybrid",
        labelFa: "رسانه",
        labelEn: "Media & DAM",
        descriptionFa: "پیش‌فرض‌های رسانه با اتصال به دامنه Media",
        descriptionEn: "Media policy linked to the canonical Media domain",
        href: "/settings/media",
    },
    urls: {
        category: "site",
        mode: "settings",
        labelFa: "پیوندها و URL",
        labelEn: "Permalinks & URL Governance",
        descriptionFa: "URL Safety Engine، preview و redirect evidence",
        descriptionEn: "URL Safety Engine, preview and redirect evidence",
        href: "/settings/configuration/urls",
    },
    catalog: {
        category: "commerce",
        mode: "hybrid",
        labelFa: "کاتالوگ",
        labelEn: "Catalog",
        descriptionFa: "پیش‌فرض نمایش بدون duplicate محصول و taxonomy",
        descriptionEn: "Display defaults without duplicating products/taxonomy",
        href: "/settings/configuration/catalog",
    },
    inventory: {
        category: "commerce",
        mode: "hybrid",
        labelFa: "موجودی",
        labelEn: "Inventory Defaults",
        descriptionFa: "پیش‌فرض‌های سیاست موجودی بدون stock ledger موازی",
        descriptionEn: "Inventory policy defaults without a parallel stock ledger",
        href: "/settings/configuration/inventory",
    },
    tax: {
        category: "commerce",
        mode: "hybrid",
        labelFa: "مالیات",
        labelEn: "Tax Configuration",
        descriptionFa: "سیاست و simulator با reuse دامنه Tax",
        descriptionEn: "Policy and simulator reusing the canonical Tax domain",
        href: "/settings/configuration/tax",
    },
    shipping: {
        category: "commerce",
        mode: "hybrid",
        labelFa: "ارسال",
        labelEn: "Shipping Configuration",
        descriptionFa: "پیش‌فرض‌ها با اتصال به zone/method واقعی",
        descriptionEn: "Defaults linked to canonical zones/methods",
        href: "/settings/configuration/shipping",
    },
    payments: {
        category: "commerce",
        mode: "hybrid",
        labelFa: "پرداخت",
        labelEn: "Payment Configuration",
        descriptionFa: "سیاست Checkout با اتصال به درگاه‌های واقعی",
        descriptionEn: "Checkout policy linked to canonical gateways",
        href: "/settings/configuration/payments",
    },
    checkout: {
        category: "commerce",
        mode: "settings",
        labelFa: "تسویه و حساب",
        labelEn: "Checkout & Accounts",
        descriptionFa: "سیاست‌های Checkout و حساب",
        descriptionEn: "Checkout and account policy",
        href: "/settings/configuration/checkout",
    },
    notifications: {
        category: "communications",
        mode: "settings",
        labelFa: "اعلان‌ها",
        labelEn: "Notifications",
        descriptionFa: "Event Registry و سیاست کانال‌ها بدون duplicate Messaging",
        descriptionEn: "Event registry and channel policy without duplicating Messaging",
        href: "/settings/configuration/notifications",
    },
    privacy: {
        category: "governance",
        mode: "settings",
        labelFa: "حریم خصوصی و رضایت",
        labelEn: "Privacy, Consent & Legal",
        descriptionFa: "سیاست رضایت، نسخه‌ها و نگهداری داده",
        descriptionEn: "Consent, versioning and retention policy",
        href: "/settings/configuration/privacy",
    },
    visibility: {
        category: "governance",
        mode: "settings",
        labelFa: "نمایانی و انتشار",
        labelEn: "Site Visibility & Launch",
        descriptionFa: "کنترل launch و robots با preview اجباری",
        descriptionEn: "Launch and robots controls with mandatory preview",
        href: "/settings/configuration/visibility",
    },
    integrations: {
        category: "developer",
        mode: "settings",
        labelFa: "API و یکپارچه‌سازی",
        labelEn: "API, Webhooks & Integrations",
        descriptionFa: "پیش‌فرض integration و secret referenceهای امن",
        descriptionEn: "Integration defaults and safe secret references",
        href: "/settings/configuration/integrations",
    },
    infrastructure: {
        category: "developer",
        mode: "settings",
        labelFa: "زیرساخت",
        labelEn: "Infrastructure & Operations",
        descriptionFa: "تنظیمات محدود و نیازمند permission/approval",
        descriptionEn: "Restricted configuration requiring permission/approval",
        href: "/settings/configuration/infrastructure",
    },
    change_management: {
        category: "change_management",
        mode: "settings",
        labelFa: "مدیریت تغییر",
        labelEn: "Change Management",
        descriptionFa: "version، diff، rollback، rollout، blueprint و drift",
        descriptionEn: "Version, diff, rollback, rollout, blueprint and drift",
        href: "/settings/configuration/change_management",
    },
};

export const configurationCapabilities: ConfigurationCapability[] = MASTER_CONFIGURATION_GROUPS.map((key) => ({
    key,
    ...GROUP_META[key],
    apiPath: `/api/v1/admin/settings/configuration/groups/${key}`,
    historyEnabled: true,
    definitionCount: configurationDefinitions.filter((definition) => definition.group === key).length,
}));

const LEGACY_SCOPES: Record<
    "general" | "datetime" | "media" | "branding",
    Array<{ group: string; key: string; type: SettingValueType }>
> = {
    general: [
        { group: "general", key: "store_address_1", type: "string" },
        { group: "general", key: "store_address_2", type: "string" },
        { group: "general", key: "store_city", type: "string" },
        { group: "general", key: "store_state", type: "string" },
        { group: "general", key: "store_postcode", type: "string" },
        { group: "general", key: "country_default", type: "string" },
        { group: "general", key: "selling_locations", type: "string" },
        { group: "general", key: "selling_locations_specific", type: "json" },
        { group: "general", key: "selling_locations_excluded", type: "json" },
        { group: "general", key: "shipping_locations", type: "string" },
        { group: "general", key: "shipping_locations_specific", type: "json" },
        { group: "general", key: "default_customer_location", type: "string" },
        { group: "tax", key: "enabled", type: "boolean" },
        { group: "tax", key: "coupons_enabled", type: "boolean" },
        { group: "tax", key: "calc_discounts_sequentially", type: "boolean" },
        { group: "general", key: "currency_display_default", type: "string" },
        { group: "general", key: "currency_position", type: "string" },
        { group: "general", key: "price_thousand_sep", type: "string" },
        { group: "general", key: "price_decimal_sep", type: "string" },
        { group: "general", key: "price_num_decimals", type: "number" },
    ],
    datetime: [
        { group: "datetime", key: "date_format", type: "string" },
        { group: "datetime", key: "time_format", type: "string" },
    ],
    media: [
        { group: "media", key: "thumbnail_width", type: "number" },
        { group: "media", key: "thumbnail_height", type: "number" },
        { group: "media", key: "thumbnail_crop", type: "boolean" },
        { group: "media", key: "medium_width", type: "number" },
        { group: "media", key: "medium_height", type: "number" },
        { group: "media", key: "large_width", type: "number" },
        { group: "media", key: "large_height", type: "number" },
        { group: "media", key: "organize_uploads_by_date", type: "boolean" },
        { group: "media", key: "max_upload_mb", type: "number" },
    ],
    branding: [
        { group: "branding", key: "name", type: "string" },
        { group: "branding", key: "tagline", type: "string" },
        { group: "branding", key: "font", type: "string" },
        { group: "branding", key: "logo_media_id", type: "json" },
        { group: "branding", key: "favicon_media_id", type: "json" },
        { group: "branding", key: "palette_background", type: "string" },
        { group: "branding", key: "palette_foreground", type: "string" },
        { group: "branding", key: "palette_muted", type: "string" },
        { group: "branding", key: "palette_muted_foreground", type: "string" },
        { group: "branding", key: "palette_border", type: "string" },
        { group: "branding", key: "palette_accent", type: "string" },
        { group: "branding", key: "palette_accent_foreground", type: "string" },
    ],
};

export function isConfigurationGroup(value: string): value is ConfigurationGroup {
    return (MASTER_CONFIGURATION_GROUPS as readonly string[]).includes(value);
}

export function isConfigurationScope(value: string): value is ConfigurationScope {
    return isConfigurationGroup(value) || value === "datetime" || value === "branding";
}

export function configurationDefinitionsForGroup(group: ConfigurationGroup): readonly ConfigurationSettingDefinition[] {
    return configurationDefinitions.filter((definition) => definition.group === group);
}

export function configurationDefinition(key: string): ConfigurationSettingDefinition | undefined {
    return configurationDefinitions.find((definition) => definition.key === key);
}

export function configurationScopeSettings(
    scope: ConfigurationScope,
): Array<{ group: string; key: string; type: SettingValueType }> {
    if (scope === "general" || scope === "datetime" || scope === "media" || scope === "branding") return LEGACY_SCOPES[scope];
    return configurationDefinitionsForGroup(scope)
        .filter((definition) => definition.storage.kind === "settings")
        .map((definition) => {
            const storage = definition.storage as Extract<ConfigurationStorage, { kind: "settings" }>;
            return { group: storage.group, key: storage.key, type: definition.type };
        });
}

export function configurationScopeForAuditAction(action: string): ConfigurationScope | null {
    if (action === "settings.general.patch") return "general";
    if (action === "settings.datetime.patch") return "datetime";
    if (action === "settings.media.patch") return "media";
    if (action === "settings.branding.patch") return "branding";
    return null;
}
