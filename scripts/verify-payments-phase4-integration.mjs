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

function notContains(relative, needle, message = `${relative} must not contain ${needle}`) {
    check(!read(relative).includes(needle), message);
}

function messages(locale) {
    const base = JSON.parse(read(`apps/admin/messages/${locale}.json`));
    const transactions = JSON.parse(read(`apps/admin/messages/transactions/${locale}.json`));
    return {
        ...base,
        ...transactions,
        Nav: {
            ...base.Nav,
            ...transactions.Nav,
        },
    };
}

const requiredFiles = [
    "apps/admin/messages/transactions/fa.json",
    "apps/admin/messages/transactions/en.json",
    "apps/admin/src/app/[locale]/(authenticated)/transactions/page.tsx",
    "apps/admin/src/lib/i18n/request.ts",
    "apps/admin/src/lib/queries/transactions.ts",
    "apps/admin/src/views/transactions/transactions-center.tsx",
    "apps/api/app/controllers/admin/payment_attempts_controller.ts",
    "apps/api/app/controllers/admin/refunds_controller.ts",
    "apps/api/app/models/payment_attempt.ts",
    "apps/api/app/services/payment_reconciliation_service.ts",
    "apps/api/app/services/refund_service.ts",
    "apps/api/app/services/adapters/base_redirect_gateway.ts",
    "apps/api/app/services/adapters/zarinpal_gateway.ts",
    "apps/api/app/table_views/admin/payment_attempts.ts",
    "apps/api/app/transformers/payment_attempt_transformer.ts",
    "apps/api/database/migrations/1750006000000_add_payment_reconciliation_state.ts",
    "apps/api/start/routes/admin_payments.ts",
    "apps/api/tests/functional/payments/admin_transaction_center.spec.ts",
    "docs/api/reference/openapi/admin/paths/payments/payment-attempts-summary.get.yaml",
    "docs/api/reference/openapi/admin/paths/payments/payment-attempts-id-reconciliation.get.yaml",
    "docs/api/reference/openapi/admin/paths/payments/payment-attempts-id-reconcile.post.yaml",
    "docs/api/reference/openapi/admin/components/schemas/AdminPaymentAttempt.yaml",
    "docs/api/reference/openapi/admin.v1.yaml",
    "packages/sdk/src/generated/admin.d.ts",
];
for (const file of requiredFiles) check(exists(file), `missing Phase 4 integration file: ${file}`);

const routes = read("apps/api/start/routes/admin_payments.ts");
for (const endpoint of [
    '"/payment-gateways"',
    '"/payment-gateways/:id"',
    '"/payment-gateways/:id/verify"',
    '"/payment-attempts"',
    '"/payment-attempts/summary"',
    '"/payment-attempts/:id/reconciliation"',
    '"/payment-attempts/:id/reconcile"',
    '"/payment-attempts/:id"',
]) {
    check(routes.includes(endpoint), `missing Admin payment route: ${endpoint}`);
}
check(routes.includes('middleware.auth({ guards: ["api"] })'), "Admin payment routes must require API authentication");
check(routes.includes("middleware.admin()"), "Admin payment routes must require admin middleware");

const transactionUi = read("apps/admin/src/views/transactions/transactions-center.tsx");
for (const invariant of [
    'useTranslations("Transactions")',
    "useTransactions",
    "useTransactionSummary",
    "useReconcileTransaction",
    "useTransactionReconciliationHistory",
    "usePaymentGateways",
    "useCreateRefund",
    "useOrderRefunds",
    "DateFilterChip",
    "dateFilterValueToTableViewFilter",
    'field: "amount_minor"',
    'field: "reconciliation_status"',
]) {
    check(transactionUi.includes(invariant), `Transaction Center missing wiring: ${invariant}`);
}
notContains(
    "apps/admin/src/views/transactions/transactions-center.tsx",
    "getTopSellersFixture",
    "Transaction Center must not use fixtures",
);
notContains(
    "apps/admin/src/views/transactions/transactions-center.tsx",
    "toast.success",
    "Transaction Center must use the repository toast manager API",
);
notContains(
    "apps/admin/src/views/transactions/transactions-center.tsx",
    "const COPY =",
    "Transaction Center visible copy must come from next-intl",
);
check(
    transactionUi.includes("const financialsReady = order.isSuccess && refunds.isSuccess"),
    "Refund UI must wait for authoritative order/refund data instead of falling back to a historical attempt amount",
);

const sidebar = read("apps/admin/src/components/Sidebar.tsx");
check(sidebar.includes("/transactions"), "Sidebar must link to /transactions");
check(sidebar.includes('labelKey: "transactions"'), "Transaction navigation must use the Nav translation catalog");
check(
    !sidebar.includes('label: { fa: "تراکنش‌ها", en: "Transactions" }'),
    "Sidebar must not hard-code bilingual transaction copy",
);

for (const locale of ["fa", "en"]) {
    const catalog = messages(locale);
    check(typeof catalog.Nav?.transactions === "string", `${locale} Nav.transactions is missing`);
    check(catalog.Transactions && typeof catalog.Transactions === "object", `${locale} Transactions namespace is missing`);
}

const controller = read("apps/api/app/controllers/admin/payment_attempts_controller.ts");
for (const invariant of [
    "async summary",
    "async reconciliationHistory",
    "async reconcile",
    "paymentReconciliationService.reconcile",
    "Number.isSafeInteger",
]) {
    check(controller.includes(invariant), `Payment attempts controller missing invariant: ${invariant}`);
}

const reconciliation = read("apps/api/app/services/payment_reconciliation_service.ts");
for (const invariant of [
    "createLock(`order:${Number(attempt.orderId)}`",
    ".forUpdate()",
    "adapter.reconcile",
    'status: "unsupported"',
    'status: "error"',
    'action: "payment.reconciliation.checked"',
    "paymentGatewayCredentialsService.runtimeSettings",
    "Sentry.captureException",
    'reason: "provider_probe_exception"',
]) {
    check(reconciliation.includes(invariant), `Reconciliation safety invariant missing: ${invariant}`);
}
notContains(
    "apps/api/app/services/payment_reconciliation_service.ts",
    ".settle(",
    "Reconciliation must not replay provider settlement as a status check",
);
notContains(
    "apps/api/app/services/payment_reconciliation_service.ts",
    ".capture(",
    "Reconciliation must not replay provider capture as a status check",
);
notContains(
    "apps/api/app/services/payment_reconciliation_service.ts",
    "error_message: (error as Error).message",
    "Reconciliation evidence must not persist raw provider exceptions",
);

const adapterContract = read("apps/api/app/services/adapters/base_redirect_gateway.ts");
check(
    adapterContract.includes("reconcile?(args: ReconcileArgs)"),
    "Payment adapter contract must make reconciliation capability explicit and optional",
);
const zarinpal = read("apps/api/app/services/adapters/zarinpal_gateway.ts");
check(zarinpal.includes("async reconcile"), "ZarinPal adapter must expose the verified safe reconciliation probe");
check(
    zarinpal.includes("code === 100 || code === 101"),
    "ZarinPal reconciliation relies on documented existing idempotent verify semantics in Calibra",
);

const model = read("apps/api/app/models/payment_attempt.ts");
for (const field of [
    "reconciliationStatus",
    "reconciliationProviderStatus",
    "reconciliationCheckedAt",
    "reconciliationCheckedByUserId",
    "reconciliationErrorCode",
    "reconciliationEvidence",
    "invalidateStaleReconciliation",
]) {
    check(model.includes(field), `PaymentAttempt model missing reconciliation field/invariant: ${field}`);
}

const migration = read("apps/api/database/migrations/1750006000000_add_payment_reconciliation_state.ts");
for (const column of [
    "reconciliation_status",
    "reconciliation_provider_status",
    "reconciliation_checked_at",
    "reconciliation_checked_by_user_id",
    "reconciliation_error_code",
    "reconciliation_evidence",
]) {
    check(migration.includes(column), `Reconciliation migration missing column: ${column}`);
}
check(
    migration.includes("payment_attempts_reconciliation_status_idx"),
    "Reconciliation migration must index status for operations filtering",
);

const generatedSchema = read("apps/api/database/schema.ts");
for (const column of [
    "reconciliationStatus",
    "reconciliationProviderStatus",
    "reconciliationCheckedAt",
    "reconciliationCheckedByUserId",
    "reconciliationErrorCode",
    "reconciliationEvidence",
]) {
    check(
        generatedSchema.includes(column),
        `Generated DB schema drift: missing PaymentAttempt.${column}; run the official migration/schema generation flow`,
    );
}

const transformer = read("apps/api/app/transformers/payment_attempt_transformer.ts");
for (const field of [
    "reconciliation_status",
    "reconciliation_provider_status",
    "reconciliation_checked_at",
    "reconciliation_checked_by_user_id",
    "reconciliation_error_code",
    "reconciliation_evidence",
]) {
    check(transformer.includes(field), `PaymentAttempt transformer missing field: ${field}`);
}
notContains(
    "apps/api/app/transformers/payment_attempt_transformer.ts",
    "idempotency_key",
    "PaymentAttempt transformer must never expose idempotency keys",
);

const refundController = read("apps/api/app/controllers/admin/refunds_controller.ts");
check(refundController.includes("refundService.create"), "Admin refunds must reuse RefundService");
check(refundController.includes("idempotencyKey"), "Admin refunds must pass idempotency key to RefundService");

const openapi = read("docs/api/reference/openapi/admin.v1.yaml");
for (const endpoint of [
    "/api/v1/admin/payment-attempts/summary:",
    "/api/v1/admin/payment-attempts/{id}/reconciliation:",
    "/api/v1/admin/payment-attempts/{id}/reconcile:",
]) {
    check(openapi.includes(endpoint), `Admin OpenAPI root registration missing: ${endpoint}`);
}
const attemptSchema = read("docs/api/reference/openapi/admin/components/schemas/AdminPaymentAttempt.yaml");
for (const field of [
    "reconciliation_status",
    "reconciliation_provider_status",
    "reconciliation_checked_at",
    "reconciliation_checked_by_user_id",
    "reconciliation_error_code",
    "reconciliation_evidence",
]) {
    check(attemptSchema.includes(field), `AdminPaymentAttempt OpenAPI schema missing ${field}`);
}

const sdk = read("packages/sdk/src/generated/admin.d.ts");
for (const endpoint of [
    '"/api/v1/admin/payment-attempts/summary"',
    '"/api/v1/admin/payment-attempts/{id}/reconciliation"',
    '"/api/v1/admin/payment-attempts/{id}/reconcile"',
]) {
    check(sdk.includes(endpoint), `Generated Admin SDK drift: missing ${endpoint}; run official codegen`);
}
for (const field of ["reconciliation_status", "reconciliation_provider_status", "reconciliation_checked_at"]) {
    check(sdk.includes(field), `Generated Admin SDK schema drift: missing ${field}`);
}

const tests = read("apps/api/tests/functional/payments/admin_transaction_center.spec.ts");
for (const scenario of ["authority", "summary", "reconcile", "mismatch", "unsupported", "reconciliation"]) {
    check(tests.toLowerCase().includes(scenario), `Transaction Center functional tests missing scenario keyword: ${scenario}`);
}

if (failures.length > 0) {
    console.error(`Payments Phase 4 verifier failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Payments Phase 4 verifier passed: ${checks} checks`);
