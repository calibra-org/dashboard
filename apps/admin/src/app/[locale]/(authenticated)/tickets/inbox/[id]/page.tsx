import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { TicketDetail } from "#/features/tickets/detail";

export default async function TicketInboxDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const ticketId = Number(id);
    if (!Number.isSafeInteger(ticketId) || ticketId < 1) notFound();
    return <TicketDetail id={ticketId} />;
}
