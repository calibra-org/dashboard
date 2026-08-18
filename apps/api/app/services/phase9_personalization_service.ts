import { createHash, randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import Product from "#models/product";
import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";
import ProductTransformer from "#transformers/product_transformer";

export type Subject = { type: "visitor" | "customer"; id: string };
export type SelectionMode = "manual" | "smart" | "controlled_random" | "hybrid";

export interface CampaignInput {
    name: string;
    selection_mode?: SelectionMode;
    min_discount_percent?: number;
    max_items?: number;
    rotation_minutes?: number;
    starts_at?: string | null;
    ends_at?: string | null;
    rules?: Record<string, unknown>;
    product_ids?: number[];
    pinned_product_ids?: number[];
    expected_version?: number;
}

export interface RecommendationContext {
    placement: string;
    limit?: number;
    subject?: Subject | null;
    locale?: string;
    exclude_product_ids?: number[];
}

interface EligibleProduct {
    id: number;
    discountPercent: number;
    categories: number[];
    brands: number[];
    transformed: Record<string, unknown>;
}

const SETTINGS_GROUP = "personalization";
const POLICY_VERSION = "phase9-v1";
const MODEL_VERSION = "rules-v1";
const RECENT_LIMIT = 30;

export default class Phase9PersonalizationService {
    private settings = new SettingsService();

    async runtimeSettings() {
        return {
            enabled: await this.settings.get(SETTINGS_GROUP, "enabled", true),
            kill_switch: await this.settings.get(SETTINGS_GROUP, "kill_switch", false),
            homepage_enabled: await this.settings.get(SETTINGS_GROUP, "homepage_enabled", true),
            homepage_campaign_id: await this.settings.get<number | null>(SETTINGS_GROUP, "homepage_campaign_id", null),
            default_limit: await this.settings.get(SETTINGS_GROUP, "default_limit", 8),
        };
    }

    async updateRuntimeSettings(input: Record<string, unknown>) {
        if (typeof input.enabled === "boolean") await this.settings.set(SETTINGS_GROUP, "enabled", input.enabled, "boolean");
        if (typeof input.kill_switch === "boolean")
            await this.settings.set(SETTINGS_GROUP, "kill_switch", input.kill_switch, "boolean");
        if (typeof input.homepage_enabled === "boolean")
            await this.settings.set(SETTINGS_GROUP, "homepage_enabled", input.homepage_enabled, "boolean");
        if (input.homepage_campaign_id === null || Number.isInteger(input.homepage_campaign_id)) {
            await this.settings.set(SETTINGS_GROUP, "homepage_campaign_id", input.homepage_campaign_id ?? null, "json");
        }
        if (Number.isInteger(input.default_limit)) {
            const limit = clamp(Number(input.default_limit), 1, 24);
            await this.settings.set(SETTINGS_GROUP, "default_limit", limit, "number");
        }
        return this.runtimeSettings();
    }

    async listCampaigns() {
        const rows = await currentTrx().from("deal_campaigns").orderBy("created_at", "desc");
        const ids = rows.map((row) => Number(row.id));
        const products = ids.length
            ? await currentTrx().from("deal_campaign_products").whereIn("campaign_id", ids).orderBy("position", "asc")
            : [];
        return rows.map((row) => ({
            ...serializeCampaign(row),
            products: products
                .filter((p) => Number(p.campaign_id) === Number(row.id))
                .map((p) => ({
                    product_id: Number(p.product_id),
                    pinned: Boolean(p.pinned),
                    position: Number(p.position),
                })),
        }));
    }

    async createCampaign(input: CampaignInput, actorUserId?: number | null) {
        validateCampaign(input);
        const now = DateTime.utc().toSQL();
        const [row] = await currentTrx()
            .table("deal_campaigns")
            .insert({
                tenant_id: currentTenantId(),
                name: input.name.trim(),
                status: "draft",
                selection_mode: input.selection_mode ?? "smart",
                min_discount_percent: clamp(input.min_discount_percent ?? 10, 1, 100),
                max_items: clamp(input.max_items ?? 8, 1, 48),
                rotation_minutes: clamp(input.rotation_minutes ?? 60, 5, 10080),
                starts_at: parseDate(input.starts_at),
                ends_at: parseDate(input.ends_at),
                rules: JSON.stringify(input.rules ?? {}),
                created_by_user_id: actorUserId ?? null,
                version: 1,
                created_at: now,
                updated_at: now,
            })
            .returning("*");
        await this.replaceCampaignProducts(Number(row.id), input.product_ids ?? [], input.pinned_product_ids ?? []);
        return this.getCampaign(Number(row.id));
    }

    async updateCampaign(id: number, input: CampaignInput) {
        validateCampaign(input, true);
        const trx = currentTrx();
        const row = await trx.from("deal_campaigns").where("id", id).forUpdate().first();
        if (!row) return null;
        if (input.expected_version !== undefined && Number(row.version) !== input.expected_version) {
            throw new Phase9ConflictError("campaign_version_conflict");
        }
        const patch: Record<string, unknown> = { updated_at: DateTime.utc().toSQL(), version: Number(row.version) + 1 };
        if (input.name !== undefined) patch.name = input.name.trim();
        if (input.selection_mode !== undefined) patch.selection_mode = input.selection_mode;
        if (input.min_discount_percent !== undefined) patch.min_discount_percent = clamp(input.min_discount_percent, 1, 100);
        if (input.max_items !== undefined) patch.max_items = clamp(input.max_items, 1, 48);
        if (input.rotation_minutes !== undefined) patch.rotation_minutes = clamp(input.rotation_minutes, 5, 10080);
        if (input.starts_at !== undefined) patch.starts_at = parseDate(input.starts_at);
        if (input.ends_at !== undefined) patch.ends_at = parseDate(input.ends_at);
        if (input.rules !== undefined) patch.rules = JSON.stringify(input.rules);
        await trx.from("deal_campaigns").where("id", id).update(patch);
        if (input.product_ids !== undefined || input.pinned_product_ids !== undefined) {
            const existing = await trx.from("deal_campaign_products").where("campaign_id", id);
            const ids = input.product_ids ?? existing.map((p) => Number(p.product_id));
            const pinned = input.pinned_product_ids ?? existing.filter((p) => p.pinned).map((p) => Number(p.product_id));
            await this.replaceCampaignProducts(id, ids, pinned);
        }
        return this.getCampaign(id);
    }

    async publishCampaign(id: number, expectedVersion?: number) {
        const trx = currentTrx();
        const row = await trx.from("deal_campaigns").where("id", id).forUpdate().first();
        if (!row) return null;
        if (expectedVersion !== undefined && Number(row.version) !== expectedVersion)
            throw new Phase9ConflictError("campaign_version_conflict");
        const preview = await this.resolveCampaignProducts(row, "fa");
        if (preview.length === 0) throw new Phase9ValidationError("campaign_has_no_eligible_products");
        const now = DateTime.utc();
        const starts = row.starts_at ? DateTime.fromJSDate(new Date(row.starts_at)) : null;
        const status = starts && starts > now ? "scheduled" : "active";
        await trx
            .from("deal_campaigns")
            .where("id", id)
            .update({ status, published_at: now.toSQL(), updated_at: now.toSQL(), version: Number(row.version) + 1 });
        return this.getCampaign(id);
    }

    async pauseCampaign(id: number, expectedVersion?: number) {
        const trx = currentTrx();
        const row = await trx.from("deal_campaigns").where("id", id).forUpdate().first();
        if (!row) return null;
        if (expectedVersion !== undefined && Number(row.version) !== expectedVersion)
            throw new Phase9ConflictError("campaign_version_conflict");
        await trx
            .from("deal_campaigns")
            .where("id", id)
            .update({ status: "paused", updated_at: DateTime.utc().toSQL(), version: Number(row.version) + 1 });
        return this.getCampaign(id);
    }

    async amazingDeals(locale = "fa", limit?: number) {
        const settings = await this.runtimeSettings();
        if (!settings.enabled || settings.kill_switch || !settings.homepage_enabled) return [];
        const now = DateTime.utc().toSQL();
        let campaign = null;
        if (settings.homepage_campaign_id) {
            campaign = await currentTrx()
                .from("deal_campaigns")
                .where("id", settings.homepage_campaign_id)
                .whereIn("status", ["active", "scheduled"])
                .where((q) => q.whereNull("starts_at").orWhere("starts_at", "<=", now))
                .where((q) => q.whereNull("ends_at").orWhere("ends_at", ">", now))
                .first();
        }
        if (!campaign) {
            campaign = await currentTrx()
                .from("deal_campaigns")
                .whereIn("status", ["active", "scheduled"])
                .where((q) => q.whereNull("starts_at").orWhere("starts_at", "<=", now))
                .where((q) => q.whereNull("ends_at").orWhere("ends_at", ">", now))
                .orderBy("published_at", "desc")
                .first();
        }
        if (!campaign) return [];
        const resolved = await this.resolveCampaignProducts(campaign, locale);
        return resolved.slice(0, clamp(limit ?? Number(campaign.max_items ?? settings.default_limit), 1, 24)).map((p) => ({
            ...p.transformed,
            discount_percent: p.discountPercent,
            reason_code: p.reasonCode,
            campaign_id: Number(campaign.id),
            campaign_name: campaign.name,
        }));
    }

    async recommendations(context: RecommendationContext) {
        const settings = await this.runtimeSettings();
        const requestId = randomUUID();
        const limit = clamp(context.limit ?? settings.default_limit, 1, 24);
        if (!settings.enabled || settings.kill_switch)
            return { request_id: requestId, exposure_id: null, items: [], fallback: "disabled" };
        const placement = await this.getPlacement(context.placement);
        if (placement && !placement.enabled)
            return { request_id: requestId, exposure_id: null, items: [], fallback: "placement_disabled" };
        const locale = context.locale ?? "fa";
        const consent = context.subject ? await this.getConsent(context.subject) : null;
        const personalized = Boolean(context.subject && consent?.personalization);
        const candidates = await this.loadEligibleProducts(0, locale, 160, false);
        const excluded = new Set(context.exclude_product_ids ?? []);
        let profile: Record<string, unknown> | null = null;
        if (personalized && context.subject) profile = await this.getProfile(context.subject);
        const recent = new Set<number>(
            Array.isArray(profile?.recent_product_ids) ? (profile?.recent_product_ids as unknown[]).map(Number) : [],
        );
        const categoryAffinity = asNumberRecord(profile?.category_affinity);
        const brandAffinity = asNumberRecord(profile?.brand_affinity);
        const ranked = candidates
            .filter((p) => !excluded.has(p.id))
            .map((p) => {
                let score = p.discountPercent * 2;
                let reasonCode = "popular_fallback";
                if (personalized) {
                    const affinity =
                        p.categories.reduce((s, id) => s + (categoryAffinity[String(id)] ?? 0), 0) +
                        p.brands.reduce((s, id) => s + (brandAffinity[String(id)] ?? 0), 0);
                    if (affinity > 0) {
                        score += affinity * 15;
                        reasonCode = "category_brand_affinity";
                    }
                    if (recent.has(p.id)) {
                        score -= 35;
                    }
                }
                if ((p.transformed as { featured?: boolean }).featured) score += 8;
                return { ...p, score, reasonCode };
            })
            .sort((a, b) => b.score - a.score || a.id - b.id)
            .slice(0, limit);
        let exposureId: string | null = null;
        if (context.subject && consent && (consent.analytics || consent.personalization) && ranked.length) {
            exposureId = randomUUID();
            await currentTrx()
                .table("recommendation_exposures")
                .insert({
                    tenant_id: currentTenantId(),
                    exposure_id: exposureId,
                    request_id: requestId,
                    subject_type: context.subject.type,
                    subject_id: context.subject.id,
                    placement: context.placement,
                    product_ids: JSON.stringify(ranked.map((p) => p.id)),
                    policy_version: POLICY_VERSION,
                    model_version: MODEL_VERSION,
                    created_at: DateTime.utc().toSQL(),
                });
        }
        return {
            request_id: requestId,
            exposure_id: exposureId,
            policy_version: POLICY_VERSION,
            model_version: MODEL_VERSION,
            personalized,
            items: ranked.map((p) => ({ ...p.transformed, reason_code: p.reasonCode })),
        };
    }

    async ingestEvent(input: Record<string, unknown>, subject: Subject | null) {
        const eventId = String(input.event_id ?? randomUUID());
        const eventType = String(input.event_type ?? "");
        if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(eventType)) throw new Phase9ValidationError("invalid_event_type");
        const consent = subject ? await this.getConsent(subject) : null;
        if (!subject || !consent || (!consent.analytics && !consent.personalization))
            return { accepted: false, reason: "consent_required" };
        const occurred = parseEventDate(input.occurred_at);
        const productId = input.product_id == null ? null : Number(input.product_id);
        if (productId !== null && (!Number.isInteger(productId) || productId < 1))
            throw new Phase9ValidationError("invalid_product_id");
        const inserted = await currentTrx()
            .table("personalization_events")
            .insert({
                tenant_id: currentTenantId(),
                event_id: eventId,
                event_type: eventType,
                schema_version: clamp(Number(input.schema_version ?? 1), 1, 99),
                visitor_id: subject.type === "visitor" ? subject.id : null,
                customer_id: subject.type === "customer" ? Number(subject.id) : null,
                session_id: typeof input.session_id === "string" ? input.session_id.slice(0, 96) : null,
                product_id: productId,
                placement: typeof input.placement === "string" ? input.placement.slice(0, 64) : null,
                payload: JSON.stringify(sanitizePayload(input.payload)),
                consent_snapshot: JSON.stringify({
                    analytics: consent.analytics,
                    personalization: consent.personalization,
                    policy_version: consent.policy_version,
                }),
                occurred_at: occurred.toSQL(),
                received_at: DateTime.utc().toSQL(),
            })
            .onConflict(["tenant_id", "event_id"])
            .ignore()
            .returning("id");
        if (inserted.length && consent.personalization && productId) await this.updateProfile(subject, productId, eventType);
        return { accepted: true, deduplicated: inserted.length === 0, event_id: eventId };
    }

    async getConsent(subject: Subject) {
        const row = await currentTrx()
            .from("personalization_consents")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .first();
        return row
            ? serializeConsent(row)
            : {
                  subject_type: subject.type,
                  subject_id: subject.id,
                  analytics: false,
                  personalization: false,
                  source: "default",
                  policy_version: "v1",
                  version: 0,
              };
    }

    async updateConsent(subject: Subject, input: Record<string, unknown>) {
        const analytics = input.analytics === true;
        const personalization = input.personalization === true;
        const source = typeof input.source === "string" ? input.source.slice(0, 64) : "preferences";
        const policy = typeof input.policy_version === "string" ? input.policy_version.slice(0, 32) : "v1";
        const now = DateTime.utc().toSQL();
        await currentTrx()
            .table("personalization_consents")
            .insert({
                tenant_id: currentTenantId(),
                subject_type: subject.type,
                subject_id: subject.id,
                analytics,
                personalization,
                source,
                policy_version: policy,
                version: 1,
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "subject_type", "subject_id"])
            .merge({
                analytics,
                personalization,
                source,
                policy_version: policy,
                updated_at: now,
                version: currentTrx().raw("personalization_consents.version + 1"),
            });
        if (!personalization)
            await currentTrx()
                .from("personalization_profiles")
                .where("subject_type", subject.type)
                .where("subject_id", subject.id)
                .delete();
        return this.getConsent(subject);
    }

    async resetProfile(subject: Subject) {
        await currentTrx()
            .from("personalization_profiles")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .delete();
        return { reset: true };
    }

    async listPlacements() {
        await this.ensureDefaultPlacements();
        return currentTrx().from("personalization_placements").orderBy("placement", "asc");
    }

    async updatePlacement(placement: string, input: Record<string, unknown>) {
        await this.ensureDefaultPlacements();
        const trx = currentTrx();
        const row = await trx.from("personalization_placements").where("placement", placement).forUpdate().first();
        if (!row) return null;
        if (input.expected_version !== undefined && Number(input.expected_version) !== Number(row.version))
            throw new Phase9ConflictError("placement_version_conflict");
        await trx
            .from("personalization_placements")
            .where("id", row.id)
            .update({
                enabled: typeof input.enabled === "boolean" ? input.enabled : row.enabled,
                strategy: typeof input.strategy === "string" ? String(input.strategy).slice(0, 32) : row.strategy,
                max_items: input.max_items !== undefined ? clamp(Number(input.max_items), 1, 48) : row.max_items,
                exploration_percent:
                    input.exploration_percent !== undefined
                        ? clamp(Number(input.exploration_percent), 0, 50)
                        : row.exploration_percent,
                rules: input.rules !== undefined ? JSON.stringify(sanitizePayload(input.rules)) : row.rules,
                version: Number(row.version) + 1,
                updated_at: DateTime.utc().toSQL(),
            });
        return trx.from("personalization_placements").where("id", row.id).first();
    }

    async overview() {
        const trx = currentTrx();
        const [events, exposures, campaigns] = await Promise.all([
            trx.from("personalization_events").count("* as total").first(),
            trx.from("recommendation_exposures").count("* as total").first(),
            trx.from("deal_campaigns").select("status").count("* as total").groupBy("status"),
        ]);
        return {
            event_count: Number(events?.total ?? 0),
            exposure_count: Number(exposures?.total ?? 0),
            campaigns: Object.fromEntries(campaigns.map((r) => [String(r.status), Number(r.total)])),
            settings: await this.runtimeSettings(),
        };
    }

    async health() {
        const latest = await currentTrx().from("personalization_events").max("received_at as latest").first();
        return {
            status: "ok",
            latest_event_at: latest?.latest ?? null,
            settings: await this.runtimeSettings(),
            policy_version: POLICY_VERSION,
            model_version: MODEL_VERSION,
        };
    }

    async recentEvents(limit = 50) {
        return currentTrx()
            .from("personalization_events")
            .orderBy("received_at", "desc")
            .limit(clamp(limit, 1, 100));
    }

    async recentConsents(limit = 50) {
        return currentTrx()
            .from("personalization_consents")
            .orderBy("updated_at", "desc")
            .limit(clamp(limit, 1, 100));
    }

    async simulate(input: Record<string, unknown>, locale = "fa") {
        const subject = parseSubject(input.subject);
        const result = await this.recommendations({
            placement: String(input.placement ?? "home"),
            limit: clamp(Number(input.limit ?? 8), 1, 24),
            subject,
            locale,
            exclude_product_ids: Array.isArray(input.exclude_product_ids) ? input.exclude_product_ids.map(Number) : [],
        });
        return {
            dry_run: true,
            steps: ["candidate_generation", "hard_eligibility", "rule_ranking", "diversity", "final_eligibility"],
            result,
        };
    }

    private async getCampaign(id: number) {
        const row = await currentTrx().from("deal_campaigns").where("id", id).first();
        if (!row) return null;
        const products = await currentTrx().from("deal_campaign_products").where("campaign_id", id).orderBy("position", "asc");
        return {
            ...serializeCampaign(row),
            products: products.map((p) => ({
                product_id: Number(p.product_id),
                pinned: Boolean(p.pinned),
                position: Number(p.position),
            })),
        };
    }

    private async replaceCampaignProducts(campaignId: number, productIds: number[], pinnedIds: number[]) {
        const ids = uniqueIds(productIds);
        const pinned = new Set(uniqueIds(pinnedIds));
        if (ids.length) {
            const valid = await currentTrx().from("products").whereIn("id", ids).whereNull("deleted_at").select("id");
            if (valid.length !== ids.length) throw new Phase9ValidationError("invalid_campaign_product");
        }
        await currentTrx().from("deal_campaign_products").where("campaign_id", campaignId).delete();
        if (ids.length)
            await currentTrx()
                .table("deal_campaign_products")
                .insert(
                    ids.map((id, index) => ({
                        tenant_id: currentTenantId(),
                        campaign_id: campaignId,
                        product_id: id,
                        pinned: pinned.has(id),
                        position: index,
                        created_at: DateTime.utc().toSQL(),
                        updated_at: DateTime.utc().toSQL(),
                    })),
                );
    }

    private async resolveCampaignProducts(campaign: Record<string, unknown>, locale: string) {
        const eligible = await this.loadEligibleProducts(Number(campaign.min_discount_percent ?? 10), locale, 240);
        const links = await currentTrx()
            .from("deal_campaign_products")
            .where("campaign_id", Number(campaign.id))
            .orderBy("position", "asc");
        const map = new Map(eligible.map((p) => [p.id, p]));
        const manual = links.map((l) => map.get(Number(l.product_id))).filter((p): p is EligibleProduct => Boolean(p));
        const pinned = links
            .filter((l) => l.pinned)
            .map((l) => map.get(Number(l.product_id)))
            .filter((p): p is EligibleProduct => Boolean(p));
        const mode = String(campaign.selection_mode) as SelectionMode;
        let selected: EligibleProduct[];
        const reasons = new Map<number, string>();
        if (mode === "manual") {
            selected = manual;
            manual.forEach((p) => {
                reasons.set(p.id, "manual_deal");
            });
        } else if (mode === "controlled_random") {
            selected = deterministicRotate(eligible, campaign);
            selected.forEach((p) => {
                reasons.set(p.id, "rotating_deal");
            });
        } else if (mode === "hybrid") {
            const rest = deterministicRotate(
                eligible.filter((p) => !pinned.some((x) => x.id === p.id)),
                campaign,
            );
            selected = [...pinned, ...rest];
            pinned.forEach((p) => {
                reasons.set(p.id, "pinned_deal");
            });
            rest.forEach((p) => {
                reasons.set(p.id, "rotating_deal");
            });
        } else {
            selected = [...eligible].sort((a, b) => b.discountPercent - a.discountPercent || a.id - b.id);
            selected.forEach((p) => {
                reasons.set(p.id, "high_discount");
            });
        }
        return selected
            .slice(0, clamp(Number(campaign.max_items ?? 8), 1, 48))
            .map((p) => ({ ...p, reasonCode: reasons.get(p.id) ?? "high_discount" }));
    }

    private async loadEligibleProducts(
        minDiscount: number,
        locale: string,
        limit: number,
        saleOnly = true,
    ): Promise<EligibleProduct[]> {
        const query = Product.query({ client: currentTrx() }).apply((scopes) => scopes.published());
        if (saleOnly) query.whereNotNull("sale_price");
        const products = await query
            .preload("translations")
            .preload("images", (q) => q.preload("media"))
            .preload("inventoryItems")
            .preload("categories", (q) => q.preload("translations"))
            .preload("brands", (q) => q.preload("translations"))
            .orderBy("id", "desc")
            .limit(limit);
        const out: EligibleProduct[] = [];
        for (const p of products) {
            const object = new ProductTransformer(p, locale).toObject() as Record<string, unknown>;
            const regular = Number(object.regular_price ?? 0);
            const effective = Number(object.effective_price ?? regular);
            if (!Number.isFinite(regular) || regular <= 0 || !Number.isFinite(effective) || effective <= 0) continue;
            if (saleOnly && object.on_sale !== true) continue;
            if (saleOnly && effective >= regular) continue;
            const stockManaged = p.inventoryItems.some((i) => Boolean(i.manageStock));
            const inStock =
                !stockManaged ||
                p.inventoryItems.some(
                    (i) => !i.manageStock || (i.stockStatus !== "outofstock" && Number(i.stockQuantity ?? 0) > 0),
                );
            if (!inStock) continue;
            const discount = effective < regular ? Math.max(0, Math.round(((regular - effective) / regular) * 100)) : 0;
            if (saleOnly && discount < minDiscount) continue;
            out.push({
                id: Number(p.id),
                discountPercent: discount,
                categories: (p.categories ?? []).map((c) => Number(c.id)),
                brands: (p.brands ?? []).map((b) => Number(b.id)),
                transformed: object,
            });
        }
        return out;
    }

    private async updateProfile(subject: Subject, productId: number, eventType: string) {
        const weight = eventWeight(eventType);
        const trx = currentTrx();
        const profile = await trx
            .from("personalization_profiles")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .forUpdate()
            .first();
        const recent = uniqueIds([productId, ...((profile?.recent_product_ids as number[] | undefined) ?? []).map(Number)]).slice(
            0,
            RECENT_LIMIT,
        );
        const categories = await trx.from("product_category_links").where("product_id", productId).select("category_id");
        const brands = await trx.from("product_brand_links").where("product_id", productId).select("brand_id");
        const cat = asNumberRecord(profile?.category_affinity);
        const brand = asNumberRecord(profile?.brand_affinity);
        for (const row of categories)
            cat[String(row.category_id)] = Math.min(100, (cat[String(row.category_id)] ?? 0) * 0.98 + weight);
        for (const row of brands) brand[String(row.brand_id)] = Math.min(100, (brand[String(row.brand_id)] ?? 0) * 0.98 + weight);
        const now = DateTime.utc().toSQL();
        await trx
            .table("personalization_profiles")
            .insert({
                tenant_id: currentTenantId(),
                subject_type: subject.type,
                subject_id: subject.id,
                recent_product_ids: JSON.stringify(recent),
                category_affinity: JSON.stringify(cat),
                brand_affinity: JSON.stringify(brand),
                version: 1,
                created_at: now,
                updated_at: now,
            })
            .onConflict(["tenant_id", "subject_type", "subject_id"])
            .merge({
                recent_product_ids: JSON.stringify(recent),
                category_affinity: JSON.stringify(cat),
                brand_affinity: JSON.stringify(brand),
                updated_at: now,
                version: trx.raw("personalization_profiles.version + 1"),
            });
    }

    private async getProfile(subject: Subject) {
        return currentTrx()
            .from("personalization_profiles")
            .where("subject_type", subject.type)
            .where("subject_id", subject.id)
            .first();
    }

    private async getPlacement(placement: string) {
        await this.ensureDefaultPlacements();
        return currentTrx().from("personalization_placements").where("placement", placement).first();
    }

    private async ensureDefaultPlacements() {
        const now = DateTime.utc().toSQL();
        for (const placement of ["home", "product", "cart", "search", "account"]) {
            await currentTrx()
                .table("personalization_placements")
                .insert({
                    tenant_id: currentTenantId(),
                    placement,
                    enabled: true,
                    strategy: "contextual",
                    max_items: 8,
                    exploration_percent: 5,
                    rules: JSON.stringify({}),
                    version: 1,
                    created_at: now,
                    updated_at: now,
                })
                .onConflict(["tenant_id", "placement"])
                .ignore();
        }
    }
}

export class Phase9ValidationError extends Error {}
export class Phase9ConflictError extends Error {}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min));
}
function uniqueIds(values: number[]) {
    return [...new Set(values.map(Number).filter((v) => Number.isInteger(v) && v > 0))];
}
function parseDate(value: string | null | undefined) {
    if (!value) return null;
    const dt = DateTime.fromISO(value, { setZone: true });
    if (!dt.isValid) throw new Phase9ValidationError("invalid_datetime");
    return dt.toUTC().toSQL();
}
function parseEventDate(value: unknown) {
    const dt = typeof value === "string" ? DateTime.fromISO(value, { setZone: true }) : DateTime.utc();
    if (!dt.isValid || Math.abs(dt.diffNow("days").days) > 7) throw new Phase9ValidationError("invalid_event_time");
    return dt.toUTC();
}
function validateCampaign(input: CampaignInput, partial = false) {
    if (!partial && (!input.name || input.name.trim().length < 2)) throw new Phase9ValidationError("campaign_name_required");
    if (input.name !== undefined && input.name.trim().length > 190) throw new Phase9ValidationError("campaign_name_too_long");
    const start = input.starts_at ? DateTime.fromISO(input.starts_at) : null;
    const end = input.ends_at ? DateTime.fromISO(input.ends_at) : null;
    if (start && end && end <= start) throw new Phase9ValidationError("invalid_campaign_window");
}
function sanitizePayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30))
        if (!/email|phone|password|token|secret/i.test(k)) out[k.slice(0, 64)] = typeof v === "string" ? v.slice(0, 500) : v;
    return out;
}
function asNumberRecord(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => Number.isFinite(Number(v)))
            .map(([k, v]) => [k, Number(v)]),
    );
}
function eventWeight(type: string) {
    if (type.includes("purchase")) return 8;
    if (type.includes("add_to_cart")) return 5;
    if (type.includes("wishlist") || type.includes("save")) return 4;
    if (type.includes("click")) return 2;
    return 1;
}
function deterministicRotate(products: EligibleProduct[], campaign: Record<string, unknown>) {
    const minutes = clamp(Number(campaign.rotation_minutes ?? 60), 5, 10080);
    const bucket = Math.floor(Date.now() / (minutes * 60_000));
    return [...products].sort(
        (a, b) =>
            seededScore(`${currentTenantId()}:${campaign.id}:${bucket}:${a.id}`) -
            seededScore(`${currentTenantId()}:${campaign.id}:${bucket}:${b.id}`),
    );
}
function seededScore(value: string) {
    return Number.parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}
function serializeCampaign(row: Record<string, unknown>) {
    return {
        id: Number(row.id),
        name: row.name,
        status: row.status,
        selection_mode: row.selection_mode,
        min_discount_percent: Number(row.min_discount_percent),
        max_items: Number(row.max_items),
        rotation_minutes: Number(row.rotation_minutes),
        rules: row.rules ?? {},
        starts_at: row.starts_at ?? null,
        ends_at: row.ends_at ?? null,
        published_at: row.published_at ?? null,
        version: Number(row.version),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function serializeConsent(row: Record<string, unknown>) {
    return {
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        analytics: Boolean(row.analytics),
        personalization: Boolean(row.personalization),
        source: row.source,
        policy_version: row.policy_version,
        version: Number(row.version),
        updated_at: row.updated_at,
    };
}
export function parseSubject(value: unknown): Subject | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const type = v.type === "customer" ? "customer" : v.type === "visitor" ? "visitor" : null;
    const id = typeof v.id === "string" || typeof v.id === "number" ? String(v.id) : "";
    return type && id.length > 0 && id.length <= 96 ? { type, id } : null;
}
