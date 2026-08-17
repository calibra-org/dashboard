export type AvailabilityState = "available" | "stockout" | "unknown";
export type ForecastQuality = "ready" | "limited_history" | "insufficient_data";

export interface DailyDemandObservation {
    date: string;
    observedDemand: number;
    availability: AvailabilityState;
}

export interface ForecastPointResult {
    date: string;
    p10: number;
    p50: number;
    p90: number;
}

export interface ForecastDiagnostics {
    activeDays: number;
    censoredDays: number;
    knownAvailabilityDays: number;
    imputedDemand: number;
    quality: ForecastQuality;
    confidence: number;
    reasonCodes: string[];
    wape: number | null;
    bias: number | null;
    intervalCoverage: number | null;
    evaluatedDays: number;
}

export interface ForecastResult {
    points: ForecastPointResult[];
    diagnostics: ForecastDiagnostics;
}

interface PreparedObservation extends DailyDemandObservation {
    demand: number;
    censored: boolean;
}

function finite(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function nonNegative(value: number): number {
    return Math.max(0, finite(value));
}

function round4(value: number): number {
    return Math.round(finite(value) * 10_000) / 10_000;
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedMean(values: number[]): number {
    if (values.length === 0) return 0;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < values.length; index += 1) {
        const weight = index + 1;
        numerator += values[index]! * weight;
        denominator += weight;
    }
    return denominator > 0 ? numerator / denominator : 0;
}

function quantile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const position = Math.max(0, Math.min(sorted.length - 1, (sorted.length - 1) * q));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower]!;
    const fraction = position - lower;
    return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

function median(values: number[]): number {
    return quantile(values, 0.5);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function utcWeekday(date: string): number {
    return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function addUtcDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function prepareHistory(history: DailyDemandObservation[]): PreparedObservation[] {
    const normalized = history.map((item) => ({
        ...item,
        observedDemand: nonNegative(item.observedDemand),
    }));
    const positiveKnown = normalized.filter((item) => item.availability !== "stockout" && item.observedDemand > 0);
    const globalFallback = median(positiveKnown.map((item) => item.observedDemand));
    const byWeekday = new Map<number, number[]>();
    for (const item of positiveKnown) {
        const weekday = utcWeekday(item.date);
        const values = byWeekday.get(weekday) ?? [];
        values.push(item.observedDemand);
        byWeekday.set(weekday, values);
    }

    return normalized.map((item) => {
        if (item.availability !== "stockout") return { ...item, demand: item.observedDemand, censored: false };
        const weekdayValues = byWeekday.get(utcWeekday(item.date)) ?? [];
        const fallback = weekdayValues.length > 0 ? median(weekdayValues) : globalFallback;
        const demand = Math.max(item.observedDemand, fallback);
        return { ...item, demand, censored: demand > item.observedDemand, };
    });
}

function estimatePoint(history: PreparedObservation[], targetDate: string, offset: number) {
    const values = history.map((item) => item.demand);
    const recent = values.slice(-Math.min(14, values.length));
    const previous = values.slice(-Math.min(28, values.length), -Math.min(14, values.length));
    const weekdayValues = history.filter((item) => utcWeekday(item.date) === utcWeekday(targetDate)).map((item) => item.demand);
    const recentMean = weightedMean(recent);
    const overallMean = weightedMean(values);
    const weekdayMedian = median(weekdayValues);
    const seasonalBase = weekdayValues.length >= 2 ? weekdayMedian : recentMean;
    let p50 = seasonalBase > 0 ? seasonalBase * 0.5 + recentMean * 0.35 + overallMean * 0.15 : recentMean * 0.7 + overallMean * 0.3;

    if (previous.length >= 7 && recent.length >= 7) {
        const rawDailyTrend = (mean(recent) - mean(previous)) / Math.max(1, recent.length);
        const cappedDailyTrend = clamp(rawDailyTrend, -Math.max(0.25, p50 * 0.15), Math.max(0.25, p50 * 0.15));
        p50 += cappedDailyTrend * Math.min(offset, 14);
    }
    p50 = nonNegative(p50);

    const residuals = history.map((item) => {
        const peers = history.filter((candidate) => candidate.date < item.date && utcWeekday(candidate.date) === utcWeekday(item.date));
        const baseline = peers.length > 0 ? median(peers.map((peer) => peer.demand)) : overallMean;
        return item.demand - baseline;
    });
    const lowerResidual = quantile(residuals, 0.1);
    const upperResidual = quantile(residuals, 0.9);
    let p10 = nonNegative(p50 + lowerResidual);
    let p90 = Math.max(p50, nonNegative(p50 + upperResidual));

    const activeDays = history.filter((item) => item.demand > 0).length;
    if (activeDays < 8) {
        p10 = Math.min(p10, p50 * 0.35);
        p90 = Math.max(p90, p50 * 1.8 + 0.5);
    }
    if (activeDays < 4) {
        p10 = 0;
        p90 = Math.max(p90, p50 * 2.5 + 1);
    }

    return { p10: round4(p10), p50: round4(p50), p90: round4(p90) };
}

function backtest(history: PreparedObservation[]) {
    const validationCount = Math.min(14, Math.max(0, history.length - 28));
    if (validationCount < 4) return { wape: null, bias: null, intervalCoverage: null, evaluatedDays: 0 };
    const start = history.length - validationCount;
    let absoluteError = 0;
    let signedError = 0;
    let actualTotal = 0;
    let covered = 0;
    let evaluated = 0;

    for (let index = start; index < history.length; index += 1) {
        const actual = history[index]!;
        if (actual.availability === "stockout") continue;
        const train = history.slice(0, index);
        if (train.length < 14) continue;
        const point = estimatePoint(train, actual.date, 1);
        absoluteError += Math.abs(point.p50 - actual.observedDemand);
        signedError += point.p50 - actual.observedDemand;
        actualTotal += actual.observedDemand;
        if (actual.observedDemand >= point.p10 && actual.observedDemand <= point.p90) covered += 1;
        evaluated += 1;
    }

    return {
        wape: evaluated > 0 && actualTotal > 0 ? round4(absoluteError / actualTotal) : null,
        bias: evaluated > 0 && actualTotal > 0 ? round4(signedError / actualTotal) : null,
        intervalCoverage: evaluated > 0 ? round4(covered / evaluated) : null,
        evaluatedDays: evaluated,
    };
}

export function forecastDemand(history: DailyDemandObservation[], horizonDays: number): ForecastResult {
    if (!Number.isSafeInteger(horizonDays) || horizonDays < 1 || horizonDays > 90) {
        throw new Error("horizonDays must be an integer between 1 and 90");
    }
    if (history.length === 0) {
        return {
            points: [],
            diagnostics: {
                activeDays: 0,
                censoredDays: 0,
                knownAvailabilityDays: 0,
                imputedDemand: 0,
                quality: "insufficient_data",
                confidence: 0,
                reasonCodes: ["NO_HISTORY"],
                wape: null,
                bias: null,
                intervalCoverage: null,
                evaluatedDays: 0,
            },
        };
    }

    const prepared = prepareHistory(history);
    const activeDays = prepared.filter((item) => item.demand > 0).length;
    const censoredDays = prepared.filter((item) => item.censored).length;
    const knownAvailabilityDays = prepared.filter((item) => item.availability !== "unknown").length;
    const imputedDemand = prepared.reduce((sum, item) => sum + Math.max(0, item.demand - item.observedDemand), 0);
    const quality: ForecastQuality = activeDays >= 8 ? "ready" : activeDays >= 4 ? "limited_history" : "insufficient_data";
    const confidence = round4(
        clamp(
            0.2 + Math.min(0.5, (activeDays / 14) * 0.5) + (knownAvailabilityDays / prepared.length) * 0.2 - (censoredDays / prepared.length) * 0.15,
            0.05,
            0.95,
        ),
    );
    const reasonCodes = ["WEIGHTED_RECENCY", "WEEKDAY_SEASONALITY", "EMPIRICAL_RESIDUAL_INTERVALS"];
    if (censoredDays > 0) reasonCodes.push("STOCKOUT_CENSORING_APPLIED");
    if (knownAvailabilityDays === 0) reasonCodes.push("AVAILABILITY_UNKNOWN");
    if (quality !== "ready") reasonCodes.push("LIMITED_HISTORY_CONFIDENCE_WIDENED");

    const lastDate = prepared[prepared.length - 1]!.date;
    const points: ForecastPointResult[] = [];
    for (let offset = 1; offset <= horizonDays; offset += 1) {
        const date = addUtcDays(lastDate, offset);
        const point = estimatePoint(prepared, date, offset);
        points.push({ date, ...point });
    }
    const metrics = backtest(prepared);

    return {
        points,
        diagnostics: {
            activeDays,
            censoredDays,
            knownAvailabilityDays,
            imputedDemand: round4(imputedDemand),
            quality,
            confidence,
            reasonCodes,
            ...metrics,
        },
    };
}

export function computeReplenishment(input: {
    onHand: number;
    dailyP50: number;
    dailyP90: number;
    leadTimeDays: number | null;
    reviewPeriodDays: number;
}) {
    const onHand = nonNegative(input.onHand);
    const dailyP50 = nonNegative(input.dailyP50);
    const dailyP90 = Math.max(dailyP50, nonNegative(input.dailyP90));
    if (input.leadTimeDays === null) {
        return {
            status: "needs_input" as const,
            suggestedQuantity: null,
            leadTimeDemandP50: null,
            leadTimeDemandP90: null,
            safetyStock: null,
            reorderPoint: null,
            targetStock: null,
            reasonCodes: ["LEAD_TIME_UNAVAILABLE"],
        };
    }
    const leadTimeDays = Math.max(0, Math.round(input.leadTimeDays));
    const reviewPeriodDays = Math.max(1, Math.round(input.reviewPeriodDays));
    const leadTimeDemandP50 = dailyP50 * leadTimeDays;
    const leadTimeDemandP90 = dailyP90 * leadTimeDays;
    const safetyStock = Math.max(0, leadTimeDemandP90 - leadTimeDemandP50);
    const reorderPoint = leadTimeDemandP50 + safetyStock;
    const targetStock = dailyP90 * (leadTimeDays + reviewPeriodDays);
    const suggestedQuantity = Math.ceil(Math.max(0, targetStock - onHand));
    return {
        status: "ready" as const,
        suggestedQuantity,
        leadTimeDemandP50: round4(leadTimeDemandP50),
        leadTimeDemandP90: round4(leadTimeDemandP90),
        safetyStock: round4(safetyStock),
        reorderPoint: round4(reorderPoint),
        targetStock: round4(targetStock),
        reasonCodes: ["P90_SERVICE_POLICY", "LEAD_TIME_DEMAND", "REVIEW_PERIOD_TARGET_STOCK"],
    };
}
