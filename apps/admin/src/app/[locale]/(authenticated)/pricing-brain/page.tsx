import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { PricingBrainDashboard } from "#/features/pricing-brain/pricing-brain-dashboard";
import type { PricingBrainOverview } from "#/features/pricing-brain/types";
import { apiServer } from "#/lib/api";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    return {
        title: locale.toLowerCase().startsWith("fa") ? "مغز قیمت‌گذاری و پروموشن" : "Pricing & Promotion Brain",
    };
}

export default async function PricingBrainPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    const api = await apiServer();
    const response = await api.http.get<{ data: PricingBrainOverview }>("/admin/pricing-brain/overview");
    return <PricingBrainDashboard overview={response.data} locale={locale} />;
}
