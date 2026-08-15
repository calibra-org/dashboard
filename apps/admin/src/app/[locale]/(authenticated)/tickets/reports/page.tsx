import { setRequestLocale } from "next-intl/server";

import { TicketReportsPage } from "#/features/tickets/reports";

export default async function TicketsReportsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketReportsPage />;
}
