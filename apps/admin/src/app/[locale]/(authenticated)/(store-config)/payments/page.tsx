import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { PageHeader } from "#/components/PageHeader";
import { PaymentsView } from "#/views/store-config/payments/payments-view";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { locale } = await params;
    return { title: locale === "fa" ? "درگاه پرداخت" : "Payment Gateways" };
}

export default async function PaymentsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const fa = locale === "fa";
    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={fa ? "درگاه پرداخت" : "Payment Gateways"}
                subtitle={
                    fa
                        ? "درگاه‌های بانکی، پرداخت‌یارها، خرید اعتباری و روش‌های آفلاین را از یک مرکز امن مدیریت کنید."
                        : "Manage bank gateways, PSPs, BNPL and offline payment methods from one secure control surface."
                }
            />
            <PaymentsView />
        </section>
    );
}
