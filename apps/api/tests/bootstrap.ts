import { resolve } from "node:path";
import { authApiClient } from "@adonisjs/auth/plugins/api_client";
import cache from "@adonisjs/cache/services/main";
import app from "@adonisjs/core/services/app";
import testUtils from "@adonisjs/core/services/test_utils";
import limiter from "@adonisjs/limiter/services/main";
import db from "@adonisjs/lucid/services/db";
import { ApiClient, apiClient } from "@japa/api-client";
import { assert } from "@japa/assert";
import { openapi } from "@japa/openapi-assertions";
import { pluginAdonisJS } from "@japa/plugin-adonisjs";
import type { Config } from "@japa/runner/types";

import { bootstrapTestRoles, ensureTestTenant, seedTestTenant, TEST_TENANT_SLUG } from "#tests/helpers/tenant";

const RESERVED_TRUNCATE_TABLES = [
    "tenants",
    "plans",
    "tenant_domains",
    "platform_users",
    "platform_access_tokens",
    "currencies",
    "regions",
    "region_translations",
];

const TRUNCATE_PATCH_FLAG = Symbol.for("calibra.test.truncatePatched");

function patchTruncateExclusions(): void {
    const proto = Object.getPrototypeOf(db.connection()) as {
        truncateAllTables: (exclude?: string[], schemas?: string[]) => Promise<void>;
        [TRUNCATE_PATCH_FLAG]?: boolean;
    };
    if (proto[TRUNCATE_PATCH_FLAG]) return;
    const original = proto.truncateAllTables;
    proto.truncateAllTables = function patched(exclude, schemas) {
        const merged = [...new Set([...(exclude ?? []), ...RESERVED_TRUNCATE_TABLES])];
        return original.call(this, merged, schemas);
    };
    proto[TRUNCATE_PATCH_FLAG] = true;
}

ApiClient.onRequest((request) => {
    request.header("X-Calibra-Tenant", TEST_TENANT_SLUG);
});

const API_SPEC_PATH = resolve(import.meta.dirname, "../../../docs/api/dist/_merged.test.json");

function openApiPluginWithDiagnostics() {
    try {
        return openapi({ schemas: [API_SPEC_PATH] });
    } catch (error) {
        const details =
            error && typeof error === "object" && "errors" in error
                ? (error as { errors?: unknown }).errors
                : error;
        console.error("OPENAPI_VALIDATION_DIAGNOSTICS", JSON.stringify(details, null, 2));
        throw error;
    }
}

export const plugins: Config["plugins"] = [
    assert(),
    openApiPluginWithDiagnostics(),
    apiClient(),
    pluginAdonisJS(app),
    authApiClient(app),
];

export const runnerHooks: Required<Pick<Config, "setup" | "teardown">> = {
    setup: [
        () => testUtils.db().migrate(),
        async () => {
            patchTruncateExclusions();
            await bootstrapTestRoles();
            await seedTestTenant();
        },
    ],
    teardown: [],
};

export const configureSuite: Config["configureSuite"] = (suite) => {
    suite.onGroup((group) => {
        group.each.setup(async () => {
            await cache.clear();
            await cache.use("memory").clear();
            await ensureTestTenant();
        });
    });
    if (["browser", "functional", "e2e"].includes(suite.name)) {
        suite.setup(() => testUtils.httpServer().start());
        suite.onGroup((group) => {
            group.each.setup(async () => {
                await limiter.clear(["memory"]);
            });
        });
    }
};
