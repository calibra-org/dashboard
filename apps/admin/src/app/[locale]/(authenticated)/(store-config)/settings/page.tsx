import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { ConfigurationOverview } from "#/views/store-config/settings/configuration-overview";

export const metadata: Metadata = { title: "Configuration" };

export default async function SettingsIndex({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    const t = await getTranslations("Settings");
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={t("title")} subtitle={t("subtitle")} />
            <ConfigurationOverview />
        </div>
    );
}
