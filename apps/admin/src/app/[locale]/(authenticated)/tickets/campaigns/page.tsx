import { setRequestLocale } from "next-intl/server";

import { TicketCampaignsPage } from "#/features/tickets/campaigns";

export default async function TicketsCampaignsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TicketCampaignsPage />;
}
