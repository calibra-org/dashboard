import type { SettingValueType } from "#models/setting";

export type ConfigurationScope = "general" | "datetime" | "media" | "branding";
export type ConfigurationCapabilityMode = "settings" | "domain";

export interface ConfigurationSettingDefinition {
    group: string;
    key: string;
    type: SettingValueType;
}

export interface ConfigurationCapability {
    key: string;
    category: "site" | "store";
    mode: ConfigurationCapabilityMode;
    labelFa: string;
    labelEn: string;
    descriptionFa: string;
    descriptionEn: string;
    href: string;
    apiPath: string;
    historyEnabled: boolean;
}

const SETTINGS_SCOPES: Record<ConfigurationScope, ConfigurationSettingDefinition[]> = {
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

export const configurationCapabilities: ConfigurationCapability[] = [
    {
        key: "general",
        category: "site",
        mode: "settings",
        labelFa: "همگانی",
        labelEn: "General",
        descriptionFa: "آدرس فروشگاه، محدوده فروش، مالیات پایه و نمایش ارز",
        descriptionEn: "Store address, selling locations, base tax toggles and currency display",
        href: "/settings/general",
        apiPath: "/api/v1/admin/settings/general",
        historyEnabled: true,
    },
    {
        key: "datetime",
        category: "site",
        mode: "settings",
        labelFa: "تاریخ و زمان",
        labelEn: "Date & Time",
        descriptionFa: "الگوهای نمایش تاریخ و ساعت در پنل مدیریت",
        descriptionEn: "Admin date and time display formats",
        href: "/settings/datetime",
        apiPath: "/api/v1/admin/settings/datetime",
        historyEnabled: true,
    },
    {
        key: "media",
        category: "site",
        mode: "settings",
        labelFa: "رسانه",
        labelEn: "Media",
        descriptionFa: "ابعاد تصاویر و سیاست‌های بارگذاری فایل",
        descriptionEn: "Image sizes and upload policies",
        href: "/settings/media",
        apiPath: "/api/v1/admin/settings/media",
        historyEnabled: true,
    },
    {
        key: "branding",
        category: "site",
        mode: "settings",
        labelFa: "هویت بصری",
        labelEn: "Branding",
        descriptionFa: "نام، لوگو، فونت و توکن‌های رنگ فروشگاه",
        descriptionEn: "Store name, logo, font and palette tokens",
        href: "/branding",
        apiPath: "/api/v1/admin/settings/branding",
        historyEnabled: true,
    },
    {
        key: "catalog",
        category: "store",
        mode: "domain",
        labelFa: "کاتالوگ",
        labelEn: "Catalog",
        descriptionFa: "محصولات، ویژگی‌ها و طبقه‌بندی فروشگاه",
        descriptionEn: "Products, attributes and catalog taxonomies",
        href: "/products",
        apiPath: "/api/v1/admin/products",
        historyEnabled: false,
    },
    {
        key: "payments",
        category: "store",
        mode: "domain",
        labelFa: "پرداخت",
        labelEn: "Payments",
        descriptionFa: "درگاه‌ها، قابلیت ارائه‌دهندگان و تنظیمات امن پرداخت",
        descriptionEn: "Gateways, provider capabilities and secure payment configuration",
        href: "/payments",
        apiPath: "/api/v1/admin/payments",
        historyEnabled: false,
    },
    {
        key: "shipping",
        category: "store",
        mode: "domain",
        labelFa: "حمل‌ونقل",
        labelEn: "Shipping",
        descriptionFa: "مناطق، روش‌ها و قواعد ارسال واقعی فروشگاه",
        descriptionEn: "Real shipping zones, methods and delivery rules",
        href: "/shipping/zones",
        apiPath: "/api/v1/admin/shipping/zones",
        historyEnabled: false,
    },
    {
        key: "tax",
        category: "store",
        mode: "domain",
        labelFa: "مالیات",
        labelEn: "Tax",
        descriptionFa: "نرخ‌ها و کلاس‌های مالیاتی فروشگاه",
        descriptionEn: "Store tax rates and tax classes",
        href: "/tax/rates",
        apiPath: "/api/v1/admin/tax/rates",
        historyEnabled: false,
    },
];

export function isConfigurationScope(value: string): value is ConfigurationScope {
    return Object.hasOwn(SETTINGS_SCOPES, value);
}

export function configurationScopeSettings(scope: ConfigurationScope): ConfigurationSettingDefinition[] {
    return SETTINGS_SCOPES[scope];
}

export function configurationScopeForAuditAction(action: string): ConfigurationScope | null {
    if (action === "settings.general.patch") return "general";
    if (action === "settings.datetime.patch") return "datetime";
    if (action === "settings.media.patch") return "media";
    if (action === "settings.branding.patch") return "branding";
    return null;
}
