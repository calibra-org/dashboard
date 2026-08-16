import type { Locale } from "@calibra/shared/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { DateTimeSettings } from "#/views/settings/datetime/datetime-settings";
import { GeneralSettings } from "#/views/settings/general/general-settings";
import { MediaSettings } from "#/views/settings/media/media-settings";

type SettingsGroup = "general" | "datetime" | "media";

interface PageProps {
    params: Promise<{ locale: string; group: string }>;
}

function isSettingsGroup(value: string): value is SettingsGroup {
    return value === "general" || value === "datetime" || value === "media";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale, group } = await params;
    if (!isSettingsGroup(group)) return { title: "—" };
    const t = await getTranslations({ locale: locale as Locale, namespace: "Settings.groups" });
    return { title: t(group) };
}

export default async function SettingsGroupPage({ params }: PageProps) {
    const { locale, group } = await params;
    setRequestLocale(locale);
    if (!isSettingsGroup(group)) notFound();
    const t = await getTranslations("Settings");
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            {group === "general" ? <GeneralSettings /> : group === "datetime" ? <DateTimeSettings /> : <MediaSettings />}
        </div>
    );
}
