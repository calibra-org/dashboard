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

function check(condition, message) {
    checks += 1;
    if (!condition) failures.push(message);
}

const transactions = read("apps/admin/src/lib/queries/transactions.ts");
const summaryBlock = transactions.match(/export function useTransactionSummary\(\)[\s\S]*?\n}\n/);
check(Boolean(summaryBlock), "useTransactionSummary hook is missing");
check(summaryBlock?.[0].includes("staleTime: 0") === true, "Transaction summary financial state must be immediately stale");

const factor = read("apps/admin/src/features/factor/queries.ts");
const paymentAttemptsBlock = factor.match(/export function useFactorPaymentAttempts[\s\S]*?\n}\n/);
check(Boolean(paymentAttemptsBlock), "useFactorPaymentAttempts hook is missing");
check(paymentAttemptsBlock?.[0].includes("staleTime: 0") === true, "Factor payment attempts must be immediately stale");

const audit = read("apps/api/app/services/admin_audit_log_service.ts");
check(audit.includes("strict?: boolean"), "Audit service must expose an explicit strict mode");
check(audit.includes("if (strict) throw error"), "Strict audit mode must fail closed on persistence errors");

const reconciliation = read("apps/api/app/services/payment_reconciliation_service.ts");
for (const invariant of [
    'createLock(`order:${Number(candidate.orderId)}`',
    "withTenantTransaction",
    ".forUpdate()",
    "strict: true",
    'action: "payment.reconciliation.checked"',
]) {
    check(reconciliation.includes(invariant), `Reconciliation financial invariant missing: ${invariant}`);
}

const refund = read("apps/api/app/services/refund_service.ts");
for (const invariant of [
    'createLock(`order:${numericOrderId}`',
    ".forUpdate()",
    'where("idempotency_key", opts.idempotencyKey)',
    "E_REFUND_EXCEEDS_OUTSTANDING",
    "paymentService.refund",
    "refundedByUserId",
    "writeAuditNote",
]) {
    check(refund.includes(invariant), `Refund financial invariant missing: ${invariant}`);
}

const refundController = read("apps/api/app/controllers/admin/refunds_controller.ts");
check(refundController.includes("refundService.create"), "Admin refund endpoint must delegate to RefundService");
check(refundController.includes("idempotencyKey"), "Admin refund endpoint must forward the idempotency key");
check(refundController.includes('action: "order.refund.created"'), "Admin refund endpoint must append operator audit evidence");

if (failures.length > 0) {
    console.error(`Financial invariants verifier failed: ${failures.length}/${checks} checks`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Financial invariants verifier passed: ${checks} checks`);
