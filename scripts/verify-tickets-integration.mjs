#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function exists(relative) {
    return fs.existsSync(path.join(root, relative));
}

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

const requiredFiles = [
    "apps/admin/messages/tickets/fa.json",
    "apps/admin/messages/tickets/en.json",
    "apps/admin/src/app/[locale]/(authenticated)/tickets/page.tsx",
    "apps/admin/src/app/[locale]/(authenticated)/tickets/[id]/page.tsx",
    "apps/admin/src/app/[locale]/(authenticated)/tickets/settings/page.tsx",
    "apps/admin/src/components/Sidebar.tsx",
    "apps/admin/src/features/tickets/workspace.tsx",
    "apps/admin/src/features/tickets/detail.tsx",
    "apps/admin/src/features/tickets/settings.tsx",
    "apps/admin/src/features/tickets/queries.ts",
    "apps/admin/src/lib/i18n/request.ts",
    "apps/admin/src/lib/queries/use-settle-mutation.ts",
    "apps/api/app/controllers/admin/tickets_controller.ts",
    "apps/api/app/models/support_ticket.ts",
    "apps/api/app/services/support/ticket_service.ts",
    "apps/api/app/services/support/ticket_queue_service.ts",
    "apps/api/app/table_views/admin/tickets.ts",
    "apps/api/app/validators/admin/ticket_request_validator.ts",
    "apps/api/database/migrations/1750007100000_create_support_ticket_tables.ts",
    "apps/api/start/routes/admin_tickets.ts",
    "apps/api/tests/functional/admin/tickets.spec.ts",
    "apps/api/tests/functional/admin/tickets_concurrency.spec.ts",
    "apps/api/tests/functional/admin/tickets_table_view.spec.ts",
    "apps/api/tests/functional/admin/tickets_workflow.spec.ts",
    "docs/api/reference/openapi/admin.tickets.v1.yaml",
    "packages/sdk/src/generated/admin.d.ts",
];
for (const file of requiredFiles) check(exists(file), `missing ticket integration file: ${file}`);

const routes = read("apps/api/start/routes/admin_tickets.ts");
for (const endpoint of [
    '"/summary"',
    '"/trends"',
    '"/settings"',
    '"/resources"',
    '"/"',
    '"/:id"',
    '"/:id/transition"',
    '"/:id/messages"',
]) {
    check(routes.includes(endpoint), `missing ticket route: ${endpoint}`);
}
check(routes.includes('middleware.auth({ guards: ["api"] })'), "Ticket routes must require API authentication");
check(routes.includes("middleware.admin()"), "Ticket routes must require admin middleware");
check(routes.includes("adminWriteLimiter"), "Ticket writes must use the shared admin write limiter");

const controller = read("apps/api/app/controllers/admin/tickets_controller.ts");
for (const invariant of [
    "ticketQueueService.list",
    "supportTicketService.create",
    "supportTicketService.update",
    "supportTicketService.transition",
    "supportTicketService.addMessage",
    "assertExpectedVersion",
    "recordAudit",
]) {
    check(controller.includes(invariant), `Ticket controller invariant missing: ${invariant}`);
}

const service = read("apps/api/app/services/support/ticket_service.ts");
for (const invariant of [
    "nextNumber(\"ticket\")",
    "ensureAssignee",
    "ensureCustomer",
    "expected_version",
    'kind === "reply" && current.first_response_at === null',
    "support_ticket_events",
    "first_response_due_at",
    "resolution_due_at",
]) {
    check(service.includes(invariant), `Ticket domain invariant missing: ${invariant}`);
}
check(service.includes('.where("version", input.expected_version)'), "Ticket metadata updates must be version-guarded");
check(service.includes('.where("version", expectedVersion)'), "Ticket workflow writes must be version-guarded");

const queue = read("apps/api/app/services/support/ticket_queue_service.ts");
for (const invariant of ["adminTicketsView.run", 'input.sla === "healthy"', 'input.sla === "breached"']) {
    check(queue.includes(invariant), `Ticket queue invariant missing: ${invariant}`);
}

const migration = read("apps/api/database/migrations/1750007100000_create_support_ticket_tables.ts");
for (const table of ["support_ticket_settings", "support_tickets", "support_ticket_messages", "support_ticket_events"]) {
    check(migration.includes(`CREATE POLICY tenant_isolation ON ${table}`), `${table} must have tenant RLS policy`);
}
check(migration.includes("FORCE ROW LEVEL SECURITY"), "Ticket tables must force row-level security");
check(migration.includes("support_tickets_number_unique"), "Ticket numbering must be unique per tenant");
check(migration.includes("support_tickets_reference_unique"), "Ticket references must be unique per tenant");

const queries = read("apps/admin/src/features/tickets/queries.ts");
for (const hook of [
    "useTickets",
    "useTicketSummary",
    "useTicketTrends",
    "useCreateTicket",
    "useUpdateTicket",
    "useTransitionTicket",
    "useAddTicketMessage",
    "useTicketSettings",
]) {
    check(queries.includes(`function ${hook}`), `Ticket admin query hook missing: ${hook}`);
}

const workspace = read("apps/admin/src/features/tickets/workspace.tsx");
check(
    workspace.includes('assigneeChoice === "default"') && workspace.includes('assigneeChoice === "unassigned"'),
    "Ticket create form must distinguish tenant-default assignment from explicit unassigned",
);
check(
    workspace.includes('createPriority === "default" ? undefined : createPriority'),
    "Ticket create form must omit priority when the tenant default is selected",
);
check(
    workspace.includes('<SelectItem value="unassigned">{t.unassigned}</SelectItem>'),
    "Ticket create form must expose explicit unassigned when a tenant default assignee exists",
);

const detail = read("apps/admin/src/features/tickets/detail.tsx");
check(detail.includes("ALLOWED_TRANSITIONS"), "Ticket detail must not offer backend-invalid status transitions");
check(detail.includes("metadataKey"), "Ticket metadata form must remount when server metadata changes");
check(detail.includes("ArrowStart"), "Ticket back navigation must use the RTL-aware logical arrow");

const settle = read("apps/admin/src/lib/queries/use-settle-mutation.ts");
check(settle.includes("setPendingState(rollback)"), "Failed settled mutations must roll optimistic state back");
check(
    settle.includes("void flush().catch"),
    "Timer-triggered settled mutations must not leak unhandled promise rejections",
);

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
check(sidebar.includes('labelKey: "ticketQueue"'), "Ticket queue navigation must use a translation key");
check(sidebar.includes('labelKey: "ticketSettings"'), "Ticket settings navigation must use a translation key");
check(sidebar.includes('navT("tickets")'), "Ticket navigation group title must come from the Nav catalog");
check(!sidebar.includes("labelFa"), "Sidebar must not keep local Persian ticket labels");
check(!sidebar.includes("labelEn"), "Sidebar must not keep local English ticket labels");

for (const locale of ["fa", "en"]) {
    const catalog = JSON.parse(read(`apps/admin/messages/tickets/${locale}.json`));
    for (const key of ["tickets", "ticketQueue", "ticketSettings"]) {
        check(typeof catalog.Nav?.[key] === "string" && catalog.Nav[key].length > 0, `${locale} Nav.${key} is missing`);
    }
}
const requestConfig = read("apps/admin/src/lib/i18n/request.ts");
check(requestConfig.includes("messages/tickets/${locale}.json"), "Admin i18n loader must compose the ticket catalog");
check(requestConfig.includes("...tickets.Nav"), "Admin i18n loader must merge ticket Nav keys with the base catalog");

const workflowTests = read("apps/api/tests/functional/admin/tickets_workflow.spec.ts");
check(
    workflowTests.includes("default assignee must be an admin and is applied unless explicitly cleared"),
    "Ticket tests must cover default assignment and explicit unassignment",
);
check(workflowTests.includes("first-response SLA"), "Ticket tests must cover first-response SLA semantics");

const concurrencyTests = read("apps/api/tests/functional/admin/tickets_concurrency.spec.ts");
check(concurrencyTests.includes("rejects stale no-op metadata update"), "Ticket tests must reject stale metadata writes");
check(concurrencyTests.includes("rejects stale same-status transition"), "Ticket tests must reject stale workflow writes");

const tableTests = read("apps/api/tests/functional/admin/tickets_table_view.spec.ts");
check(tableTests.includes("shared grammar"), "Ticket queue tests must cover the shared TableView grammar");
check(tableTests.includes("rejects legacy per-facet query keys"), "Ticket queue must reject legacy query keys");

const operationsTests = read("apps/api/tests/functional/admin/tickets.spec.ts");
for (const scenario of [
    "rejects unauthenticated and non-admin requests",
    "creates, lists, searches, and reads a ticket",
    "transitions workflow and enforces optimistic versions",
    "distinguishes public replies from internal notes for SLA",
    "returns operational summary, trends, and resources",
]) {
    check(operationsTests.includes(scenario), `Ticket functional coverage missing scenario: ${scenario}`);
}

const openapi = read("docs/api/reference/openapi/admin.tickets.v1.yaml");
for (const endpoint of [
    "/api/v1/admin/tickets:",
    "/api/v1/admin/tickets/summary:",
    "/api/v1/admin/tickets/trends:",
    "/api/v1/admin/tickets/settings:",
    "/api/v1/admin/tickets/resources:",
    "/api/v1/admin/tickets/{id}:",
    "/api/v1/admin/tickets/{id}/transition:",
    "/api/v1/admin/tickets/{id}/messages:",
]) {
    check(openapi.includes(endpoint), `Ticket OpenAPI overlay missing path: ${endpoint}`);
}

const sdk = read("packages/sdk/src/generated/admin.d.ts");
for (const endpoint of [
    '"/api/v1/admin/tickets"',
    '"/api/v1/admin/tickets/summary"',
    '"/api/v1/admin/tickets/{id}"',
    '"/api/v1/admin/tickets/{id}/transition"',
    '"/api/v1/admin/tickets/{id}/messages"',
]) {
    check(sdk.includes(endpoint), `Generated Admin SDK drift: missing ${endpoint}; run official codegen`);
}

if (failures.length > 0) {
    console.error(`Tickets integration verifier failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Tickets integration verifier passed: ${checks} checks`);
