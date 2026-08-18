import { TrustRiskWorkspace } from "#/features/trust/TrustRiskWorkspace";
import { getTrustModels, getTrustOverview, getTrustSignals } from "#/lib/queries/trust-risk";

export default async function TrustPage() {
    const [overview, signals, models] = await Promise.all([getTrustOverview(), getTrustSignals(), getTrustModels()]);
    return <TrustRiskWorkspace initial={overview} signals={signals.data} models={models.data} />;
}
