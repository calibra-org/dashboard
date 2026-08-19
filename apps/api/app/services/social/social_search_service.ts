import { getMeilisearch } from "#services/meilisearch";
import { currentTenantId, currentTrx } from "#services/tenant_context";

function indexName() {
    return `social_contents_${currentTenantId().toString()}`;
}
function escapeFilter(value: string) {
    return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export class SocialSearchService {
    async syncContent(contentId: number) {
        const client = getMeilisearch();
        if (!client) return { indexed: false, reason: "meilisearch_not_configured" };
        const row = await currentTrx().from("social_contents").where("id", contentId).first();
        if (!row) {
            await client
                .index(indexName())
                .deleteDocument(contentId)
                .catch(() => undefined);
            return { indexed: false, deleted: true };
        }
        await client
            .index(indexName())
            .addDocuments(
                [
                    {
                        ...row,
                        id: Number(row.id),
                        tenant_id: Number(row.tenant_id),
                        visibility: (row.audience as any)?.visibility ?? "public",
                    },
                ],
                { primaryKey: "id" },
            );
        return { indexed: true };
    }
    async search(input: { q?: string; kind?: string; locale?: string; page?: number; limit?: number; visibility?: string }) {
        const page = Math.max(1, Math.floor(input.page ?? 1));
        const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 24)));
        const client = getMeilisearch();
        if (client) {
            const filters = [
                `tenant_id = ${currentTenantId().toString()}`,
                `moderation_state = "approved"`,
                `status IN ["published", "highlight"]`,
                `visibility = "${escapeFilter(input.visibility ?? "public")}"`,
            ];
            if (input.kind) filters.push(`kind = "${escapeFilter(input.kind)}"`);
            if (input.locale) filters.push(`locale = "${escapeFilter(input.locale)}"`);
            const result = await client
                .index(indexName())
                .search(input.q ?? "", {
                    filter: filters.join(" AND "),
                    limit,
                    offset: (page - 1) * limit,
                    sort: ["published_at:desc"],
                });
            return {
                data: result.hits,
                meta: { page, limit, total: result.estimatedTotalHits ?? result.hits.length, source: "meilisearch_acl_filtered" },
            };
        }
        let query = currentTrx()
            .from("social_contents")
            .whereIn("status", ["published", "highlight"])
            .where("moderation_state", "approved")
            .whereRaw(`COALESCE(audience->>'visibility', 'public') = 'public'`);
        if (input.kind) query = query.where("kind", input.kind);
        if (input.locale) query = query.where("locale", input.locale);
        if (input.q)
            query = query.where((builder) =>
                builder.whereILike("title", `%${input.q}%`).orWhereILike("description", `%${input.q}%`),
            );
        const rows = await query
            .orderBy("published_at", "desc")
            .limit(limit)
            .offset((page - 1) * limit);
        return { data: rows, meta: { page, limit, total: rows.length, source: "postgres_acl_filtered_fallback" } };
    }
}
export const socialSearchService = new SocialSearchService();
