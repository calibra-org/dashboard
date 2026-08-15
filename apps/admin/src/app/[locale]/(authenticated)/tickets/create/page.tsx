import { setRequestLocale } from "next-intl/server";

import { TicketCreatePage } from "#/features/tickets/create";

export default async function TicketsCreateRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketCreatePage />;
}
