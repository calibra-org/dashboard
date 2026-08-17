import { setRequestLocale } from "next-intl/server";

import { IdentityWorkspace } from "#/features/identity/IdentityWorkspace";

interface PageProps {
    params: Promise<{ locale: string }>;
}

export default async function IdentityCredentialsPage({ params }: PageProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <IdentityWorkspace section="credentials" />;
}
