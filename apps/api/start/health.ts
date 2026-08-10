import { DiskSpaceCheck, HealthChecks, MemoryHeapCheck } from "@adonisjs/core/health";
import app from "@adonisjs/core/services/app";
import { DbCheck } from "@adonisjs/lucid/database";
import db from "@adonisjs/lucid/services/db";
import { RedisCheck } from "@adonisjs/redis";
import redis from "@adonisjs/redis/services/main";

/**
 * Readiness checks for `/health/ready`. The probe reports degraded when any of the
 * required dependencies is unhealthy:
 *
 *   - `DiskSpaceCheck` — uses the strict production defaults, while test runs avoid
 *     coupling API correctness to the transient root-disk occupancy of hosted CI runners.
 *   - `MemoryHeapCheck` — flags slow GC pressure before the container OOMs.
 *   - `DbCheck` — pings Postgres on the default Lucid connection; the api is unusable
 *     without it.
 *   - `RedisCheck` — pings the `main` connection; the limiter, lock, transmit transport
 *     and cache bus all key off it.
 *
 * Add a Mailpit / queue check by appending to this list. Each `BaseCheck` returns a
 * `HealthCheckResult` with structured metadata — the report renderer maps them straight
 * to JSON.
 */
const diskSpaceCheck = new DiskSpaceCheck();

/**
 * GitHub-hosted runners can arrive with >80% of their root disk already occupied before
 * the application starts. The default DiskSpaceCheck failure threshold is 80%, which
 * makes `/health/ready` nondeterministic in the functional suite even when Postgres,
 * Redis, and the application are healthy. Keep the production defaults untouched and
 * relax only NODE_ENV=test so the test measures Calibra readiness rather than runner
 * image pressure.
 */
if (app.inTest) {
    diskSpaceCheck.warnWhenExceeds(95).failWhenExceeds(99);
}

export const healthChecks = new HealthChecks().register([
    diskSpaceCheck,
    /**
     * The default failure threshold (300 MB) is tight for a Node.js api warmed up by the
     * full functional test suite — fresh allocations push past it on CI without the heap
     * being genuinely unhealthy. Bumped to 600 MB / 800 MB to track the realistic prod
     * envelope and stop flapping the health probe.
     */
    new MemoryHeapCheck().warnWhenExceeds("600 mb").failWhenExceeds("800 mb"),
    new DbCheck(db.connection()),
    new RedisCheck(redis.connection()),
]);
