import { currentTenantId, currentTrx } from "#services/tenant_context";

const PHASE27_CONFIGURATION_LOCK = 2701;

export async function acquireNetworkConfigurationLock() {
    await currentTrx().rawQuery("SELECT pg_advisory_xact_lock(?, ?)", [Number(currentTenantId()), PHASE27_CONFIGURATION_LOCK]);
}
