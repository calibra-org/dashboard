import { setRequestLocale } from "next-intl/server";

import { TrustWorkspace } from "#/features/trust/TrustWorkspace";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function TrustSignalsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <TrustWorkspace section="signals" />;
}
