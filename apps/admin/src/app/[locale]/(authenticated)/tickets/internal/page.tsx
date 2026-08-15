import { setRequestLocale } from "next-intl/server";

import { TicketInternalPage } from "#/features/tickets/internal";

export default async function TicketsInternalRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketInternalPage />;
}
