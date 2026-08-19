export const AGENTIC_ADAPTERS = ["native", "ucp", "acp", "mcp", "a2a", "custom"] as const;
export type AgenticAdapter = (typeof AGENTIC_ADAPTERS)[number];
export const CHANNEL_MODES = ["disabled", "shadow", "read_only", "live"] as const;
export type ChannelMode = (typeof CHANNEL_MODES)[number];

export interface ProductReadinessDimension {
    key: string;
    scoreBp: number;
    weightBp: number;
    missing: string[];
    freshness?: string | null;
}

export function weightedReadiness(dimensions: ProductReadinessDimension[]) {
    const normalized = dimensions.map((dimension) => ({
        ...dimension,
        scoreBp: Math.max(0, Math.min(10000, Number(dimension.scoreBp) || 0)),
        weightBp: Math.max(0, Math.min(10000, Number(dimension.weightBp) || 0)),
    }));
    const denominator = normalized.reduce((sum, dimension) => sum + dimension.weightBp, 0) || 1;
    const score = Math.round(normalized.reduce((sum, dimension) => sum + dimension.scoreBp * dimension.weightBp, 0) / denominator);
    return Math.max(0, Math.min(10000, score));
}

export function isMutationCapability(key: string) {
    return /cart|checkout|discount|payment|fulfillment|order|return|support/i.test(key);
}
