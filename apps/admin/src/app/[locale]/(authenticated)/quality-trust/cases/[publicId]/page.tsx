import { setRequestLocale } from "next-intl/server";

import { TrustWorkspace } from "#/features/trust/TrustWorkspace";

interface PageProps {
    params: Promise<{ locale: string; publicId: string }>;
}

export default async function TrustCaseDetailPage({ params }: PageProps) {
    const { locale, publicId } = await params;
    setRequestLocale(locale);
    return <TrustWorkspace section="case-detail" casePublicId={publicId} />;
}
