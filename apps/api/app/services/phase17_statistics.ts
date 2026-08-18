import { createHash } from "node:crypto";

export interface VariantAggregate {
    variantId: number;
    variantKey: string;
    isControl: boolean;
    expectedShare: number;
    assignments: number;
    exposedSubjects: number;
    observations: number;
    sum: number;
    sumSquares: number;
}

export function deterministicBucket(parts: Array<string | number | bigint>): number {
    const digest = createHash("sha256").update(parts.join("|")).digest();
    return digest.readUInt32BE(0) % 10000;
}

export function subjectHash(tenantId: string | number | bigint, subjectType: string, subjectKey: string): string {
    return createHash("sha256").update(`${tenantId}|${subjectType}|${subjectKey}`).digest("hex");
}

export function chiSquareStatistic(observed: number[], expectedShares: number[]): number | null {
    const total = observed.reduce((sum, value) => sum + value, 0);
    if (total === 0 || observed.length !== expectedShares.length || observed.length < 2) return null;
    let statistic = 0;
    for (let index = 0; index < observed.length; index += 1) {
        const expected = total * (expectedShares[index] ?? 0);
        if (expected <= 0) return null;
        statistic += ((observed[index] ?? 0) - expected) ** 2 / expected;
    }
    return statistic;
}

export function srmDetected(statistic: number | null, degreesOfFreedom: number): boolean {
    if (statistic === null) return false;
    const critical001: Record<number, number> = { 1: 6.635, 2: 9.21, 3: 11.345, 4: 13.277, 5: 15.086 };
    const threshold = critical001[Math.min(Math.max(degreesOfFreedom, 1), 5)] ?? 15.086;
    return statistic >= threshold;
}

function variance(row: VariantAggregate): number | null {
    if (row.observations < 2) return null;
    const numerator = row.sumSquares - (row.sum * row.sum) / row.observations;
    return Math.max(0, numerator / (row.observations - 1));
}

export function variantEffect(row: VariantAggregate, control: VariantAggregate | null) {
    const mean = row.observations > 0 ? row.sum / row.observations : null;
    const isControl = row.variantId === control?.variantId;
    if (isControl) {
        return {
            mean,
            absoluteLift: 0,
            relativeLift: 0,
            ci95: null,
        };
    }
    if (mean === null || !control || control.observations <= 0) {
        return {
            mean,
            absoluteLift: null,
            relativeLift: null,
            ci95: null,
        };
    }
    const controlMean = control.sum / control.observations;
    const absoluteLift = mean - controlMean;
    const relativeLift = controlMean === 0 ? null : absoluteLift / Math.abs(controlMean);
    const rowVariance = variance(row);
    const controlVariance = variance(control);
    const se =
        rowVariance === null || controlVariance === null
            ? null
            : Math.sqrt(rowVariance / row.observations + controlVariance / control.observations);
    return {
        mean,
        absoluteLift,
        relativeLift,
        ci95: se === null ? null : ([absoluteLift - 1.96 * se, absoluteLift + 1.96 * se] as [number, number]),
    };
}
