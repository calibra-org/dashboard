import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { IntelligenceOverview } from "#/views/customers/intelligence/intelligence-overview";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "CustomerIntelligence.overview" });
    return { title: t("title") };
}

export default async function CustomerIntelligencePage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <IntelligenceOverview />;
}
