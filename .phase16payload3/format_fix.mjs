import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const packagePath = resolve(root, "package.json");

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
pkg.scripts["format:fix"] = "biome format . --write";
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 4)}\n`);

const phase16Targets = [
    "apps/admin/src/app/[locale]/(authenticated)/discovery",
    "apps/admin/src/features/discovery",
    "apps/api/app/controllers/admin/discovery_controller.ts",
    "apps/api/app/controllers/storefront/discovery_controller.ts",
    "apps/api/app/jobs/discovery_index_projection_job.ts",
    "apps/api/app/services/cache_invalidation.ts",
    "apps/api/app/services/discovery",
    "apps/api/app/validators/admin/discovery_validator.ts",
    "apps/api/start/routes/admin_discovery.ts",
    "apps/api/start/routes/discovery_storefront.ts",
    "apps/api/tests/unit/discovery",
    "scripts/verify-phase16-discovery-integration.mjs",
];

const run = (args) => {
    const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit", env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`pnpm ${args.join(" ")} exited with ${result.status}`);
};

run(["exec", "biome", "format", ".", "--write"]);
run(["exec", "biome", "check", ...phase16Targets, "--write", "--max-diagnostics=1000"]);
