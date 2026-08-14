import { Exception } from "@adonisjs/core/exceptions";

import { contentService, type ContentPostInput } from "#services/content/content_service";
import { seoService } from "#services/seo/seo_service";
import { currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;
type EntityKind = "product" | "category" | "brand" | "attribute" | "content_post" | "media" | "page";

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function json<T extends Record<string, unknown>>(value: unknown): T {
    if (!value) return {} as T;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
        } catch {
            return {} as T;
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T);
}

function actionRow(row: DbRow): DbRow {
    return {
        ...row,
        id: numberValue(row.id),
        entity_id: nullableNumber(row.entity_id),
        expected_version: nullableNumber(row.expected_version),
        proposed_by_user_id: nullableNumber(row.proposed_by_user_id),
        reviewed_by_user_id: nullableNumber(row.reviewed_by_user_id),
        applied_by_user_id: nullableNumber(row.applied_by_user_id),
        before_payload: json(row.before_payload),
        after_payload: json(row.after_payload),
    };
}

function contentPayload(post: Record<string, unknown>): ContentPostInput {
    const categories = Array.isArray(post.categories) ? post.categories : [];
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const products = Array.isArray(post.products) ? post.products : [];
    return {
        type: post.type as ContentPostInput["type"],
        locale: post.locale === "en" ? "en" : "fa",
        title: String(post.title ?? ""),
        slug: String(post.slug ?? ""),
        excerpt: post.excerpt === null ? null : String(post.excerpt ?? ""),
        content_html: String(post.content_html ?? ""),
        featured_media_id: nullableNumber(post.featured_media_id),
        author_user_id: nullableNumber(post.author_user_id),
        reviewer_user_id: nullableNumber(post.reviewer_user_id),
        source_signal_id: nullableNumber(post.source_signal_id),
        seo_title: post.seo_title === null ? null : String(post.seo_title ?? ""),
        meta_description: post.meta_description === null ? null : String(post.meta_description ?? ""),
        canonical_url: post.canonical_url === null ? null : String(post.canonical_url ?? ""),
        robots_index: post.robots_index !== false,
        robots_follow: post.robots_follow !== false,
        schema_type: (post.schema_type ?? "BlogPosting") as ContentPostInput["schema_type"],
        search_intent: (post.search_intent ?? null) as ContentPostInput["search_intent"],
        focus_keyword: post.focus_keyword === null ? null : String(post.focus_keyword ?? ""),
        structured_data: json(post.structured_data),
        scheduled_at: post.scheduled_at ? String(post.scheduled_at) : null,
        category_ids: categories.map((item) => numberValue((item as DbRow).id)).filter(Boolean),
        tag_ids: tags.map((item) => numberValue((item as DbRow).id)).filter(Boolean),
        product_ids: products.map((item) => numberValue((item as DbRow).id)).filter(Boolean),
    };
}

const CONTENT_REFRESH_FIELDS = new Set([
    "title",
    "excerpt",
    "content_html",
    "featured_media_id",
    "seo_title",
    "meta_description",
    "canonical_url",
    "robots_index",
    "robots_follow",
    "schema_type",
    "search_intent",
    "focus_keyword",
    "structured_data",
    "category_ids",
    "tag_ids",
    "product_ids",
    "change_summary",
]);

const PROFILE_FIELDS = new Set([
    "engineProfile",
    "metaTitle",
    "metaDescription",
    "focusKeyword",
    "secondaryKeywords",
    "canonicalUrl",
    "robotsIndex",
    "robotsFollow",
    "ogTitle",
    "ogDescription",
    "socialMediaId",
    "schemaType",
    "schemaOverrides",
    "locale",
]);

function pick(source: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) if (allowed.has(key)) result[key] = value;
    return result;
}

export class SeoOperationsService {
    async listActions(input: { status?: string; action_type?: string; entity_kind?: string; limit?: number } = {}) {
        let query = currentTrx().from("seo_action_queue");
        if (input.status) query = query.where("status", input.status);
        if (input.action_type) query = query.where("action_type", input.action_type);
        if (input.entity_kind) query = query.where("entity_kind", input.entity_kind);
        const rows = await query.orderBy("created_at", "desc").limit(Math.max(1, Math.min(200, input.limit ?? 100)));
        return { data: rows.map((row) => actionRow(row as DbRow)) };
    }

    async createAction(input: {
        action_type: "media_alt" | "content_refresh" | "seo_profile";
        entity_kind: EntityKind;
        entity_id?: number | null;
        entity_key?: string | null;
        expected_version?: number | null;
        after_payload: Record<string, unknown>;
    }, actorId: number | null) {
        let before: Record<string, unknown> = {};
        let expectedVersion = input.expected_version ?? null;
        if (input.action_type === "media_alt") {
            if (input.entity_kind !== "media" || !input.entity_id) throw new Exception("Media ALT action requires a media entity", { status: 422, code: "E_SEO_ACTION_ENTITY" });
            const media = await currentTrx().from("media").where("id", input.entity_id).first();
            if (!media) throw new Exception("Media not found", { status: 404, code: "E_SEO_MEDIA_NOT_FOUND" });
            before = { alt: media.alt ?? null, updated_at: media.updated_at ?? null };
            input.after_payload = { alt: input.after_payload.alt === null ? null : String(input.after_payload.alt ?? "").trim().slice(0, 512) };
        } else if (input.action_type === "content_refresh") {
            if (input.entity_kind !== "content_post" || !input.entity_id) throw new Exception("Content refresh requires a content post", { status: 422, code: "E_SEO_ACTION_ENTITY" });
            const detail = await contentService.detail(input.entity_id);
            before = contentPayload(detail.data);
            expectedVersion = expectedVersion ?? numberValue(detail.data.version);
            input.after_payload = pick(input.after_payload, CONTENT_REFRESH_FIELDS);
            if (Object.keys(input.after_payload).length === 0) throw new Exception("Content refresh has no supported changes", { status: 422, code: "E_SEO_ACTION_EMPTY" });
        } else {
            if (!input.entity_id || input.entity_kind === "media" || input.entity_kind === "page") throw new Exception("SEO profile action requires a persisted SEO entity", { status: 422, code: "E_SEO_ACTION_ENTITY" });
            const locale = input.after_payload.locale === "en" ? "en" : "fa";
            const detail = await seoService.entity(input.entity_kind as Exclude<EntityKind, "media" | "page">, input.entity_id, locale);
            const profile = json<Record<string, unknown>>((detail.data as Record<string, unknown>).evidence && ((detail.data as Record<string, unknown>).evidence as Record<string, unknown>).profile);
            before = profile;
            expectedVersion = expectedVersion ?? nullableNumber(profile.version);
            input.after_payload = pick(input.after_payload, PROFILE_FIELDS);
        }
        const [row] = await currentTrx().table("seo_action_queue").insert({
            action_type: input.action_type,
            entity_kind: input.entity_kind,
            entity_id: input.entity_id ?? null,
            entity_key: input.entity_key ?? null,
            status: "proposed",
            before_payload: JSON.stringify(before),
            after_payload: JSON.stringify(input.after_payload),
            expected_version: expectedVersion,
            proposed_by_user_id: actorId,
        }).returning("*");
        return { data: actionRow(row as DbRow) };
    }

    async createMediaAltActions(items: Array<{ media_id: number; alt: string | null }>, actorId: number | null) {
        const ids = items.map((item) => item.media_id);
        if (new Set(ids).size !== ids.length) throw new Exception("Duplicate media ids are not allowed", { status: 422, code: "E_SEO_MEDIA_DUPLICATE" });
        const actions = [];
        for (const item of items) actions.push((await this.createAction({ action_type: "media_alt", entity_kind: "media", entity_id: item.media_id, after_payload: { alt: item.alt } }, actorId)).data);
        return { data: actions };
    }

    async reviewAction(id: number, decision: "approved" | "rejected", note: string | null | undefined, actorId: number | null) {
        const current = await currentTrx().from("seo_action_queue").where("id", id).forUpdate().first();
        if (!current) throw new Exception("SEO action not found", { status: 404, code: "E_SEO_ACTION_NOT_FOUND" });
        if (String(current.status) !== "proposed") throw new Exception("SEO action has already been reviewed", { status: 409, code: "E_SEO_ACTION_STATE" });
        const [row] = await currentTrx().from("seo_action_queue").where("id", id).where("status", "proposed").update({
            status: decision,
            reviewed_by_user_id: actorId,
            review_note: note ?? null,
            reviewed_at: new Date(),
            updated_at: new Date(),
        }).returning("*");
        return { data: actionRow(row as DbRow) };
    }

    async applyAction(id: number, actorId: number | null) {
        const action = await currentTrx().from("seo_action_queue").where("id", id).forUpdate().first();
        if (!action) throw new Exception("SEO action not found", { status: 404, code: "E_SEO_ACTION_NOT_FOUND" });
        if (String(action.status) !== "approved") throw new Exception("SEO action must be approved before apply", { status: 409, code: "E_SEO_ACTION_STATE" });
        const before = json<Record<string, unknown>>(action.before_payload);
        const after = json<Record<string, unknown>>(action.after_payload);
        let appliedVersion: number | null = null;
        try {
            if (String(action.action_type) === "media_alt") {
                const media = await currentTrx().from("media").where("id", action.entity_id).forUpdate().first();
                if (!media) throw new Exception("Media not found", { status: 404, code: "E_SEO_MEDIA_NOT_FOUND" });
                if ((media.alt ?? null) !== (before.alt ?? null)) throw new Exception("Media changed after SEO proposal", { status: 409, code: "E_SEO_ACTION_CONFLICT" });
                await currentTrx().from("media").where("id", media.id).update({ alt: after.alt ?? null, updated_at: new Date() });
            } else if (String(action.action_type) === "content_refresh") {
                const postId = numberValue(action.entity_id);
                const detail = await contentService.detail(postId);
                const expected = numberValue(action.expected_version);
                if (numberValue(detail.data.version) !== expected) throw new Exception("Content changed after SEO proposal", { status: 409, code: "E_SEO_ACTION_CONFLICT" });
                const payload = { ...contentPayload(detail.data), ...pick(after, CONTENT_REFRESH_FIELDS), expected_version: expected } as ContentPostInput & { expected_version: number };
                const result = await contentService.update(postId, payload, actorId);
                appliedVersion = numberValue(result.data.version);
            } else {
                const entityId = numberValue(action.entity_id);
                const locale = after.locale === "en" ? "en" : "fa";
                const payload = { ...pick(after, PROFILE_FIELDS), expected_version: nullableNumber(action.expected_version) ?? undefined } as never;
                const result = await seoService.updateProfile(String(action.entity_kind) as "product" | "category" | "brand" | "attribute" | "content_post", entityId, locale, payload, actorId);
                const profile = json<Record<string, unknown>>(((result.data as Record<string, unknown>).evidence as Record<string, unknown> | undefined)?.profile);
                appliedVersion = nullableNumber(profile.version);
            }
            const enrichedAfter = { ...after, ...(appliedVersion ? { _applied_version: appliedVersion } : {}) };
            const [row] = await currentTrx().from("seo_action_queue").where("id", id).where("status", "approved").update({
                status: "applied",
                after_payload: JSON.stringify(enrichedAfter),
                applied_by_user_id: actorId,
                applied_at: new Date(),
                last_error: null,
                updated_at: new Date(),
            }).returning("*");
            return { data: actionRow(row as DbRow) };
        } catch (error) {
            await currentTrx().from("seo_action_queue").where("id", id).update({ status: "failed", last_error: error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000), updated_at: new Date() });
            throw error;
        }
    }

    async rollbackAction(id: number, actorId: number | null) {
        const action = await currentTrx().from("seo_action_queue").where("id", id).forUpdate().first();
        if (!action) throw new Exception("SEO action not found", { status: 404, code: "E_SEO_ACTION_NOT_FOUND" });
        if (String(action.status) !== "applied") throw new Exception("Only applied SEO actions can be rolled back", { status: 409, code: "E_SEO_ACTION_STATE" });
        const before = json<Record<string, unknown>>(action.before_payload);
        const after = json<Record<string, unknown>>(action.after_payload);
        if (String(action.action_type) === "media_alt") {
            const media = await currentTrx().from("media").where("id", action.entity_id).forUpdate().first();
            if (!media) throw new Exception("Media not found", { status: 404, code: "E_SEO_MEDIA_NOT_FOUND" });
            if ((media.alt ?? null) !== (after.alt ?? null)) throw new Exception("Media changed after SEO action; rollback refused", { status: 409, code: "E_SEO_ROLLBACK_CONFLICT" });
            await currentTrx().from("media").where("id", media.id).update({ alt: before.alt ?? null, updated_at: new Date() });
        } else if (String(action.action_type) === "content_refresh") {
            const postId = numberValue(action.entity_id);
            const detail = await contentService.detail(postId);
            const appliedVersion = numberValue(after._applied_version);
            if (!appliedVersion || numberValue(detail.data.version) !== appliedVersion) throw new Exception("Content changed after SEO action; rollback refused", { status: 409, code: "E_SEO_ROLLBACK_CONFLICT" });
            await contentService.update(postId, { ...(before as unknown as ContentPostInput), expected_version: appliedVersion, change_summary: `Rollback SEO action #${id}` }, actorId);
        } else {
            const entityId = numberValue(action.entity_id);
            const appliedVersion = numberValue(after._applied_version);
            const locale = before.locale === "en" ? "en" : "fa";
            if (!appliedVersion) throw new Exception("SEO profile apply version is unavailable", { status: 409, code: "E_SEO_ROLLBACK_CONFLICT" });
            await seoService.updateProfile(String(action.entity_kind) as "product" | "category" | "brand" | "attribute" | "content_post", entityId, locale, { ...pick(before, PROFILE_FIELDS), expected_version: appliedVersion } as never, actorId);
        }
        const [row] = await currentTrx().from("seo_action_queue").where("id", id).where("status", "applied").update({ status: "rolled_back", applied_by_user_id: actorId, rolled_back_at: new Date(), updated_at: new Date() }).returning("*");
        return { data: actionRow(row as DbRow) };
    }

    async createCrawl(urls: string[], actorId: number | null) {
        const settings = await seoService.settings();
        const baseUrl = String(settings.base_url ?? "").trim();
        if (!baseUrl) throw new Exception("SEO base_url must be configured before crawling", { status: 422, code: "E_SEO_CRAWL_BASE_URL" });
        let base: URL;
        try { base = new URL(baseUrl); } catch { throw new Exception("SEO base_url is invalid", { status: 422, code: "E_SEO_CRAWL_BASE_URL" }); }
        const unique = [...new Set(urls.map((value) => new URL(value).toString()))];
        for (const value of unique) {
            const url = new URL(value);
            if (url.hostname.toLowerCase().replace(/^www\./, "") !== base.hostname.toLowerCase().replace(/^www\./, "")) throw new Exception("Crawl URL is outside the configured SEO hostname", { status: 422, code: "E_SEO_CRAWL_SCOPE" });
        }
        const [run] = await currentTrx().table("seo_crawl_runs").insert({
            status: "queued",
            base_url: base.toString().replace(/\/$/, ""),
            requested_count: unique.length,
            created_by_user_id: actorId,
        }).returning("*");
        const runId = numberValue(run.id);
        await currentTrx().table("seo_crawl_targets").insert(unique.map((url) => ({ crawl_run_id: runId, url })));
        return { data: { ...run, id: runId, urls: unique } };
    }

    async crawlRuns(limit = 50) {
        const rows = await currentTrx().from("seo_crawl_runs").orderBy("created_at", "desc").limit(Math.max(1, Math.min(100, limit)));
        return { data: rows.map((row) => ({ ...row, id: numberValue(row.id), requested_count: numberValue(row.requested_count), completed_count: numberValue(row.completed_count), failed_count: numberValue(row.failed_count) })) };
    }

    async crawlRun(id: number) {
        const run = await currentTrx().from("seo_crawl_runs").where("id", id).first();
        if (!run) throw new Exception("SEO crawl run not found", { status: 404, code: "E_SEO_CRAWL_NOT_FOUND" });
        const [targets, observations] = await Promise.all([
            currentTrx().from("seo_crawl_targets").where("crawl_run_id", id).orderBy("id", "asc"),
            currentTrx().from("seo_crawl_observations").where("crawl_run_id", id).orderBy("id", "asc"),
        ]);
        return { data: { ...run, id: numberValue(run.id), targets, observations } };
    }

    async createExport(input: { report_kind: string; format: "csv" | "json"; filters?: Record<string, unknown> }, actorId: number | null) {
        const [row] = await currentTrx().table("seo_export_jobs").insert({
            report_kind: input.report_kind,
            format: input.format,
            status: "queued",
            filters: JSON.stringify(input.filters ?? {}),
            created_by_user_id: actorId,
        }).returning("*");
        return { data: { ...row, id: numberValue(row.id), filters: json(row.filters) } };
    }

    async exportData(id: number) {
        const job = await currentTrx().from("seo_export_jobs").where("id", id).forUpdate().first();
        if (!job) throw new Exception("SEO export job not found", { status: 404, code: "E_SEO_EXPORT_NOT_FOUND" });
        const kind = String(job.report_kind);
        let rows: DbRow[];
        if (kind === "issues") rows = (await currentTrx().from("seo_issues").orderBy("last_seen_at", "desc").limit(10_000)) as DbRow[];
        else if (kind === "keywords") rows = (await currentTrx().from("seo_keywords").orderBy("updated_at", "desc").limit(10_000)) as DbRow[];
        else if (kind === "entities") rows = (await currentTrx().from("seo_entity_profiles").orderBy("updated_at", "desc").limit(10_000)) as DbRow[];
        else if (kind === "crawl") rows = (await currentTrx().from("seo_crawl_observations").orderBy("fetched_at", "desc").limit(10_000)) as DbRow[];
        else rows = [((await seoService.overview()).data as DbRow)];
        const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !/credential|secret|token/i.test(key))));
        let body: string;
        let contentType: string;
        if (String(job.format) === "json") {
            body = JSON.stringify(safeRows, null, 2);
            contentType = "application/json; charset=utf-8";
        } else {
            const headers = [...new Set(safeRows.flatMap((row) => Object.keys(row)))];
            const cell = (value: unknown) => {
                const raw = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
                return `"${raw.replaceAll('"', '""')}"`;
            };
            body = [headers.map(cell).join(","), ...safeRows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n");
            contentType = "text/csv; charset=utf-8";
        }
        await currentTrx().from("seo_export_jobs").where("id", id).update({
            status: "completed",
            result_metadata: JSON.stringify({ rows: safeRows.length, bytes: Buffer.byteLength(body), generated_at: new Date().toISOString() }),
            completed_at: new Date(),
            last_error: null,
            updated_at: new Date(),
        });
        return { body, contentType, filename: `calibra-seo-${kind}-${id}.${job.format}` };
    }
}

export const seoOperationsService = new SeoOperationsService();
