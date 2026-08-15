import { setRequestLocale } from "next-intl/server";

import { TicketsOverviewPage } from "#/features/tickets/overview";

export default async function TicketsOverviewRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketsOverviewPage />;
}
