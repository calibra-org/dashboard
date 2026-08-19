import { createHash, randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { currentTenantId, currentTrx } from "#services/tenant_context";

function digest(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function paging(input: Record<string, unknown>) {
    const page = Math.max(1, Number(input.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(input.limit ?? 50)));
    return { page, limit, offset: (page - 1) * limit };
}

function count(row: unknown, key = "total"): number {
    const record = row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
    const value = Number(record?.[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
}

export const QUALITY_CASE_FLOW: Record<string, readonly string[]> = {
    open: ["triaged"],
    triaged: ["investigating"],
    investigating: ["action_required", "resolved"],
    action_required: ["verifying", "resolved"],
    verifying: ["resolved"],
    resolved: ["closed", "investigating"],
    closed: [],
};

export const QUALITY_ACTION_FLOW: Record<string, readonly string[]> = {
    proposed: ["accepted", "rejected", "cancelled"],
    accepted: ["in_progress", "cancelled"],
    in_progress: ["verification_pending", "cancelled"],
    verification_pending: ["completed", "in_progress"],
    completed: [],
    rejected: [],
    cancelled: [],
};

export class QualityTrustService {
    async overview() {
        const trx = currentTrx();
        const [openCases, criticalCases, openSignals, overdueActions, returns, inspections] = await Promise.all([
            trx.from("quality_cases").whereNot("status", "closed").count("id as total").first(),
            trx.from("quality_cases").where("severity", "critical").whereNot("status", "closed").count("id as total").first(),
            trx.from("quality_signals").where("status", "open").count("id as total").first(),
            trx
                .from("quality_actions")
                .whereNotIn("status", ["completed", "rejected", "cancelled"])
                .where("due_at", "<", trx.raw("now()"))
                .count("id as total")
                .first(),
            trx.from("order_return_items").count("id as total").first(),
            trx.from("return_item_inspections").countDistinct("return_item_id as total").first(),
        ]);
        const totalReturns = count(returns);
        return {
            data: {
                open_cases: count(openCases),
                critical_cases: count(criticalCases),
                open_signals: count(openSignals),
                overdue_actions: count(overdueActions),
                return_items: totalReturns,
                inspection_coverage: totalReturns > 0 ? count(inspections) / totalReturns : null,
            },
        };
    }

    async listCases(input: Record<string, unknown>) {
        const trx = currentTrx();
        const { page, limit, offset } = paging(input);
        const query = trx.from("quality_cases");
        if (input.status) query.where("status", String(input.status));
        if (input.severity) query.where("severity", String(input.severity));
        if (input.q)
            query.where((builder) =>
                builder.whereILike("title", `%${String(input.q)}%`).orWhereILike("reference", `%${String(input.q)}%`),
            );
        const total = await query.clone().clearSelect().clearOrder().count("id as total").first();
        const rows = await query.select("*").orderBy("updated_at", "desc").limit(limit).offset(offset);
        return { data: rows, meta: { page, limit, total: count(total) } };
    }

    async caseDetail(id: number) {
        const trx = currentTrx();
        const record = await trx.from("quality_cases").where("id", id).first();
        if (!record) return null;
        const [sources, evidence, findings, actions, outcomes] = await Promise.all([
            trx.from("quality_case_sources").where("quality_case_id", id).orderBy("created_at", "desc"),
            trx.from("quality_evidence").where("quality_case_id", id).orderBy("captured_at", "desc"),
            trx.from("quality_findings").where("quality_case_id", id).orderBy("created_at", "desc"),
            trx.from("quality_actions").where("quality_case_id", id).orderBy("created_at", "desc"),
            trx.from("quality_outcomes").where("quality_case_id", id).orderBy("created_at", "desc"),
        ]);
        return { ...record, sources, evidence, findings, actions, outcomes };
    }

    async createCase(input: Record<string, unknown>, actorId: number, idempotencyKey?: string) {
        const trx = currentTrx();
        const fingerprint = digest(input);
        if (idempotencyKey) {
            const existing = await trx.from("quality_cases").where("idempotency_key", idempotencyKey).first();
            if (existing) {
                if (existing.idempotency_fingerprint !== fingerprint)
                    throw Object.assign(new Error("idempotency conflict"), { status: 409 });
                return { data: existing, replayed: true };
            }
        }
        const [created] = await trx
            .table("quality_cases")
            .insert({
                tenant_id: currentTenantId(),
                reference: `Q-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
                status: "open",
                severity: input.severity ?? "medium",
                case_type: input.case_type,
                title: input.title,
                summary: input.summary ?? null,
                product_id: input.product_id ?? null,
                variation_id: input.variation_id ?? null,
                owner_user_id: input.owner_user_id ?? null,
                due_at: input.due_at ?? null,
                idempotency_key: idempotencyKey ?? null,
                idempotency_fingerprint: idempotencyKey ? fingerprint : null,
                created_by_user_id: actorId,
            })
            .returning("*");
        return { data: created, replayed: false };
    }

    async updateCase(id: number, input: Record<string, unknown>, actorId: number) {
        const trx = currentTrx();
        const current = await trx.from("quality_cases").where("id", id).forUpdate().first();
        if (!current) return null;
        if (Number(current.version) !== Number(input.expected_version))
            throw Object.assign(new Error("version conflict"), { status: 409 });
        const nextStatus = input.status ? String(input.status) : String(current.status);
        if (nextStatus !== current.status && !(QUALITY_CASE_FLOW[String(current.status)] ?? []).includes(nextStatus))
            throw Object.assign(new Error("invalid state transition"), { status: 409 });
        const patch: Record<string, unknown> = { version: Number(current.version) + 1, updated_at: DateTime.utc().toSQL() };
        for (const field of [
            "status",
            "severity",
            "title",
            "summary",
            "owner_user_id",
            "due_at",
            "resolution_summary",
            "closure_waiver_reason",
        ])
            if (Object.hasOwn(input, field)) patch[field] = input[field];
        if (nextStatus === "resolved") patch.verification_status = "passed";
        if (nextStatus === "closed") {
            const outcome = await trx.from("quality_outcomes").where("quality_case_id", id).first();
            const waiver = String(input.closure_waiver_reason ?? "").trim();
            if (!outcome && waiver.length < 8)
                throw Object.assign(new Error("closure requires measured outcome or audited waiver"), { status: 422 });
            if (!outcome) {
                patch.closure_waived_by_user_id = actorId;
                patch.closure_waived_at = DateTime.utc().toSQL();
                patch.verification_status = "waived";
            }
        }
        const [updated] = await trx
            .from("quality_cases")
            .where({ id, version: input.expected_version })
            .update(patch)
            .returning("*");
        if (!updated) throw Object.assign(new Error("version conflict"), { status: 409 });
        return updated;
    }

    async addSource(caseId: number, input: Record<string, unknown>, actorId: number) {
        const trx = currentTrx();
        const keys = ["return_item_id", "product_review_id", "support_ticket_id", "refund_id"].filter(
            (field) => input[field] !== null && input[field] !== undefined,
        );
        if (keys.length !== 1) throw Object.assign(new Error("exactly one source is required"), { status: 422 });
        const sourceKey = keys[0]!;
        const tables: Record<string, string> = {
            return_item_id: "order_return_items",
            product_review_id: "product_reviews",
            support_ticket_id: "support_tickets",
            refund_id: "order_refunds",
        };
        if (!(await trx.from(tables[sourceKey]!).where("id", Number(input[sourceKey])).first()))
            throw Object.assign(new Error("source not found in tenant"), { status: 404 });
        const [created] = await trx
            .table("quality_case_sources")
            .insert({
                tenant_id: currentTenantId(),
                quality_case_id: caseId,
                [sourceKey]: input[sourceKey],
                source_role: input.source_role ?? "signal",
                linked_by_user_id: actorId,
            })
            .returning("*");
        if (sourceKey === "return_item_id") {
            const line = await trx
                .from("order_return_items as ri")
                .join("order_line_items as li", "li.id", "ri.order_line_item_id")
                .where("ri.id", Number(input[sourceKey]))
                .select("li.product_id", "li.variation_id")
                .first();
            if (line)
                await trx
                    .from("quality_cases")
                    .where("id", caseId)
                    .whereNull("product_id")
                    .update({ product_id: line.product_id, variation_id: line.variation_id, updated_at: DateTime.utc().toSQL() });
        }
        return created;
    }

    async addEvidence(caseId: number, input: Record<string, unknown>, actorId: number) {
        const trx = currentTrx();
        const contentHash = digest([input.evidence_type, input.source_system, input.source_ref, input.summary]);
        const existing = await trx.from("quality_evidence").where({ quality_case_id: caseId, content_hash: contentHash }).first();
        if (existing) return { data: existing, replayed: true };
        const [created] = await trx
            .table("quality_evidence")
            .insert({
                tenant_id: currentTenantId(),
                quality_case_id: caseId,
                evidence_type: input.evidence_type,
                source_system: input.source_system,
                source_ref: input.source_ref ?? null,
                provenance_type: input.provenance_type,
                summary: input.summary,
                content_hash: contentHash,
                ai_provenance: input.ai_provenance ?? {},
                created_by_user_id: actorId,
            })
            .returning("*");
        return { data: created, replayed: false };
    }

    async addFinding(caseId: number, input: Record<string, unknown>, actorId: number, key?: string) {
        return this.idempotentInsert(
            "quality_findings",
            {
                tenant_id: currentTenantId(),
                quality_case_id: caseId,
                truth_state: input.truth_state ?? "observed",
                finding_type: input.finding_type,
                statement: input.statement,
                confidence: input.confidence ?? null,
                evidence_summary: input.evidence_summary ?? null,
                created_by_user_id: actorId,
            },
            key,
        );
    }

    async adjudicateFinding(caseId: number, findingId: number, input: Record<string, unknown>, actorId: number) {
        const trx = currentTrx();
        const [updated] = await trx
            .from("quality_findings")
            .where({ id: findingId, quality_case_id: caseId, version: input.expected_version })
            .update({
                truth_state: input.truth_state,
                validated_by_user_id: actorId,
                validated_at: DateTime.utc().toSQL(),
                version: Number(input.expected_version) + 1,
                updated_at: DateTime.utc().toSQL(),
            })
            .returning("*");
        if (!updated) throw Object.assign(new Error("version conflict"), { status: 409 });
        return updated;
    }

    async inspectReturnItem(returnId: number, itemId: number, input: Record<string, unknown>, actorId: number, key?: string) {
        const trx = currentTrx();
        if (!(await trx.from("order_return_items").where({ id: itemId, return_id: returnId }).first())) return null;
        if (Number(input.defect_quantity ?? 0) > Number(input.inspected_quantity))
            throw Object.assign(new Error("defect quantity cannot exceed inspected quantity"), { status: 422 });
        return this.idempotentInsert(
            "return_item_inspections",
            {
                tenant_id: currentTenantId(),
                return_item_id: itemId,
                reason_definition_id: input.reason_definition_id ?? null,
                condition: input.condition,
                disposition: input.disposition,
                inspected_quantity: input.inspected_quantity,
                defect_quantity: input.defect_quantity ?? 0,
                note: input.note ?? null,
                evidence_refs: input.evidence_refs ?? [],
                created_by_user_id: actorId,
            },
            key,
        );
    }

    async returns(input: Record<string, unknown>) {
        const trx = currentTrx();
        const { page, limit, offset } = paging(input);
        const total = await trx.from("order_return_items").count("id as total").first();
        const rows = await trx
            .from("order_return_items as ri")
            .join("order_returns as r", "r.id", "ri.return_id")
            .join("order_line_items as li", "li.id", "ri.order_line_item_id")
            .leftJoin("return_item_inspections as ins", "ins.return_item_id", "ri.id")
            .select(
                "ri.id",
                "ri.return_id",
                "ri.reason",
                "ri.requested_quantity",
                "ri.received_quantity",
                "r.status",
                "r.created_at",
                "li.product_id",
                "li.variation_id",
            )
            .max("ins.created_at as last_inspected_at")
            .groupBy("ri.id", "r.id", "li.id")
            .orderBy("r.created_at", "desc")
            .limit(limit)
            .offset(offset);
        return { data: rows, meta: { page, limit, total: count(total) } };
    }

    async voc(input: Record<string, unknown>) {
        const trx = currentTrx();
        const { page, limit, offset } = paging(input);
        const result = await trx.rawQuery(
            `SELECT * FROM (SELECT 'return_item' source_kind, ri.id source_id, coalesce(ri.reason, r.reason, r.customer_note, '') body, r.created_at occurred_at FROM order_return_items ri JOIN order_returns r ON r.id=ri.return_id UNION ALL SELECT 'product_review', pr.id, pr.body, pr.created_at FROM product_reviews pr UNION ALL SELECT 'support_ticket', st.id, st.subject, st.created_at FROM support_tickets st) s ORDER BY occurred_at DESC LIMIT ? OFFSET ?`,
            [limit, offset],
        );
        const total = await trx.rawQuery(
            `SELECT (SELECT count(*) FROM order_return_items)+(SELECT count(*) FROM product_reviews)+(SELECT count(*) FROM support_tickets) total`,
        );
        const rows = (result.rows ?? []) as Array<Record<string, unknown> & { latest_classification?: unknown }>;
        for (const row of rows) {
            const key =
                row.source_kind === "return_item"
                    ? "return_item_id"
                    : row.source_kind === "product_review"
                      ? "product_review_id"
                      : "support_ticket_id";
            row.latest_classification =
                (await trx
                    .from("feedback_classifications")
                    .where(key, Number(row.source_id))
                    .orderBy("created_at", "desc")
                    .first()) ?? null;
        }
        return { data: rows, meta: { page, limit, total: Number(total.rows?.[0]?.total ?? 0) } };
    }

    async classify(input: Record<string, unknown>, actorId: number, key?: string) {
        const sourceKeys = ["return_item_id", "product_review_id", "support_ticket_id"].filter(
            (field) => input[field] !== null && input[field] !== undefined,
        );
        if (sourceKeys.length !== 1) throw Object.assign(new Error("exactly one feedback source is required"), { status: 422 });
        if (input.provenance_type === "ai" && !input.ai_provenance)
            throw Object.assign(new Error("AI provenance is required"), { status: 422 });
        return this.idempotentInsert(
            "feedback_classifications",
            {
                tenant_id: currentTenantId(),
                return_item_id: input.return_item_id ?? null,
                product_review_id: input.product_review_id ?? null,
                support_ticket_id: input.support_ticket_id ?? null,
                theme_code: input.theme_code,
                sentiment: input.sentiment ?? null,
                confidence: input.confidence ?? null,
                provenance_type: input.provenance_type ?? "operator",
                ai_provenance: input.ai_provenance ?? {},
                created_by_user_id: actorId,
            },
            key,
        );
    }

    async listSignals(input: Record<string, unknown>) {
        const trx = currentTrx();
        const { page, limit, offset } = paging(input);
        const query = trx.from("quality_signals");
        if (input.status) query.where("status", String(input.status));
        const total = await query.clone().clearSelect().count("id as total").first();
        return {
            data: await query.select("*").orderBy("created_at", "desc").limit(limit).offset(offset),
            meta: { page, limit, total: count(total) },
        };
    }

    async evaluateSignals(input: Record<string, unknown>) {
        const trx = currentTrx();
        const days = Number(input.days ?? 30);
        const minimum = Number(input.minimum_delivered_units ?? 20);
        const threshold = Number(input.threshold_rate ?? 0.08);
        const end = DateTime.utc();
        const start = end.minus({ days });
        const delivered = await trx
            .from("order_fulfillment_items as fi")
            .join("order_fulfillments as f", "f.id", "fi.fulfillment_id")
            .join("order_line_items as li", "li.id", "fi.order_line_item_id")
            .where("f.status", "delivered")
            .whereBetween("f.updated_at", [start.toSQL()!, end.toSQL()!])
            .whereNotNull("li.product_id")
            .groupBy("li.product_id")
            .select("li.product_id")
            .sum("fi.quantity as delivered_units");
        let created = 0;
        for (const row of delivered) {
            const denominator = Number(row.delivered_units ?? 0);
            if (denominator < minimum) continue;
            const returned = await trx
                .from("order_return_items as ri")
                .join("order_returns as r", "r.id", "ri.return_id")
                .join("order_line_items as li", "li.id", "ri.order_line_item_id")
                .where("li.product_id", Number(row.product_id))
                .whereBetween("r.created_at", [start.toSQL()!, end.toSQL()!])
                .sum("ri.requested_quantity as total")
                .first();
            const numerator = count(returned);
            const rate = numerator / denominator;
            if (rate < threshold) continue;
            const dedupeKey = `return-rate:${row.product_id}:${start.toISODate()}:${end.toISODate()}:${threshold}`;
            if (await trx.from("quality_signals").where("dedupe_key", dedupeKey).first()) continue;
            await trx.table("quality_signals").insert({
                tenant_id: currentTenantId(),
                signal_type: "return_rate_anomaly",
                status: "open",
                severity: rate >= threshold * 2 ? "high" : "medium",
                product_id: row.product_id,
                metric_key: "return_rate_delivered_units",
                numerator,
                denominator,
                rate,
                threshold_rate: threshold,
                detector_version: "deterministic-v1",
                explanation: `Return rate ${rate.toFixed(4)} exceeded threshold ${threshold.toFixed(4)} with ${denominator} delivered units.`,
                window_start: start.toSQL(),
                window_end: end.toSQL(),
                dedupe_key: dedupeKey,
            });
            created += 1;
        }
        return {
            data: {
                evaluated_products: delivered.length,
                created_signals: created,
                minimum_delivered_units: minimum,
                threshold_rate: threshold,
                window_start: start.toISO(),
                window_end: end.toISO(),
            },
        };
    }

    async transitionSignal(id: number, action: "acknowledge" | "resolve", actorId: number) {
        const trx = currentTrx();
        const patch =
            action === "acknowledge"
                ? { status: "acknowledged", acknowledged_by_user_id: actorId, acknowledged_at: DateTime.utc().toSQL() }
                : { status: "resolved" };
        const [updated] = await trx
            .from("quality_signals")
            .where("id", id)
            .update({ ...patch, updated_at: DateTime.utc().toSQL() })
            .returning("*");
        return updated ?? null;
    }

    async listActions(input: Record<string, unknown>) {
        const trx = currentTrx();
        const { page, limit, offset } = paging(input);
        const query = trx.from("quality_actions");
        if (input.status) query.where("status", String(input.status));
        const total = await query.clone().clearSelect().count("id as total").first();
        return {
            data: await query.select("*").orderBy("created_at", "desc").limit(limit).offset(offset),
            meta: { page, limit, total: count(total) },
        };
    }

    async createAction(input: Record<string, unknown>, actorId: number, key?: string) {
        return this.idempotentInsert(
            "quality_actions",
            {
                tenant_id: currentTenantId(),
                quality_case_id: input.quality_case_id,
                action_type: input.action_type,
                status: "proposed",
                title: input.title,
                description: input.description ?? null,
                owner_user_id: input.owner_user_id ?? null,
                due_at: input.due_at ?? null,
                verification_metric_key: input.verification_metric_key ?? null,
                created_by_user_id: actorId,
            },
            key,
        );
    }

    async updateAction(id: number, input: Record<string, unknown>) {
        const trx = currentTrx();
        const current = await trx.from("quality_actions").where("id", id).first();
        if (!current) return null;
        if (Number(current.version) !== Number(input.expected_version))
            throw Object.assign(new Error("version conflict"), { status: 409 });
        if (!(QUALITY_ACTION_FLOW[String(current.status)] ?? []).includes(String(input.status)))
            throw Object.assign(new Error("invalid action transition"), { status: 409 });
        const [updated] = await trx
            .from("quality_actions")
            .where({ id, version: input.expected_version })
            .update({ status: input.status, version: Number(input.expected_version) + 1, updated_at: DateTime.utc().toSQL() })
            .returning("*");
        return updated ?? null;
    }

    async createOutcome(input: Record<string, unknown>, actorId: number, key?: string) {
        return this.idempotentInsert(
            "quality_outcomes",
            {
                tenant_id: currentTenantId(),
                quality_case_id: input.quality_case_id,
                quality_action_id: input.quality_action_id ?? null,
                metric_key: input.metric_key,
                unit: input.unit,
                baseline_value: input.baseline_value ?? null,
                actual_value: input.actual_value ?? null,
                assessment: input.assessment,
                created_by_user_id: actorId,
            },
            key,
        );
    }

    async reasons() {
        return { data: await currentTrx().from("quality_reason_definitions").orderBy("code").orderBy("version", "desc") };
    }

    async createReason(input: Record<string, unknown>, actorId: number) {
        const [row] = await currentTrx()
            .table("quality_reason_definitions")
            .insert({
                tenant_id: currentTenantId(),
                code: input.code,
                category: input.category,
                label_fa: input.label_fa,
                label_en: input.label_en ?? null,
                description_fa: input.description_fa ?? null,
                default_severity: input.default_severity ?? "medium",
                created_by_user_id: actorId,
            })
            .returning("*");
        return row;
    }

    async createReasonVersion(id: number, input: Record<string, unknown>, actorId: number) {
        const trx = currentTrx();
        const current = await trx.from("quality_reason_definitions").where("id", id).forUpdate().first();
        if (!current) return null;
        await trx
            .from("quality_reason_definitions")
            .where("id", id)
            .update({ is_active: false, valid_to: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
        const [row] = await trx
            .table("quality_reason_definitions")
            .insert({
                tenant_id: currentTenantId(),
                code: current.code,
                category: input.category ?? current.category,
                label_fa: input.label_fa ?? current.label_fa,
                label_en: input.label_en ?? current.label_en,
                description_fa: input.description_fa ?? current.description_fa,
                default_severity: input.default_severity ?? current.default_severity,
                version: Number(current.version) + 1,
                is_active: true,
                created_by_user_id: actorId,
            })
            .returning("*");
        return row;
    }

    async traceability() {
        const trx = currentTrx();
        const [total, productLinked, inspected, caseLinked, receivingLotRows, receivingTotals] = await Promise.all([
            trx.from("order_return_items").count("id as total").first(),
            trx
                .from("order_return_items as ri")
                .join("order_line_items as li", "li.id", "ri.order_line_item_id")
                .whereNotNull("li.product_id")
                .count("ri.id as total")
                .first(),
            trx.from("return_item_inspections").countDistinct("return_item_id as total").first(),
            trx.from("quality_case_sources").whereNotNull("return_item_id").countDistinct("return_item_id as total").first(),
            trx
                .from("purchase_order_receipt_lines")
                .where((builder) => builder.whereNotNull("lot_code").orWhereNotNull("batch_code"))
                .count("id as total")
                .first(),
            trx.from("purchase_order_receipt_lines").count("id as total").first(),
        ]);
        const receivingTotal = count(receivingTotals);
        const receivingLotCoverage = receivingTotal > 0 ? count(receivingLotRows) / receivingTotal : null;
        return {
            data: {
                total_return_items: count(total),
                product_linked: count(productLinked),
                inspected: count(inspected),
                case_linked: count(caseLinked),
                supplier_receiving_chain: "available",
                receiving_lot_batch_coverage: receivingLotCoverage,
                customer_return_supplier_attribution: "unavailable",
                supplier_id: null,
                lot_batch_serial: null,
                rule: "Supplier receiving quality is measured only from direct PO/receiving evidence. Customer-return supplier attribution remains unavailable until inventory lot allocation connects a received lot/batch to the fulfilled order line.",
            },
        };
    }

    async supplierQuality() {
        const trx = currentTrx();
        const result = await trx.rawQuery(`WITH receiving AS (
            SELECT po.supplier_id,
                   SUM(rl.received_quantity)::numeric received,
                   SUM(rl.accepted_quantity)::numeric accepted,
                   SUM(rl.rejected_quantity)::numeric rejected,
                   SUM(rl.quarantine_quantity)::numeric quarantine,
                   COUNT(*) FILTER (WHERE rl.lot_code IS NOT NULL OR rl.batch_code IS NOT NULL)::int traced_receipt_lines,
                   COUNT(*)::int receipt_lines
            FROM purchase_order_receipt_lines rl
            JOIN purchase_order_receipts r ON r.id=rl.receipt_id
            JOIN purchase_orders po ON po.id=r.purchase_order_id
            GROUP BY po.supplier_id
        ), incidents AS (
            SELECT supplier_id,
                   COUNT(*) FILTER (WHERE type='quality')::int quality_incidents,
                   COUNT(*) FILTER (WHERE type='quality' AND status='open')::int open_quality_incidents
            FROM supplier_incidents
            GROUP BY supplier_id
        )
        SELECT s.id supplier_id,s.code supplier_code,s.display_name supplier_name,s.status supplier_status,
               COALESCE(r.received,0) received,COALESCE(r.accepted,0) accepted,
               COALESCE(r.rejected,0) rejected,COALESCE(r.quarantine,0) quarantine,
               COALESCE(r.traced_receipt_lines,0) traced_receipt_lines,COALESCE(r.receipt_lines,0) receipt_lines,
               COALESCE(i.quality_incidents,0) quality_incidents,COALESCE(i.open_quality_incidents,0) open_quality_incidents
        FROM suppliers s
        LEFT JOIN receiving r ON r.supplier_id=s.id
        LEFT JOIN incidents i ON i.supplier_id=s.id
        ORDER BY COALESCE(r.rejected,0)+COALESCE(r.quarantine,0) DESC,s.display_name ASC`);
        const rows = (result.rows ?? []).map((row: Record<string, unknown>) => {
            const received = Number(row.received ?? 0);
            const rejected = Number(row.rejected ?? 0);
            const quarantine = Number(row.quarantine ?? 0);
            const receiptLines = Number(row.receipt_lines ?? 0);
            const tracedLines = Number(row.traced_receipt_lines ?? 0);
            return {
                ...row,
                received,
                accepted: Number(row.accepted ?? 0),
                rejected,
                quarantine,
                quality_incidents: Number(row.quality_incidents ?? 0),
                open_quality_incidents: Number(row.open_quality_incidents ?? 0),
                receiving_exception_rate: received > 0 ? (rejected + quarantine) / received : null,
                lot_batch_coverage: receiptLines > 0 ? tracedLines / receiptLines : null,
                attribution_basis: "direct_receiving_and_supplier_incident_only",
            };
        });
        return {
            status: "available",
            data: rows,
            customer_return_supplier_attribution: {
                status: "unavailable",
                reason: "No canonical inventory lot allocation currently links a received lot/batch to the fulfilled order line. Returns are therefore not charged to a supplier by inference.",
            },
        };
    }

    async metrics() {
        const trx = currentTrx();
        const [delivered, returned, receiving] = await Promise.all([
            trx
                .from("order_fulfillment_items as fi")
                .join("order_fulfillments as f", "f.id", "fi.fulfillment_id")
                .where("f.status", "delivered")
                .sum("fi.quantity as total")
                .first(),
            trx.from("order_return_items").sum("requested_quantity as total").first(),
            trx
                .from("purchase_order_receipt_lines")
                .select(
                    trx.raw("COALESCE(SUM(received_quantity),0) received"),
                    trx.raw("COALESCE(SUM(rejected_quantity),0) rejected"),
                    trx.raw("COALESCE(SUM(quarantine_quantity),0) quarantine"),
                )
                .first(),
        ]);
        const deliveredUnits = count(delivered);
        const returnedUnits = count(returned);
        const receivedUnits = Number(receiving?.received ?? 0);
        const receivingExceptions = Number(receiving?.rejected ?? 0) + Number(receiving?.quarantine ?? 0);
        return {
            data: {
                definitions: [
                    {
                        metric_key: "return_rate_delivered_units",
                        label_fa: "نرخ مرجوعی بر واحد تحویل‌شده",
                        unit: "ratio",
                        business_definition: "تعداد واحدهای مرجوع‌شده تقسیم بر واحدهای واقعاً تحویل‌شده.",
                        formula: "returned_units / delivered_units",
                        version: 1,
                    },
                    {
                        metric_key: "receiving_exception_rate",
                        label_fa: "نرخ استثنای کیفیت دریافت",
                        unit: "ratio",
                        business_definition: "مجموع واحدهای ردشده و قرنطینه‌شده در دریافت تقسیم بر کل واحدهای دریافت‌شده.",
                        formula: "(rejected_units + quarantine_units) / received_units",
                        version: 1,
                    },
                ],
                values: {
                    return_rate_delivered_units:
                        deliveredUnits > 0
                            ? {
                                  status: "available",
                                  value: returnedUnits / deliveredUnits,
                                  numerator: returnedUnits,
                                  denominator: deliveredUnits,
                              }
                            : { status: "insufficient_data", value: null, numerator: returnedUnits, denominator: deliveredUnits },
                    receiving_exception_rate:
                        receivedUnits > 0
                            ? {
                                  status: "available",
                                  value: receivingExceptions / receivedUnits,
                                  numerator: receivingExceptions,
                                  denominator: receivedUnits,
                              }
                            : {
                                  status: "insufficient_data",
                                  value: null,
                                  numerator: receivingExceptions,
                                  denominator: receivedUnits,
                              },
                },
            },
        };
    }

    async audit(caseId?: number) {
        const trx = currentTrx();
        let query = trx.from("admin_audit_log").whereILike("action", "quality.%").orderBy("occurred_at", "desc").limit(200);
        if (caseId)
            query = query.where((builder) =>
                builder
                    .where("entity_kind", "quality_case")
                    .where("entity_id", caseId)
                    .orWhereRaw("payload->>'quality_case_id' = ?", [String(caseId)]),
            );
        return { data: await query };
    }

    private async idempotentInsert(table: string, values: Record<string, unknown>, key?: string) {
        const trx = currentTrx();
        const fingerprint = digest(values);
        if (key) {
            const existing = await trx.from(table).where("idempotency_key", key).first();
            if (existing) {
                if (existing.idempotency_fingerprint !== fingerprint)
                    throw Object.assign(new Error("idempotency conflict"), { status: 409 });
                return { data: existing, replayed: true };
            }
            values.idempotency_key = key;
            values.idempotency_fingerprint = fingerprint;
        }
        const [row] = await trx.table(table).insert(values).returning("*");
        return { data: row, replayed: false };
    }
}

export const qualityTrustService = new QualityTrustService();
