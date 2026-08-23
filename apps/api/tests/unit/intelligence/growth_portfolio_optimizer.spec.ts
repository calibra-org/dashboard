import { test } from "@japa/runner";

import {
    type CandidateRow,
    optimizeGrowthPortfolio,
    type PlanRow,
} from "#services/phase25_growth_portfolio_service";

const plan = (overrides: Partial<PlanRow> = {}): PlanRow => ({
    id: 1,
    public_id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    cash_budget_minor: 1_000_000,
    team_hours_budget: 100,
    warehouse_capacity_budget: 100,
    supplier_capacity_budget: 100,
    max_risk: 0.9,
    channel_limits: {},
    policy_constraints: { high_risk_auto_cancel: false },
    ...overrides,
});

const candidate = (id: number, caseId: number, overrides: Partial<CandidateRow> = {}): CandidateRow => ({
    id,
    intelligence_case_id: caseId,
    expected_incremental_contribution_minor: 100_000,
    confidence: 0.9,
    required_cash_minor: 10_000,
    team_hours: 2,
    warehouse_capacity: 1,
    supplier_capacity: 1,
    risk: 0.2,
    reversibility: 0.8,
    time_to_value: 0.8,
    customer_impact: 0.8,
    strategic_alignment: 0.8,
    dependencies: [],
    exclusive_with: [],
    channel_requirements: {},
    source_case_stable_key: `case-${caseId}`,
    source_case_version: 1,
    ...overrides,
});

test.group("Phase 25 growth portfolio optimizer", () => {
    test("does not prune a valid branch when a selected candidate depends on a later lower-scored candidate", ({ assert }) => {
        const result = optimizeGrowthPortfolio(plan(), [
            candidate(1, 10, { expected_incremental_contribution_minor: 500_000, dependencies: [20] }),
            candidate(2, 20, { expected_incremental_contribution_minor: 10_000, confidence: 0.6 }),
        ]);
        const selected = result.selected.map((item) => item.candidate.intelligence_case_id);
        assert.includeMembers(selected, [10, 20]);
    });

    test("enforces portfolio policy constraints as hard constraints", ({ assert }) => {
        const result = optimizeGrowthPortfolio(
            plan({ policy_constraints: { max_selected_actions: 1, high_risk_auto_cancel: false } }),
            [candidate(1, 10), candidate(2, 20, { expected_incremental_contribution_minor: 90_000 })],
        );
        assert.lengthOf(result.selected, 1);
    });

    test("marks forbidden cases infeasible instead of merely lowering their score", ({ assert }) => {
        const result = optimizeGrowthPortfolio(
            plan({ policy_constraints: { forbidden_case_ids: [10], high_risk_auto_cancel: false } }),
            [candidate(1, 10), candidate(2, 20, { expected_incremental_contribution_minor: 80_000 })],
        );
        const forbidden = result.items.find((item) => item.candidate.intelligence_case_id === 10);
        assert.equal(forbidden?.decision, "infeasible");
        assert.include(forbidden?.binding_constraints ?? [], "policy:forbidden_case:10");
    });
});
