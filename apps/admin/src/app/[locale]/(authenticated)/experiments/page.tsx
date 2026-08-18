import { setRequestLocale } from "next-intl/server";

import { ExperimentationWorkspace } from "#/features/experiments/ExperimentationWorkspace";

export default async function ExperimentsPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    setRequestLocale(locale);
    return <ExperimentationWorkspace />;
}
