export type PricingLifecycleState =
    | "draft"
    | "review"
    | "approved"
    | "scheduled"
    | "active"
    | "paused"
    | "stopped"
    | "rolled_back";

export interface PricingPolicyVersion {
    id: number;
    policy_id: number;
    version: number;
    state: PricingLifecycleState;
    currency: string;
    product_id: number | null;
    variation_id: number | null;
    guardrails: Record<string, unknown>;
    evidence: Record<string, unknown>;
    scheduled_at: string | null;
    activated_at: string | null;
    approved_by: number | null;
    proposed_by: number | null;
}

export interface PricingPolicySummary {
    id: number;
    policy_key: string;
    name: string;
    objective: string | null;
    status: "active" | "frozen";
    frozen_at: string | null;
    freeze_reason: string | null;
    updated_at: string;
    latest_version: PricingPolicyVersion | null;
}

export interface PricingProposal {
    id: number;
    policy_id: number;
    policy_version_id: number | null;
    product_id: number;
    variation_id: number | null;
    reference_price_minor: number;
    candidate_price_minor: number;
    currency: string;
    status: string;
    objective: string | null;
    rationale: string | null;
    evidence: Record<string, unknown>;
    created_at?: string;
}

export interface PricingBrainOverview {
    catalog: { products: number; priced_products: number; sale_products: number; pricing_coverage_percent: number };
    promotions: { coupons: number; active_coupons: number; authority: string };
    economics: {
        covered_products: number;
        coverage_percent: number;
        latest_cost_evidence_at: string | null;
        status: "available" | "unavailable";
        authority: string;
    };
    evidence: {
        elasticity: { status: string; reason: string };
        experimentation: { status: string; reason: string };
    };
    runtime: {
        base_price_resolver: string;
        promotion_engine: string;
        economics_source: string;
        simulation_engine: string;
        autonomy_level: number;
        activation_enabled: boolean;
    };
    policies: PricingPolicySummary[];
    proposals: PricingProposal[];
}
