import { setRequestLocale } from "next-intl/server";
import { QualityWorkspace } from "#/features/quality/workspace";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <QualityWorkspace section="suppliers" />;
}
