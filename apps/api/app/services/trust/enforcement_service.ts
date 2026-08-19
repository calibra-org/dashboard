import type { HttpContext } from "@adonisjs/core/http";

import { hasRecentIdentityStepUp } from "#services/identity/step_up";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface CheckoutSubject {
    type: "customer" | "customer_account";
    id: string;
}

export async function assertTrustAllowsCheckout(ctx: HttpContext, customerId: bigint | number | null | undefined) {
    const subjects: CheckoutSubject[] = [];
    if (customerId !== null && customerId !== undefined) subjects.push({ type: "customer", id: String(customerId) });
    const authUser = ctx.auth?.user;
    if (authUser?.id !== undefined) subjects.push({ type: "customer_account", id: String(authUser.id) });
    if (subjects.length === 0) return;

    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const cases = await trx
        .from("fraud_cases as trust_case")
        .innerJoin("fraud_action_executions as action", "action.case_id", "trust_case.id")
        .where("trust_case.tenant_id", tenantId)
        .where("action.tenant_id", tenantId)
        .whereIn("action.status", ["active", "pending"])
        .where((query) => {
            for (const [index, subject] of subjects.entries()) {
                if (index === 0)
                    query.where((nested) =>
                        nested.where("trust_case.subject_type", subject.type).where("trust_case.subject_id", subject.id),
                    );
                else
                    query.orWhere((nested) =>
                        nested.where("trust_case.subject_type", subject.type).where("trust_case.subject_id", subject.id),
                    );
            }
        })
        .select(
            "trust_case.public_id as case_public_id",
            "action.action as action_type",
            "action.risk_class",
            "action.created_at",
        )
        .orderBy("action.created_at", "desc")
        .limit(20);

    const blocked = cases.find((row) => row.action_type === "block");
    if (blocked) {
        throw Object.assign(new Error("Checkout is blocked by an active trust decision"), {
            status: 403,
            code: "E_TRUST_CHECKOUT_BLOCKED",
            meta: { case_id: blocked.case_public_id },
        });
    }
    const held = cases.find((row) => row.action_type === "order_hold_or_manual_review");
    if (held) {
        throw Object.assign(new Error("Checkout requires manual trust review"), {
            status: 409,
            code: "E_TRUST_MANUAL_REVIEW_REQUIRED",
            meta: { case_id: held.case_public_id },
        });
    }
    const stepUp = cases.find((row) => row.action_type === "require_step_up");
    if (!stepUp) return;
    if (!authUser?.id) {
        throw Object.assign(new Error("Step-up authentication is required before checkout"), {
            status: 403,
            code: "E_TRUST_STEP_UP_REQUIRED",
            meta: { action_scope: "commerce.checkout", case_id: stepUp.case_public_id },
        });
    }
    if (await hasRecentIdentityStepUp(Number(authUser.id), "commerce.checkout")) return;
    throw Object.assign(new Error("Step-up authentication is required before checkout"), {
        status: 403,
        code: "E_TRUST_STEP_UP_REQUIRED",
        meta: { action_scope: "commerce.checkout", case_id: stepUp.case_public_id },
    });
}
