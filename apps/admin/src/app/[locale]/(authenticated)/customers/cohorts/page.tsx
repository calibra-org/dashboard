import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CohortsLifecycle } from "#/views/customers/cohorts/cohorts-lifecycle";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: "CustomerIntelligence.cohorts" });
    return { title: t("title") };
}

export default async function CustomerCohortsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <CohortsLifecycle />;
}
