import { Exception } from "@adonisjs/core/exceptions";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";

import OrderCouponLine from "#models/order_coupon_line";
import OrderLineItem from "#models/order_line_item";
import Product from "#models/product";
import ProductVariation from "#models/product_variation";
import { recordAudit } from "#services/admin_audit_log_service";
import { evaluatePricingCandidate, type PricingGuardrails } from "#services/pricing_decision_engine";
import { resolvePrice } from "#services/price_resolver";
import { currentTenantId, currentTrx, withTenantTransaction } from "#services/tenant_context";

export type PricingLifecycleState = "draft" | "review" | "approved" | "scheduled" | "active" | "paused" | "stopped" | "rolled_back";
export type PricingLifecycleAction = "submit" | "approve" | "schedule" | "activate" | "pause" | "stop" | "rollback";

type Actor = { id: string | number | bigint };
type JsonObject = Record<string, unknown>;

export interface CreatePricingPolicyInput {
    policy_key: string;
    name: string;
    objective?: string | null;
    currency: string;
    product_id?: number | null;
    variation_id?: number | null;
    scope?: JsonObject;
    guardrails?: JsonObject;
    evidence?: JsonObject;
    reason?: string | null;
}

export interface CreatePricingVersionInput {
    currency?: string;
    product_id?: number | null;
    variation_id?: number | null;
    scope?: JsonObject;
    guardrails?: JsonObject;
    evidence?: JsonObject;
    reason?: string | null;
}

export interface TransitionPricingInput {
    expected_version: number;
    reason: string;
    evidence?: JsonObject;
    correlation_id?: string | null;
    idempotency_key?: string | null;
    scheduled_at?: string | null;
    rollback_to_version?: number | null;
}

export interface CreatePricingProposalInput {
    policy_id: number;
    policy_version_id?: number | null;
    product_id: number;
    variation_id?: number | null;
    reference_price_minor: number;
    candidate_price_minor: number;
    currency: string;
    objective?: string | null;
    rationale?: string | null;
    evidence?: JsonObject;
}

const tenantId = () => Number(currentTenantId());
const now = () => new Date();

function fail(message: string, status: number, code: string): never {
    throw new Exception(message, { status, code });
}

function safeMinor(value: unknown, label: string): number {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 0) fail(`${label} is outside the supported minor-unit range`, 422, "E_PRICING_MONEY_RANGE");
    return result;
}

function jsonObject(value: unknown): JsonObject {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function guardrailsFrom(value: unknown): PricingGuardrails {
    const source = jsonObject(value);
    return {
        floorPrice: source.floor_price_minor == null ? null : safeMinor(source.floor_price_minor, "floor_price_minor"),
        cogs: null,
        minimumMarginPercent: source.minimum_margin_percent == null ? null : Number(source.minimum_margin_percent),
        maximumDiscountPercent: source.maximum_discount_percent == null ? null : Number(source.maximum_discount_percent),
    };
}

export class PricingPolicyService {
    async listPolicies() {
        const trx = currentTrx();
        const policies = await trx
            .from("pricing_policies")
            .where("tenant_id", tenantId())
            .select("id", "policy_key", "name", "objective", "status", "frozen_at", "freeze_reason", "updated_at")
            .orderBy("updated_at", "desc")
            .limit(200);
        if (policies.length === 0) return { data: [] };
        const ids = policies.map((row) => Number(row.id));
        const versions = await trx
            .from("pricing_policy_versions")
            .where("tenant_id", tenantId())
            .whereIn("policy_id", ids)
            .select(
                "id",
                "policy_id",
                "version",
                "state",
                "currency",
                "product_id",
                "variation_id",
                "guardrails",
                "evidence",
                "scheduled_at",
                "activated_at",
                "approved_by",
                "proposed_by",
            )
            .orderBy("version", "desc");
        const latest = new Map<number, (typeof versions)[number]>();
        for (const row of versions) if (!latest.has(Number(row.policy_id))) latest.set(Number(row.policy_id), row);
        return {
            data: policies.map((policy) => ({
                ...policy,
                latest_version: latest.get(Number(policy.id)) ?? null,
            })),
        };
    }

    async listProposals() {
        return {
            data: await currentTrx()
                .from("pricing_proposals")
                .where("tenant_id", tenantId())
                .select("*")
                .orderBy("created_at", "desc")
                .limit(200),
        };
    }

    async createPolicy(input: CreatePricingPolicyInput, actor: Actor) {
        return withTenantTransaction(async (trx) => {
            const actorId = Number(actor.id);
            const [policy] = await trx
                .table("pricing_policies")
                .insert({
                    tenant_id: tenantId(),
                    policy_key: input.policy_key,
                    name: input.name,
                    objective: input.objective ?? null,
                    status: "active",
                    created_by: actorId,
                })
                .returning("*");
            const [version] = await trx
                .table("pricing_policy_versions")
                .insert({
                    tenant_id: tenantId(),
                    policy_id: policy.id,
                    version: 1,
                    state: "draft",
                    currency: input.currency.toUpperCase(),
                    product_id: input.product_id ?? null,
                    variation_id: input.variation_id ?? null,
                    scope: input.scope ?? {},
                    guardrails: input.guardrails ?? {},
                    evidence: input.evidence ?? {},
                    reason: input.reason ?? null,
                    proposed_by: actorId,
                })
                .returning("*");
            await this.recordAction(trx, {
                policyId: Number(policy.id),
                versionId: Number(version.id),
                action: "policy.create",
                fromState: null,
                toState: "draft",
                actorId,
                reason: input.reason ?? "pricing.policy.create",
                evidence: input.evidence ?? {},
            });
            return { data: { policy, version } };
        });
    }

    async createVersion(policyId: number, input: CreatePricingVersionInput, actor: Actor) {
        return withTenantTransaction(async (trx) => {
            const actorId = Number(actor.id);
            const policy = await trx
                .from("pricing_policies")
                .where("tenant_id", tenantId())
                .where("id", policyId)
                .forUpdate()
                .first();
            if (!policy) fail("Pricing policy not found", 404, "E_PRICING_POLICY_NOT_FOUND");
            if (policy.status === "frozen") fail("Pricing policy is frozen", 409, "E_PRICING_POLICY_FROZEN");
            const latest = await trx
                .from("pricing_policy_versions")
                .where("tenant_id", tenantId())
                .where("policy_id", policyId)
                .orderBy("version", "desc")
                .first();
            const [version] = await trx
                .table("pricing_policy_versions")
                .insert({
                    tenant_id: tenantId(),
                    policy_id: policyId,
                    version: Number(latest?.version ?? 0) + 1,
                    state: "draft",
                    currency: (input.currency ?? latest?.currency ?? "IRR").toUpperCase(),
                    product_id: input.product_id ?? latest?.product_id ?? null,
                    variation_id: input.variation_id ?? latest?.variation_id ?? null,
                    scope: input.scope ?? jsonObject(latest?.scope),
                    guardrails: input.guardrails ?? jsonObject(latest?.guardrails),
                    evidence: input.evidence ?? {},
                    reason: input.reason ?? null,
                    proposed_by: actorId,
                })
                .returning("*");
            await this.recordAction(trx, {
                policyId,
                versionId: Number(version.id),
                action: "version.create",
                fromState: null,
                toState: "draft",
                actorId,
                reason: input.reason ?? "pricing.version.create",
                evidence: input.evidence ?? {},
            });
            return { data: version };
        });
    }

    async createProposal(input: CreatePricingProposalInput, actor: Actor) {
        safeMinor(input.reference_price_minor, "reference_price_minor");
        safeMinor(input.candidate_price_minor, "candidate_price_minor");
        return withTenantTransaction(async (trx) => {
            const policy = await trx
                .from("pricing_policies")
                .where("tenant_id", tenantId())
                .where("id", input.policy_id)
                .first();
            if (!policy) fail("Pricing policy not found", 404, "E_PRICING_POLICY_NOT_FOUND");
            if (policy.status === "frozen") fail("Pricing policy is frozen", 409, "E_PRICING_POLICY_FROZEN");
            const [proposal] = await trx
                .table("pricing_proposals")
                .insert({
                    tenant_id: tenantId(),
                    policy_id: input.policy_id,
                    policy_version_id: input.policy_version_id ?? null,
                    product_id: input.product_id,
                    variation_id: input.variation_id ?? null,
                    reference_price_minor: input.reference_price_minor,
                    candidate_price_minor: input.candidate_price_minor,
                    currency: input.currency.toUpperCase(),
                    status: "draft",
                    objective: input.objective ?? null,
                    rationale: input.rationale ?? null,
                    evidence: input.evidence ?? {},
                    proposed_by: Number(actor.id),
                })
                .returning("*");
            return { data: proposal };
        });
    }

    async transition(policyId: number, action: PricingLifecycleAction, input: TransitionPricingInput, actor: Actor) {
        return withTenantTransaction(async (trx) => {
            const actorId = Number(actor.id);
            const idempotencyKey = input.idempotency_key?.trim().slice(0, 180) || null;
            if (idempotencyKey) {
                const replay = await trx
                    .from("pricing_policy_actions")
                    .where("tenant_id", tenantId())
                    .where("idempotency_key", idempotencyKey)
                    .first();
                if (replay) return { data: replay, replayed: true };
            }
            const policy = await trx
                .from("pricing_policies")
                .where("tenant_id", tenantId())
                .where("id", policyId)
                .forUpdate()
                .first();
            if (!policy) fail("Pricing policy not found", 404, "E_PRICING_POLICY_NOT_FOUND");
            if (policy.status === "frozen" && !["rollback", "stop"].includes(action)) {
                fail("Pricing policy is frozen", 409, "E_PRICING_POLICY_FROZEN");
            }
            const version = await trx
                .from("pricing_policy_versions")
                .where("tenant_id", tenantId())
                .where("policy_id", policyId)
                .where("version", input.expected_version)
                .forUpdate()
                .first();
            if (!version) fail("Pricing policy version is stale or missing", 409, "E_PRICING_VERSION_STALE");

            if (action === "rollback") {
                return this.rollbackLocked(trx, policy, version, input, actorId, idempotencyKey);
            }

            const fromState = String(version.state) as PricingLifecycleState;
            const toState = this.nextState(action, fromState);
            const changes: Record<string, unknown> = { state: toState, updated_at: now() };
            if (action === "submit") changes.reviewed_at = null;
            if (action === "approve") {
                if (Number(version.proposed_by) === actorId) fail("A proposer cannot approve their own pricing version", 422, "E_PRICING_SELF_APPROVAL");
                changes.reviewed_by = actorId;
                changes.reviewed_at = now();
                changes.approved_by = actorId;
                changes.approved_at = now();
            }
            if (action === "schedule") {
                const scheduledAt = input.scheduled_at ? new Date(input.scheduled_at) : null;
                if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt <= now()) {
                    fail("scheduled_at must be a valid future time", 422, "E_PRICING_SCHEDULE_INVALID");
                }
                changes.scheduled_by = actorId;
                changes.scheduled_at = scheduledAt;
            }
            if (action === "activate") {
                if (fromState === "scheduled" && version.scheduled_at && new Date(version.scheduled_at) > now()) {
                    fail("Scheduled pricing version is not due yet", 409, "E_PRICING_SCHEDULE_NOT_DUE");
                }
                await trx
                    .from("pricing_policy_versions")
                    .where("tenant_id", tenantId())
                    .where("policy_id", policyId)
                    .where("state", "active")
                    .whereNot("id", version.id)
                    .update({ state: "paused", retired_at: now(), updated_at: now() });
                changes.activated_by = actorId;
                changes.activated_at = now();
                changes.retired_at = null;
            }
            if (action === "pause" || action === "stop") changes.retired_at = now();

            const [updated] = await trx.from("pricing_policy_versions").where("id", version.id).update(changes).returning("*");
            const event = await this.recordAction(trx, {
                policyId,
                versionId: Number(version.id),
                action: `version.${action}`,
                fromState,
                toState,
                actorId,
                reason: input.reason,
                evidence: input.evidence ?? {},
                correlationId: input.correlation_id ?? null,
                idempotencyKey,
            });
            return { data: { version: updated, action: event }, replayed: false };
        });
    }

    async freeze(policyId: number, frozen: boolean, reason: string, actor: Actor, idempotencyKey?: string | null) {
        return withTenantTransaction(async (trx) => {
            const key = idempotencyKey?.trim().slice(0, 180) || null;
            if (key) {
                const replay = await trx
                    .from("pricing_policy_actions")
                    .where("tenant_id", tenantId())
                    .where("idempotency_key", key)
                    .first();
                if (replay) return { data: replay, replayed: true };
            }
            const policy = await trx
                .from("pricing_policies")
                .where("tenant_id", tenantId())
                .where("id", policyId)
                .forUpdate()
                .first();
            if (!policy) fail("Pricing policy not found", 404, "E_PRICING_POLICY_NOT_FOUND");
            const nextStatus = frozen ? "frozen" : "active";
            await trx.from("pricing_policies").where("id", policyId).update({
                status: nextStatus,
                frozen_at: frozen ? now() : null,
                frozen_by: frozen ? Number(actor.id) : null,
                freeze_reason: frozen ? reason : null,
                updated_at: now(),
            });
            const event = await this.recordAction(trx, {
                policyId,
                versionId: null,
                action: frozen ? "policy.freeze" : "policy.unfreeze",
                fromState: String(policy.status),
                toState: nextStatus,
                actorId: Number(actor.id),
                reason,
                evidence: {},
                idempotencyKey: key,
            });
            return { data: event, replayed: false };
        });
    }

    async enforceAndSnapshotOrder(orderId: number, currency: string, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderLineItem.query({ client: trx }).where("order_id", orderId).orderBy("id", "asc");
        if (lines.length === 0) return;
        const couponLines = await OrderCouponLine.query({ client: trx }).where("order_id", orderId).orderBy("id", "asc");
        const couponIds = couponLines.map((row) => Number(row.couponId));

        for (const line of lines) {
            const productId = Number(line.productId);
            const variationId = line.variationId == null ? null : Number(line.variationId);
            const product = await Product.find(productId, { client: trx });
            if (!product) fail("Pricing snapshot product is unavailable", 422, "E_PRICING_PRODUCT_UNAVAILABLE");
            const variation = variationId == null ? null : await ProductVariation.find(variationId, { client: trx });
            const resolved = resolvePrice(product, variation);
            const referencePrice = safeMinor(resolved.regularPrice, "reference_price_minor");
            const resolvedPrice = safeMinor(resolved.effectivePrice, "resolved_price_minor");
            const active = await this.resolveActiveGuardrail(productId, variationId, trx);
            const guardrails = guardrailsFrom(active?.guardrails);
            const cogs = guardrails.minimumMarginPercent == null ? null : await this.resolveCogs(productId, variationId, trx);
            guardrails.cogs = cogs;
            const decision = evaluatePricingCandidate({
                referencePrice,
                candidatePrice: resolvedPrice,
                quantity: line.quantity,
                guardrails,
            });
            if (active && !decision.allowed) {
                throw new Exception("Checkout price violates an active pricing policy", {
                    status: 409,
                    code: "E_PRICING_POLICY_VIOLATION",
                    cause: { policy_id: active.policy_id, policy_version_id: active.id, violations: decision.violations } as unknown as Error,
                });
            }
            await trx
                .table("pricing_order_snapshots")
                .insert({
                    tenant_id: tenantId(),
                    order_id: orderId,
                    line_item_id: Number(line.id),
                    product_id: productId,
                    variation_id: variationId,
                    reference_price_minor: referencePrice,
                    resolved_price_minor: resolvedPrice,
                    currency,
                    policy_id: active?.policy_id ?? null,
                    policy_version_id: active?.id ?? null,
                    coupon_ids: couponIds,
                    guardrail_result: {
                        allowed: decision.allowed,
                        violations: decision.violations,
                        economics: cogs == null ? "unavailable" : "available",
                    },
                })
                .onConflict(["tenant_id", "order_id", "line_item_id"])
                .ignore();
        }
    }

    private nextState(action: Exclude<PricingLifecycleAction, "rollback">, state: PricingLifecycleState): PricingLifecycleState {
        const allowed: Record<Exclude<PricingLifecycleAction, "rollback">, Partial<Record<PricingLifecycleState, PricingLifecycleState>>> = {
            submit: { draft: "review" },
            approve: { review: "approved" },
            schedule: { approved: "scheduled" },
            activate: { approved: "active", scheduled: "active", paused: "active" },
            pause: { active: "paused" },
            stop: { active: "stopped", paused: "stopped", scheduled: "stopped" },
        };
        const next = allowed[action][state];
        if (!next) fail(`Pricing transition ${action} is not allowed from ${state}`, 409, "E_PRICING_TRANSITION_INVALID");
        return next;
    }

    private async rollbackLocked(
        trx: TransactionClientContract,
        policy: Record<string, unknown>,
        current: Record<string, unknown>,
        input: TransitionPricingInput,
        actorId: number,
        idempotencyKey: string | null,
    ) {
        if (String(current.state) !== "active") fail("Only an active pricing version can be rolled back", 409, "E_PRICING_ROLLBACK_STATE");
        const targetVersion = input.rollback_to_version;
        if (!targetVersion || targetVersion === Number(current.version)) fail("A different rollback target is required", 422, "E_PRICING_ROLLBACK_TARGET");
        const target = await trx
            .from("pricing_policy_versions")
            .where("tenant_id", tenantId())
            .where("policy_id", Number(policy.id))
            .where("version", targetVersion)
            .forUpdate()
            .first();
        if (!target) fail("Rollback target was not found", 404, "E_PRICING_ROLLBACK_TARGET");
        if (!target.approved_at) fail("Rollback target was never approved", 422, "E_PRICING_ROLLBACK_UNAPPROVED");
        await trx.from("pricing_policy_versions").where("id", current.id).update({ state: "rolled_back", retired_at: now(), updated_at: now() });
        const [restored] = await trx
            .from("pricing_policy_versions")
            .where("id", target.id)
            .update({ state: "active", rollback_of_version_id: current.id, activated_by: actorId, activated_at: now(), retired_at: null, updated_at: now() })
            .returning("*");
        const event = await this.recordAction(trx, {
            policyId: Number(policy.id),
            versionId: Number(target.id),
            action: "version.rollback",
            fromState: "active",
            toState: "active",
            actorId,
            reason: input.reason,
            evidence: { ...(input.evidence ?? {}), rolled_back_version: Number(current.version), restored_version: targetVersion },
            correlationId: input.correlation_id ?? null,
            idempotencyKey,
        });
        return { data: { version: restored, action: event }, replayed: false };
    }

    private async resolveActiveGuardrail(productId: number, variationId: number | null, trx: TransactionClientContract) {
        return trx
            .from("pricing_policy_versions as v")
            .innerJoin("pricing_policies as p", "p.id", "v.policy_id")
            .where("v.tenant_id", tenantId())
            .where("p.tenant_id", tenantId())
            .where("p.status", "active")
            .where("v.state", "active")
            .where((query) => {
                query.where((exact) => exact.where("v.product_id", productId).where("v.variation_id", variationId));
                query.orWhere((product) => product.where("v.product_id", productId).whereNull("v.variation_id"));
                query.orWhereNull("v.product_id");
            })
            .select("v.*", "p.id as policy_id", "p.policy_key")
            .orderByRaw("CASE WHEN v.product_id = ? AND v.variation_id IS NOT DISTINCT FROM ? THEN 0 WHEN v.product_id = ? THEN 1 ELSE 2 END", [
                productId,
                variationId,
                productId,
            ])
            .orderBy("v.activated_at", "desc")
            .first();
    }

    private async resolveCogs(productId: number, variationId: number | null, trx: TransactionClientContract): Promise<number | null> {
        const snapshotQuery = trx
            .from("economic_line_cost_snapshots")
            .where("product_id", productId)
            .whereNotNull("unit_cost_minor")
            .whereNot("quality", "incomplete");
        if (variationId == null) snapshotQuery.whereNull("variation_id");
        else snapshotQuery.where("variation_id", variationId);
        const snapshot = await snapshotQuery.orderBy("effective_at", "desc").orderBy("id", "desc").first();
        if (snapshot?.unit_cost_minor != null) return safeMinor(snapshot.unit_cost_minor, "unit_cost_minor");

        const layerQuery = trx.from("economic_cost_layers").where("product_id", productId).whereNotNull("unit_landed_cost_minor");
        if (variationId == null) layerQuery.whereNull("variation_id");
        else layerQuery.where("variation_id", variationId);
        const layer = await layerQuery.orderBy("effective_at", "desc").orderBy("id", "desc").first();
        return layer?.unit_landed_cost_minor == null ? null : safeMinor(layer.unit_landed_cost_minor, "unit_landed_cost_minor");
    }

    private async recordAction(
        trx: TransactionClientContract,
        input: {
            policyId: number;
            versionId: number | null;
            action: string;
            fromState: string | null;
            toState: string | null;
            actorId: number;
            reason: string;
            evidence: JsonObject;
            correlationId?: string | null;
            idempotencyKey?: string | null;
        },
    ) {
        const [event] = await trx
            .table("pricing_policy_actions")
            .insert({
                tenant_id: tenantId(),
                policy_id: input.policyId,
                policy_version_id: input.versionId,
                action: input.action,
                from_state: input.fromState,
                to_state: input.toState,
                actor_user_id: input.actorId,
                reason: input.reason,
                evidence: input.evidence,
                correlation_id: input.correlationId ?? null,
                idempotency_key: input.idempotencyKey ?? null,
            })
            .returning("*");
        await recordAudit({
            actorUserId: input.actorId,
            action: `pricing.${input.action}`,
            entityKind: "pricing_policy",
            entityId: input.policyId,
            payload: {
                policy_version_id: input.versionId,
                from_state: input.fromState,
                to_state: input.toState,
                reason: input.reason,
                evidence: input.evidence,
                correlation_id: input.correlationId ?? null,
                idempotency_key: input.idempotencyKey ?? null,
            },
            trx,
            strict: true,
        });
        return event;
    }
}

export const pricingPolicyService = new PricingPolicyService();
