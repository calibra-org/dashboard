import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import PaymentAttempt from "#models/payment_attempt";
import { adminPaymentAttemptsView } from "#table_views/admin/payment_attempts";
import PaymentAttemptTransformer from "#transformers/payment_attempt_transformer";
import { adminPaymentAttemptListValidator } from "#validators/admin/payment_gateway_validator";

/**
 * Admin operations view onto payment attempts. The list remains TableView-driven so pagination,
 * filters and sorting use the same wire grammar as the rest of Admin. The only custom projection
 * is `q`, which searches the identifiers an operator actually has when investigating a payment.
 */
export default class AdminPaymentAttemptsController {
    async index(ctx: HttpContext) {
        const parsed = await ctx.request.validateUsing(adminPaymentAttemptListValidator);
        const query = PaymentAttempt.query();
        const q = parsed.q?.trim();
        if (q) {
            query.where((builder) => {
                builder
                    .whereILike("gateway_code_snapshot", `%${q}%`)
                    .orWhereILike("gateway_authority", `%${q}%`)
                    .orWhereILike("gateway_transaction_id", `%${q}%`);
                if (/^\d+$/.test(q)) {
                    builder.orWhere("id", Number(q)).orWhere("order_id", Number(q));
                }
            });
        }
        const { data, meta } = await adminPaymentAttemptsView.run<PaymentAttempt>(query, parsed);
        return {
            data: data.map((row) => new PaymentAttemptTransformer(row).forList()),
            meta,
        };
    }

    /** Lightweight KPI source for the transaction workbench. Values are canonical minor units. */
    async summary() {
        const rows = await PaymentAttempt.query()
            .select("status")
            .sum("amount_minor as amount_minor")
            .count("id as count")
            .groupBy("status");

        const byStatus: Record<string, { count: number; amount_minor: number }> = {};
        let totalCount = 0;
        let totalAmountMinor = 0;
        for (const row of rows) {
            const serialized = row.serialize() as Record<string, unknown>;
            const status = String(serialized.status ?? row.status);
            const count = Number(serialized.count ?? row.$extras.count ?? 0);
            const amountMinor = Number(serialized.amount_minor ?? row.$extras.amount_minor ?? 0);
            byStatus[status] = { count, amount_minor: amountMinor };
            totalCount += count;
            totalAmountMinor += amountMinor;
        }
        return { data: { total_count: totalCount, total_amount_minor: totalAmountMinor, by_status: byStatus } };
    }

    async show(ctx: HttpContext) {
        const id = Number(ctx.params.id);
        if (!Number.isFinite(id)) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const attempt = await PaymentAttempt.find(id);
        if (!attempt) {
            throw new Exception("Payment attempt not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return { data: new PaymentAttemptTransformer(attempt).forDetail() };
    }
}