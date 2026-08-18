import { setRequestLocale } from "next-intl/server";

import { PlanningWorkspace } from "#/features/planning/PlanningWorkspace";

export default async function PlanningPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <PlanningWorkspace />;
}
