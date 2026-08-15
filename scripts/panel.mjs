#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const setup = process.argv.includes("--setup");
const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--setup");
const spinCli = "packages/spin/dist/cli.js";

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * Daily startup must stay deterministic and offline-friendly: no install,
 * tests, code generation, or quality gates are run from `pnpm panel`.
 * Use `pnpm panel:setup` once after a fresh checkout/dependency reset.
 */
if (setup) {
    run(pnpm, ["install", "--frozen-lockfile"]);
    run(pnpm, ["--filter", "@calibra/spin", "build"]);
    process.exit(0);
}

if (!existsSync(spinCli)) {
    console.error("Calibra panel is not prepared. Run `pnpm panel:setup` once, then use `pnpm panel` for daily startup.");
    process.exit(1);
}

run(process.execPath, [spinCli, "local", ...forwardedArgs]);
