import { setRequestLocale } from "next-intl/server";
import { PlanningView } from "#/views/planning/planning-view";
export default async function PlanningPage({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <PlanningView section="overview" />; }
