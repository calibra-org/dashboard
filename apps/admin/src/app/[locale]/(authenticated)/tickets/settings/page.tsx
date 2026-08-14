import { setRequestLocale } from "next-intl/server";

import { TicketSettingsPage } from "#/features/tickets/settings";

export default async function TicketsSettingsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketSettingsPage />;
}
