import type { SettingValueType } from "#models/setting";

export const MASTER_CONFIGURATION_GROUPS = [
    "general", "publishing", "reading", "community", "media", "urls", "catalog", "inventory", "tax",
    "shipping", "payments", "checkout", "notifications", "privacy", "visibility", "integrations", "infrastructure",
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

const ALL_SCOPES = ["tenant", "market", "channel", "environment", "temporary"] as const;
const TENANT = ["tenant"] as const;
const TENANT_ENV = ["tenant", "environment"] as const;

type DefinitionOptions = Partial<Omit<ConfigurationSettingDefinition, "key" | "group" | "type" | "defaultValue" | "storage" | "labelFa" | "labelEn" | "descriptionFa" | "descriptionEn">> & {
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
};

function setting(group: ConfigurationGroup, key: string, type: SettingValueType, defaultValue: unknown, options: DefinitionOptions): ConfigurationSettingDefinition {
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
        approvalPolicy: options.approvalPolicy ?? (riskLevel === "critical" ? "governance_required" : riskLevel === "high" ? "preview_required" : "none"),
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

function linked(group: ConfigurationGroup, key: string, settingsGroup: string, settingsKey: string, type: SettingValueType, defaultValue: unknown, linkedHref: string, labelFa: string, labelEn: string): ConfigurationSettingDefinition {
    return {
        key, group, type, schemaVersion: 1, defaultValue, allowedScopes: TENANT, validation: {}, secretClass: "none", riskLevel: "medium",
        dependencies: [linkedHref], sideEffectPolicy: "domain_owned", previewCapability: false, testCapability: false, restartRequirement: "none",
        approvalPolicy: "none", deprecationPolicy: "active", migrationPolicy: "owned-by-linked-domain", requiredPermission: `configuration:${group}:write`,
        labelFa, labelEn, descriptionFa: "این مقدار در دامنه اصلی خودش مدیریت می‌شود.", descriptionEn: "This value is managed by its canonical domain.",
        storage: { kind: "settings", group: settingsGroup, key: settingsKey, readOnly: true }, linkedHref,
    };
}

export const configurationDefinitions: readonly ConfigurationSettingDefinition[] = [
    linked("general", "general.currency", "general", "currency_display_default", "string", "IRR", "/settings/general", "ارز نمایش", "Display currency"),
    linked("general", "general.date_format", "datetime", "date_format", "string", "d MMMM yyyy", "/settings/datetime", "قالب تاریخ", "Date format"),
    linked("general", "general.brand_name", "branding", "name", "string", "Calibra", "/branding", "نام برند", "Brand name"),
    setting("general", "general.support_email", "string", "", { labelFa: "ایمیل پشتیبانی", labelEn: "Support email", descriptionFa: "ایمیل عمومی پشتیبانی فروشگاه.", descriptionEn: "Public storefront support email.", validation: { pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" } }),
    setting("publishing", "publishing.default_status", "string", "draft", { labelFa: "وضعیت پیش‌فرض انتشار", labelEn: "Default publishing status", descriptionFa: "وضعیت اولیه محتوای جدید.", descriptionEn: "Initial state for newly created content.", validation: { enum: ["draft", "review", "published"] }, dependencies: ["content"] }),
    setting("publishing", "publishing.default_locale", "string", "fa", { labelFa: "زبان پیش‌فرض", labelEn: "Default locale", descriptionFa: "زبان پیش‌فرض محتوای جدید.", descriptionEn: "Default locale for new content.", validation: { enum: ["fa", "en"] } }),
    setting("reading", "reading.homepage_mode", "string", "store", { labelFa: "حالت صفحه اصلی", labelEn: "Homepage mode", descriptionFa: "تجربه پیش‌فرض صفحه اصلی.", descriptionEn: "Default homepage experience.", validation: { enum: ["store", "content", "custom"] }, riskLevel: "medium" }),
    setting("reading", "reading.feed_page_size", "number", 20, { labelFa: "تعداد آیتم فید", labelEn: "Feed page size", descriptionFa: "تعداد آیتم هر صفحه فید.", descriptionEn: "Items returned per feed page.", validation: { min: 1, max: 100 } }),
    setting("community", "community.reviews_enabled", "boolean", true, { labelFa: "دیدگاه محصول", labelEn: "Product reviews", descriptionFa: "امکان ثبت دیدگاه محصول.", descriptionEn: "Allow product reviews.", dependencies: ["reviews"] }),
    setting("community", "community.moderation_required", "boolean", true, { labelFa: "نیاز به تأیید", labelEn: "Moderation required", descriptionFa: "محتوای جامعه قبل از انتشار بررسی شود.", descriptionEn: "Require review before community content is public.", riskLevel: "medium" }),
    linked("media", "media.max_upload_mb", "media", "max_upload_mb", "number", 20, "/settings/media", "حداکثر بارگذاری", "Maximum upload"),
    setting("media", "media.preferred_image_format", "string", "original", { labelFa: "فرمت ترجیحی تصویر", labelEn: "Preferred image format", descriptionFa: "سیاست فرمت پردازش رسانه.", descriptionEn: "Preferred media processing format.", validation: { enum: ["original", "webp", "avif"] }, dependencies: ["media"] }),
    setting("urls", "urls.product_pattern", "string", "/products/{slug}", { labelFa: "الگوی URL محصول", labelEn: "Product URL pattern", descriptionFa: "الگوی عمومی URL محصول.", descriptionEn: "Public product URL pattern.", validation: { pattern: "^/[^?#]*\\{slug\\}[^?#]*$" }, riskLevel: "high", dependencies: ["catalog", "seo", "redirects"], sideEffectPolicy: "redirect_evidence" }),
    setting("urls", "urls.category_base", "string", "/category", { labelFa: "پایه دسته‌بندی", labelEn: "Category base", descriptionFa: "پیشوند URL دسته‌بندی.", descriptionEn: "Category URL prefix.", validation: { pattern: "^/[a-zA-Z0-9_/-]*$" }, riskLevel: "high", dependencies: ["catalog", "seo", "redirects"], sideEffectPolicy: "redirect_evidence" }),
    setting("urls", "urls.trailing_slash", "boolean", false, { labelFa: "اسلش انتهایی", labelEn: "Trailing slash", descriptionFa: "سیاست canonical اسلش انتهایی.", descriptionEn: "Canonical trailing-slash policy.", riskLevel: "high", dependencies: ["seo", "redirects"], sideEffectPolicy: "redirect_evidence" }),
    setting("catalog", "catalog.default_sort", "string", "menu_order", { labelFa: "مرتب‌سازی پیش‌فرض", labelEn: "Default catalog sort", descriptionFa: "فقط سیاست نمایش؛ داده محصول در Catalog می‌ماند.", descriptionEn: "Display policy only; product data remains Catalog-owned.", validation: { enum: ["menu_order", "newest", "price_asc", "price_desc"] }, dependencies: ["catalog"] }),
    setting("inventory", "inventory.low_stock_threshold", "number", 5, { labelFa: "آستانه کمبود", labelEn: "Low-stock threshold", descriptionFa: "پیش‌فرض هشدار، بدون ساخت stock ledger موازی.", descriptionEn: "Alert default without duplicating the stock ledger.", validation: { min: 0, max: 100000 }, dependencies: ["inventory"] }),
    linked("tax", "tax.enabled", "tax", "enabled", "boolean", false, "/settings/general", "مالیات فعال", "Tax enabled"),
    setting("tax", "tax.display_prices", "string", "exclusive", { labelFa: "نمایش مالیات", labelEn: "Tax price display", descriptionFa: "سیاست نمایش؛ نرخ‌ها در Tax canonical می‌مانند.", descriptionEn: "Display policy; rates remain Tax-owned.", validation: { enum: ["exclusive", "inclusive"] }, dependencies: ["tax"], riskLevel: "medium" }),
    setting("shipping", "shipping.default_package_weight_g", "number", 500, { labelFa: "وزن بسته پیش‌فرض", labelEn: "Default package weight", descriptionFa: "پیش‌فرض پیکربندی؛ Zone/Method در Shipping می‌ماند.", descriptionEn: "Configuration default; zones/methods remain Shipping-owned.", validation: { min: 0, max: 1000000 }, dependencies: ["shipping"] }),
    setting("payments", "payments.require_verified_gateway", "boolean", true, { labelFa: "الزام درگاه تأییدشده", labelEn: "Require verified gateway", descriptionFa: "سیاست Checkout؛ درگاه و تراکنش در Payments می‌ماند.", descriptionEn: "Checkout policy; gateways and transactions remain Payments-owned.", dependencies: ["payments", "checkout"], riskLevel: "high" }),
    setting("checkout", "checkout.guest_enabled", "boolean", true, { labelFa: "خرید مهمان", labelEn: "Guest checkout", descriptionFa: "اجازه خرید بدون حساب.", descriptionEn: "Allow checkout without an account.", dependencies: ["checkout", "identity"], riskLevel: "medium" }),
    setting("checkout", "checkout.account_creation", "string", "optional", { labelFa: "ساخت حساب", labelEn: "Account creation", descriptionFa: "سیاست ساخت حساب در Checkout.", descriptionEn: "Account creation policy during checkout.", validation: { enum: ["disabled", "optional", "required"] }, dependencies: ["checkout", "identity"], riskLevel: "medium" }),
    setting("notifications", "notifications.order_created_channels", "json", ["email"], { labelFa: "کانال سفارش جدید", labelEn: "Order-created channels", descriptionFa: "پیش‌فرض کانال؛ ارسال در Messaging می‌ماند.", descriptionEn: "Channel policy; delivery remains Messaging-owned.", dependencies: ["messaging"], allowedScopes: TENANT }),
    setting("notifications", "notifications.event_registry_version", "number", 1, { labelFa: "نسخه رجیستری اعلان", labelEn: "Notification registry version", descriptionFa: "نسخه قرارداد رخدادهای اعلان.", descriptionEn: "Notification-event contract version.", validation: { min: 1, max: 1000 }, dependencies: ["messaging"] }),
    setting("privacy", "privacy.consent_version", "string", "1", { labelFa: "نسخه رضایت", labelEn: "Consent version", descriptionFa: "نسخه سیاست رضایت کاربر.", descriptionEn: "User-consent policy version.", dependencies: ["identity", "consent"], riskLevel: "high" }),
    setting("privacy", "privacy.data_retention_days", "number", 365, { labelFa: "نگهداری داده", labelEn: "Data retention days", descriptionFa: "سیاست نگهداری؛ حذف عملیاتی حاکمیتی است.", descriptionEn: "Retention policy; destructive execution is governance-owned.", validation: { min: 1, max: 3650 }, dependencies: ["privacy", "governance"], riskLevel: "high" }),
    setting("visibility", "visibility.site_state", "string", "live", { labelFa: "وضعیت سایت", labelEn: "Site state", descriptionFa: "کنترل live/coming soon/private.", descriptionEn: "Control live/coming-soon/private state.", validation: { enum: ["live", "coming_soon", "private"] }, riskLevel: "critical", dependencies: ["storefront", "seo"], sideEffectPolicy: "cache_invalidate", allowedScopes: TENANT }),
    setting("visibility", "visibility.robots_policy", "string", "index", { labelFa: "سیاست ربات", labelEn: "Robots policy", descriptionFa: "سیاست index/noindex سطح سایت.", descriptionEn: "Site-level index/noindex policy.", validation: { enum: ["index", "noindex"] }, riskLevel: "critical", dependencies: ["seo"], allowedScopes: TENANT }),
    setting("integrations", "integrations.webhook_timeout_ms", "number", 5000, { labelFa: "مهلت وبهوک", labelEn: "Webhook timeout", descriptionFa: "timeout پیش‌فرض integration.", descriptionEn: "Default integration webhook timeout.", validation: { min: 500, max: 30000 }, dependencies: ["webhooks"] }),
    setting("integrations", "integrations.webhook_secret_ref", "json", null, { labelFa: "مرجع راز وبهوک", labelEn: "Webhook secret reference", descriptionFa: "فقط نام متغیر محیطی ذخیره می‌شود؛ مقدار راز ذخیره نمی‌شود.", descriptionEn: "Only an environment variable reference is stored; secret material is never persisted.", secretClass: "reference", riskLevel: "high", dependencies: ["webhooks", "secrets"], allowedScopes: TENANT_ENV }),
    setting("infrastructure", "infrastructure.cache_ttl_seconds", "number", 300, { labelFa: "TTL کش", labelEn: "Cache TTL", descriptionFa: "پیش‌فرض زیرساختی با نیاز به تأیید.", descriptionEn: "Restricted infrastructure default requiring approval.", validation: { min: 0, max: 86400 }, riskLevel: "critical", restartRequirement: "api", sideEffectPolicy: "restart_required", allowedScopes: TENANT_ENV, requiredPermission: "configuration:infrastructure:write" }),
    setting("infrastructure", "infrastructure.worker_concurrency", "number", 4, { labelFa: "همزمانی Worker", labelEn: "Worker concurrency", descriptionFa: "پیش‌فرض Worker؛ اعمال deployment خارج از موتور است.", descriptionEn: "Worker default; deployment application stays outside this engine.", validation: { min: 1, max: 64 }, riskLevel: "critical", restartRequirement: "worker", sideEffectPolicy: "restart_required", allowedScopes: TENANT_ENV, requiredPermission: "configuration:infrastructure:write" }),
    setting("change_management", "change_management.default_rollout_percent", "number", 100, { labelFa: "درصد انتشار پیش‌فرض", labelEn: "Default rollout percent", descriptionFa: "پیش‌فرض staged rollout.", descriptionEn: "Default staged-rollout percentage.", validation: { min: 1, max: 100 }, allowedScopes: TENANT }),
    setting("change_management", "change_management.rollback_window_days", "number", 30, { labelFa: "پنجره بازگردانی", labelEn: "Rollback window", descriptionFa: "پنجره عملیاتی؛ تاریخچه immutable حذف نمی‌شود.", descriptionEn: "Operational window; immutable history is never deleted.", validation: { min: 1, max: 3650 }, allowedScopes: TENANT }),
];

const META: Record<ConfigurationGroup, Omit<ConfigurationCapability, "key" | "definitionCount">> = {
    general: ["site", "hybrid", "عمومی و هویت سایت", "General & Site Identity", "/settings/general"],
    publishing: ["site", "settings", "انتشار", "Publishing", "/settings/configuration/publishing"],
    reading: ["site", "settings", "خواندن و صفحه اصلی", "Reading & Homepage", "/settings/configuration/reading"],
    community: ["communications", "settings", "دیدگاه و جامعه", "Discussion & Community", "/settings/configuration/community"],
    media: ["site", "hybrid", "رسانه", "Media & DAM", "/settings/media"],
    urls: ["site", "settings", "پیوندها و URL", "Permalinks & URL Governance", "/settings/configuration/urls"],
    catalog: ["commerce", "hybrid", "کاتالوگ", "Catalog", "/products"],
    inventory: ["commerce", "hybrid", "موجودی", "Inventory Defaults", "/settings/configuration/inventory"],
    tax: ["commerce", "hybrid", "مالیات", "Tax Configuration", "/tax/rates"],
    shipping: ["commerce", "hybrid", "ارسال", "Shipping Configuration", "/shipping/zones"],
    payments: ["commerce", "hybrid", "پرداخت", "Payment Configuration", "/payments"],
    checkout: ["commerce", "settings", "تسویه و حساب", "Checkout & Accounts", "/settings/configuration/checkout"],
    notifications: ["communications", "settings", "اعلان‌ها", "Notifications", "/settings/configuration/notifications"],
    privacy: ["governance", "settings", "حریم خصوصی و رضایت", "Privacy, Consent & Legal", "/settings/configuration/privacy"],
    visibility: ["governance", "settings", "نمایانی و انتشار", "Site Visibility & Launch", "/settings/configuration/visibility"],
    integrations: ["developer", "settings", "API و یکپارچه‌سازی", "API, Webhooks & Integrations", "/settings/configuration/integrations"],
    infrastructure: ["developer", "settings", "زیرساخت", "Infrastructure & Operations", "/settings/configuration/infrastructure"],
    change_management: ["change_management", "settings", "مدیریت تغییر", "Change Management", "/settings/configuration/change_management"],
} as unknown as Record<ConfigurationGroup, Omit<ConfigurationCapability, "key" | "definitionCount">>;

export const configurationCapabilities: ConfigurationCapability[] = MASTER_CONFIGURATION_GROUPS.map((key) => {
    const [category, mode, labelFa, labelEn, href] = META[key] as unknown as [ConfigurationCategory, ConfigurationCapabilityMode, string, string, string];
    return { key, category, mode, labelFa, labelEn, descriptionFa: `${labelFa} در Configuration OS`, descriptionEn: `${labelEn} in Configuration OS`, href, apiPath: `/api/v1/admin/settings/configuration/groups/${key}`, historyEnabled: true, definitionCount: configurationDefinitions.filter((item) => item.group === key).length };
});

export function isConfigurationGroup(value: string): value is ConfigurationGroup { return (MASTER_CONFIGURATION_GROUPS as readonly string[]).includes(value) }
export function isConfigurationScope(value: string): value is ConfigurationScope { return isConfigurationGroup(value) || value === "datetime" || value === "branding" }
export function configurationDefinitionsForGroup(group: ConfigurationGroup) { return configurationDefinitions.filter((definition) => definition.group === group) }
export function configurationDefinition(key: string) { return configurationDefinitions.find((definition) => definition.key === key) }
export function configurationScopeSettings(scope: ConfigurationScope): Array<{ group: string; key: string; type: SettingValueType }> {
    if (scope === "datetime") return [{ group: "datetime", key: "date_format", type: "string" }, { group: "datetime", key: "time_format", type: "string" }];
    if (scope === "branding") return ["name", "tagline", "font", "logo_media_id", "favicon_media_id", "palette_background", "palette_foreground", "palette_muted", "palette_muted_foreground", "palette_border", "palette_accent", "palette_accent_foreground"].map((key) => ({ group: "branding", key, type: key.endsWith("_id") ? "json" : "string" })) as Array<{ group: string; key: string; type: SettingValueType }>;
    return configurationDefinitionsForGroup(scope).filter((definition) => definition.storage.kind === "settings").map((definition) => { const storage = definition.storage as Extract<ConfigurationStorage, { kind: "settings" }>; return { group: storage.group, key: storage.key, type: definition.type } });
}
export function configurationScopeForAuditAction(action: string): ConfigurationScope | null {
    if (action === "settings.general.patch") return "general";
    if (action === "settings.datetime.patch") return "datetime";
    if (action === "settings.media.patch") return "media";
    if (action === "settings.branding.patch") return "branding";
    return null;
}
