import { setRequestLocale } from "next-intl/server";

import { redirect } from "#/lib/i18n/navigation";

export default async function TicketsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    redirect({ href: "/tickets/overview", locale });
}
