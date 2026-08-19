import { redirect } from "next/navigation";

export default async function TrustCompatibilityPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    redirect(`/${locale}/quality-trust/overview`);
}
