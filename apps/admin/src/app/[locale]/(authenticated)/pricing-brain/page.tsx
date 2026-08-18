import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { PricingBrainDashboard, type PricingBrainOverview } from "#/features/pricing-brain/pricing-brain-dashboard";
import { apiServer } from "#/lib/api";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export const metadata: Metadata = {
    title: "مغز قیمت‌گذاری و پروموشن",
};

export default async function PricingBrainPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);

    const api = await apiServer();
    const response = await api.http.get<{ data: PricingBrainOverview }>("/admin/pricing-brain/overview");
    return <PricingBrainDashboard overview={response.data} />;
}
