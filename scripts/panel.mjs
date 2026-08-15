#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

function run(args) {
    const result = spawnSync(pnpm, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

/**
 * The panel command is intentionally a startup path, not a quality gate.
 * It installs the frozen workspace only when the spin CLI is unavailable,
 * then starts the existing in-place production-parity stack.
 */
if (!existsSync("packages/spin/dist/cli.js")) {
    run(["install", "--frozen-lockfile"]);
}

run(["spin", "local", ...process.argv.slice(2)]);
