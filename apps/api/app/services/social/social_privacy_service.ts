import { randomUUID } from "node:crypto";
import ConfigurationEngineService from "#services/configuration_engine_service";
import { currentTrx } from "#services/tenant_context";
function valueFromGroup(group: any, key: string, fallback: unknown) {
    const found = group.definitions?.find((x: any) => x.definition?.key === key);
    return found?.value ?? fallback;
}
export class SocialPrivacyService {
    async retentionDays() {
        const group = await new ConfigurationEngineService().group("privacy");
        return Number(valueFromGroup(group, "privacy.retention_days", 365));
    }
    async eraseCustomer(customerId: number) {
        const customer = await currentTrx().from("customers").where("id", customerId).first();
        if (!customer) return { data: { customer_id: customerId, changed: false } };
        const userId = customer.user_id ? Number(customer.user_id) : null;
        const ownerRef = `privacy-erased:${randomUUID()}`;
        const events = await currentTrx().from("social_interaction_events").where("customer_id", customerId).select("id");
        await currentTrx()
            .from("social_interaction_events")
            .where("customer_id", customerId)
            .update({
                customer_id: null,
                anonymous_id: randomUUID(),
                actor_type: "anonymous",
                actor_ref: ownerRef,
                privacy_classification: "pseudonymous",
            });
        await currentTrx().from("social_follow_edges").where("follower_customer_id", customerId).delete();
        await currentTrx().from("social_channel_memberships").where("customer_id", customerId).delete();
        const reports = await currentTrx().from("product_review_reports").where("customer_id", customerId).select("id");
        for (const report of reports)
            await currentTrx()
                .from("product_review_reports")
                .where("id", report.id)
                .update({ customer_id: null, anonymous_id: randomUUID() });
        await currentTrx()
            .from("social_messages")
            .where("author_customer_id", customerId)
            .update({
                author_customer_id: null,
                author_user_id: null,
                kind: "system",
                body: "[privacy-erased]",
                moderation_state: "removed",
            });
        if (userId)
            await currentTrx()
                .from("social_messages")
                .where("author_user_id", userId)
                .update({ author_user_id: null, kind: "system", body: "[privacy-erased]", moderation_state: "removed" });
        const media = await currentTrx()
            .from("social_media_assets")
            .where("owner_actor_type", "customer")
            .where("owner_actor_ref", String(customerId))
            .select("media_id");
        const mediaIds = media.map((x) => Number(x.media_id));
        await currentTrx()
            .from("social_media_assets")
            .where("owner_actor_type", "customer")
            .where("owner_actor_ref", String(customerId))
            .update({
                owner_actor_ref: ownerRef,
                metadata: JSON.stringify({ privacy_erased: true, pseudonymous_owner: ownerRef }),
                updated_at: new Date(),
            });
        if (mediaIds.length)
            await currentTrx()
                .from("media_rights")
                .whereIn("media_id", mediaIds)
                .update({ holder_ref: null, evidence: JSON.stringify({ privacy_erased: true }), updated_at: new Date() });
        await currentTrx()
            .from("social_commerce_attributions")
            .where("customer_id", customerId)
            .update({ customer_id: null, metadata: JSON.stringify({ privacy_erased: true }) });
        return {
            data: {
                customer_id: customerId,
                changed: true,
                event_rows_unlinked: events.length,
                report_rows_unlinked: reports.length,
                media_records: mediaIds.length,
            },
        };
    }
    async sweep(retentionDays: number, limit = 100) {
        const safeDays = Math.max(1, Math.min(3650, Math.floor(retentionDays)));
        const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        const cutoff = new Date(Date.now() - safeDays * 86_400_000);
        const rows = await currentTrx()
            .from("customers")
            .whereNotNull("deleted_at")
            .where("deleted_at", "<=", cutoff)
            .orderBy("deleted_at")
            .limit(safeLimit)
            .select("id");
        let erased = 0;
        for (const row of rows) if ((await this.eraseCustomer(Number(row.id))).data.changed) erased += 1;
        return { data: { retention_days: safeDays, cutoff: cutoff.toISOString(), processed: rows.length, erased } };
    }
    async eraseDueCustomers(limit = 100) {
        return this.sweep(await this.retentionDays(), limit);
    }
}
export const socialPrivacyService = new SocialPrivacyService();
