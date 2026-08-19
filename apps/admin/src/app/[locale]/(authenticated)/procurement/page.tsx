import { ProcurementWorkspace } from "#/features/procurement/ProcurementWorkspace";
import { getProcurementOverview, getProcurementRecommendations } from "#/lib/queries/procurement";
export default async function ProcurementPage() {
    const [initial, recs] = await Promise.all([getProcurementOverview(), getProcurementRecommendations()]);
    return <ProcurementWorkspace initial={initial} recommendations={recs.data} />;
}
