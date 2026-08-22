import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import DiscoveryIndexOperation from "#models/discovery_index_operation";
import DiscoveryMerchandisingRule from "#models/discovery_merchandising_rule";
import DiscoveryOpportunity from "#models/discovery_opportunity";
import DiscoveryOpportunityEvidence from "#models/discovery_opportunity_evidence";
import DiscoveryProductRelationship from "#models/discovery_product_relationship";
import DiscoverySearchEvent from "#models/discovery_search_event";
import DiscoverySearchPolicy from "#models/discovery_search_policy";
import DiscoverySearchPolicyVersion from "#models/discovery_search_policy_version";
import DiscoverySynonymRule from "#models/discovery_synonym_rule";
import Product from "#models/product";
import ProductCategory from "#models/product_category";
import { recordAudit } from "#services/admin_audit_log_service";
import { retryIndexOperation } from "#services/discovery/index_projection";
import { normalizeDiscoveryQuery } from "#services/discovery/normalizer";
import { discoveryPermissions, requireDiscoveryPermission } from "#services/discovery/permissions";
import {
    applyActivePolicyToIndexes,
    probeSearchBackend,
    rebuildIndexes,
    searchProducts,
} from "#services/discovery/search_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import { adminDiscoveryMerchandisingView } from "#table_views/admin/discovery_merchandising";
import { adminDiscoveryOpportunitiesView } from "#table_views/admin/discovery_opportunities";
import { adminDiscoveryPoliciesView } from "#table_views/admin/discovery_policies";
import { adminDiscoveryRelationshipsView } from "#table_views/admin/discovery_relationships";
import { adminDiscoverySearchEventsView } from "#table_views/admin/discovery_search_events";
import { adminDiscoverySynonymsView } from "#table_views/admin/discovery_synonyms";
import {
    discoveryMerchandisingCreateValidator,
    discoveryMerchandisingListValidator,
    discoveryOpportunityActionValidator,
    discoveryOpportunityListValidator,
    discoveryPolicyCreateValidator,
    discoveryPolicyListValidator,
    discoveryPolicyVersionValidator,
    discoveryRelationshipCreateValidator,
    discoveryRelationshipListValidator,
    discoveryRelationshipResolveValidator,
    discoverySearchEventListValidator,
    discoverySimulationValidator,
    discoverySynonymCreateValidator,
    discoverySynonymListValidator,
} from "#validators/admin/discovery_validator";

function numericId(ctx: HttpContext): number {
    const value = Number(ctx.params.id);
    if (!Number.isSafeInteger(value) || value < 1)
        throw new Exception("شناسه نامعتبر است", { status: 422, code: "E_DISCOVERY_INVALID_ID" });
    return value;
}
async function actor(ctx: HttpContext) {
    const u = await ctx.auth.authenticate();
    return u ? Number(u.id) : null;
}
function conflict(message: string): never {
    throw new Exception(message, { status: 409, code: "E_DISCOVERY_VERSION_CONFLICT" });
}
async function lock(scope: string) {
    await currentTrx().rawQuery("SELECT pg_advisory_xact_lock(hashtext(?))", [`discovery:${currentTenantId()}:${scope}`]);
}
async function productExists(id: number) {
    return Boolean(await Product.query().where("id", id).first());
}
async function categoryExists(id: number) {
    return Boolean(await ProductCategory.query().where("id", id).first());
}

export default class AdminDiscoveryController {
    async capabilities(ctx: HttpContext) {
        return {
            data: {
                permissions: await discoveryPermissions(ctx),
                authority: { catalog: "catalog", search: "phase16", recommendations: "phase9", pricing: "phase18" },
            },
        };
    }
    async overview(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const trx = currentTrx();
        const [summary] = await Promise.all([
            trx.rawQuery(
                `SELECT count(*) FILTER (WHERE event_type='search_performed')::int AS searches, count(*) FILTER (WHERE event_type='zero_result')::int AS zero_results, count(*) FILTER (WHERE event_type='result_clicked')::int AS clicks, count(*) FILTER (WHERE event_type='purchase')::int AS purchases, count(DISTINCT session_hash)::int AS sessions FROM discovery_search_events WHERE occurred_at >= now()-interval '30 days'`,
            ),
        ]);
        const row = summary.rows[0] ?? {};
        const searches = Number(row.searches ?? 0);
        return {
            data: {
                period_days: 30,
                searches,
                sessions: Number(row.sessions ?? 0),
                zero_result_rate: searches ? Number(row.zero_results ?? 0) / searches : null,
                click_rate: searches ? Number(row.clicks ?? 0) / searches : null,
                purchase_rate: searches ? Number(row.purchases ?? 0) / searches : null,
                open_opportunities: Number(
                    (
                        await DiscoveryOpportunity.query()
                            .whereNotIn("status", ["closed", "rejected", "duplicate"])
                            .count("id as count")
                            .first()
                    )?.$extras.count ?? 0,
                ),
                active_rules: Number(
                    (await DiscoveryMerchandisingRule.query().where("status", "active").count("id as count").first())?.$extras
                        .count ?? 0,
                ),
                relationship_count: Number(
                    (await DiscoveryProductRelationship.query().where("status", "active").count("id as count").first())?.$extras
                        .count ?? 0,
                ),
                permissions: await discoveryPermissions(ctx),
            },
        };
    }
    async queries(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoverySearchEventListValidator);
        const builder = DiscoverySearchEvent.query();
        if (payload.q) builder.whereRaw("LOWER(normalized_query) LIKE LOWER(?)", [`%${normalizeDiscoveryQuery(payload.q)}%`]);
        return adminDiscoverySearchEventsView.run(builder, payload as never);
    }
    async zeroResults(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoverySearchEventListValidator);
        const builder = DiscoverySearchEvent.query().where("event_type", "zero_result");
        if (payload.q) builder.whereRaw("LOWER(normalized_query) LIKE LOWER(?)", [`%${normalizeDiscoveryQuery(payload.q)}%`]);
        return adminDiscoverySearchEventsView.run(builder, payload as never);
    }
    async simulator(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoverySimulationValidator);
        const result = await searchProducts(payload);
        return {
            data: {
                ...result.meta,
                results: result.data,
                explain: {
                    normalization: "Persian/Arabic normalization + digit/unit canonicalization",
                    eligibility: "published + not deleted + catalog visibility",
                    ranking: "retrieval relevance then deterministic merchandising",
                    compatibility: "not inferred unless a verified graph edge exists",
                },
            },
        };
    }

    async synonyms(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoverySynonymListValidator);
        return adminDiscoverySynonymsView.run(DiscoverySynonymRule.query(), payload as never);
    }
    async synonymCreate(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "search:write");
        const payload = await ctx.request.validateUsing(discoverySynonymCreateValidator);
        try {
            const user = await actor(ctx);
            const row = await DiscoverySynonymRule.create({
                locale: payload.locale,
                term: payload.term,
                synonyms: payload.synonyms,
                mode: payload.mode,
                categoryId: payload.category_id ?? null,
                enabled: payload.enabled ?? true,
                createdByUserId: user,
                updatedByUserId: user,
            });
            ctx.response.status(201);
            await recordAudit({
                ctx,
                action: "discovery.synonym.create",
                entityKind: "discovery_synonym",
                entityId: Number(row.id),
                payload,
            });
            return { data: row };
        } catch (error) {
            if (String(error).includes("discovery_synonyms_scope_unique"))
                throw new Exception("این هم‌معنی در همین دامنه از قبل وجود دارد", {
                    status: 409,
                    code: "E_DISCOVERY_SYNONYM_DUPLICATE",
                });
            throw error;
        }
    }
    async synonymToggle(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "search:write");
        const row = await DiscoverySynonymRule.findOrFail(numericId(ctx));
        row.enabled = !row.enabled;
        row.version += 1;
        row.updatedByUserId = await actor(ctx);
        await row.save();
        await recordAudit({
            ctx,
            action: "discovery.synonym.toggle",
            entityKind: "discovery_synonym",
            entityId: Number(row.id),
            payload: { enabled: row.enabled },
        });
        return { data: row };
    }

    async merchandising(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoveryMerchandisingListValidator);
        return adminDiscoveryMerchandisingView.run(DiscoveryMerchandisingRule.query(), payload as never);
    }
    async merchandisingCreate(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "merchandising:write");
        const payload = await ctx.request.validateUsing(discoveryMerchandisingCreateValidator);
        if (!payload.product_id && !payload.category_id)
            throw new Exception("حداقل یک محصول یا دسته باید هدف قانون باشد", {
                status: 422,
                code: "E_DISCOVERY_RULE_TARGET_REQUIRED",
            });
        if (payload.product_id && !(await productExists(payload.product_id)))
            throw new Exception("محصول در این فروشگاه پیدا نشد", { status: 422, code: "E_DISCOVERY_PRODUCT_NOT_FOUND" });
        if (payload.category_id && !(await categoryExists(payload.category_id)))
            throw new Exception("دسته در این فروشگاه پیدا نشد", { status: 422, code: "E_DISCOVERY_CATEGORY_NOT_FOUND" });
        const user = await actor(ctx);
        const startsAt = payload.starts_at ? DateTime.fromISO(payload.starts_at, { zone: "utc" }) : null;
        const endsAt = payload.ends_at ? DateTime.fromISO(payload.ends_at, { zone: "utc" }) : null;
        if ((startsAt && !startsAt.isValid) || (endsAt && !endsAt.isValid))
            throw new Exception("زمان‌بندی نامعتبر است", { status: 422, code: "E_DISCOVERY_RULE_SCHEDULE_INVALID" });
        if (startsAt && endsAt && endsAt <= startsAt)
            throw new Exception("زمان پایان باید بعد از زمان شروع باشد", {
                status: 422,
                code: "E_DISCOVERY_RULE_SCHEDULE_ORDER",
            });
        const row = await DiscoveryMerchandisingRule.create({
            name: payload.name,
            action: payload.action,
            queryPattern: payload.query_pattern ?? null,
            productId: payload.product_id ?? null,
            categoryId: payload.category_id ?? null,
            boostFactor: payload.boost_factor == null ? null : String(payload.boost_factor),
            pinPosition: payload.pin_position ?? null,
            priority: payload.priority ?? 100,
            startsAt,
            endsAt,
            reason: payload.reason,
            status: "draft",
            createdByUserId: user,
            updatedByUserId: user,
        });
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "discovery.merchandising.create",
            entityKind: "discovery_merchandising_rule",
            entityId: Number(row.id),
            payload,
        });
        return { data: row };
    }
    async merchandisingStatus(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "merchandising:write");
        const row = await DiscoveryMerchandisingRule.findOrFail(numericId(ctx));
        const status = String(ctx.request.input("status"));
        if (!["active", "paused", "archived"].includes(status))
            throw new Exception("وضعیت نامعتبر است", { status: 422, code: "E_DISCOVERY_INVALID_STATUS" });
        row.status = status;
        row.version += 1;
        row.updatedByUserId = await actor(ctx);
        await row.save();
        await recordAudit({
            ctx,
            action: "discovery.merchandising.status",
            entityKind: "discovery_merchandising_rule",
            entityId: Number(row.id),
            payload: { status },
        });
        return { data: row };
    }

    async relationships(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoveryRelationshipListValidator);
        return adminDiscoveryRelationshipsView.run(DiscoveryProductRelationship.query(), payload as never);
    }
    async relationshipCreate(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "compatibility:write");
        const payload = await ctx.request.validateUsing(discoveryRelationshipCreateValidator);
        if (payload.subject_product_id === payload.object_product_id)
            throw new Exception("محصول نمی‌تواند با خودش رابطه داشته باشد", { status: 422, code: "E_DISCOVERY_SELF_RELATION" });
        if (!(await productExists(payload.subject_product_id)) || !(await productExists(payload.object_product_id)))
            throw new Exception("یکی از محصولات در این فروشگاه وجود ندارد", {
                status: 422,
                code: "E_DISCOVERY_PRODUCT_NOT_FOUND",
            });
        const user = await actor(ctx);
        const row = await DiscoveryProductRelationship.create({
            subjectProductId: payload.subject_product_id,
            relationType: payload.relation_type,
            objectProductId: payload.object_product_id,
            state: payload.state,
            confidenceClass: payload.confidence_class,
            sourceType: payload.source_type,
            sourceRef: payload.source_ref ?? null,
            evidence: payload.evidence ?? {},
            status: "active",
            createdByUserId: user,
            reviewedByUserId: payload.confidence_class === "verified" ? user : null,
            reviewedAt: payload.confidence_class === "verified" ? DateTime.utc() : null,
        });
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "discovery.relationship.create",
            entityKind: "discovery_relationship",
            entityId: Number(row.id),
            payload,
        });
        return { data: row };
    }
    async relationshipResolve(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "compatibility:write");
        const payload = await ctx.request.validateUsing(discoveryRelationshipResolveValidator);
        const row = await DiscoveryProductRelationship.findOrFail(numericId(ctx));
        if (row.version !== payload.expected_version)
            conflict("این رابطه توسط کاربر دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید");
        row.state = payload.state;
        row.confidenceClass = payload.confidence_class;
        row.sourceRef = payload.source_ref ?? row.sourceRef;
        row.evidence = payload.evidence ?? row.evidence;
        row.reviewedByUserId = await actor(ctx);
        row.reviewedAt = DateTime.utc();
        row.version += 1;
        await row.save();
        await recordAudit({
            ctx,
            action: "discovery.relationship.resolve",
            entityKind: "discovery_relationship",
            entityId: Number(row.id),
            payload,
        });
        return { data: row };
    }
    async relationshipRevoke(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "compatibility:write");
        const row = await DiscoveryProductRelationship.findOrFail(numericId(ctx));
        row.status = "revoked";
        row.version += 1;
        row.reviewedByUserId = await actor(ctx);
        row.reviewedAt = DateTime.utc();
        await row.save();
        await recordAudit({
            ctx,
            action: "discovery.relationship.revoke",
            entityKind: "discovery_relationship",
            entityId: Number(row.id),
            payload: {},
        });
        return { data: row };
    }
    async compatibility(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const subject = Number(ctx.request.input("subject_product_id"));
        const object = Number(ctx.request.input("object_product_id"));
        if (!subject || !object)
            throw new Exception("دو شناسه محصول لازم است", { status: 422, code: "E_DISCOVERY_COMPATIBILITY_INPUT" });
        const negative = await DiscoveryProductRelationship.query()
            .where("subject_product_id", subject)
            .where("object_product_id", object)
            .where("status", "active")
            .where("state", "not_compatible")
            .first();
        if (negative) return { data: { state: "not_compatible", edge: negative } };
        const positive = await DiscoveryProductRelationship.query()
            .where("subject_product_id", subject)
            .where("object_product_id", object)
            .where("status", "active")
            .where("state", "compatible")
            .first();
        return { data: { state: positive ? "compatible" : "unknown", edge: positive } };
    }

    async opportunities(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoveryOpportunityListValidator);
        return adminDiscoveryOpportunitiesView.run(DiscoveryOpportunity.query(), payload as never);
    }
    async detectOpportunities(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "opportunity:write");
        await lock("opportunity-detection");
        const result = await currentTrx().rawQuery(
            `SELECT normalized_query, count(*)::int AS queries, count(DISTINCT session_hash)::int AS sessions FROM discovery_search_events WHERE event_type='zero_result' AND normalized_query IS NOT NULL AND occurred_at >= now()-interval '30 days' GROUP BY normalized_query HAVING count(*) >= 3 ORDER BY count(*) DESC LIMIT 200`,
        );
        let created = 0,
            updated = 0;
        for (const r of result.rows) {
            const query = String(r.normalized_query);
            const matches = await searchProducts({ query, locale: "fa", limit: 3 });
            const type = matches.data.length === 0 ? "MISSING_PRODUCT" : "SEARCH_RELEVANCE_GAP";
            const fingerprint = createHash("sha256").update(`${type}:${query}`).digest("hex");
            let row = await DiscoveryOpportunity.query().where("fingerprint", fingerprint).first();
            const values = {
                type,
                title: type === "MISSING_PRODUCT" ? `تقاضای بدون محصول: ${query}` : `شکاف بازیابی: ${query}`,
                summary:
                    type === "MISSING_PRODUCT"
                        ? "در ۳۰ روز اخیر چند جست‌وجوی بدون نتیجه ثبت شده و پس از بازیابی مجدد نیز محصول فعالی پیدا نشد."
                        : "جست‌وجوی بدون نتیجه ثبت شده اما اکنون محصول قابل‌بازیابی وجود دارد؛ تنظیمات، ویژگی‌ها یا ایندکس بررسی شود.",
                query,
                queryCount: Number(r.queries),
                uniqueSessions: Number(r.sessions),
                confidenceClass: "derived",
                recommendedActions:
                    type === "MISSING_PRODUCT"
                        ? ["بررسی موجودی و سبد محصول", "بررسی محصول/واریانت جدید"]
                        : ["بررسی ایندکس", "بررسی synonym و attribute"],
            };
            if (row) {
                row.merge(values);
                row.version += 1;
                await row.save();
                updated++;
            } else {
                row = await DiscoveryOpportunity.create({ fingerprint, status: "detected", ...values });
                created++;
            }
            await DiscoveryOpportunityEvidence.create({
                opportunityId: row.id,
                evidenceType: "zero_result_30d",
                payload: { queries: Number(r.queries), sessions: Number(r.sessions) },
            });
        }
        await recordAudit({
            ctx,
            action: "discovery.opportunity.detect",
            entityKind: "discovery_opportunity",
            entityId: null,
            payload: { created, updated },
        });
        return { data: { created, updated } };
    }
    async opportunityAction(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "opportunity:write");
        const payload = await ctx.request.validateUsing(discoveryOpportunityActionValidator);
        const row = await DiscoveryOpportunity.findOrFail(numericId(ctx));
        if (row.version !== payload.expected_version) conflict("این فرصت توسط کاربر دیگری تغییر کرده است؛ صفحه را تازه‌سازی کنید");
        const map: Record<string, string> = {
            triage: "triaged",
            accept: "accepted",
            reject: "rejected",
            assign: "assigned",
            start: "in_progress",
            implement: "implemented",
            measure: "measuring",
            validate: "validated",
            close: "closed",
            insufficient_evidence: "insufficient_evidence",
            duplicate: "duplicate",
        };
        row.status = map[payload.action]!;
        if (payload.assigned_to_user_id) row.assignedToUserId = payload.assigned_to_user_id;
        if (payload.note) row.resolutionNote = payload.note;
        row.version += 1;
        await row.save();
        await recordAudit({
            ctx,
            action: `discovery.opportunity.${payload.action}`,
            entityKind: "discovery_opportunity",
            entityId: Number(row.id),
            payload,
        });
        return { data: row };
    }

    async policies(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const payload = await ctx.request.validateUsing(discoveryPolicyListValidator);
        return adminDiscoveryPoliciesView.run(DiscoverySearchPolicy.query(), payload as never);
    }
    async policyCreate(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "governance:write");
        const payload = await ctx.request.validateUsing(discoveryPolicyCreateValidator);
        await lock("policies");
        const user = await actor(ctx);
        const policy = await DiscoverySearchPolicy.create({
            name: payload.name,
            status: "draft",
            activeVersion: null,
            createdByUserId: user,
            updatedByUserId: user,
        });
        await DiscoverySearchPolicyVersion.create({
            policyId: policy.id,
            versionNumber: 1,
            maxResults: payload.max_results,
            typoTolerance: payload.typo_tolerance,
            typoMaxEdits: payload.typo_max_edits,
            rankingWeights: payload.ranking_weights ?? {},
            configuration: {},
            reason: payload.reason ?? null,
            createdByUserId: user,
        });
        ctx.response.status(201);
        await recordAudit({
            ctx,
            action: "discovery.policy.create",
            entityKind: "discovery_search_policy",
            entityId: Number(policy.id),
            payload,
        });
        return { data: policy };
    }
    async policyVersion(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "governance:write");
        const payload = await ctx.request.validateUsing(discoveryPolicyVersionValidator);
        await lock("policies");
        const policy = await DiscoverySearchPolicy.findOrFail(numericId(ctx));
        if (policy.version !== payload.expected_version) conflict("نسخه سیاست تغییر کرده است؛ صفحه را تازه‌سازی کنید");
        const last = await DiscoverySearchPolicyVersion.query()
            .where("policy_id", Number(policy.id))
            .orderBy("version_number", "desc")
            .first();
        const n = (last?.versionNumber ?? 0) + 1;
        const version = await DiscoverySearchPolicyVersion.create({
            policyId: policy.id,
            versionNumber: n,
            maxResults: payload.max_results,
            typoTolerance: payload.typo_tolerance,
            typoMaxEdits: payload.typo_max_edits,
            rankingWeights: payload.ranking_weights ?? {},
            configuration: {},
            reason: payload.reason ?? null,
            createdByUserId: await actor(ctx),
        });
        policy.version += 1;
        policy.updatedByUserId = await actor(ctx);
        await policy.save();
        await recordAudit({
            ctx,
            action: "discovery.policy.version",
            entityKind: "discovery_search_policy",
            entityId: Number(policy.id),
            payload: { version: n },
        });
        return { data: version };
    }
    async policyActivate(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "governance:write");
        await lock("policies");
        const policy = await DiscoverySearchPolicy.findOrFail(numericId(ctx));
        const v = Number(ctx.request.input("version"));
        const version = await DiscoverySearchPolicyVersion.query()
            .where("policy_id", Number(policy.id))
            .where("version_number", v)
            .firstOrFail();
        await DiscoverySearchPolicy.query().where("status", "active").update({ status: "archived" });
        policy.status = "active";
        policy.activeVersion = version.versionNumber;
        policy.version += 1;
        policy.updatedByUserId = await actor(ctx);
        await policy.save();
        await applyActivePolicyToIndexes();
        await recordAudit({
            ctx,
            action: "discovery.policy.activate",
            entityKind: "discovery_search_policy",
            entityId: Number(policy.id),
            payload: { version: v },
        });
        return { data: policy };
    }
    async policyRollback(ctx: HttpContext) {
        return this.policyActivate(ctx);
    }
    async indexHealth(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "read");
        const backend = await probeSearchBackend();
        const meili = backend.reachable ? await import("#services/meilisearch").then((m) => m.getMeilisearch()) : null;
        const productCount = Number(
            (await Product.query().where("status", "publish").whereNull("deleted_at").count("id as count").first())?.$extras
                .count ?? 0,
        );
        const tenant = currentTenantId();
        const counts: Record<string, number | null> = { fa: null, en: null };
        if (meili) {
            for (const locale of ["fa", "en"]) {
                try {
                    const stats = await meili.index(`calibra_products_${tenant}_${locale}`).getStats();
                    counts[locale] = stats.numberOfDocuments;
                } catch {
                    counts[locale] = null;
                }
            }
        }
        const rows = await DiscoveryIndexOperation.query().select("status").count("id as count").groupBy("status");
        const operations = Object.fromEntries(rows.map((r) => [r.status, Number(r.$extras.count ?? 0)]));
        const last = await DiscoveryIndexOperation.query().where("status", "succeeded").orderBy("completed_at", "desc").first();
        return {
            data: {
                available: backend.reachable,
                configured: backend.configured,
                product_count: productCount,
                fa_index: counts.fa,
                en_index: counts.en,
                degraded: !backend.reachable,
                operations,
                last_success_at: last?.completedAt?.toISO() ?? null,
            },
        };
    }
    async retryIndex(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "reindex");
        const row = await retryIndexOperation(numericId(ctx));
        await recordAudit({
            ctx,
            action: "discovery.index.retry",
            entityKind: "discovery_index_operation",
            entityId: Number(row.id),
            payload: { status: row.status },
        });
        return { data: row };
    }
    async rebuild(ctx: HttpContext) {
        await requireDiscoveryPermission(ctx, "reindex");
        const result = await rebuildIndexes();
        await recordAudit({
            ctx,
            action: "discovery.index.rebuild",
            entityKind: "discovery_index",
            entityId: null,
            payload: result,
        });
        return { data: result };
    }
}
