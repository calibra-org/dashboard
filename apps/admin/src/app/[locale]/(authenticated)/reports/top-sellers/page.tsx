import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { TopSellersView } from "#/views/reports/top-sellers-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "Reports.topSellers" });
    return { title: t("title") };
}

/** Thin locale-aware shell; the client view loads the canonical Admin top-products report. */
export default async function TopSellersPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TopSellersView />;
}
