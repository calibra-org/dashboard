import { setRequestLocale } from "next-intl/server";

import { DiscoveryWorkspace } from "#/features/discovery/workspace";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <DiscoveryWorkspace mode="compatibility" />;
}
