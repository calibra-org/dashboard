import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SegmentStudio } from "#/views/customers/segments/segment-studio";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "CustomerIntelligence.segments" });
    return { title: t("title") };
}

export default async function CustomerSegmentsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <SegmentStudio />;
}
