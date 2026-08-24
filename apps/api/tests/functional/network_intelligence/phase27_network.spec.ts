import fs from "node:fs";
import path from "node:path";

import { test } from "@japa/runner";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

test.group("Phase 27 network intelligence release contracts", () => {
    test("tenant-owned tables enforce FORCE RLS", ({ assert }) => {
        const migration = read("database/migrations/1780000000000_create_network_intelligence_os.ts");
        assert.include(migration, "ENABLE ROW LEVEL SECURITY");
        assert.include(migration, "FORCE ROW LEVEL SECURITY");
        assert.include(migration, "app.current_tenant");
    });

    test("participation is explicit, versioned and purpose-bound", ({ assert }) => {
        const service = read("app/services/network_intelligence/network_service.ts");
        assert.include(service, "E_NETWORK_OPT_IN_CONTRACT_REQUIRED");
        assert.include(service, "E_NETWORK_PURPOSE_NOT_AUTHORIZED");
        assert.include(service, "policy_digest");
    });

    test("tenant export excludes peer raw records and identifiers", ({ assert }) => {
        const service = read("app/services/network_intelligence/network_service.ts");
        assert.include(service, "contains_peer_raw_records: false");
        assert.include(service, "peer_identifiers");
        assert.include(service, "cross_tenant_contribution_rows");
    });

    test("offline aggregator bounds contributions and privacy budget", ({ assert }) => {
        const aggregate = read("../../scripts/aggregate-network-benchmarks.mjs");
        assert.include(aggregate, "metric_bounds");
        assert.include(aggregate, "privacy budget exceeded");
        assert.include(aggregate, "randomBytes");
        assert.notInclude(aggregate, "cfg.seed");
    });

    test("access changes remain tenant-scoped and self-lockout safe", ({ assert }) => {
        const permissions = read("app/services/network_intelligence/permissions.ts");
        assert.include(permissions, "admin_permissions");
        assert.include(permissions, "E_NETWORK_SELF_LOCKOUT");
        assert.include(permissions, "currentTenantId");
    });
});
