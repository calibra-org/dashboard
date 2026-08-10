#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
const failures = [];

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

function contains(file, needle, message = `${file} must contain ${needle}`) {
    check(read(file).includes(needle), message);
}

function notContains(file, needle, message = `${file} must not contain ${needle}`) {
    check(!read(file).includes(needle), message);
}

const serviceFile = "apps/api/app/services/seo/search_engines.ts";
const controllerFile = "apps/api/app/controllers/admin/seo_controller.ts";
const validatorFile = "apps/api/app/validators/admin/seo_validator.ts";
const typesFile = "apps/admin/src/features/seo/types.ts";
const workspaceFile = "apps/admin/src/features/seo/workspace.tsx";
const migrationFile = "apps/api/database/migrations/1760000000000_expand_seo_search_engines.ts";
const commandFile = "apps/api/commands/seo_sync_search_engines.ts";
const docsFile = "docs/seo-integration/SEARCH_ENGINES_REAL_INTEGRATIONS_FA.md";

for (const file of [
    serviceFile,
    controllerFile,
    validatorFile,
    typesFile,
    workspaceFile,
    migrationFile,
    commandFile,
    docsFile,
    "apps/api/tests/unit/seo/search_engines.spec.ts",
]) {
    check(fs.existsSync(path.join(root, file)), `Missing seven-engine integration file: ${file}`);
}

const service = read(serviceFile);
const registry = service.match(/export const SEO_SEARCH_ENGINES = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
const expected = [
    ["google", "google_search_console"],
    ["bing", "bing_webmaster"],
    ["yandex", "yandex_webmaster"],
    ["baidu", "baidu_search_resource"],
    ["brave", "brave_search"],
    ["naver", "naver_search_advisor"],
    ["seznam", "seznam_indexnow"],
];

check(Boolean(registry), "SEO_SEARCH_ENGINES registry must be statically discoverable");
for (const [engine, provider] of expected) {
    const engineMatches = registry.match(new RegExp(`engine: "${engine}"`, "g")) ?? [];
    const providerMatches = registry.match(new RegExp(`provider: "${provider}"`, "g")) ?? [];
    check(engineMatches.length === 1, `Search engine ${engine} must appear exactly once in the registry`);
    check(providerMatches.length === 1, `Provider ${provider} must appear exactly once in the registry`);
}
check((registry.match(/engine: "/g) ?? []).length === 7, "Registry must contain exactly seven engines");
for (const utility of ["indexnow", "google_merchant", "openai_searchbot", "manual_import"]) {
    check(!registry.includes(`provider: "${utility}"`), `${utility} is a utility and must not count as a search engine`);
}

for (const [engine, rankKind] of [
    ["google", "webmaster_average"],
    ["bing", "webmaster_average"],
    ["yandex", "webmaster_average"],
    ["brave", "api_serp_observation"],
    ["baidu", "none"],
    ["naver", "none"],
    ["seznam", "none"],
]) {
    const block = registry.match(new RegExp(`\\{[\\s\\S]*?engine: "${engine}"[\\s\\S]*?\\n    \\}`, "m"))?.[0] ?? "";
    check(block.includes(`rankKind: "${rankKind}"`), `${engine} must declare rankKind=${rankKind}`);
}

const officialRuntimeNeedles = [
    "https://www.googleapis.com/webmasters/v3/sites",
    "/searchAnalytics/query",
    "https://oauth2.googleapis.com/token",
    "https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats",
    "https://api.webmaster.yandex.net/v4/user",
    "/search-queries/popular",
    "https://api.search.brave.com/res/v1/web/search",
    "http://data.zz.baidu.com/urls",
    "https://searchadvisor.naver.com/indexnow",
    "https://search.seznam.cz/indexnow",
];
for (const needle of officialRuntimeNeedles) contains(serviceFile, needle, `Real provider runtime missing ${needle}`);

contains(serviceFile, 'dimensions: ["query", "device", "country"]', "Google sync must preserve query/device/country dimensions");
contains(serviceFile, 'device: "all"', "Aggregate webmaster observations must support device=all");
contains(serviceFile, "AVG_SHOW_POSITION", "Yandex average display position must come from provider data");
contains(serviceFile, "AvgImpressionPosition", "Bing average impression position must come from provider data");
contains(serviceFile, "more_results_available", "Brave rank probing must paginate only while real results remain");
contains(serviceFile, "No rank is written", "Brave must explicitly avoid fabricated not-found ranks");
contains(serviceFile, "Baidu accepted zero URLs", "Baidu HTTP success must still verify accepted URL count");
contains(serviceFile, "IndexNow key file does not exactly match", "IndexNow must verify the public proof file before submission");
contains(serviceFile, "verification_pending", "HTTP 202 IndexNow responses must remain pending, not connected");
contains(serviceFile, 'status: verificationPending ? "configured" : "connected"', "Connected state must require completed provider verification");
contains(serviceFile, 'status: "error"', "Provider failures must be persisted as an error state");
contains(serviceFile, 'split(secret).join("[REDACTED]")', "Provider errors must redact runtime secrets");
contains(serviceFile, "process.env[credentialEnvRef]", "Secrets must be resolved from runtime environment variables");
notContains(serviceFile, "Math.random", "Search-engine runtime must not synthesize provider data with Math.random");
notContains(serviceFile, "fakeRank", "Search-engine runtime must not contain fake rank helpers");
notContains(serviceFile, "mockRank", "Search-engine runtime must not contain mock rank helpers");

contains(controllerFile, "seoSearchEngineService.configureAndSync", "Engine PATCH must execute the real provider runtime");
contains(controllerFile, "isSeoSearchEngineProvider", "Engine integrations must be separated from utility providers");
contains(validatorFile, '"seznam"', "Keyword validator must accept the seventh search engine");
contains(validatorFile, '"all"', "Keyword validator must preserve aggregate webmaster device semantics");
contains(typesFile, 'rank_kind: "webmaster_average" | "api_serp_observation" | "none"', "Admin types must expose truthful rank semantics");
contains(workspaceFile, "میانگین رتبه وبمستر", "UI must label provider average positions accurately");
contains(workspaceFile, "رتبه مشاهده‌شده API", "UI must distinguish Brave API result position from webmaster rank");
contains(workspaceFile, "بدون رتبه ساختگی", "UI must expose engines that intentionally have no rank source");
contains(workspaceFile, "خطای اتصال", "UI must surface failed provider connections");
contains(workspaceFile, "last_error", "UI must display provider error evidence");
contains(workspaceFile, "key_location", "Naver/Seznam must allow configuration of a real public IndexNow proof location");

for (const provider of expected.map(([, provider]) => provider)) {
    contains(migrationFile, `'${provider}'`, `Migration must allow provider ${provider}`);
}
for (const column of ["current_position", "previous_position", "best_position"]) {
    contains(migrationFile, `ALTER COLUMN ${column} TYPE numeric(8,2)`, `${column} must preserve provider decimal positions`);
}
contains(migrationFile, "ALTER COLUMN country TYPE varchar(3)", "Google Search Console alpha-3 country values must fit the schema");

contains(commandFile, 'static commandName = "seo:sync-search-engines"', "Recurring sync command must be available to cron");
contains(commandFile, "native_rank_tracking || item.capabilities.webmaster_analytics", "Scheduled sync must target analytics/rank connectors");
notContains(commandFile, 'provider: "baidu_search_resource"', "Scheduled analytics sync must not resubmit Baidu URLs");
notContains(commandFile, 'provider: "naver_search_advisor"', "Scheduled analytics sync must not resubmit Naver URLs");
notContains(commandFile, 'provider: "seznam_indexnow"', "Scheduled analytics sync must not resubmit Seznam URLs");

if (failures.length > 0) {
    console.error(`SEO seven-engine verification failed (${failures.length}/${checks} checks):`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}
console.log(`SEO seven-engine verification passed (${checks} checks).`);
