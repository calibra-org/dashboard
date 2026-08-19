export const TRUST_RISK_BANDS = ["trusted", "low", "medium", "elevated", "high", "severe"] as const;
export type TrustRiskBand = (typeof TRUST_RISK_BANDS)[number];

export const TRUST_ACTIONS = ["allow", "monitor", "step_up", "hold", "block", "dismiss"] as const;
export type TrustAction = (typeof TRUST_ACTIONS)[number];

export const TRUST_CASE_STATUSES = ["open", "in_review", "waiting_step_up", "held", "resolved", "dismissed", "appealed"] as const;
export type TrustCaseStatus = (typeof TRUST_CASE_STATUSES)[number];

export function riskBandForScore(score: number): TrustRiskBand {
    if (score >= 90) return "severe";
    if (score >= 75) return "high";
    if (score >= 55) return "elevated";
    if (score >= 30) return "medium";
    if (score >= 10) return "low";
    return "trusted";
}

export function recommendedActionForBand(band: TrustRiskBand): TrustAction {
    if (band === "trusted") return "allow";
    if (band === "low" || band === "medium") return "monitor";
    if (band === "elevated") return "step_up";
    if (band === "high") return "hold";
    return "block";
}

export function clampBasisPoints(value: number): number {
    return Math.max(0, Math.min(10_000, Math.round(value)));
}

export function safeEntityId(value: unknown): string {
    return String(value ?? "unknown").slice(0, 190);
}
