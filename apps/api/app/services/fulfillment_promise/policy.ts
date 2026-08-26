export interface CalibrationEvidence {
    calibrationSampleCount: number;
    minimumSampleCount: number;
    confidenceBps: number;
    lastCalibratedAt: string | Date | null;
    maxCalibrationAgeHours: number;
}

export function isInventoryFreshAt(
    observedAt: string | Date | null,
    staleAfterMinutes: number,
    now: string | Date,
): boolean {
    if (!observedAt || !Number.isFinite(staleAfterMinutes) || staleAfterMinutes < 1) return false;
    const observed = new Date(observedAt).getTime();
    const current = new Date(now).getTime();
    if (!Number.isFinite(observed) || !Number.isFinite(current) || observed > current) return false;
    return current - observed <= staleAfterMinutes * 60_000;
}

export function isCalibratedServiceProfile(evidence: CalibrationEvidence, now: string | Date): boolean {
    if (evidence.minimumSampleCount < 1) return false;
    if (evidence.calibrationSampleCount < evidence.minimumSampleCount) return false;
    if (evidence.confidenceBps <= 0 || evidence.confidenceBps > 10_000) return false;
    if (!evidence.lastCalibratedAt || evidence.maxCalibrationAgeHours < 1) return false;
    const calibratedAt = new Date(evidence.lastCalibratedAt).getTime();
    const current = new Date(now).getTime();
    if (!Number.isFinite(calibratedAt) || !Number.isFinite(current) || calibratedAt > current) return false;
    return current - calibratedAt <= evidence.maxCalibrationAgeHours * 3_600_000;
}

export type RankablePromise = {
    confidenceBps: number;
    windowEndMs: number;
    costMinor: number;
};

export function comparePromiseOptions(a: RankablePromise, b: RankablePromise): number {
    return b.confidenceBps - a.confidenceBps || a.windowEndMs - b.windowEndMs || a.costMinor - b.costMinor;
}
