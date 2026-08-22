export const AGENT_SPECIALTIES = [
    "finance",
    "inventory",
    "procurement",
    "pricing",
    "growth",
    "customer",
    "seo",
    "content",
    "support",
    "risk",
    "quality",
    "operations_sre",
] as const;

export type AgentSpecialty = (typeof AGENT_SPECIALTIES)[number];

export const RISK_ORDER = {
    read_only: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
} as const;

export type ToolRisk = keyof typeof RISK_ORDER;

export function requiresHumanApproval(risk: ToolRisk, registryFlag = false): boolean {
    return registryFlag || RISK_ORDER[risk] >= RISK_ORDER.high;
}

export function isForbiddenHandlerKey(handlerKey: string): boolean {
    return /(^|\.)(sql|shell|exec|eval|filesystem)(\.|$)/i.test(handlerKey);
}

export function boundedAttempts(attempt: number, maxAttempts = 3): number {
    return Math.max(1, Math.min(attempt, maxAttempts));
}
