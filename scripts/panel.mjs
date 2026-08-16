#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const setupOnly = process.argv.includes("--setup");
const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== "--setup");
const spinCli = "packages/spin/dist/cli.js";
const lockfile = "pnpm-lock.yaml";
const nodeModules = "node_modules";

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

function preparePanel() {
    if (!existsSync(nodeModules)) {
        if (!existsSync(lockfile)) {
            console.error("pnpm-lock.yaml is missing; cannot prepare the Calibra workspace safely.");
            process.exit(1);
        }
        run(pnpm, ["install", "--frozen-lockfile"]);
    }

    if (!existsSync(spinCli)) {
        run(pnpm, ["--filter", "@calibra/spin", "build"]);
    }
}

/**
 * One-command panel startup. This performs only the minimum preparation needed
 * to launch the current checkout; it never runs tests, lint, typecheck, codegen,
 * or other quality gates. `pnpm panel:setup` remains available when preparation
 * without launching the panel is desired.
 */
preparePanel();

if (setupOnly) process.exit(0);

run(process.execPath, [spinCli, "local", ...forwardedArgs]);
