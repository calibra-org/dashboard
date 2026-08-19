import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import type User from "#models/user";
import { orderStateMachine } from "#services/order_state_machine";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import type { TrustAction } from "#services/trust/contracts";

export async function executeTrustAction(input: {
    caseRow: Record<string, unknown>;
    decisionId: number;
    action: TrustAction;
    actor: User;
    idempotencyKey: string;
}) {
    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const existing = await trx
        .from("fraud_action_executions")
        .where("tenant_id", tenantId)
        .where("idempotency_key", input.idempotencyKey)
        .first();
    if (existing) return existing;

    const now = DateTime.utc();
    const caseId = Number(input.caseRow.id);
    const riskClass = String(input.caseRow.risk_band ?? "medium");
    const actionType =
        input.action === "step_up" ? "require_step_up" : input.action === "hold" ? "order_hold_or_manual_review" : input.action;
    const rows = await trx
        .table("fraud_action_executions")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            case_id: caseId,
            decision_id: input.decisionId,
            action: actionType,
            risk_class: riskClass,
            status: "executing",
            idempotency_key: input.idempotencyKey,
            required_permission: ["hold", "block"].includes(input.action) ? "trust.cases.review+step_up" : "trust.cases.review",
            autonomy_ceiling: "human_approved",
            dry_run: false,
            reversible: ["step_up", "hold", "block", "monitor"].includes(input.action),
            rollback_plan: ["step_up", "hold", "block", "monitor"].includes(input.action)
                ? "Record a superseding allow/dismiss decision; canonical domain rollback remains governed by its own state machine."
                : null,
            input_snapshot: JSON.stringify({
                case_public_id: input.caseRow.public_id,
                action: input.action,
                risk_band: input.caseRow.risk_band,
                subject_type: input.caseRow.subject_type,
                subject_id: input.caseRow.subject_id,
            }),
            policy_result: JSON.stringify({
                policy_key: input.caseRow.policy_key ?? null,
                policy_version: input.caseRow.policy_version ?? null,
            }),
            result: JSON.stringify({}),
            external_refs: JSON.stringify({}),
            actor_user_id: Number(input.actor.id),
            metadata: JSON.stringify({ case_public_id: input.caseRow.public_id, action: input.action }),
            created_at: now.toSQL(),
            updated_at: now.toSQL(),
        })
        .returning("*");
    const ledger = rows[0];

    try {
        let result: Record<string, unknown> = {};
        let externalRefs: Record<string, unknown> = {};
        if (input.action === "hold" && input.caseRow.order_id) {
            const order = await Order.query({ client: trx }).where("id", Number(input.caseRow.order_id)).forUpdate().first();
            if (!order)
                throw Object.assign(new Error("Order referenced by trust case was not found"), {
                    status: 404,
                    code: "E_TRUST_ORDER_NOT_FOUND",
                });
            if (order.status === OrderStatus.Pending) {
                await orderStateMachine.transition(order, OrderStatus.OnHold, {
                    actor: input.actor,
                    reason: `trust.case:${String(input.caseRow.public_id)}`,
                    trx,
                });
                result = { canonical_order_action: "transitioned_to_on_hold", previous_status: OrderStatus.Pending };
            } else if (order.status === OrderStatus.OnHold) {
                result = { canonical_order_action: "already_on_hold", idempotent: true };
            } else {
                throw Object.assign(new Error(`Order cannot be put on hold from status ${order.status}`), {
                    status: 409,
                    code: "E_TRUST_ORDER_HOLD_UNSUPPORTED_STATE",
                });
            }
            externalRefs = { order_id: Number(order.id) };
        } else if (input.action === "hold") {
            result = { enforcement: "manual_review_gate", scope: `${input.caseRow.subject_type}:${input.caseRow.subject_id}` };
        } else if (input.action === "step_up") {
            result = { enforcement: "phase7_step_up_gate", action_scope: "commerce.checkout" };
        } else if (input.action === "block") {
            result = { enforcement: "trust_block_gate", scope: `${input.caseRow.subject_type}:${input.caseRow.subject_id}` };
        } else if (input.action === "allow" || input.action === "dismiss") {
            await trx
                .from("fraud_action_executions")
                .where("tenant_id", tenantId)
                .where("case_id", caseId)
                .whereIn("status", ["active", "pending"])
                .update({ status: "superseded", updated_at: now.toSQL() });
            result = { enforcement: "cleared_by_superseding_decision" };
        } else {
            result = { enforcement: "monitor_only" };
        }
        const finalStatus = ["step_up", "hold", "block", "monitor"].includes(input.action) ? "active" : "completed";
        await trx
            .from("fraud_action_executions")
            .where("id", ledger.id)
            .update({
                status: finalStatus,
                result: JSON.stringify(result),
                external_refs: JSON.stringify(externalRefs),
                verification: JSON.stringify({
                    canonical_action_verified:
                        input.action !== "hold" ||
                        !input.caseRow.order_id ||
                        ["transitioned_to_on_hold", "already_on_hold"].includes(String(result.canonical_order_action ?? "")),
                }),
                executed_at: now.toSQL(),
                updated_at: now.toSQL(),
            });
        return { ...ledger, status: finalStatus, result, external_refs: externalRefs };
    } catch (error) {
        const typed = error as Error & { code?: string };
        await trx
            .from("fraud_action_executions")
            .where("id", ledger.id)
            .update({
                status: "failed",
                error_code: typed.code ?? "E_TRUST_ACTION_FAILED",
                error_message: typed.message.slice(0, 1000),
                executed_at: now.toSQL(),
                updated_at: now.toSQL(),
            });
        throw error;
    }
}
