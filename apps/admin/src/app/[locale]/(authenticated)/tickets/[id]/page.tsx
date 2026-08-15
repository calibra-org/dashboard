import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { redirect } from "#/lib/i18n/navigation";

export default async function TicketLegacyDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const ticketId = Number(id);
    if (!Number.isSafeInteger(ticketId) || ticketId < 1) notFound();
    redirect({ href: `/tickets/inbox/${ticketId}` as never, locale });
}
