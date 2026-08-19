import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { QualityCaseDetail } from "#/features/quality/case-detail";
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { locale, id } = await params;
    setRequestLocale(locale);
    const value = Number(id);
    if (!Number.isSafeInteger(value) || value < 1) notFound();
    return <QualityCaseDetail id={value} />;
}
