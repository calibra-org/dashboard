import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import type { DiscounterInput } from "#contracts/discounter";
import { getDiscounter } from "#services/discounter";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { Phase9ConflictError, Phase9ValidationError, type Subject } from "#services/phase9_personalization_service";

const TRANSITIONS: Record<string, ReadonlyArray<string>> = {
    draft: ["scheduled", "preheat", "active", "cancelled"],
    scheduled: ["preheat", "active", "paused", "cancelled", "expired"],
    preheat: ["active", "paused", "cancelled", "expired"],
    active: ["paused", "sold_out", "ended", "expired", "cancelled"],
    paused: ["active", "ended", "expired", "cancelled"],
    sold_out: ["ended", "expired", "archived"],
    ended: ["archived"],
    expired: ["archived"],
    cancelled: ["archived"],
    archived: [],
};

export default class Phase9DealGuardService {
    async transitionCampaign(id: number, target: string, expectedVersion?: number) {
        if (!Number.isInteger(id) || id < 1) throw new Phase9ValidationError("invalid_id");
        const trx = currentTrx();
        const row = await trx.from("deal_campaigns").where("id", id).forUpdate().first();
        if (!row) return null;
        if (expectedVersion !== undefined && Number(row.version) !== expectedVersion)
            throw new Phase9ConflictError("campaign_version_conflict");
        if (!(TRANSITIONS[String(row.status)] ?? []).includes(target))
            throw new Phase9ConflictError("invalid_campaign_transition");
        const now = DateTime.utc().toSQL();
        await trx
            .from("deal_campaigns")
            .where("id", id)
            .update({
                status: target,
                version: Number(row.version) + 1,
                updated_at: now,
                ...(target === "active" && !row.published_at ? { published_at: now } : {}),
                ...(target === "cancelled" ? { cancelled_at: now } : {}),
                ...(target === "ended" ? { ended_at: now } : {}),
            });
        return trx.from("deal_campaigns").where("id", id).first();
    }

    async reserve(input: Record<string, unknown>, subject: Subject | null) {
        const campaignId = Number(input.campaign_id);
        const productId = input.product_id == null ? null : Number(input.product_id);
        const orderId = input.order_id == null ? null : Number(input.order_id);
        const quantity = Math.max(1, Math.round(Number(input.quantity ?? 1)));
        const idempotencyKey = String(input.idempotency_key ?? "").trim();
        if (!Number.isInteger(campaignId) || campaignId < 1 || !/^[a-zA-Z0-9._:-]{8,96}$/.test(idempotencyKey))
            throw new Phase9ValidationError("invalid_reservation");
        if (productId !== null && (!Number.isInteger(productId) || productId < 1))
            throw new Phase9ValidationError("invalid_product_id");
        if (orderId !== null && (!Number.isInteger(orderId) || orderId < 1)) throw new Phase9ValidationError("invalid_order_id");

        const trx = currentTrx();
        const existing = await trx.from("deal_reservations").where("idempotency_key", idempotencyKey).first();
        if (existing) return { ...existing, deduplicated: true };

        const campaign = await trx.from("deal_campaigns").where("id", campaignId).forUpdate().first();
        if (!campaign || campaign.status !== "active") throw new Phase9ConflictError("deal_not_active");
        const now = DateTime.utc();
        if (campaign.starts_at && DateTime.fromJSDate(new Date(campaign.starts_at)) > now)
            throw new Phase9ConflictError("deal_not_started");
        if (campaign.ends_at && DateTime.fromJSDate(new Date(campaign.ends_at)) <= now)
            throw new Phase9ConflictError("deal_expired");

        await trx
            .from("deal_reservations")
            .where("campaign_id", campaignId)
            .where("status", "reserved")
            .where("expires_at", "<=", now.toSQL())
            .update({ status: "expired", updated_at: now.toSQL() });

        const liveReservations = await trx
            .from("deal_reservations")
            .where("campaign_id", campaignId)
            .where("status", "reserved")
            .where("expires_at", ">", now.toSQL())
            .sum("quantity as quantity")
            .first();
        const redemptions = await trx
            .from("deal_redemptions")
            .where("campaign_id", campaignId)
            .sum("quantity as quantity")
            .first();
        const quantityLimit = campaign.quantity_limit === null ? null : Number(campaign.quantity_limit);
        if (
            quantityLimit !== null &&
            Number(liveReservations?.quantity ?? 0) + Number(redemptions?.quantity ?? 0) + quantity > quantityLimit
        )
            throw new Phase9ConflictError("deal_quantity_exhausted");
        if (campaign.max_applications !== null && Number(campaign.usage_count ?? 0) >= Number(campaign.max_applications))
            throw new Phase9ConflictError("deal_application_limit_reached");

        const rules = object(campaign.rules);
        const perCustomerLimit = Math.max(0, Math.round(Number(rules.per_customer_limit ?? 0)));
        if (subject && perCustomerLimit > 0) {
            const subjectReserved = await trx
                .from("deal_reservations")
                .where("campaign_id", campaignId)
                .where("subject_type", subject.type)
                .where("subject_id", subject.id)
                .where("status", "reserved")
                .where("expires_at", ">", now.toSQL())
                .sum("quantity as quantity")
                .first();
            const subjectRedeemed = await trx
                .from("deal_reservations")
                .where("campaign_id", campaignId)
                .where("subject_type", subject.type)
                .where("subject_id", subject.id)
                .where("status", "consumed")
                .sum("quantity as quantity")
                .first();
            if (Number(subjectReserved?.quantity ?? 0) + Number(subjectRedeemed?.quantity ?? 0) + quantity > perCustomerLimit)
                throw new Phase9ConflictError("deal_customer_limit_reached");
        }

        const [row] = await trx
            .table("deal_reservations")
            .insert({
                tenant_id: currentTenantId(),
                reservation_id: randomUUID(),
                campaign_id: campaignId,
                product_id: productId,
                order_id: orderId,
                subject_type: subject?.type ?? null,
                subject_id: subject?.id ?? null,
                quantity,
                status: "reserved",
                idempotency_key: idempotencyKey,
                expires_at: now.plus({ minutes: 15 }).toSQL(),
                created_at: now.toSQL(),
                updated_at: now.toSQL(),
            })
            .returning("*");
        return { ...row, deduplicated: false };
    }

    async release(reservationId: string) {
        const trx = currentTrx();
        const row = await trx.from("deal_reservations").where("reservation_id", reservationId).forUpdate().first();
        if (!row) return null;
        if (row.status === "reserved") {
            await trx.from("deal_reservations").where("id", row.id).update({
                status: "released",
                updated_at: DateTime.utc().toSQL(),
            });
        }
        return { ...(await trx.from("deal_reservations").where("id", row.id).first()), deduplicated: row.status !== "reserved" };
    }

    async consumeOrder(orderId: number) {
        if (!Number.isInteger(orderId) || orderId < 1) throw new Phase9ValidationError("invalid_order_id");
        const trx = currentTrx();
        const reservations = await trx
            .from("deal_reservations")
            .where("order_id", orderId)
            .where("status", "reserved")
            .orderBy("campaign_id", "asc")
            .forUpdate();
        for (const reservation of reservations) {
            if (DateTime.fromJSDate(new Date(reservation.expires_at)) <= DateTime.utc()) {
                await trx
                    .from("deal_reservations")
                    .where("id", reservation.id)
                    .update({ status: "expired", updated_at: DateTime.utc().toSQL() });
                throw new Phase9ConflictError("deal_reservation_expired");
            }
            const campaign = await trx.from("deal_campaigns").where("id", reservation.campaign_id).forUpdate().first();
            if (!campaign || campaign.status !== "active") throw new Phase9ConflictError("deal_not_active");
            const idempotencyKey = `deal:${reservation.reservation_id}:${orderId}`;
            const prior = await trx.from("deal_redemptions").where("idempotency_key", idempotencyKey).first();
            if (!prior) {
                await trx.table("deal_redemptions").insert({
                    tenant_id: currentTenantId(),
                    campaign_id: reservation.campaign_id,
                    reservation_id: reservation.reservation_id,
                    order_id: orderId,
                    product_id: reservation.product_id,
                    quantity: reservation.quantity,
                    benefit_minor: 0,
                    campaign_version: Number(campaign.version),
                    policy_snapshot: JSON.stringify(campaign.policy_snapshot ?? {}),
                    idempotency_key: idempotencyKey,
                    created_at: DateTime.utc().toSQL(),
                });
                await trx.from("deal_campaigns").where("id", reservation.campaign_id).increment("usage_count", 1);
            }
            await trx
                .from("deal_reservations")
                .where("id", reservation.id)
                .update({ status: "consumed", updated_at: DateTime.utc().toSQL() });
        }
        return { consumed: reservations.length };
    }

    async simulateCommerce(input: Record<string, unknown>) {
        const rawItems = Array.isArray(input.items) ? input.items : [];
        const rawCoupons = Array.isArray(input.applied_coupons) ? input.applied_coupons : [];
        const items = rawItems.map((raw, index) => {
            const item = object(raw);
            const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1)));
            const priceSnapshot = Math.max(0, Math.round(Number(item.price_snapshot ?? 0)));
            return {
                lineKey: String(item.line_key ?? index + 1),
                productId: Number(item.product_id),
                variationId: item.variation_id == null ? null : Number(item.variation_id),
                quantity,
                priceSnapshot,
                lineSubtotal: priceSnapshot * quantity,
                categoryIds: Array.isArray(item.category_ids) ? item.category_ids.map(Number) : [],
                tagIds: Array.isArray(item.tag_ids) ? item.tag_ids.map(Number) : [],
                brandIds: Array.isArray(item.brand_ids) ? item.brand_ids.map(Number) : [],
                onSale: item.on_sale === true,
            };
        });
        const discounterInput: DiscounterInput = {
            items,
            itemsTotal: items.reduce((sum, item) => sum + item.lineSubtotal, 0),
            appliedCoupons: rawCoupons.map((raw) => {
                const coupon = object(raw);
                return { id: Number(coupon.id), code: String(coupon.code ?? "") };
            }),
            customer:
                input.customer && typeof input.customer === "object"
                    ? {
                          customerId: Number(object(input.customer).customer_id) || null,
                          email: typeof object(input.customer).email === "string" ? String(object(input.customer).email) : null,
                      }
                    : null,
        };
        const result = await getDiscounter().calculate(discounterInput);
        const minSellingPrice = input.min_selling_price == null ? null : Math.max(0, Number(input.min_selling_price));
        const finalAfterDiscount = Math.max(0, discounterInput.itemsTotal - result.discountTotal);
        return {
            resolver: "canonical_discounter",
            deterministic_order: ["coupon_eligibility", "coupon_precedence", "coupon_combinability", "margin_guard"],
            discount_total: result.discountTotal,
            free_shipping: result.freeShipping,
            final_after_discount: finalAfterDiscount,
            margin_guard: {
                allowed: minSellingPrice === null || finalAfterDiscount >= minSellingPrice,
                min_selling_price: minSellingPrice,
            },
            per_coupon: Object.fromEntries(result.perCouponDiscounts),
        };
    }
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return value as Record<string, unknown>;
}
