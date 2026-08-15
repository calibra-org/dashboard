import { setRequestLocale } from "next-intl/server";

import { TicketInboxPage } from "#/features/tickets/inbox";

export default async function TicketsInboxRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketInboxPage />;
}
