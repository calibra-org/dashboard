import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import type { ConfigurationGroup } from "#/lib/queries/configuration";
import { ConfigurationGroupView } from "#/views/store-config/settings/configuration-group-view";
import { DateTimeSettings } from "#/views/settings/datetime/datetime-settings";
import { GeneralSettings } from "#/views/settings/general/general-settings";
import { MediaSettings } from "#/views/settings/media/media-settings";

type LegacySettingsGroup = "general" | "datetime" | "media";

const CONFIGURATION_GROUPS = [
    "publishing",
    "reading",
    "community",
    "urls",
    "inventory",
    "checkout",
    "notifications",
    "privacy",
    "visibility",
    "integrations",
    "infrastructure",
    "change_management",
] as const satisfies readonly ConfigurationGroup[];

interface PageProps {
    params: Promise<{ locale: string; group: string }>;
}

function isLegacySettingsGroup(value: string): value is LegacySettingsGroup {
    return value === "general" || value === "datetime" || value === "media";
}

function isConfigurationGroup(value: string): value is (typeof CONFIGURATION_GROUPS)[number] {
    return (CONFIGURATION_GROUPS as readonly string[]).includes(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, group } = await params;
    if (isLegacySettingsGroup(group)) {
        const t = await getTranslations({ locale: locale as Locale, namespace: "Settings.groups" });
        return { title: t(group) };
    }
    if (isConfigurationGroup(group)) return { title: locale === "fa" ? "مرکز تنظیمات" : "Configuration" };
    return { title: "—" };
}

export default async function SettingsGroupPage({ params }: PageProps) {
    const { locale, group } = await params;
    setRequestLocale(locale);
    if (!isLegacySettingsGroup(group) && !isConfigurationGroup(group)) notFound();

    const t = await getTranslations("Settings");
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title={isConfigurationGroup(group) ? (locale === "fa" ? "مرکز تنظیمات" : "Configuration") : t("title")}
                subtitle={
                    isConfigurationGroup(group)
                        ? locale === "fa"
                            ? "پیکربندی نسخه‌دار، قابل بازگردانی و امن"
                            : "Versioned, reversible and safe configuration"
                        : t("subtitle")
                }
            />
            {group === "general" ? (
                <GeneralSettings />
            ) : group === "datetime" ? (
                <DateTimeSettings />
            ) : group === "media" ? (
                <MediaSettings />
            ) : (
                <ConfigurationGroupView group={group} />
            )}
        </div>
    );
}
