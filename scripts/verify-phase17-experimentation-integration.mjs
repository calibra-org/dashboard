import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const checks = [
    ["migration", "apps/api/database/migrations/1768000000000_create_phase17_experimentation_lab.ts", ["experiment_assignments", "experiment_exposures", "experiment_analysis_runs", "experiment_holdouts", "experiment_causal_knowledge", "FORCE ROW LEVEL SECURITY"]],
    ["service", "apps/api/app/services/phase17_experimentation_service.ts", ["deterministicBucket", "persistent_holdout", "srm_detected", "guardrail_breached", "no_prior_exposure", "captureKnowledge"]],
    ["routes", "apps/api/start/routes/admin_experiments.ts", ["/overview", "/collisions", "/knowledge", "/:id/analyze"]],
    ["public routes", "apps/api/start/routes/experiments.ts", ["/assign", "/exposures", "/observations"]],
    ["admin ui", "apps/admin/src/features/experiments/ExperimentationWorkspace.tsx", ["Assignment ≠ Exposure", "Guardrail", "Causal Memory", "Persistent Holdouts"]],
    ["queries", "apps/admin/src/lib/queries/experiments.ts", ["useExperimentOverview", "useAnalyzeExperiment", "useCreateHoldout"]],
    ["openapi", "docs/api/reference/openapi/admin.phase17.v1.yaml", ["/api/v1/admin/experiments", "/api/v1/admin/experiments/{id}/analyze"]],
];

for (const [label, path, needles] of checks) {
    const content = read(path);
    for (const needle of needles) {
        if (!content.includes(needle)) throw new Error(`Phase 17 ${label} missing ${needle}`);
    }
}

const routes = read("apps/api/start/routes.ts");
if (!routes.includes('await import("./routes/admin_experiments.js")') || !routes.includes('await import("./routes/experiments.js")')) throw new Error("Phase 17 route registry imports are missing");
const sidebar = read("apps/admin/src/components/Sidebar.tsx");
if (!sidebar.includes('href: "/experiments"')) throw new Error("Phase 17 admin navigation is missing");
console.log("Phase 17 experimentation integration verified");
