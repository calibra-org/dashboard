import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import DiscoverySearchEvent from "#models/discovery_search_event";
import Product from "#models/product";
import { normalizeDiscoveryQuery, redactDiscoveryQuery } from "#services/discovery/normalizer";
import { hashSession, searchProducts } from "#services/discovery/search_service";
import { discoveryEventValidator, discoverySearchValidator } from "#validators/admin/discovery_validator";

export default class StorefrontDiscoveryController {
    async search(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(discoverySearchValidator);
        return searchProducts(payload);
    }
    async event(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(discoveryEventValidator);
        if (payload.product_id) {
            const product = await Product.query().where("id", payload.product_id).first();
            if (!product) {
                ctx.response.status(422);
                return { errors: [{ code: "E_DISCOVERY_PRODUCT_NOT_FOUND", message: "Product not found in tenant" }] };
            }
        }
        const raw = payload.query ? redactDiscoveryQuery(payload.query) : null;
        const normalized = payload.query ? normalizeDiscoveryQuery(raw) : null;
        try {
            const row = await DiscoverySearchEvent.create({
                eventKey: payload.event_key,
                eventType: payload.event_type,
                locale: payload.locale ?? "fa",
                surface: payload.surface ?? "storefront",
                sessionHash: hashSession(payload.session_key),
                rawQueryRedacted: raw,
                normalizedQuery: normalized,
                resultCount: payload.result_count ?? null,
                productId: payload.product_id ?? null,
                position: payload.position ?? null,
                occurredAt: payload.occurred_at ? DateTime.fromISO(payload.occurred_at, { zone: "utc" }) : DateTime.utc(),
                retrievalVersion: "phase16-v1",
            });
            ctx.response.status(202);
            return { data: { id: row.id, accepted: true } };
        } catch (error) {
            if (String(error).includes("discovery_events_idempotency_unique")) {
                ctx.response.status(200);
                return { data: { accepted: true, duplicate: true } };
            }
            throw error;
        }
    }
}
