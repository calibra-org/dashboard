import { Exception } from "@adonisjs/core/exceptions";
import ConfigurationEngineService from "#services/configuration_engine_service";
import { supportTicketService } from "#services/support/ticket_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { socialEventService } from "#services/social/social_event_service";
import { socialSearchService } from "#services/social/social_search_service";
import { socialVideoProvider } from "#services/social/social_video_provider";

type Row = Record<string, unknown>;
type ContentStatus = "draft" | "review" | "scheduled" | "published" | "expired" | "archived" | "highlight";
const CONTENT_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
    draft: ["review", "scheduled", "archived"],
    review: ["draft", "scheduled", "published", "archived"],
    scheduled: ["draft", "published", "archived"],
    published: ["expired", "archived", "highlight"],
    expired: ["archived", "highlight"],
    archived: ["draft", "highlight"],
    highlight: ["expired", "archived", "published"],
};
function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}
function jsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            const v = JSON.parse(value) as unknown;
            return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function serialize(row: Row): Row {
    const result: Row = { ...row };
    for (const key of Object.keys(result)) {
        if (key === "id" || key.endsWith("_id") || key === "version") {
            if (result[key] !== null && result[key] !== undefined) result[key] = numberValue(result[key]);
        }
    }
    for (const key of ["metadata", "audience", "rights_metadata", "cta", "evidence"])
        if (key in result) result[key] = jsonObject(result[key]);
    return result;
}
function sanitizeUgc(input: string): string {
    return input
        .replace(/<[^>]*>/g, "")
        .replace(/javascript:/gi, "")
        .replace(/data:text\/html/gi, "")
        .trim();
}
function cfg(group: any, key: string, fallback: unknown) {
    return group.definitions?.find((x: any) => x.definition?.key === key)?.value ?? fallback;
}
export function ensureId(value: unknown, code = "E_SOCIAL_INVALID_ID"): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new Exception("Invalid social identifier", { status: 422, code });
    return id;
}
export async function customerForUser(userId: number) {
    const row = await currentTrx().from("customers").where("user_id", userId).whereNull("deleted_at").first();
    if (!row) throw new Exception("Customer profile required", { status: 403, code: "E_SOCIAL_CUSTOMER_REQUIRED" });
    return row;
}
async function ensureContent(id: number) {
    const row = await currentTrx().from("social_contents").where("id", id).first();
    if (!row) throw new Exception("Social content not found", { status: 404, code: "E_SOCIAL_CONTENT_NOT_FOUND" });
    return row;
}
async function ensureMedia(mediaId?: number | null, expectedMimePrefix?: string) {
    if (!mediaId) return null;
    const media = await currentTrx().from("media").where("id", mediaId).first();
    if (!media) throw new Exception("Canonical media not found", { status: 422, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
    if (expectedMimePrefix && !String(media.mime ?? "").startsWith(expectedMimePrefix))
        throw new Exception(`Media must be ${expectedMimePrefix}`, { status: 422, code: "E_SOCIAL_MEDIA_MIME" });
    return media;
}
async function ensureProduct(productId: number) {
    const product = await currentTrx()
        .from("products")
        .where("id", productId)
        .where("status", "publish")
        .whereNull("deleted_at")
        .first();
    if (!product) throw new Exception("Canonical product not found", { status: 422, code: "E_SOCIAL_PRODUCT_NOT_FOUND" });
    return product;
}

export class SocialCommerceService {
    private async resolvedPolicy() {
        const engine = new ConfigurationEngineService();
        const [community, media] = await Promise.all([engine.group("community"), engine.group("media")]);
        return {
            story_rail_enabled: Boolean(cfg(community, "community.social_story_rail_enabled", true)),
            discover_enabled: Boolean(cfg(community, "community.social_discover_enabled", true)),
            live_enabled: Boolean(cfg(community, "community.social_live_enabled", false)),
            live_provider_enabled: Boolean(cfg(community, "community.social_live_provider_enabled", false)),
            live_emergency_off: Boolean(cfg(community, "community.social_live_emergency_off", false)),
            moderation_emergency_mode: Boolean(cfg(community, "community.social_moderation_emergency_mode", false)),
            moderation_required: Boolean(cfg(community, "community.moderation_required", true)),
            max_video_seconds: numberValue(cfg(media, "media.social_max_video_seconds", 900)),
        };
    }

    async listContent(input: { q?: string; kind?: string; status?: string; limit?: number; page?: number } = {}) {
        const limit = Math.max(1, Math.min(100, input.limit ?? 50));
        const page = Math.max(1, input.page ?? 1);
        let query = currentTrx().from("social_contents");
        if (input.q)
            query = query.where((b) => b.whereILike("title", `%${input.q}%`).orWhereILike("description", `%${input.q}%`));
        if (input.kind) query = query.where("kind", input.kind);
        if (input.status) query = query.where("status", input.status);
        const rows = await query
            .orderBy("updated_at", "desc")
            .limit(limit)
            .offset((page - 1) * limit);
        return { data: rows.map((x) => serialize(x as Row)), meta: { page, limit, total: rows.length } };
    }
    async findContent(id: number) {
        const row = await ensureContent(id);
        const [frames, markers] = await Promise.all([
            currentTrx().from("social_story_frames").where("content_id", id).orderBy("sequence"),
            this.productMarkers(id),
        ]);
        return { data: { ...serialize(row as Row), frames: frames.map((x) => serialize(x as Row)), product_markers: markers } };
    }
    async createContent(
        input: {
            kind: string;
            title: string;
            description?: string | null;
            locale?: string;
            market?: string | null;
            primary_media_id?: number | null;
            cover_media_id?: number | null;
            audience?: Record<string, unknown>;
            rights_metadata?: Record<string, unknown>;
            metadata?: Record<string, unknown>;
            aspect_ratio?: string | null;
            duration_seconds?: number | null;
            publish_at?: Date | null;
            expires_at?: Date | null;
        },
        actorUserId: number,
    ) {
        await ensureMedia(input.cover_media_id, input.cover_media_id ? "image/" : undefined);
        await ensureMedia(
            input.primary_media_id,
            input.primary_media_id && ["video", "live"].includes(String(input.kind)) ? "video/" : undefined,
        );
        const policy = await this.resolvedPolicy();
        if (input.duration_seconds && input.duration_seconds > policy.max_video_seconds)
            throw new Exception("Video duration beyond Configuration OS policy", {
                status: 422,
                code: "E_SOCIAL_VIDEO_DURATION",
            });
        const [row] = await currentTrx()
            .table("social_contents")
            .insert({
                kind: input.kind,
                status: "draft",
                title: sanitizeUgc(input.title),
                description: input.description ? sanitizeUgc(input.description) : null,
                locale: input.locale ?? "fa",
                market: input.market ?? null,
                primary_media_id: input.primary_media_id ?? null,
                cover_media_id: input.cover_media_id ?? null,
                audience: JSON.stringify(input.audience ?? { visibility: "public" }),
                rights_metadata: JSON.stringify(input.rights_metadata ?? {}),
                metadata: JSON.stringify(input.metadata ?? {}),
                aspect_ratio: input.aspect_ratio ?? null,
                duration_seconds: input.duration_seconds ?? null,
                publish_at: input.publish_at ?? null,
                expires_at: input.expires_at ?? null,
                moderation_state: policy.moderation_required ? "pending_review" : "approved",
                created_by_user_id: actorUserId,
            })
            .returning("*");
        if (policy.moderation_required) await this.ensureEditorialCase(Number(row.id));
        return { data: serialize(row as Row) };
    }
    async updateContent(id: number, input: Record<string, unknown> & { expected_version: number }) {
        const current = await ensureContent(id);
        if (input.cover_media_id !== undefined)
            await ensureMedia(numberOrNull(input.cover_media_id), input.cover_media_id ? "image/" : undefined);
        if (input.primary_media_id !== undefined)
            await ensureMedia(
                numberOrNull(input.primary_media_id),
                input.primary_media_id && ["video", "live"].includes(String(current.kind)) ? "video/" : undefined,
            );
        if (numberValue(current.version) !== input.expected_version)
            throw new Exception("Social content changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        const allowed = [
            "title",
            "description",
            "locale",
            "market",
            "cover_media_id",
            "primary_media_id",
            "audience",
            "rights_metadata",
            "metadata",
            "experiment_variant",
            "aspect_ratio",
            "duration_seconds",
            "publish_at",
            "expires_at",
        ];
        const patch: Record<string, unknown> = { version: input.expected_version + 1, updated_at: new Date() };
        for (const key of allowed)
            if (input[key] !== undefined)
                patch[key] = ["audience", "rights_metadata", "metadata"].includes(key)
                    ? JSON.stringify(input[key] ?? {})
                    : ["title", "description"].includes(key) && typeof input[key] === "string"
                      ? sanitizeUgc(String(input[key]))
                      : input[key];
        const [row] = await currentTrx()
            .from("social_contents")
            .where("id", id)
            .where("version", input.expected_version)
            .update(patch)
            .returning("*");
        if (!row) throw new Exception("Social content changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        await socialSearchService.syncContent(id);
        return { data: serialize(row as Row) };
    }
    private async assertPublicationReady(content: Row) {
        const contentId = numberValue(content.id);
        const kind = String(content.kind);
        if (kind === "video") {
            const mediaId = numberOrNull(content.primary_media_id);
            if (!mediaId)
                throw new Exception("Video content requires a primary media asset before publication", {
                    status: 422,
                    code: "E_SOCIAL_PRIMARY_MEDIA_REQUIRED",
                });
            const media = await currentTrx()
                .from("media as media")
                .innerJoin("social_media_assets as asset", "asset.media_id", "media.id")
                .where("media.id", mediaId)
                .select("media.processing_state", "asset.upload_state")
                .first();
            if (!media || String(media.processing_state) !== "publishable" || String(media.upload_state) !== "publishable")
                throw new Exception("Video media must pass processing, rights and publication gates", {
                    status: 422,
                    code: "E_SOCIAL_MEDIA_NOT_PUBLISHABLE",
                });
        }
        if (kind === "story") {
            const blockedFrame = await currentTrx()
                .from("social_story_frames as frame")
                .innerJoin("social_media_assets as asset", "asset.media_id", "frame.media_id")
                .innerJoin("media as media", "media.id", "frame.media_id")
                .where("frame.content_id", contentId)
                .where((query) =>
                    query.whereNot("asset.upload_state", "publishable").orWhereNot("media.processing_state", "publishable"),
                )
                .select("frame.id")
                .first();
            if (blockedFrame)
                throw new Exception("Story media must pass processing and rights gates before publication", {
                    status: 422,
                    code: "E_SOCIAL_STORY_MEDIA_NOT_PUBLISHABLE",
                });
        }
        if (kind === "live") {
            const live = await currentTrx()
                .from("social_live_sessions")
                .where("content_id", contentId)
                .orderBy("id", "desc")
                .first();
            if (!live || !["ready", "starting", "live"].includes(String(live.status)))
                throw new Exception("Live content requires a provisioned live session before publication", {
                    status: 422,
                    code: "E_SOCIAL_LIVE_NOT_READY",
                });
        }
    }
    async transitionContent(id: number, expectedVersion: number, status: ContentStatus) {
        const current = await ensureContent(id);
        if (numberValue(current.version) !== expectedVersion)
            throw new Exception("Social content changed by another operator", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        const from = String(current.status) as ContentStatus;
        if (!CONTENT_TRANSITIONS[from]?.includes(status))
            throw new Exception(`Invalid social content transition ${from} -> ${status}`, {
                status: 422,
                code: "E_SOCIAL_STATUS_TRANSITION",
            });
        if (["published", "highlight"].includes(status) && String(current.moderation_state) !== "approved")
            throw new Exception("Content must be approved before publication", {
                status: 422,
                code: "E_SOCIAL_MODERATION_REQUIRED",
            });
        if (["published", "highlight"].includes(status)) await this.assertPublicationReady(current as Row);
        if (status === "scheduled" && !current.publish_at)
            throw new Exception("Scheduled content requires publish_at", { status: 422, code: "E_SOCIAL_PUBLISH_AT_REQUIRED" });
        const now = new Date();
        const patch: Record<string, unknown> = { status, version: expectedVersion + 1, updated_at: now };
        if (status === "published" || status === "highlight") patch.published_at = current.published_at ?? now;
        if (status === "archived") patch.archived_at = now;
        const [row] = await currentTrx()
            .from("social_contents")
            .where("id", id)
            .where("version", expectedVersion)
            .update(patch)
            .returning("*");
        if (!row)
            throw new Exception("Social content changed by another operator", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        await socialSearchService.syncContent(id);
        return this.findContent(id);
    }
    private async ensureEditorialCase(contentId: number) {
        let item = await currentTrx()
            .from("social_moderation_cases")
            .where("target_type", "content")
            .where("target_id", contentId)
            .where("category", "editorial_review")
            .first();
        if (!item)
            [item] = await currentTrx()
                .table("social_moderation_cases")
                .insert({
                    target_type: "content",
                    target_id: contentId,
                    category: "editorial_review",
                    status: "pending_review",
                    reason: "editorial_review",
                })
                .returning("*");
        return Number(item.id);
    }
    async addFrame(
        contentId: number,
        input: {
            sequence: number;
            frame_type: string;
            media_id?: number | null;
            product_id?: number | null;
            duration_ms?: number;
            cta_label?: string | null;
            cta_url?: string | null;
            payload?: Record<string, unknown>;
        },
    ) {
        const content = await ensureContent(contentId);
        if (String(content.kind) !== "story")
            throw new Exception("Frames are only valid for stories", { status: 422, code: "E_SOCIAL_FRAME_KIND" });
        await ensureMedia(
            input.media_id,
            input.frame_type === "image" ? "image/" : input.frame_type === "video" ? "video/" : undefined,
        );
        if (input.product_id) await ensureProduct(input.product_id);
        const [row] = await currentTrx()
            .table("social_story_frames")
            .insert({
                content_id: contentId,
                sequence: input.sequence,
                frame_type: input.frame_type,
                media_id: input.media_id ?? null,
                product_id: input.product_id ?? null,
                duration_ms: input.duration_ms ?? 5000,
                cta_label: input.cta_label ?? null,
                cta_url: input.cta_url ?? null,
                payload: JSON.stringify(input.payload ?? {}),
            })
            .returning("*");
        return { data: serialize(row as Row) };
    }
    async addProductMarker(
        contentId: number,
        input: { product_id: number; timestamp_ms?: number; label?: string | null; metadata?: Record<string, unknown> },
    ) {
        const content = await ensureContent(contentId);
        if (!["story", "video", "live"].includes(String(content.kind)))
            throw new Exception("Product markers require story, video or live content", {
                status: 422,
                code: "E_SOCIAL_MARKER_KIND",
            });
        await ensureProduct(input.product_id);
        const [row] = await currentTrx()
            .table("social_product_markers")
            .insert({
                content_id: contentId,
                product_id: input.product_id,
                timestamp_ms: input.timestamp_ms ?? 0,
                label: input.label ?? null,
                metadata: JSON.stringify(input.metadata ?? {}),
            })
            .returning("*");
        await socialSearchService.syncContent(contentId);
        return { data: serialize(row as Row) };
    }

    private async productMarkers(contentId: number) {
        const rows = await currentTrx()
            .from("social_product_markers as m")
            .leftJoin("products as p", "p.id", "m.product_id")
            .leftJoin("product_translations as pt", function () {
                this.on("pt.product_id", "p.id").andOnVal("pt.locale", "fa");
            })
            .select("m.*", "p.regular_price", "p.sale_price", "p.status as product_status", "pt.name as product_name")
            .where("m.content_id", contentId)
            .orderBy("m.timestamp_ms");
        const ids = rows.map((r) => Number(r.product_id));
        const inventory = ids.length
            ? await currentTrx()
                  .from("inventory_items as ii")
                  .whereIn("ii.product_id", ids)
                  .select("ii.product_id", "ii.stock_status", "ii.stock_quantity")
            : [];
        return rows.map((row) => ({
            ...serialize(row as Row),
            product: {
                id: Number(row.product_id),
                name: row.product_name ?? null,
                regular_price: row.regular_price ?? null,
                sale_price: row.sale_price ?? null,
                status: row.product_status,
                stock_status: inventory.find((x) => Number(x.product_id) === Number(row.product_id))?.stock_status ?? null,
                stock_quantity: inventory.find((x) => Number(x.product_id) === Number(row.product_id))?.stock_quantity ?? null,
                source: "catalog_inventory_live",
            },
        }));
    }

    async storyRail(locale = "fa", limit = 16) {
        const policy = await this.resolvedPolicy();
        if (!policy.story_rail_enabled) return { data: [], meta: { enabled: false } };
        const rows = await currentTrx()
            .from("social_contents")
            .where("kind", "story")
            .whereIn("status", ["published", "highlight"])
            .where("moderation_state", "approved")
            .where((q) => q.whereNull("publish_at").orWhere("publish_at", "<=", new Date()))
            .where((q) => q.whereNull("expires_at").orWhere("expires_at", ">", new Date()))
            .whereIn("locale", [...new Set([locale, "fa"])])
            .orderByRaw("CASE WHEN status = 'highlight' THEN 0 ELSE 1 END")
            .orderBy("published_at", "desc")
            .limit(Math.max(1, Math.min(40, limit)));
        const data = [];
        for (const row of rows)
            data.push({ ...serialize(row as Row), product_markers: await this.productMarkers(Number(row.id)) });
        return { data, meta: { enabled: true, source: "first_party_social" } };
    }
    async discover(input: { tab?: string; page?: number; limit?: number; locale?: string; customer_id?: number | null } = {}) {
        const policy = await this.resolvedPolicy();
        if (!policy.discover_enabled) return { data: [], meta: { enabled: false } };
        const tab = input.tab ?? "latest";
        const page = Math.max(1, input.page ?? 1);
        const limit = Math.max(1, Math.min(40, input.limit ?? 24));
        let query = currentTrx()
            .from("social_contents as c")
            .whereIn("c.status", ["published", "highlight"])
            .where("c.moderation_state", "approved")
            .where((b) => b.whereNull("c.expires_at").orWhere("c.expires_at", ">", new Date()));
        if (input.locale) query = query.where("c.locale", input.locale);
        if (tab === "live") query = query.where("c.kind", "live");
        if (tab === "questions") query = query.where("c.kind", "question");
        if (tab === "tutorials") query = query.whereRaw("c.metadata->>'category' = ?", ["tutorial"]);
        if (tab === "reviews") query = query.whereRaw("c.metadata->>'category' = ?", ["review"]);
        if (tab === "deals") query = query.whereRaw("c.metadata->>'category' = ?", ["deal"]);
        if (tab === "following") {
            if (!input.customer_id)
                return { data: [], meta: { page, limit, total: 0, ranking_state: "requires_authenticated_follow_graph" } };
            query = query.whereExists((builder) => {
                builder
                    .select(currentTrx().raw("1"))
                    .from("social_follow_edges as f")
                    .where("f.follower_customer_id", input.customer_id as number)
                    .whereRaw(
                        "(f.subject_type IN ('creator','user') AND f.subject_ref = c.created_by_user_id::text) OR (f.subject_type = 'series' AND f.subject_ref = c.metadata->>'series') OR (f.subject_type = 'brand' AND f.subject_ref = c.metadata->>'brand') OR (f.subject_type = 'category' AND f.subject_ref = c.metadata->>'category') OR (f.subject_type = 'topic' AND f.subject_ref = c.metadata->>'topic')",
                    );
            });
        }
        if (tab === "trending")
            query = query
                .select("c.*")
                .orderByRaw(
                    "(SELECT COUNT(*) FROM social_interaction_events AS e WHERE e.content_id = c.id AND e.occurred_at >= NOW() - INTERVAL '7 days') DESC",
                );
        else query = query.select("c.*").orderBy("c.published_at", "desc");
        const rows = await query.limit(limit).offset((page - 1) * limit);
        const data = [];
        for (const row of rows)
            data.push({ ...serialize(row as Row), product_markers: await this.productMarkers(Number(row.id)) });
        return {
            data,
            meta: {
                page,
                limit,
                tab,
                ranking_state: tab === "for_you" ? "phase8_baseline_no_personalization" : "deterministic_phase8",
                future_consumer: "Commerce OS Phase 9 Personalization",
            },
        };
    }

    async follow(userId: number, input: { subject_type: string; subject_ref: string; following?: boolean }) {
        const customer = await customerForUser(userId);
        if (input.following === false) {
            await currentTrx()
                .from("social_follow_edges")
                .where({ follower_customer_id: customer.id, subject_type: input.subject_type, subject_ref: input.subject_ref })
                .delete();
            return { data: { following: false } };
        }
        const [row] = await currentTrx()
            .table("social_follow_edges")
            .insert({ follower_customer_id: customer.id, subject_type: input.subject_type, subject_ref: input.subject_ref })
            .onConflict(["tenant_id", "follower_customer_id", "subject_type", "subject_ref"])
            .ignore()
            .returning("*");
        return { data: { ...(row ? serialize(row as Row) : {}), following: true } };
    }
    async recordInteraction(input: {
        user_id?: number | null;
        anonymous_id?: string | null;
        content_id?: number | null;
        product_id?: number | null;
        marker_id?: number | null;
        event_type: string;
        source_surface: string;
        position_ms?: number | null;
        watch_ms?: number | null;
        metadata?: Record<string, unknown>;
        event_id?: string;
        session_id?: string | null;
        correlation_id?: string | null;
        causation_id?: string | null;
        consent_context?: string | null;
        dedupe_key?: string | null;
    }) {
        let customerId: number | null = null;
        if (input.user_id) customerId = numberValue((await customerForUser(input.user_id)).id);
        if (!customerId && !input.anonymous_id)
            throw new Exception("Interaction actor is required", { status: 422, code: "E_SOCIAL_ACTOR_REQUIRED" });
        if (input.content_id) await ensureContent(input.content_id);
        if (input.product_id) await ensureProduct(input.product_id);
        if (input.marker_id) {
            const marker = await currentTrx().from("social_product_markers").where("id", input.marker_id).first();
            if (!marker) throw new Exception("Product marker not found", { status: 422, code: "E_SOCIAL_MARKER_INVALID" });
            if (input.content_id && numberValue(marker.content_id) !== input.content_id) {
                throw new Exception("Marker does not belong to content", { status: 422, code: "E_SOCIAL_MARKER_CONTENT" });
            }
        }
        const result = await socialEventService.record({
            customerId,
            anonymousId: customerId ? null : (input.anonymous_id ?? null),
            contentId: input.content_id ?? null,
            productId: input.product_id ?? null,
            markerId: input.marker_id ?? null,
            eventType: input.event_type,
            sourceSurface: input.source_surface,
            positionMs: input.position_ms ?? null,
            watchMs: input.watch_ms ?? null,
            metadata: input.metadata ?? {},
            eventId: input.event_id,
            sessionId: input.session_id ?? null,
            correlationId: input.correlation_id ?? null,
            causationId: input.causation_id ?? null,
            consentContext: input.consent_context ?? null,
            dedupeKey: input.dedupe_key ?? null,
        });
        return { data: serialize(result.data as Row), replayed: result.replayed, envelope: result.envelope ?? null };
    }

    async recordAttribution(input: {
        order_id: number;
        customer_id?: number | null;
        content_id?: number | null;
        marker_id?: number | null;
        interaction_event_id?: number | null;
        source_surface: string;
        position_ms?: number | null;
        metadata?: Record<string, unknown>;
    }) {
        const order = await currentTrx().from("orders").where("id", input.order_id).first();
        if (!order) throw new Exception("Canonical order not found", { status: 422, code: "E_SOCIAL_ORDER_NOT_FOUND" });
        const [row] = await currentTrx()
            .table("social_commerce_attributions")
            .insert({ ...input, metadata: JSON.stringify(input.metadata ?? {}) })
            .onConflict(["tenant_id", "order_id", "source_surface"])
            .merge({
                content_id: input.content_id ?? null,
                marker_id: input.marker_id ?? null,
                interaction_event_id: input.interaction_event_id ?? null,
                position_ms: input.position_ms ?? null,
                metadata: JSON.stringify(input.metadata ?? {}),
            })
            .returning("*");
        await socialEventService.record({
            eventType: "purchase",
            customerId: input.customer_id ?? null,
            contentId: input.content_id ?? null,
            markerId: input.marker_id ?? null,
            sourceSurface: input.source_surface,
            metadata: { order_id: input.order_id },
        });
        return { data: serialize(row as Row) };
    }

    async createChannel(input: {
        name: string;
        slug: string;
        kind?: string;
        visibility?: string;
        metadata?: Record<string, unknown>;
    }) {
        const [row] = await currentTrx()
            .table("social_channels")
            .insert({
                name: sanitizeUgc(input.name),
                slug: input.slug.toLowerCase(),
                kind: input.kind ?? "discussion",
                visibility: input.visibility ?? "public",
                metadata: JSON.stringify(input.metadata ?? {}),
            })
            .returning("*");
        return { data: serialize(row as Row) };
    }
    async setChannelMembership(
        channelId: number,
        input: { customer_id?: number | null; user_id?: number | null; role: string; status?: string },
    ) {
        const channel = await currentTrx().from("social_channels").where("id", channelId).first();
        if (!channel) throw new Exception("Channel not found", { status: 404, code: "E_SOCIAL_CHANNEL_NOT_FOUND" });
        const [row] = await currentTrx()
            .table("social_channel_memberships")
            .insert({
                channel_id: channelId,
                customer_id: input.customer_id ?? null,
                user_id: input.user_id ?? null,
                role: input.role,
                status: input.status ?? "active",
            })
            .returning("*");
        return { data: serialize(row as Row) };
    }
    async listVisibleChannels(userId: number) {
        const customer = await customerForUser(userId);
        const rows = await currentTrx()
            .from("social_channels as c")
            .leftJoin("social_channel_memberships as m", function () {
                this.on("m.channel_id", "c.id").andOnVal("m.customer_id", customer.id).andOnVal("m.status", "active");
            })
            .where((b) => b.where("c.visibility", "public").orWhereNotNull("m.id"))
            .select("c.*", "m.role as membership_role")
            .orderBy("c.name");
        return { data: rows.map((x) => serialize(x as Row)) };
    }
    async listMyThreads(userId: number) {
        const customer = await customerForUser(userId);
        const rows = await currentTrx()
            .from("social_threads")
            .where("customer_id", customer.id)
            .orderBy("last_message_at", "desc");
        return { data: rows.map((x) => serialize(x as Row)) };
    }
    async listThreads(input: { status?: string; kind?: string; limit?: number } = {}) {
        let q = currentTrx().from("social_threads");
        if (input.status) q = q.where("status", input.status);
        if (input.kind) q = q.where("kind", input.kind);
        const rows = await q.orderBy("last_message_at", "desc").limit(Math.max(1, Math.min(100, input.limit ?? 100)));
        return { data: rows.map((x) => serialize(x as Row)) };
    }
    async createThread(
        userId: number,
        input: { kind: string; subject: string; channel_id?: number | null; content_id?: number | null; message?: string | null },
    ) {
        const customer = await customerForUser(userId);
        const [row] = await currentTrx()
            .table("social_threads")
            .insert({
                customer_id: customer.id,
                kind: input.kind,
                subject: sanitizeUgc(input.subject),
                channel_id: input.channel_id ?? null,
                content_id: input.content_id ?? null,
            })
            .returning("*");
        if (input.message) await this.addCustomerMessage(userId, Number(row.id), input.message);
        return { data: serialize(row as Row) };
    }
    async addCustomerMessage(userId: number, threadId: number, body: string, mediaIds: number[] = []) {
        const customer = await customerForUser(userId);
        const thread = await currentTrx().from("social_threads").where("id", threadId).where("customer_id", customer.id).first();
        if (!thread) throw new Exception("Conversation not found", { status: 404, code: "E_SOCIAL_THREAD_NOT_FOUND" });
        const clean = sanitizeUgc(body);
        if (!clean) throw new Exception("Message is empty", { status: 422, code: "E_SOCIAL_MESSAGE_EMPTY" });
        for (const mediaId of mediaIds) {
            const media = await currentTrx()
                .from("social_media_assets as asset")
                .innerJoin("media", "media.id", "asset.media_id")
                .where("asset.media_id", mediaId)
                .where("asset.purpose", "message")
                .whereIn("media.access_policy", ["members", "private", "signed"])
                .where("media.processing_state", "publishable")
                .first();
            if (!media)
                throw new Exception("Conversation attachment violates purpose/access policy", {
                    status: 422,
                    code: "E_SOCIAL_MESSAGE_MEDIA_POLICY",
                });
        }
        const [row] = await currentTrx()
            .table("social_messages")
            .insert({
                thread_id: threadId,
                author_customer_id: customer.id,
                kind: "message",
                body: clean,
                metadata: JSON.stringify(mediaIds.length ? { attachments: mediaIds } : {}),
            })
            .returning("*");
        for (const [sequence, mediaId] of mediaIds.entries())
            await currentTrx().table("social_message_media").insert({ message_id: row.id, media_id: mediaId, sequence });
        await currentTrx()
            .from("social_threads")
            .where("id", threadId)
            .update({ last_message_at: new Date(), updated_at: new Date() });
        return {
            data: {
                ...serialize(row as Row),
                attachment_reference: mediaIds.length ? `[attachments:${mediaIds.join(",")}]` : null,
            },
        };
    }
    async addAdminMessage(threadId: number, userId: number, body: string) {
        const thread = await currentTrx().from("social_threads").where("id", threadId).first();
        if (!thread) throw new Exception("Conversation not found", { status: 404, code: "E_SOCIAL_THREAD_NOT_FOUND" });
        const [row] = await currentTrx()
            .table("social_messages")
            .insert({ thread_id: threadId, author_user_id: userId, kind: "message", body: sanitizeUgc(body) })
            .returning("*");
        await currentTrx().from("social_threads").where("id", threadId).update({ last_message_at: new Date() });
        return { data: serialize(row as Row) };
    }
    async convertThreadToTicket(threadId: number, actorUserId: number) {
        const thread = await currentTrx().from("social_threads").where("id", threadId).forUpdate().first();
        if (!thread) throw new Exception("Conversation not found", { status: 404, code: "E_SOCIAL_THREAD_NOT_FOUND" });
        if (thread.converted_ticket_id) return { data: { ticket_id: Number(thread.converted_ticket_id), changed: false } };
        const customer = thread.customer_id
            ? await currentTrx()
                  .from("customers as c")
                  .leftJoin("users as u", "u.id", "c.user_id")
                  .where("c.id", thread.customer_id)
                  .select("c.*", "u.email as user_email")
                  .first()
            : null;
        const messages = await currentTrx().from("social_messages").where("thread_id", threadId).orderBy("created_at");
        const transcript = messages
            .map((m) => `${m.kind}: ${m.body}`)
            .join("\n")
            .slice(0, 10000);
        const ticket = await supportTicketService.create(
            {
                customer_id: thread.customer_id ? Number(thread.customer_id) : null,
                requester_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : "Social customer",
                requester_email: customer?.user_email ?? null,
                requester_phone: customer?.phone ?? null,
                subject: String(thread.subject),
                message: `${transcript}\n\n[social-thread:${threadId}]`,
                channel: "web",
                category: "social_commerce",
                tags: ["social_commerce", `social_thread_${threadId}`],
            },
            actorUserId,
        );
        const ticketId = Number(ticket.data.id);
        await currentTrx()
            .from("social_threads")
            .where("id", threadId)
            .update({
                converted_ticket_id: ticketId,
                status: "converted_to_ticket",
                version: numberValue(thread.version) + 1,
                updated_at: new Date(),
            });
        return { data: { ticket_id: ticketId, ticket_reference: ticket.data.reference, changed: true } };
    }

    async report(
        userId: number,
        input: {
            target_type: string;
            target_id: number;
            category: string;
            reason?: string | null;
            evidence?: Record<string, unknown>;
        },
    ) {
        const customer = await customerForUser(userId);
        const [row] = await currentTrx()
            .table("social_moderation_cases")
            .insert({
                target_type: input.target_type,
                target_id: input.target_id,
                category: input.category,
                status: "pending_review",
                reason: input.reason ?? null,
                evidence: JSON.stringify({ ...(input.evidence ?? {}), reporter_customer_id: Number(customer.id) }),
            })
            .returning("*");
        await socialEventService.record({
            eventType: "report",
            customerId: Number(customer.id),
            contentId: input.target_type === "content" ? input.target_id : null,
            sourceSurface: "community_report",
            metadata: { moderation_case_id: Number(row.id), category: input.category },
        });
        return { data: serialize(row as Row) };
    }
    async listModeration(input: { status?: string; category?: string; limit?: number } = {}) {
        let q = currentTrx().from("social_moderation_cases");
        if (input.status) q = q.where("status", input.status);
        if (input.category) q = q.where("category", input.category);
        const rows = await q.orderBy("created_at", "desc").limit(Math.max(1, Math.min(100, input.limit ?? 100)));
        return { data: rows.map((x) => serialize(x as Row)) };
    }
    async moderateCase(
        id: number,
        actorUserId: number,
        input: {
            expected_version: number;
            action: "limit" | "remove" | "restore" | "finalize" | "escalate" | "note";
            reason?: string | null;
            evidence?: Record<string, unknown>;
        },
    ) {
        const item = await currentTrx().from("social_moderation_cases").where("id", id).forUpdate().first();
        if (!item) throw new Exception("Moderation case not found", { status: 404, code: "E_SOCIAL_MODERATION_NOT_FOUND" });
        if (numberValue(item.version) !== input.expected_version)
            throw new Exception("Moderation case changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        const status =
            input.action === "limit"
                ? "limited"
                : input.action === "remove"
                  ? "removed"
                  : input.action === "restore"
                    ? "restored"
                    : input.action === "finalize"
                      ? "final"
                      : String(item.status);
        const [updated] = await currentTrx()
            .from("social_moderation_cases")
            .where("id", id)
            .where("version", input.expected_version)
            .update({ status, version: input.expected_version + 1, updated_at: new Date() })
            .returning("*");
        await currentTrx()
            .table("social_moderation_actions")
            .insert({
                case_id: id,
                actor_user_id: actorUserId,
                action: input.action,
                reason: input.reason ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
            });
        if (String(item.target_type) === "content") {
            const moderationState =
                status === "restored" || (status === "final" && input.action === "finalize")
                    ? "approved"
                    : status === "limited"
                      ? "limited"
                      : status === "removed"
                        ? "removed"
                        : "pending_review";
            await currentTrx()
                .from("social_contents")
                .where("id", item.target_id)
                .update({ moderation_state: moderationState, updated_at: new Date() });
            await socialSearchService.syncContent(numberValue(item.target_id));
        }
        return { data: serialize(updated as Row) };
    }
    async appealModeration(userId: number, caseId: number, reason: string) {
        const customer = await customerForUser(userId);
        const moderationCase = await currentTrx().from("social_moderation_cases").where("id", caseId).forUpdate().first();
        if (!moderationCase)
            throw new Exception("Moderation case not found", { status: 404, code: "E_SOCIAL_MODERATION_NOT_FOUND" });
        const targetType = String(moderationCase.target_type);
        const targetId = numberValue(moderationCase.target_id);
        let owned = false;
        if (targetType === "message") {
            owned = Boolean(
                await currentTrx().from("social_messages").where("id", targetId).where("author_customer_id", customer.id).first(),
            );
        } else if (targetType === "content") {
            const content = await currentTrx().from("social_contents").where("id", targetId).first();
            const metadata = jsonObject(content?.metadata);
            owned = String(metadata.creator_customer_id ?? "") === String(customer.id);
        }
        if (!owned && numberValue(moderationCase.reported_by_customer_id) !== numberValue(customer.id)) {
            throw new Exception("Appeal is not allowed for this case", { status: 403, code: "E_SOCIAL_APPEAL_FORBIDDEN" });
        }
        const existing = await currentTrx()
            .from("social_moderation_appeals")
            .where("case_id", caseId)
            .where("customer_id", customer.id)
            .whereIn("status", ["submitted", "in_review"])
            .first();
        if (existing) return { data: serialize(existing as Row), replayed: true };
        const [appeal] = await currentTrx()
            .table("social_moderation_appeals")
            .insert({ case_id: caseId, customer_id: customer.id, reason })
            .returning("*");
        await currentTrx()
            .from("social_moderation_cases")
            .where("id", caseId)
            .update({ status: "appealed", version: numberValue(moderationCase.version) + 1, updated_at: new Date() });
        return { data: serialize(appeal as Row), replayed: false };
    }
    async createLiveSession(
        contentId: number,
        input: { scheduled_at: Date; slow_mode_seconds?: number; metadata?: Record<string, unknown> },
    ) {
        const content = await ensureContent(contentId);
        if (String(content.kind) !== "live")
            throw new Exception("Live session requires live content", { status: 422, code: "E_SOCIAL_LIVE_KIND" });
        const policy = await this.resolvedPolicy();
        if (!policy.live_enabled || policy.live_emergency_off)
            throw new Exception("Live shopping is disabled by policy", { status: 409, code: "E_SOCIAL_LIVE_DISABLED" });
        if (!policy.live_provider_enabled)
            throw new Exception("Live provider is disabled by policy", { status: 409, code: "E_SOCIAL_LIVE_PROVIDER_DISABLED" });
        const provider = socialVideoProvider();
        const handle = await provider.createLiveInput({
            name: String(content.title ?? `Calibra live ${contentId}`),
            creatorRef: `${currentTenantId()}:content:${contentId}`,
            requireSignedPlayback: true,
        });
        try {
            const [row] = await currentTrx()
                .table("social_live_sessions")
                .insert({
                    content_id: contentId,
                    status: "ready",
                    scheduled_at: input.scheduled_at,
                    slow_mode_seconds: input.slow_mode_seconds ?? 0,
                    provider: provider.name,
                    provider_ref: handle.providerRef,
                    provider_ready_at: new Date(),
                    metadata: JSON.stringify({
                        ...(input.metadata ?? {}),
                        provider_capabilities: {
                            rtmps: Boolean(handle.rtmpsUrl),
                            srt: Boolean(handle.srtUrl),
                            webrtc: Boolean(handle.webRtcUrl),
                        },
                    }),
                })
                .returning("*");
            return {
                data: {
                    ...serialize(row as Row),
                    ingest: {
                        rtmps_url: handle.rtmpsUrl ?? null,
                        stream_key: handle.streamKey ?? null,
                        srt_url: handle.srtUrl ?? null,
                        webrtc_url: handle.webRtcUrl ?? null,
                        secret_persisted: false,
                    },
                },
            };
        } catch (error) {
            await provider.stopLiveInput(handle.providerRef).catch(() => undefined);
            throw error;
        }
    }
    async updateLiveSession(
        contentId: number,
        input: { expected_version: number; status?: string; pinned_marker_id?: number | null; slow_mode_seconds?: number },
    ) {
        const current = await currentTrx().from("social_live_sessions").where("content_id", contentId).forUpdate().first();
        if (!current) throw new Exception("Live session not found", { status: 404, code: "E_SOCIAL_LIVE_NOT_FOUND" });
        if (numberValue(current.version) !== input.expected_version)
            throw new Exception("Live session changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        if (input.pinned_marker_id) {
            const marker = await currentTrx()
                .from("social_product_markers")
                .where("id", input.pinned_marker_id)
                .where("content_id", contentId)
                .first();
            if (!marker)
                throw new Exception("Pinned marker is not part of the live content", {
                    status: 422,
                    code: "E_SOCIAL_LIVE_MARKER",
                });
        }
        const patch: Row = { version: input.expected_version + 1, updated_at: new Date() };
        if (input.status !== undefined) {
            patch.status = input.status;
            if (input.status === "live") patch.started_at = new Date();
            if (input.status === "ended") patch.ended_at = new Date();
        }
        if (input.pinned_marker_id !== undefined) patch.pinned_marker_id = input.pinned_marker_id;
        if (input.slow_mode_seconds !== undefined) patch.slow_mode_seconds = input.slow_mode_seconds;
        const [row] = await currentTrx()
            .from("social_live_sessions")
            .where("id", current.id)
            .where("version", input.expected_version)
            .update(patch)
            .returning("*");
        if (!row) throw new Exception("Live session changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        if (input.status === "ended" && current.provider_ref)
            await socialVideoProvider()
                .stopLiveInput(String(current.provider_ref))
                .catch(() => undefined);
        return { data: serialize(row as Row) };
    }
    async freezeLiveChat(
        contentId: number,
        actorUserId: number,
        input: { expected_version: number; frozen: boolean; reason?: string | null },
    ) {
        const [row] = await currentTrx()
            .from("social_live_sessions")
            .where("content_id", contentId)
            .where("version", input.expected_version)
            .update({
                chat_frozen: input.frozen,
                chat_freeze_reason: input.frozen ? (input.reason ?? "moderator_freeze") : null,
                chat_frozen_at: input.frozen ? new Date() : null,
                chat_frozen_by_user_id: input.frozen ? actorUserId : null,
                version: input.expected_version + 1,
                updated_at: new Date(),
            })
            .returning("*");
        if (!row) throw new Exception("Live session changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        return { data: serialize(row as Row) };
    }
    async moderateLiveParticipant(
        contentId: number,
        actorUserId: number,
        input: {
            control: "mute" | "ban";
            active: boolean;
            customer_id?: number | null;
            anonymous_id?: string | null;
            reason?: string | null;
            expires_at?: Date | null;
        },
    ) {
        const live = await currentTrx().from("social_live_sessions").where("content_id", contentId).first();
        if (!live) throw new Exception("Live session not found", { status: 404, code: "E_SOCIAL_LIVE_NOT_FOUND" });
        if (!input.customer_id && !input.anonymous_id)
            throw new Exception("Participant identity required", { status: 422, code: "E_SOCIAL_LIVE_PARTICIPANT" });
        let q = currentTrx()
            .from("social_live_participant_controls")
            .where("live_session_id", live.id)
            .where("control", input.control);
        q = input.customer_id ? q.where("customer_id", input.customer_id) : q.where("anonymous_id", input.anonymous_id!);
        const existing = await q.first();
        if (existing) {
            const [row] = await currentTrx()
                .from("social_live_participant_controls")
                .where("id", existing.id)
                .update({
                    active: input.active,
                    reason: input.reason ?? null,
                    expires_at: input.expires_at ?? null,
                    actor_user_id: actorUserId,
                    updated_at: new Date(),
                })
                .returning("*");
            return { data: serialize(row as Row) };
        }
        const [row] = await currentTrx()
            .table("social_live_participant_controls")
            .insert({
                live_session_id: live.id,
                customer_id: input.customer_id ?? null,
                anonymous_id: input.anonymous_id ?? null,
                control: input.control,
                active: input.active,
                reason: input.reason ?? null,
                expires_at: input.expires_at ?? null,
                actor_user_id: actorUserId,
            })
            .returning("*");
        return { data: serialize(row as Row) };
    }
    async liveParticipantAccess(contentId: number, input: { customer_id?: number | null; anonymous_id?: string | null }) {
        const live = await currentTrx().from("social_live_sessions").where("content_id", contentId).first();
        if (!live) return { data: { allowed: true, muted: false, banned: false } };
        let q = currentTrx()
            .from("social_live_participant_controls")
            .where("live_session_id", live.id)
            .where("active", true)
            .where((b) => b.whereNull("expires_at").orWhere("expires_at", ">", new Date()));
        if (input.customer_id) q = q.where("customer_id", input.customer_id);
        else if (input.anonymous_id) q = q.where("anonymous_id", input.anonymous_id);
        else return { data: { allowed: true, muted: false, banned: false } };
        const rows = await q;
        const banned = rows.some((x) => x.control === "ban"),
            muted = rows.some((x) => x.control === "mute");
        return { data: { allowed: !banned, muted, banned, chat_frozen: Boolean(live.chat_frozen) } };
    }
    async attachLiveReplay(contentId: number, actorUserId: number, input: { media_id: number; expected_version: number }) {
        const live = await currentTrx().from("social_live_sessions").where("content_id", contentId).forUpdate().first();
        if (!live) throw new Exception("Live session not found", { status: 404, code: "E_SOCIAL_LIVE_NOT_FOUND" });
        if (numberValue(live.version) !== input.expected_version)
            throw new Exception("Live session changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        if (!["ended", "processing_replay", "replay_failed"].includes(String(live.status)))
            throw new Exception("Live session is not awaiting replay", { status: 409, code: "E_SOCIAL_LIVE_REPLAY_STATE" });
        const media = await currentTrx()
            .from("social_media_assets as asset")
            .innerJoin("media as media", "media.id", "asset.media_id")
            .where("asset.media_id", input.media_id)
            .where("asset.purpose", "live_replay")
            .where("media.processing_state", "publishable")
            .select("asset.media_id", "asset.provider_ref")
            .first();
        if (!media)
            throw new Exception("Replay media must be a publishable live_replay asset", {
                status: 422,
                code: "E_SOCIAL_LIVE_REPLAY_MEDIA",
            });
        const [row] = await currentTrx()
            .from("social_live_sessions")
            .where("id", live.id)
            .where("version", input.expected_version)
            .update({
                replay_media_id: input.media_id,
                playback_ref: media.provider_ref ?? live.playback_ref,
                status: "replay_ready",
                version: input.expected_version + 1,
                updated_at: new Date(),
            })
            .returning("*");
        return { data: { ...serialize(row as Row), replay_attached_by_user_id: actorUserId } };
    }
    async emergencyStopLive(contentId: number, actorUserId: number, input: { expected_version: number; reason: string }) {
        const current = await currentTrx().from("social_live_sessions").where("content_id", contentId).forUpdate().first();
        if (!current) throw new Exception("Live session not found", { status: 404, code: "E_SOCIAL_LIVE_NOT_FOUND" });
        if (numberValue(current.version) !== input.expected_version)
            throw new Exception("Live session changed", { status: 409, code: "E_SOCIAL_VERSION_CONFLICT" });
        if (!["ready", "starting", "live", "interrupted", "ending"].includes(String(current.status)))
            throw new Exception("Live session cannot be emergency-stopped from this state", {
                status: 409,
                code: "E_SOCIAL_LIVE_STOP_STATE",
            });
        if (current.provider_ref)
            await socialVideoProvider()
                .stopLiveInput(String(current.provider_ref))
                .catch(() => undefined);
        const [row] = await currentTrx()
            .from("social_live_sessions")
            .where("id", current.id)
            .where("version", input.expected_version)
            .update({
                status: "ended",
                ended_at: new Date(),
                chat_frozen: true,
                chat_freeze_reason: `emergency_stop:${sanitizeUgc(input.reason)}`,
                chat_frozen_at: new Date(),
                chat_frozen_by_user_id: actorUserId,
                version: input.expected_version + 1,
                updated_at: new Date(),
            })
            .returning("*");
        return { data: serialize(row as Row) };
    }

    async reputation(userId: number) {
        const customer = await customerForUser(userId);
        const [signals, reviews, abuse] = await Promise.all([
            currentTrx().from("social_reputation_signals").where("customer_id", customer.id),
            currentTrx().from("product_reviews").where("customer_id", customer.id).where("status", "approved"),
            currentTrx()
                .from("social_moderation_cases")
                .whereRaw(`(evidence->>'reporter_customer_id')::bigint = ?`, [customer.id])
                .whereIn("status", ["removed", "final"]),
        ]);
        const verifiedBuyer = reviews.some((x) => Boolean(x.verified) || x.verified_order_id);
        const helpful = signals.filter((x) => x.signal_type === "helpful_review").reduce((n, x) => n + Number(x.weight ?? 0), 0);
        const confirmedAbuseCases = abuse.length;
        return {
            data: {
                customer_id: Number(customer.id),
                badges: {
                    verified_buyer: verifiedBuyer && confirmedAbuseCases === 0,
                    helpful_reviewer: helpful >= 3 && confirmedAbuseCases === 0,
                    contributor: signals.length >= 5 && confirmedAbuseCases === 0,
                },
                confirmed_abuse_cases: confirmedAbuseCases,
                clean_standing_required_for_trust_badges: true,
            },
        };
    }

    async publishDue(limit = 100) {
        const now = new Date();
        const scheduled = await currentTrx()
            .from("social_contents")
            .where("status", "scheduled")
            .whereNotNull("publish_at")
            .where("publish_at", "<=", now)
            .orderBy("publish_at")
            .limit(limit);
        const expiring = await currentTrx()
            .from("social_contents")
            .whereIn("status", ["published", "highlight"])
            .whereNotNull("expires_at")
            .where("expires_at", "<=", now)
            .orderBy("expires_at")
            .limit(limit);
        let published = 0,
            expired = 0;
        const blocked: Array<{ id: number; code: string }> = [];
        for (const row of scheduled) {
            try {
                await this.assertPublicationReady(row as Row);
                await currentTrx()
                    .from("social_contents")
                    .where("id", row.id)
                    .where("status", "scheduled")
                    .update({ status: "published", published_at: now, version: numberValue(row.version) + 1, updated_at: now });
                await socialSearchService.syncContent(Number(row.id));
                published += 1;
            } catch (error) {
                blocked.push({
                    id: Number(row.id),
                    code: error instanceof Exception ? (error.code ?? "E_SOCIAL_PUBLISH_BLOCKED") : "E_SOCIAL_PUBLISH_BLOCKED",
                });
            }
        }
        for (const row of expiring) {
            await currentTrx()
                .from("social_contents")
                .where("id", row.id)
                .update({ status: "expired", version: numberValue(row.version) + 1, updated_at: now });
            await socialSearchService.syncContent(Number(row.id));
            expired += 1;
        }
        return { data: { processed: scheduled.length + expiring.length, published, expired, blocked } };
    }

    async adminSummary() {
        const [content, moderation, conversations, interactions] = await Promise.all([
            currentTrx().from("social_contents").select("status").count("id as count").groupBy("status"),
            currentTrx().from("social_moderation_cases").select("status").count("id as count").groupBy("status"),
            currentTrx().from("social_threads").select("status").count("id as count").groupBy("status"),
            currentTrx()
                .from("social_interaction_events")
                .where("occurred_at", ">=", new Date(Date.now() - 30 * 86_400_000))
                .count("id as count")
                .first(),
        ]);
        const toMap = (rows: any[]) => Object.fromEntries(rows.map((x) => [x.status, Number(x.count)]));
        return {
            data: {
                content: toMap(content),
                moderation: toMap(moderation),
                conversations: toMap(conversations),
                interactions_30d: Number(interactions?.count ?? 0),
                policy: await this.resolvedPolicy(),
            },
        };
    }
    async analytics() {
        const events = await currentTrx()
            .from("social_interaction_events")
            .where("occurred_at", ">=", new Date(Date.now() - 30 * 86_400_000))
            .select("event_type")
            .count("id as count")
            .groupBy("event_type");
        const top = await currentTrx()
            .from("social_interaction_events as e")
            .leftJoin("social_contents as c", "c.id", "e.content_id")
            .whereNotNull("e.content_id")
            .where("e.occurred_at", ">=", new Date(Date.now() - 30 * 86_400_000))
            .groupBy("e.content_id", "c.title")
            .select("e.content_id", "c.title")
            .count("e.id as interactions")
            .sum("e.watch_ms as watch_ms")
            .orderBy("interactions", "desc")
            .limit(20);
        const orders = await currentTrx()
            .from("social_commerce_attributions")
            .where("created_at", ">=", new Date(Date.now() - 30 * 86_400_000))
            .countDistinct("order_id as count")
            .first();
        return {
            data: {
                events: Object.fromEntries(events.map((x) => [x.event_type, Number(x.count)])),
                top_content: top,
                attributed_orders_30d: Number(orders?.count ?? 0),
            },
        };
    }
    async contract() {
        return {
            data: {
                phase: 8,
                commerce_integrity: {
                    price_stock_source: "Catalog + Inventory",
                    order_source: "Canonical Orders",
                    support_escalation: "Ticket Operations",
                    no_parallel_domains: [
                        "social_orders",
                        "social_payments",
                        "social_support_tickets",
                        "social_products",
                        "social_inventory",
                    ],
                },
                event_stream_contract: {
                    authority: "social_interaction_events",
                    future_consumer: "Commerce OS Phase 9 Personalization",
                    ranking: "phase8_baseline_no_personalization",
                },
                media: { authority: "media + social_media_assets", safety: "fail_closed" },
            },
        };
    }
    async search(input: { q?: string; kind?: string; locale?: string; page?: number; limit?: number; visibility?: string }) {
        return socialSearchService.search(input);
    }
}
export const socialCommerceService = new SocialCommerceService();
