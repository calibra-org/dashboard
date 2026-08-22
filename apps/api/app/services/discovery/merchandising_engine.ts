export interface RankedCandidate {
    id: number;
    score: number;
    categoryIds?: number[];
    [key: string]: unknown;
}

export interface RuntimeRule {
    id: number;
    action: "boost" | "bury" | "pin" | "hide";
    productId: number | null;
    categoryId: number | null;
    boostFactor: number | null;
    pinPosition: number | null;
    priority: number;
}

function matches(candidate: RankedCandidate, rule: RuntimeRule): boolean {
    if (rule.productId !== null && candidate.id === rule.productId) return true;
    if (rule.categoryId !== null && candidate.categoryIds?.includes(rule.categoryId)) return true;
    return false;
}

/** Deterministic business layer applied only after base retrieval relevance. */
export function applyMerchandising(candidates: RankedCandidate[], rules: RuntimeRule[]): RankedCandidate[] {
    const orderedRules = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
    let items = candidates.filter(
        (candidate) => !orderedRules.some((rule) => rule.action === "hide" && matches(candidate, rule)),
    );
    items = items.map((candidate) => ({ ...candidate }));

    for (const rule of orderedRules) {
        if (rule.action !== "boost" && rule.action !== "bury") continue;
        for (const item of items) {
            if (!matches(item, rule)) continue;
            if (rule.action === "boost") item.score *= Math.max(1, rule.boostFactor ?? 1.2);
            if (rule.action === "bury") item.score *= Math.min(1, Math.max(0, rule.boostFactor ?? 0.35));
        }
    }

    items.sort((a, b) => b.score - a.score || a.id - b.id);
    for (const pin of orderedRules.filter((rule) => rule.action === "pin" && rule.pinPosition)) {
        const moving = items.filter((item) => matches(item, pin));
        for (const item of moving.reverse()) {
            const index = items.findIndex((candidate) => candidate.id === item.id);
            if (index < 0) continue;
            const [removed] = items.splice(index, 1);
            items.splice(Math.max(0, (pin.pinPosition ?? 1) - 1), 0, removed!);
        }
    }
    return items;
}
