import { DateTime } from "luxon";

import Phase9PersonalizationService, { Phase9ValidationError, type Subject } from "#services/phase9_personalization_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

export const PHASE9_EVENT_VOCABULARY = new Set([
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
]);

export default class Phase9EventIdentityService {
    private base = new Phase9PersonalizationService();

    async ingest(input: Record<string, unknown>, subject: Subject | null) {
        const eventType = String(input.event_type ?? "");
        if (!PHASE9_EVENT_VOCABULARY.has(eventType)) throw new Phase9ValidationError("unsupported_event_type");
        const schemaVersion = Number(input.schema_version ?? 1);
        if (schemaVersion !== 1) throw new Phase9ValidationError("unsupported_event_version");
        return this.base.ingestEvent({ ...input, schema_version: 1 }, subject);
    }

    async ingestBatch(input: unknown, subject: Subject | null) {
        if (!Array.isArray(input) || input.length < 1 || input.length > 100)
            throw new Phase9ValidationError("invalid_event_batch");
        const results = [];
        for (const value of input) {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Phase9ValidationError("invalid_event");
            results.push(await this.ingest(value as Record<string, unknown>, subject));
        }
        return { total: results.length, accepted: results.filter((item) => item.accepted).length, results };
    }

    async mergeAnonymousIntoCustomer(visitorId: string, customerId: number) {
        if (!/^[a-zA-Z0-9_-]{12,96}$/.test(visitorId) || !Number.isInteger(customerId) || customerId < 1)
            throw new Phase9ValidationError("invalid_identity_merge");

        const visitor: Subject = { type: "visitor", id: visitorId };
        const customer: Subject = { type: "customer", id: String(customerId) };
        const [visitorConsent, customerConsent] = await Promise.all([
            this.base.getConsent(visitor),
            this.base.getConsent(customer),
        ]);
        if (!visitorConsent.personalization || !customerConsent.personalization)
            return { merged: false, reason: "personalization_consent_required" };

        const trx = currentTrx();
        const conflicting = await trx
            .from("personalization_identity_merges")
            .where("visitor_id", visitorId)
            .whereNot("customer_id", customerId)
            .first();
        if (conflicting) return { merged: false, reason: "visitor_already_linked_to_another_customer" };

        const previous = await trx
            .from("personalization_identity_merges")
            .where("visitor_id", visitorId)
            .where("customer_id", customerId)
            .first();
        if (previous) return { merged: true, deduplicated: true };

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
        const now = DateTime.utc().toSQL();

        if (visitorProfile || customerProfile) {
            const recent = uniqueIds([
                ...ids(customerProfile?.recent_product_ids),
                ...ids(visitorProfile?.recent_product_ids),
            ]).slice(0, 30);
            const categories = mergeAffinity(customerProfile?.category_affinity, visitorProfile?.category_affinity);
            const brands = mergeAffinity(customerProfile?.brand_affinity, visitorProfile?.brand_affinity);
            await trx
                .table("personalization_profiles")
                .insert({
                    tenant_id: currentTenantId(),
                    subject_type: "customer",
                    subject_id: String(customerId),
                    recent_product_ids: JSON.stringify(recent),
                    category_affinity: JSON.stringify(categories),
                    brand_affinity: JSON.stringify(brands),
                    version: Number(customerProfile?.version ?? 0) + 1,
                    created_at: customerProfile?.created_at ?? now,
                    updated_at: now,
                })
                .onConflict(["tenant_id", "subject_type", "subject_id"])
                .merge({
                    recent_product_ids: JSON.stringify(recent),
                    category_affinity: JSON.stringify(categories),
                    brand_affinity: JSON.stringify(brands),
                    version: Number(customerProfile?.version ?? 0) + 1,
                    updated_at: now,
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
            merged_at: now,
        });
        await trx.from("personalization_profiles").where("subject_type", "visitor").where("subject_id", visitorId).delete();
        return { merged: true, deduplicated: false };
    }

    async getPreferences(subject: Subject) {
        const row = await currentTrx()
            .from("personalization_preferences")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .first();
        return (
            row ?? {
                subject_type: subject.type,
                subject_id: subject.id,
                hidden_product_ids: [],
                hidden_category_ids: [],
                show_less_topics: [],
            }
        );
    }

    async updatePreferences(subject: Subject, input: Record<string, unknown>) {
        const now = DateTime.utc().toSQL();
        const hiddenProducts = uniqueIds(Array.isArray(input.hidden_product_ids) ? input.hidden_product_ids.map(Number) : []);
        const hiddenCategories = uniqueIds(Array.isArray(input.hidden_category_ids) ? input.hidden_category_ids.map(Number) : []);
        const showLessTopics = Array.isArray(input.show_less_topics) ? input.show_less_topics.map(String).slice(0, 50) : [];
        await currentTrx()
            .table("personalization_preferences")
            .insert({
                tenant_id: currentTenantId(),
                subject_type: subject.type,
                subject_id: subject.id,
                hidden_product_ids: JSON.stringify(hiddenProducts),
                hidden_category_ids: JSON.stringify(hiddenCategories),
                show_less_topics: JSON.stringify(showLessTopics),
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "subject_type", "subject_id"])
            .merge({
                hidden_product_ids: JSON.stringify(hiddenProducts),
                hidden_category_ids: JSON.stringify(hiddenCategories),
                show_less_topics: JSON.stringify(showLessTopics),
                updated_at: now,
            });
        return this.getPreferences(subject);
    }

    async resetSubject(subject: Subject) {
        const trx = currentTrx();
        await trx.from("personalization_profiles").where("subject_type", subject.type).where("subject_id", subject.id).delete();
        await trx
            .from("personalization_preferences")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .delete();
        if (subject.type === "visitor") {
            await trx.from("personalization_events").where("visitor_id", subject.id).delete();
            await trx.from("personalization_identity_merges").where("visitor_id", subject.id).delete();
        } else {
            await trx.from("personalization_events").where("customer_id", Number(subject.id)).delete();
        }
        return { reset: true };
    }
}

function ids(value: unknown): number[] {
    return Array.isArray(value) ? value.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
}
function uniqueIds(value: number[]) {
    return [...new Set(value.filter((id) => Number.isInteger(id) && id > 0))];
}
function asRecord(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, Number(val) || 0]));
}
function mergeAffinity(first: unknown, second: unknown) {
    const out: Record<string, number> = { ...asRecord(first) };
    for (const [key, value] of Object.entries(asRecord(second))) out[key] = Math.min(100, (out[key] ?? 0) + value);
    return out;
}
