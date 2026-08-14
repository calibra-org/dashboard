import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import AdminAuditLog from "#models/admin_audit_log";
import PaymentAttempt from "#models/payment_attempt";
import { paymentReconciliationService } from "#services/payment_reconciliation_service";
import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import AdminAuditLogTransformer from "#transformers/admin_audit_log_transformer";
import PaymentAttemptTransformer from "#transformers/payment_attempt_transformer";
import { adminPaymentAttemptListValidator } from "#validators/admin/payment_gateway_validator";

function ilikeLiteral(value: string): string {
    return `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

/** Admin operations surface for payment attempts. */
export default class AdminPaymentAttemptsController {
    async index(ctx: HttpContext) {
        const parsed = await ctx.request.validateUsing(adminPaymentAttemptListValidator);
        const query = PaymentAttempt.query();
        const q = parsed.q?.trim();
        if (q) {
            const needle = ilikeLiteral(q);
            query.where((builder) => {
                builder
                    .whereILike("gateway_code_snapshot", needle)
                    .orWhereILike("gateway_authority", needle)
                    .orWhereILike("gateway_transaction_id", needle);
                if (/^\d+$/.test(q)) {
                    const numeric = Number(q);
                    if (Number.isSafeInteger(numeric)) builder.orWhere("id", numeric).orWhere("order_id", numeric);
                }
            });
        }
        const { data, meta } = await adminPaymentAttemptsView.run<PaymentAttempt>(query, parsed);
        return { data: data.map((row) => new PaymentAttemptTransformer(row).forList()), meta };
    }

    /** KPI source for the transaction workbench. Values stay in canonical minor units. */
    async summary() {
        const statusRows = await PaymentAttempt.query()
            .select("status")
            .sum("amount_minor as amount_minor")
            .count("id as count")
            .groupBy("status");
        const reconciliationRows = await PaymentAttempt.query()
            .select("reconciliation_status")
            .count("id as count")
            .groupBy("reconciliation_status");
        const attentionRow = await PaymentAttempt.query()
            .where((builder) =>
                builder.whereIn("status", ["failed", "cancelled"]).orWhere("reconciliation_status", "mismatch"),
            )
            .count("id as count")
            .first();

        const byStatus: Record<string, { count: number; amount_minor: number }> = {};
        let totalCount = 0;
        let totalAmountMinor = 0;
        for (const row of statusRows) {
            const status = String(row.status);
            const count = Number(row.$extras.count ?? 0);
            const amountMinor = Number(row.$extras.amount_minor ?? 0);
            byStatus[status] = { count, amount_minor: amountMinor };
            totalCount += count;
            totalAmountMinor += amountMinor;
        }
        const byReconciliation: Record<string, number> = {};
        for (const row of reconciliationRows) {
            byReconciliation[String(row.reconciliationStatus ?? "unchecked")] = Number(row.$extras.count ?? 0);
        }

        return {
            data: {
                total_count: totalCount,
                total_amount_minor: totalAmountMinor,
                by_status: byStatus,
                by_reconciliation: byReconciliation,
                needs_attention_count: Number(attentionRow?.$extras.count ?? 0),
            },
        };
    }

    async show(ctx: HttpContext) {
        const attempt = await this.findAttempt(ctx.params.id);
        return { data: new PaymentAttemptTransformer(attempt).forDetail() };
    }

    async reconcile(ctx: HttpContext) {
        const id = this.numericId(ctx.params.id);
        const attempt = await paymentReconciliationService.reconcile(id, ctx);
        return { data: new PaymentAttemptTransformer(attempt).forDetail() };
    }

    async reconciliationHistory(ctx: HttpContext) {
        const id = this.numericId(ctx.params.id);
        await this.findAttempt(id);
        const rows = await AdminAuditLog.query()
            .where("entity_kind", "payment_attempt")
            .where("entity_id", id)
            .where("action", "payment.reconciliation.checked")
            .preload("actor")
            .orderBy("occurred_at", "desc")
            .limit(50);
        return { data: rows.map((row) => new AdminAuditLogTransformer(row).toObject()) };
    }

    private numericId(raw: unknown): number {
        const id = Number(raw);
        if (!Number.isSafeInteger(id) || id <= 0) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return id;
    }

    private async findAttempt(raw: unknown): Promise<PaymentAttempt> {
        const id = this.numericId(raw);
        const attempt = await PaymentAttempt.find(id);
        if (!attempt) throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        return attempt;
    }
}
