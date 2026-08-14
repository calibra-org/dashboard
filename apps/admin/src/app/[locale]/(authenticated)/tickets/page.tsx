import { setRequestLocale } from "next-intl/server";

import { TicketsWorkspace } from "#/features/tickets/workspace";

export default async function TicketsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketsWorkspace />;
}
