/** Generated-shape overlay for Phase 13 Planning. Regenerate from admin.phase13.v1.yaml when API docs toolchain is available. */
export interface paths {
    "/api/v1/admin/planning/overview": { get: operations["adminPhase13PlanningOverview"] };
    "/api/v1/admin/planning/forecast": { get: operations["adminPhase13ForecastShow"] };
    "/api/v1/admin/planning/forecast/run": { post: operations["adminPhase13ForecastRun"] };
    "/api/v1/admin/planning/inventory-risks": { get: operations["adminPhase13InventoryRisks"] };
    "/api/v1/admin/planning/cycles": { get: operations["adminPhase13CyclesList"]; post: operations["adminPhase13CycleCreate"] };
    "/api/v1/admin/planning/cycles/{id}/transition": { post: operations["adminPhase13CycleTransition"] };
    "/api/v1/admin/planning/scenarios": { get: operations["adminPhase13ScenariosList"]; post: operations["adminPhase13ScenarioCreate"] };
    "/api/v1/admin/planning/scenarios/{id}/result": { get: operations["adminPhase13ScenarioResult"] };
    "/api/v1/admin/planning/overrides": { get: operations["adminPhase13OverridesList"]; post: operations["adminPhase13OverrideCreate"] };
    "/api/v1/admin/planning/overrides/{id}/review": { post: operations["adminPhase13OverrideReview"] };
    "/api/v1/admin/planning/health": { get: operations["adminPhase13PlanningHealth"] };
}
export interface components { schemas: { PlanningForecastRun: Record<string, unknown>; PlanningForecastEnvelope: Record<string, unknown>; PlanningOverviewEnvelope: Record<string, unknown>; PlanningRiskEnvelope: Record<string, unknown>; PlanningCycle: Record<string, unknown>; PlanningScenario: Record<string, unknown>; PlanningOverride: Record<string, unknown>; PlanningHealthEnvelope: Record<string, unknown>; }; }
export interface operations {
    adminPhase13PlanningOverview: Operation<components["schemas"]["PlanningOverviewEnvelope"]>; adminPhase13ForecastShow: Operation<components["schemas"]["PlanningForecastEnvelope"]>; adminPhase13ForecastRun: Operation<components["schemas"]["PlanningForecastEnvelope"]>; adminPhase13InventoryRisks: Operation<components["schemas"]["PlanningRiskEnvelope"]>; adminPhase13CyclesList: Operation<{ data: components["schemas"]["PlanningCycle"][] }>; adminPhase13CycleCreate: Operation<{ data: components["schemas"]["PlanningCycle"] }>; adminPhase13CycleTransition: Operation<{ data: components["schemas"]["PlanningCycle"] }>; adminPhase13ScenariosList: Operation<{ data: components["schemas"]["PlanningScenario"][] }>; adminPhase13ScenarioCreate: Operation<{ data: components["schemas"]["PlanningScenario"] }>; adminPhase13ScenarioResult: Operation<Record<string, unknown>>; adminPhase13OverridesList: Operation<{ data: components["schemas"]["PlanningOverride"][] }>; adminPhase13OverrideCreate: Operation<{ data: components["schemas"]["PlanningOverride"] }>; adminPhase13OverrideReview: Operation<{ data: components["schemas"]["PlanningOverride"] }>; adminPhase13PlanningHealth: Operation<components["schemas"]["PlanningHealthEnvelope"]>;
}
type Operation<T> = { responses: { 200: { content: { "application/json": T } }; 201?: { content: { "application/json": T } }; }; };
