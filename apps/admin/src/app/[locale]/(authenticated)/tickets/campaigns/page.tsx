import { setRequestLocale } from "next-intl/server";

import { CampaignOmnichannelControls } from "#/features/tickets/campaign-omnichannel-controls";
import { TicketCampaignsPage } from "#/features/tickets/campaigns";

export default async function TicketsCampaignsRoute({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return (
        <div className="space-y-5">
            <TicketCampaignsPage />
            <CampaignOmnichannelControls />
        </div>
    );
}
