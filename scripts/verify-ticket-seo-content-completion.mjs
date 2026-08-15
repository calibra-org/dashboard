#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;
const check = (condition, message) => {
    checks += 1;
    if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const contains = (file, text, message = `${file} must contain ${text}`) => check(read(file).includes(text), message);

const required = [
    "docs/calibra/TICKET_SEO_CONTENT_BACKEND_COMPLETION_PROMPT_FA.md",
    "apps/api/database/migrations/1760001000000_expand_support_operations.ts",
    "apps/api/app/services/support/ticket_operations_service.ts",
    "apps/api/app/controllers/admin/ticket_operations_controller.ts",
    "apps/api/start/routes/admin_ticket_operations.ts",
    "apps/api/app/services/support/public_support_service.ts",
    "apps/api/start/routes/support_public.ts",
    "apps/api/database/migrations/1760001100000_expand_seo_operations.ts",
    "apps/api/database/migrations/1760001110000_add_seo_crawl_targets.ts",
    "apps/api/app/services/seo/operations_service.ts",
    "apps/api/app/services/seo/crawl_service.ts",
    "apps/api/commands/seo_run_crawls.ts",
    "apps/api/app/controllers/admin/seo_operations_controller.ts",
    "apps/api/start/routes/admin_seo_operations.ts",
    "apps/api/database/migrations/1760001200000_add_content_scheduler_runs.ts",
    "apps/api/app/services/content/news_service.ts",
    "apps/api/app/services/content/scheduler_observability_service.ts",
    "apps/api/start/routes/admin_news.ts",
    "apps/api/start/routes/news_public.ts",
];
for (const file of required) check(exists(file), `missing completion file: ${file}`);

const supportMigration = "apps/api/database/migrations/1760001000000_expand_support_operations.ts";
for (const table of [
    "support_ticket_workflow_statuses",
    "support_ticket_saved_views",
    "support_ticket_attachments",
    "support_ticket_merges",
    "support_agent_presence",
    "support_channel_integrations",
    "support_routing_rules",
    "support_automation_rules",
    "support_campaigns",
    "support_campaign_recipients",
    "support_csat_responses",
    "support_public_tokens",
]) {
    contains(supportMigration, `createTable("${table}"`, `support migration must create ${table}`);
    contains(supportMigration, `"${table}"`, `${table} must participate in the support tenant-table RLS set`);
}
contains(
    supportMigration,
    "`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`",
    "support tenant-table loop must enable row-level security",
);
contains(
    supportMigration,
    "`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`",
    "support tenant-table loop must force row-level security",
);
contains(
    supportMigration,
    "`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`",
    "support tenant-table loop must install tenant isolation policy",
);
contains(supportMigration, "support_campaign_recipients_dedupe", "campaign recipients must deduplicate");
contains(supportMigration, "response_token_hash", "CSAT must not store a plaintext public token");
contains(
    "apps/api/app/services/support/public_support_service.ts",
    "randomBytes(32)",
    "public support must issue opaque random tokens",
);
contains(
    "apps/api/app/services/support/public_support_service.ts",
    'createHash("sha256")',
    "public support must hash tracking tokens",
);
contains(
    "apps/api/app/services/support/public_support_service.ts",
    '.whereIn("kind", ["requester_message", "reply"])',
    "public support must exclude internal notes",
);
contains(
    "apps/api/app/services/support/public_support_service.ts",
    '.where("scan_status", "clean")',
    "public support must exclude unscanned attachments",
);
contains("apps/api/app/services/support/ticket_operations_service.ts", "E_TICKET_MERGE_LOOP", "ticket merge must reject loops");
contains(
    "apps/api/app/services/support/ticket_operations_service.ts",
    "credential_env_ref",
    "channel secrets must use environment references",
);
contains(
    "apps/api/app/services/support/ticket_operations_service.ts",
    'String(channel.status) !== "connected"',
    "campaign scheduling must require a verified channel",
);

const seoMigration = "apps/api/database/migrations/1760001100000_expand_seo_operations.ts";
for (const table of ["seo_action_queue", "seo_crawl_runs", "seo_crawl_observations", "seo_export_jobs"]) {
    contains(seoMigration, `createTable("${table}"`, `SEO migration must create ${table}`);
    contains(seoMigration, `"${table}"`, `${table} must participate in the SEO tenant-table RLS set`);
}
contains(
    seoMigration,
    "`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`",
    "SEO tenant-table loop must enable row-level security",
);
contains(seoMigration, "`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`", "SEO tenant-table loop must force row-level security");
contains(
    seoMigration,
    "`CREATE POLICY tenant_isolation ON ${table} USING (${TENANT}) WITH CHECK (${TENANT})`",
    "SEO tenant-table loop must install tenant isolation policy",
);
contains(
    "apps/api/app/services/seo/operations_service.ts",
    'String(action.status) !== "approved"',
    "SEO actions must require approval before apply",
);
contains("apps/api/app/services/seo/operations_service.ts", "E_SEO_ROLLBACK_CONFLICT", "SEO rollback must conflict on drift");
contains(
    "apps/api/app/services/seo/operations_service.ts",
    "contentService.update",
    "SEO content refresh must use Content OS update/revision path",
);
contains(
    "apps/api/app/services/seo/crawl_service.ts",
    "isPrivateContentSourceAddress",
    "SEO crawler must block private network addresses",
);
contains("apps/api/app/services/seo/crawl_service.ts", "pinnedLookup", "SEO crawler must pin resolved DNS address");
contains(
    "apps/api/app/services/seo/crawl_service.ts",
    "crawl redirects are not followed",
    "SEO crawler must not follow redirects silently",
);
contains(
    "apps/api/commands/seo_run_crawls.ts",
    "withJobTenantContext",
    "SEO crawl worker must re-enter tenant RLS context around DB phases",
);

const schedulerMigration = "apps/api/database/migrations/1760001200000_add_content_scheduler_runs.ts";
contains(schedulerMigration, 'createTable("content_scheduler_runs"', "content scheduler ledger is required");
contains(schedulerMigration, "content_scheduler_runs_bucket_unique", "scheduler runs must be idempotent per bucket");
contains(schedulerMigration, "FORCE ROW LEVEL SECURITY", "scheduler ledger must force RLS");
contains("apps/api/commands/content_publish_due.ts", 'begin("publish_due")', "publish command must record a scheduler run");
contains("apps/api/commands/content_ingest_due.ts", 'begin("ingest_due")', "ingest command must record a scheduler run");
contains("apps/api/app/services/content/news_service.ts", 'type: "news"', "dedicated News API must reuse content_posts subtype");
contains(
    "apps/api/app/services/content/news_service.ts",
    "contentService.publicDetail",
    "public News detail must use the public Content OS boundary",
);

const routes = read("apps/api/start/routes.ts");
for (const module of ["admin_ticket_operations", "support_public", "admin_seo_operations", "admin_news", "news_public"]) {
    check(routes.includes(`./routes/${module}.js`), `route registry missing ${module}`);
}

for (const file of required.filter((file) => /\.(ts|tsx)$/.test(file))) {
    const source = read(file);
    check(!/\b(?:TODO|FIXME|HACK)\b/.test(source), `unfinished marker found: ${file}`);
    check(!/@ts-ignore|@ts-nocheck/.test(source), `TypeScript suppression found: ${file}`);
    check(!/console\.(?:log|debug)\s*\(/.test(source), `debug console found: ${file}`);
}

if (failures.length > 0) {
    console.error(`Ticket/SEO/Content completion verification failed (${failures.length}/${checks} checks):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log(`Ticket/SEO/Content completion verification passed (${checks} checks).`);
