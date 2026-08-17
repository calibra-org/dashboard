import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import type { DiscounterInput, DiscounterItem } from "#contracts/discounter";
import { getDiscounter } from "#services/discounter";
import Phase9PersonalizationService, {
    Phase9ConflictError,
    Phase9ValidationError,
    type Subject,
} from "#services/phase9_personalization_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const PHASE9_EVENT_TYPES = [
    "session_started",
    "page_view",
    "view_product",
    "view_category",
    "search",
    "search_result_click",
    "scroll_depth",
    "story_view",
    "video_progress",
    "video_complete",
    "like",
    "save",
    "follow",
    "comment",
    "add_cart",
    "remove_cart",
    "wishlist",
    "checkout_started",
    "purchase",
    "return_requested",
    "refund",
    "recommendation_impression",
    "recommendation_click",
    "not_interested",
] as const;

export const PHASE9_SURFACES = [
    "home",
    "category",
    "search",
    "product",
    "cart",
    "checkout",
    "account",
    "empty",
    "story",
    "video",
    "community",
    "email",
    "sms_push",
] as const;

const EVENT_SET = new Set<string>(PHASE9_EVENT_TYPES);
const SURFACE_SET = new Set<string>(PHASE9_SURFACES);
const DEAL_TRANSITIONS: Record<string, readonly string[]> = {
    draft: ["scheduled", "preheat", "active", "cancelled"],
    scheduled: ["preheat", "active", "paused", "cancelled", "expired"],
    preheat: ["active", "paused", "cancelled", "expired"],
    active: ["paused", "sold_out", "expired", "ended", "cancelled"],
    paused: ["active", "ended", "cancelled", "expired"],
    sold_out: ["ended", "expired"],
    expired: ["archived"],
    ended: ["archived"],
    cancelled: ["archived"],
    archived: [],
};

export default class Phase9MasterService {
    private base = new Phase9PersonalizationService();

    async ingestEvent(input: Record<string, unknown>, subject: Subject | null) {
        const type = String(input.event_type ?? "");
        if (!EVENT_SET.has(type)) throw new Phase9ValidationError("unsupported_event_type");
        const schemaVersion = Number(input.schema_version ?? 1);
        if (schemaVersion !== 1) throw new Phase9ValidationError("unsupported_event_schema_version");
        return this.base.ingestEvent({ ...input, schema_version: 1 }, subject);
    }

    async ingestBatch(events: unknown, subject: Subject | null) {
        if (!Array.isArray(events) || events.length < 1 || events.length > 100)
            throw new Phase9ValidationError("invalid_event_batch");
        const results = [];
        for (const item of events) {
            if (!item || typeof item !== "object" || Array.isArray(item))
                throw new Phase9ValidationError("invalid_event_batch_item");
            results.push(await this.ingestEvent(item as Record<string, unknown>, subject));
        }
        return { accepted: results.filter((x) => x.accepted).length, results };
    }

    async mergeAnonymousIntoCustomer(visitorId: string, customerId: number) {
        if (!/^[a-zA-Z0-9_-]{12,96}$/.test(visitorId) || !Number.isInteger(customerId) || customerId < 1)
            throw new Phase9ValidationError("invalid_identity_merge");
        const trx = currentTrx();
        const prior = await trx
            .from("personalization_identity_merges")
            .where("visitor_id", visitorId)
            .whereNot("customer_id", customerId)
            .first();
        if (prior) return { merged: false, reason: "account_switch_guard" };

        const visitor: Subject = { type: "visitor", id: visitorId };
        const customer: Subject = { type: "customer", id: String(customerId) };
        const [visitorConsent, customerConsent] = await Promise.all([
            this.base.getConsent(visitor),
            this.base.getConsent(customer),
        ]);
        if (!visitorConsent.personalization || !customerConsent.personalization)
            return { merged: false, reason: "personalization_consent_required" };

        const existing = await trx
            .from("personalization_identity_merges")
            .where("visitor_id", visitorId)
            .where("customer_id", customerId)
            .first();
        if (existing) return { merged: true, deduplicated: true };

        const visitorProfile = await trx
            .from("personalization_profiles")
            .where("subject_type", "visitor")
            .where("subject_id", visitorId)
            .forUpdate()
            .first();
        const customerProfile = await trx
            .from("personalization_profiles")
            .where("subject_type", "customer")
            .where("subject_id", String(customerId))
            .forUpdate()
            .first();

        if (visitorProfile) {
            const recent = uniqueIds([
                ...jsonArray(visitorProfile.recent_product_ids).map(Number),
                ...jsonArray(customerProfile?.recent_product_ids).map(Number),
            ]).slice(0, 30);
            const categories = mergeScores(visitorProfile.category_affinity, customerProfile?.category_affinity);
            const brands = mergeScores(visitorProfile.brand_affinity, customerProfile?.brand_affinity);
            const now = DateTime.utc().toSQL();
            await trx
                .table("personalization_profiles")
                .insert({
                    tenant_id: currentTenantId(),
                    subject_type: "customer",
                    subject_id: String(customerId),
                    recent_product_ids: JSON.stringify(recent),
                    category_affinity: JSON.stringify(categories),
                    brand_affinity: JSON.stringify(brands),
                    version: 1,
                    created_at: now,
                    updated_at: now,
                })
                .onConflict(["tenant_id", "subject_type", "subject_id"])
                .merge({
                    recent_product_ids: JSON.stringify(recent),
                    category_affinity: JSON.stringify(categories),
                    brand_affinity: JSON.stringify(brands),
                    updated_at: now,
                    version: trx.raw("personalization_profiles.version + 1"),
                });
        }

        await trx
            .from("personalization_events")
            .where("visitor_id", visitorId)
            .whereNull("customer_id")
            .update({ customer_id: customerId });
        await trx.table("personalization_identity_merges").insert({
            tenant_id: currentTenantId(),
            visitor_id: visitorId,
            customer_id: customerId,
            merge_version: "phase9-v1",
            merged_at: DateTime.utc().toSQL(),
        });
        await trx
            .from("personalization_profiles")
            .where("subject_type", "visitor")
            .where("subject_id", visitorId)
            .delete();
        return { merged: true, deduplicated: false };
    }

    async getPreferences(subject: Subject) {
        const row = await currentTrx()
            .from("personalization_preferences")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .first();
        return row
            ? {
                  hidden_product_ids: jsonArray(row.hidden_product_ids).map(Number),
                  hidden_category_ids: jsonArray(row.hidden_category_ids).map(Number),
                  show_less_topics: jsonArray(row.show_less_topics).map(String),
              }
            : { hidden_product_ids: [], hidden_category_ids: [], show_less_topics: [] };
    }

    async updatePreferences(subject: Subject, input: Record<string, unknown>) {
        const hiddenProducts = uniqueIds(asArray(input.hidden_product_ids).map(Number)).slice(0, 500);
        const hiddenCategories = uniqueIds(asArray(input.hidden_category_ids).map(Number)).slice(0, 200);
        const topics = [...new Set(asArray(input.show_less_topics).map(String).map((x) => x.slice(0, 64)))].slice(0, 100);
        const now = DateTime.utc().toSQL();
        await currentTrx()
            .table("personalization_preferences")
            .insert({
                tenant_id: currentTenantId(),
                subject_type: subject.type,
                subject_id: subject.id,
                hidden_product_ids: JSON.stringify(hiddenProducts),
                hidden_category_ids: JSON.stringify(hiddenCategories),
                show_less_topics: JSON.stringify(topics),
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "subject_type", "subject_id"])
            .merge({
                hidden_product_ids: JSON.stringify(hiddenProducts),
                hidden_category_ids: JSON.stringify(hiddenCategories),
                show_less_topics: JSON.stringify(topics),
                updated_at: now,
            });
        return this.getPreferences(subject);
    }

    async reset(subject: Subject) {
        const trx = currentTrx();
        await trx.from("personalization_profiles").where("subject_type", subject.type).where("subject_id", subject.id).delete();
        await trx.from("personalization_preferences").where("subject_type", subject.type).where("subject_id", subject.id).delete();
        if (subject.type === "visitor") {
            await trx.from("personalization_events").where("visitor_id", subject.id).delete();
            await trx.from("personalization_identity_merges").where("visitor_id", subject.id).delete();
        } else {
            await trx.from("personalization_events").where("customer_id", Number(subject.id)).delete();
        }
        return { reset: true };
    }

    async serve(input: Record<string, unknown>, subject: Subject | null, locale = "fa") {
        const surface = String(input.surface ?? input.placement ?? "home");
        if (!SURFACE_SET.has(surface)) throw new Phase9ValidationError("unsupported_recommendation_surface");
        const prefs = subject ? await this.getPreferences(subject) : { hidden_product_ids: [] as number[] };
        const explicit = asArray(input.exclude_product_ids).map(Number);
        const result = await this.base.recommendations({
            placement: surface,
            limit: Number(input.limit ?? 8),
            subject,
            locale,
            exclude_product_ids: uniqueIds([...explicit, ...prefs.hidden_product_ids]),
        });
        const active = await this.activeRegistry();
        return {
            ...result,
            surface,
            policy_version: active.policy_version ?? result.policy_version,
            model_version: active.model_version ?? result.model_version,
            reason_code_version: active.reason_code_version ?? "v1",
        };
    }

    async servePage(input: Record<string, unknown>, subject: Subject | null, locale = "fa") {
        const surfaces = asArray(input.surfaces).map(String);
        const requested = surfaces.length ? surfaces : ["home"];
        if (requested.length > 12) throw new Phase9ValidationError("too_many_surfaces");
        const placements: Record<string, unknown> = {};
        for (const surface of requested) placements[surface] = await this.serve({ ...input, surface }, subject, locale);
        return { request_id: randomUUID(), placements };
    }

    async listPolicies() {
        return currentTrx().from("personalization_policies").orderBy("policy_key").orderBy("version", "desc");
    }

    async createPolicy(input: Record<string, unknown>, actor?: number | null) {
        const key = registryKey(input.policy_key);
        const trx = currentTrx();
        const last = await trx.from("personalization_policies").where("policy_key", key).max("version as version").first();
        const version = Number(last?.version ?? 0) + 1;
        const [row] = await trx.table("personalization_policies").insert({
            tenant_id: currentTenantId(),
            policy_key: key,
            version,
            status: "draft",
            config: JSON.stringify(sanitizeObject(input.config)),
            reason_code_version: String(input.reason_code_version ?? "v1").slice(0, 32),
            created_by_user_id: actor ?? null,
            created_at: DateTime.utc().toSQL(),
        }).returning("*");
        return row;
    }

    async activatePolicy(id: number, actor?: number | null) {
        const trx = currentTrx();
        const row = await trx.from("personalization_policies").where("id", id).forUpdate().first();
        if (!row) return null;
        await trx.from("personalization_policies").where("policy_key", row.policy_key).where("status", "active").update({ status: "retired" });
        await trx.from("personalization_policies").where("id", id).update({ status: "active", activated_at: DateTime.utc().toSQL() });
        await trx.table("personalization_rollouts").insert({
            tenant_id: currentTenantId(), kind: "policy", registry_key: row.policy_key,
            from_version: null, to_version: String(row.version), percentage: 100, status: "completed",
            created_by_user_id: actor ?? null, started_at: DateTime.utc().toSQL(), ended_at: DateTime.utc().toSQL(), created_at: DateTime.utc().toSQL(),
        });
        return trx.from("personalization_policies").where("id", id).first();
    }

    async rollbackPolicy(keyInput: unknown, versionInput: unknown, actor?: number | null) {
        const key = registryKey(keyInput);
        const version = positiveInt(versionInput, "invalid_policy_version");
        const target = await currentTrx().from("personalization_policies").where("policy_key", key).where("version", version).first();
        if (!target) return null;
        return this.activatePolicy(Number(target.id), actor);
    }

    async listModels() {
        return currentTrx().from("personalization_models").orderBy("model_key").orderBy("created_at", "desc");
    }

    async createModel(input: Record<string, unknown>, actor?: number | null) {
        const key = registryKey(input.model_key);
        const version = String(input.version ?? "").trim().slice(0, 64);
        if (!version) throw new Phase9ValidationError("model_version_required");
        const rollout = clamp(Number(input.rollout_percent ?? 0), 0, 100);
        const [row] = await currentTrx().table("personalization_models").insert({
            tenant_id: currentTenantId(), model_key: key, version, status: "draft",
            config: JSON.stringify(sanitizeObject(input.config)), rollout_percent: rollout,
            created_by_user_id: actor ?? null, created_at: DateTime.utc().toSQL(),
        }).returning("*");
        return row;
    }

    async activateModel(id: number, rolloutPercent: number, actor?: number | null) {
        const trx = currentTrx();
        const row = await trx.from("personalization_models").where("id", id).forUpdate().first();
        if (!row) return null;
        const percentage = clamp(rolloutPercent, 1, 100);
        const current = await trx.from("personalization_models").where("model_key", row.model_key).where("status", "active").first();
        if (percentage === 100) await trx.from("personalization_models").where("model_key", row.model_key).where("status", "active").update({ status: "retired", rollout_percent: 0 });
        await trx.from("personalization_models").where("id", id).update({ status: "active", rollout_percent: percentage, activated_at: DateTime.utc().toSQL() });
        await trx.table("personalization_rollouts").insert({
            tenant_id: currentTenantId(), kind: "model", registry_key: row.model_key,
            from_version: current?.version ?? null, to_version: row.version, percentage, status: percentage === 100 ? "completed" : "active",
            created_by_user_id: actor ?? null, started_at: DateTime.utc().toSQL(), ended_at: percentage === 100 ? DateTime.utc().toSQL() : null, created_at: DateTime.utc().toSQL(),
        });
        return trx.from("personalization_models").where("id", id).first();
    }

    async rollbackModel(keyInput: unknown, versionInput: unknown, actor?: number | null) {
        const key = registryKey(keyInput);
        const version = String(versionInput ?? "").trim();
        const target = await currentTrx().from("personalization_models").where("model_key", key).where("version", version).first();
        if (!target) return null;
        await currentTrx().from("personalization_rollouts").where("kind", "model").where("registry_key", key).where("status", "active").update({ status: "rolled_back", ended_at: DateTime.utc().toSQL() });
        return this.activateModel(Number(target.id), 100, actor);
    }

    async listRollouts() {
        return currentTrx().from("personalization_rollouts").orderBy("created_at", "desc").limit(200);
    }

    async transitionCampaign(id: number, next: string, expectedVersion?: number) {
        const trx = currentTrx();
        const row = await trx.from("deal_campaigns").where("id", id).forUpdate().first();
        if (!row) return null;
        if (expectedVersion !== undefined && Number(row.version) !== expectedVersion) throw new Phase9ConflictError("campaign_version_conflict");
        if (!(DEAL_TRANSITIONS[String(row.status)] ?? []).includes(next)) throw new Phase9ConflictError("invalid_campaign_transition");
        const patch: Record<string, unknown> = { status: next, version: Number(row.version) + 1, updated_at: DateTime.utc().toSQL() };
        if (next === "cancelled") patch.cancelled_at = DateTime.utc().toSQL();
        if (next === "ended") patch.ended_at = DateTime.utc().toSQL();
        await trx.from("deal_campaigns").where("id", id).update(patch);
        return trx.from("deal_campaigns").where("id", id).first();
    }

    async configureAllocation(campaignId: number, input: Record<string, unknown>) {
        const productId = nullablePositiveInt(input.product_id);
        const variantId = nullablePositiveInt(input.variant_id);
        const quantity = positiveInt(input.allocated_quantity, "invalid_allocation_quantity");
        const trx = currentTrx();
        await trx.from("deal_campaigns").where("id", campaignId).forUpdate().first();
        const existing = await allocationQuery(campaignId, productId, variantId).forUpdate().first();
        if (existing && Number(existing.reserved_quantity) + Number(existing.consumed_quantity) > quantity)
            throw new Phase9ConflictError("allocation_below_committed_quantity");
        if (existing) {
            await trx.from("deal_allocations").where("id", existing.id).update({ allocated_quantity: quantity, version: Number(existing.version) + 1, updated_at: DateTime.utc().toSQL() });
        } else {
            await trx.table("deal_allocations").insert({ tenant_id: currentTenantId(), campaign_id: campaignId, product_id: productId, variant_id: variantId, allocated_quantity: quantity, reserved_quantity: 0, consumed_quantity: 0, version: 1, created_at: DateTime.utc().toSQL(), updated_at: DateTime.utc().toSQL() });
        }
        return allocationQuery(campaignId, productId, variantId).first();
    }

    async reserveDeal(campaignId: number, input: Record<string, unknown>, subject: Subject | null) {
        const trx = currentTrx();
        const idempotencyKey = String(input.idempotency_key ?? "").trim().slice(0, 96);
        if (idempotencyKey.length < 8) throw new Phase9ValidationError("idempotency_key_required");
        const prior = await trx.from("deal_reservations").where("idempotency_key", idempotencyKey).first();
        if (prior) return { ...prior, deduplicated: true };
        const campaign = await trx.from("deal_campaigns").where("id", campaignId).forUpdate().first();
        if (!campaign) return null;
        if (campaign.status !== "active") throw new Phase9ConflictError("campaign_not_active");
        const now = DateTime.utc();
        if (campaign.starts_at && DateTime.fromJSDate(new Date(campaign.starts_at)) > now) throw new Phase9ConflictError("campaign_not_started");
        if (campaign.ends_at && DateTime.fromJSDate(new Date(campaign.ends_at)) <= now) throw new Phase9ConflictError("campaign_expired");
        const productId = nullablePositiveInt(input.product_id);
        const variantId = nullablePositiveInt(input.variant_id);
        const quantity = positiveInt(input.quantity ?? 1, "invalid_reservation_quantity");
        await this.releaseExpired(campaignId);
        let allocation = await allocationQuery(campaignId, productId, variantId).forUpdate().first();
        if (!allocation) allocation = await allocationQuery(campaignId, null, null).forUpdate().first();
        if (!allocation) throw new Phase9ConflictError("deal_allocation_missing");
        const remaining = Number(allocation.allocated_quantity) - Number(allocation.reserved_quantity) - Number(allocation.consumed_quantity);
        if (remaining < quantity) throw new Phase9ConflictError("deal_quantity_exhausted");
        const rules = sanitizeObject(campaign.rules);
        const perCustomerLimit = Number(rules.per_customer_limit ?? 0);
        if (subject && perCustomerLimit > 0) {
            const used = await trx.from("deal_reservations").where("campaign_id", campaignId).where("subject_type", subject.type).where("subject_id", subject.id).whereIn("status", ["reserved", "consumed"]).sum("quantity as total").first();
            if (Number(used?.total ?? 0) + quantity > perCustomerLimit) throw new Phase9ConflictError("deal_customer_limit_reached");
        }
        if (campaign.max_applications !== null && Number(campaign.usage_count) >= Number(campaign.max_applications))
            throw new Phase9ConflictError("deal_application_limit_reached");
        const ttlSeconds = clamp(Number(input.ttl_seconds ?? 900), 60, 3600);
        const reservationId = randomUUID();
        await trx.from("deal_allocations").where("id", allocation.id).update({ reserved_quantity: Number(allocation.reserved_quantity) + quantity, version: Number(allocation.version) + 1, updated_at: now.toSQL() });
        const [row] = await trx.table("deal_reservations").insert({
            tenant_id: currentTenantId(), reservation_id: reservationId, campaign_id: campaignId,
            product_id: productId, order_id: nullablePositiveInt(input.order_id), subject_type: subject?.type ?? null,
            subject_id: subject?.id ?? null, quantity, status: "reserved", idempotency_key: idempotencyKey,
            expires_at: now.plus({ seconds: ttlSeconds }).toSQL(), created_at: now.toSQL(), updated_at: now.toSQL(),
        }).returning("*");
        return { ...row, deduplicated: false };
    }

    async consumeReservation(reservationId: string, orderId: number) {
        const trx = currentTrx();
        const row = await trx.from("deal_reservations").where("reservation_id", reservationId).forUpdate().first();
        if (!row) return null;
        if (row.status === "consumed") return { ...row, deduplicated: true };
        if (row.status !== "reserved") throw new Phase9ConflictError("reservation_not_consumable");
        if (DateTime.fromJSDate(new Date(row.expires_at)) <= DateTime.utc()) throw new Phase9ConflictError("reservation_expired");
        const campaign = await trx.from("deal_campaigns").where("id", row.campaign_id).forUpdate().first();
        if (!campaign) throw new Phase9ConflictError("campaign_not_found");
        let allocation = await allocationQuery(Number(row.campaign_id), row.product_id ? Number(row.product_id) : null, null).forUpdate().first();
        if (!allocation) allocation = await allocationQuery(Number(row.campaign_id), null, null).forUpdate().first();
        if (!allocation) throw new Phase9ConflictError("deal_allocation_missing");
        const quantity = Number(row.quantity);
        const now = DateTime.utc().toSQL();
        await trx.from("deal_allocations").where("id", allocation.id).update({
            reserved_quantity: Math.max(0, Number(allocation.reserved_quantity) - quantity),
            consumed_quantity: Number(allocation.consumed_quantity) + quantity,
            version: Number(allocation.version) + 1, updated_at: now,
        });
        await trx.from("deal_reservations").where("id", row.id).update({ status: "consumed", order_id: orderId, updated_at: now });
        await trx.table("deal_redemptions").insert({
            tenant_id: currentTenantId(), campaign_id: row.campaign_id, reservation_id: row.reservation_id,
            order_id: orderId, product_id: row.product_id, quantity, benefit_minor: 0,
            campaign_version: Number(campaign.version), policy_snapshot: JSON.stringify(campaign.policy_snapshot ?? {}),
            idempotency_key: `reservation:${row.reservation_id}`, created_at: now,
        }).onConflict(["tenant_id", "idempotency_key"]).ignore();
        await trx.from("deal_campaigns").where("id", row.campaign_id).update({ usage_count: Number(campaign.usage_count) + 1, updated_at: now });
        return trx.from("deal_reservations").where("id", row.id).first();
    }

    async releaseReservation(reservationId: string) {
        const trx = currentTrx();
        const row = await trx.from("deal_reservations").where("reservation_id", reservationId).forUpdate().first();
        if (!row) return null;
        if (row.status === "released" || row.status === "expired") return { ...row, deduplicated: true };
        if (row.status !== "reserved") throw new Phase9ConflictError("reservation_not_releasable");
        await this.releaseReservationRow(row, "released");
        return trx.from("deal_reservations").where("id", row.id).first();
    }

    async simulatePromotion(input: Record<string, unknown>) {
        const itemsRaw = asArray(input.items);
        if (itemsRaw.length < 1 || itemsRaw.length > 100) throw new Phase9ValidationError("invalid_simulator_items");
        const items: DiscounterItem[] = itemsRaw.map((raw, index) => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Phase9ValidationError("invalid_simulator_item");
            const x = raw as Record<string, unknown>;
            const productId = positiveInt(x.product_id, "invalid_product_id");
            const quantity = positiveInt(x.quantity ?? 1, "invalid_quantity");
            const price = nonNegativeInt(x.price_snapshot, "invalid_price_snapshot");
            return {
                lineKey: String(x.line_key ?? index + 1), productId, variationId: nullablePositiveInt(x.variant_id), quantity,
                priceSnapshot: price, lineSubtotal: price * quantity,
                categoryIds: uniqueIds(asArray(x.category_ids).map(Number)), tagIds: uniqueIds(asArray(x.tag_ids).map(Number)),
                brandIds: uniqueIds(asArray(x.brand_ids).map(Number)), onSale: x.on_sale === true,
            };
        });
        const coupons = asArray(input.coupons).map((raw) => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Phase9ValidationError("invalid_simulator_coupon");
            const x = raw as Record<string, unknown>;
            return { id: positiveInt(x.id, "invalid_coupon_id"), code: String(x.code ?? "").slice(0, 100) };
        });
        const customerRaw = input.customer && typeof input.customer === "object" && !Array.isArray(input.customer) ? input.customer as Record<string, unknown> : null;
        const discounterInput: DiscounterInput = {
            items, itemsTotal: items.reduce((sum, x) => sum + x.lineSubtotal, 0), appliedCoupons: coupons,
            customer: customerRaw ? { customerId: nullablePositiveInt(customerRaw.customer_id), email: typeof customerRaw.email === "string" ? customerRaw.email : null } : null,
        };
        const result = await getDiscounter().calculate(discounterInput);
        const campaignId = nullablePositiveInt(input.campaign_id);
        let marginGuard: Record<string, unknown> = { eligible: true };
        if (campaignId) {
            const campaign = await currentTrx().from("deal_campaigns").where("id", campaignId).first();
            if (!campaign) throw new Phase9ValidationError("campaign_not_found");
            const minPrice = campaign.min_selling_price === null ? null : Number(campaign.min_selling_price);
            const maxDiscount = campaign.max_discount_percent === null ? null : Number(campaign.max_discount_percent);
            const floorBreaches = minPrice === null ? [] : items.filter((x) => x.priceSnapshot < minPrice).map((x) => x.productId);
            marginGuard = { eligible: floorBreaches.length === 0, min_selling_price: minPrice, max_discount_percent: maxDiscount, floor_breach_product_ids: floorBreaches };
        }
        return {
            canonical_pricing: true,
            resolver: "DiscounterService",
            pricing_stack: "shared_with_cart_and_checkout",
            deal_price_delta: 0,
            discount_total: result.discountTotal,
            discount_tax_total: result.discountTaxTotal,
            free_shipping: result.freeShipping,
            per_line_discounts: Object.fromEntries(result.perLineDiscounts),
            per_coupon_discounts: Object.fromEntries(result.perCouponDiscounts),
            final_items_total: Math.max(0, discounterInput.itemsTotal - result.discountTotal - result.discountTaxTotal),
            margin_guard: marginGuard,
        };
    }

    async analytics() {
        const trx = currentTrx();
        const eventRows = await trx.from("personalization_events").select("event_type").count("* as total").groupBy("event_type");
        const exposureRows = await trx.from("recommendation_exposures").select("placement", "policy_version", "model_version").count("* as impressions").groupBy("placement", "policy_version", "model_version");
        const reservations = await trx.from("deal_reservations").select("status").count("* as total").groupBy("status");
        return {
            events: Object.fromEntries(eventRows.map((x) => [String(x.event_type), Number(x.total)])),
            placements: exposureRows.map((x) => ({ placement: x.placement, policy_version: x.policy_version, model_version: x.model_version, impressions: Number(x.impressions) })),
            reservations: Object.fromEntries(reservations.map((x) => [String(x.status), Number(x.total)])),
        };
    }

    private async activeRegistry() {
        const trx = currentTrx();
        const [policy, model] = await Promise.all([
            trx.from("personalization_policies").where("status", "active").orderBy("activated_at", "desc").first(),
            trx.from("personalization_models").where("status", "active").orderBy("activated_at", "desc").first(),
        ]);
        return {
            policy_version: policy ? `${policy.policy_key}:v${policy.version}` : null,
            model_version: model ? `${model.model_key}:${model.version}` : null,
            reason_code_version: policy?.reason_code_version ?? null,
        };
    }

    private async releaseExpired(campaignId: number) {
        const rows = await currentTrx().from("deal_reservations").where("campaign_id", campaignId).where("status", "reserved").where("expires_at", "<=", DateTime.utc().toSQL()).forUpdate();
        for (const row of rows) await this.releaseReservationRow(row, "expired");
    }

    private async releaseReservationRow(row: Record<string, unknown>, status: "released" | "expired") {
        const trx = currentTrx();
        let allocation = await allocationQuery(Number(row.campaign_id), row.product_id ? Number(row.product_id) : null, null).forUpdate().first();
        if (!allocation) allocation = await allocationQuery(Number(row.campaign_id), null, null).forUpdate().first();
        if (allocation) await trx.from("deal_allocations").where("id", allocation.id).update({
            reserved_quantity: Math.max(0, Number(allocation.reserved_quantity) - Number(row.quantity)),
            version: Number(allocation.version) + 1, updated_at: DateTime.utc().toSQL(),
        });
        await trx.from("deal_reservations").where("id", row.id).update({ status, updated_at: DateTime.utc().toSQL() });
    }
}

function allocationQuery(campaignId: number, productId: number | null, variantId: number | null) {
    const q = currentTrx().from("deal_allocations").where("campaign_id", campaignId);
    productId === null ? q.whereNull("product_id") : q.where("product_id", productId);
    variantId === null ? q.whereNull("variant_id") : q.where("variant_id", variantId);
    return q;
}
function registryKey(value: unknown) {
    const key = String(value ?? "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(key)) throw new Phase9ValidationError("invalid_registry_key");
    return key;
}
function sanitizeObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (/email|phone|password|token|secret|national/i.test(key)) continue;
        out[key.slice(0, 64)] = item;
    }
    return out;
}
function jsonArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
    return [];
}
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function mergeScores(a: unknown, b: unknown) {
    const first = scoreRecord(a); const second = scoreRecord(b); const out: Record<string, number> = { ...second };
    for (const [key, value] of Object.entries(first)) out[key] = Math.min(100, value + (out[key] ?? 0));
    return out;
}
function scoreRecord(value: unknown): Record<string, number> {
    let source = value;
    if (typeof value === "string") { try { source = JSON.parse(value); } catch { source = {}; } }
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(Object.entries(source as Record<string, unknown>).filter(([, x]) => Number.isFinite(Number(x))).map(([k, x]) => [k, Number(x)]));
}
function uniqueIds(values: number[]) { return [...new Set(values.filter((x) => Number.isInteger(x) && x > 0))]; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min)); }
function positiveInt(value: unknown, code: string) { const x = Number(value); if (!Number.isInteger(x) || x < 1) throw new Phase9ValidationError(code); return x; }
function nonNegativeInt(value: unknown, code: string) { const x = Number(value); if (!Number.isInteger(x) || x < 0) throw new Phase9ValidationError(code); return x; }
function nullablePositiveInt(value: unknown): number | null { if (value === null || value === undefined || value === "") return null; const x = Number(value); if (!Number.isInteger(x) || x < 1) throw new Phase9ValidationError("invalid_id"); return x; }
