import { createHash } from "node:crypto";
import { DateTime } from "luxon";

import Product from "#models/product";
import DiscoveryMerchandisingRule from "#models/discovery_merchandising_rule";
import DiscoverySearchPolicy from "#models/discovery_search_policy";
import DiscoverySearchPolicyVersion from "#models/discovery_search_policy_version";
import DiscoverySynonymRule from "#models/discovery_synonym_rule";
import { getMeilisearch } from "#services/meilisearch";
import { currentTenantId } from "#services/tenant_context";

import { applyMerchandising, type RuntimeRule } from "./merchandising_engine.js";
import { normalizeDiscoveryQuery } from "./normalizer.js";

export interface DiscoverySearchInput {
    query: string;
    locale?: string;
    limit?: number;
    category_id?: number;
}

function indexName(locale: string): string {
    return `calibra_products_${currentTenantId()}_${locale === "en" ? "en" : "fa"}`;
}

async function waitForSuccessfulTask(meili: NonNullable<ReturnType<typeof getMeilisearch>>, taskUid: number) {
    await meili.tasks.waitForTask(taskUid);
    const task = (await meili.tasks.getTask(taskUid)) as unknown as { status: string };
    if (task.status !== "succeeded") {
        throw new Error(`Meilisearch task ${taskUid} ended with status ${task.status}`);
    }
    return task;
}

function priceOf(product: Product): number | null {
    return product.salePrice !== null
        ? Number(product.salePrice)
        : product.regularPrice !== null
          ? Number(product.regularPrice)
          : null;
}

async function activePolicy() {
    const policy = await DiscoverySearchPolicy.query().where("status", "active").orderBy("updated_at", "desc").first();
    if (!policy?.activeVersion) return null;
    return DiscoverySearchPolicyVersion.query()
        .where("policy_id", Number(policy.id))
        .where("version_number", policy.activeVersion)
        .first();
}

async function synonyms(locale: string, categoryId?: number) {
    const query = DiscoverySynonymRule.query().where("locale", locale).where("enabled", true);
    if (categoryId) {
        query.where((builder) => builder.whereNull("category_id").orWhere("category_id", categoryId));
    } else {
        query.whereNull("category_id");
    }
    return query.orderBy("category_id", "desc");
}

async function rulesFor(query: string): Promise<RuntimeRule[]> {
    const now = DateTime.utc().toSQL();
    const rows = await DiscoveryMerchandisingRule.query()
        .where("status", "active")
        .where((builder) => builder.whereNull("starts_at").orWhere("starts_at", "<=", now!))
        .where((builder) => builder.whereNull("ends_at").orWhere("ends_at", ">", now!));
    return rows
        .filter((row) => !row.queryPattern || normalizeDiscoveryQuery(row.queryPattern) === query)
        .map((row) => ({
            id: Number(row.id),
            action: row.action as RuntimeRule["action"],
            productId: row.productId === null ? null : Number(row.productId),
            categoryId: row.categoryId === null ? null : Number(row.categoryId),
            boostFactor: row.boostFactor === null ? null : Number(row.boostFactor),
            pinPosition: row.pinPosition,
            priority: row.priority,
        }));
}

function richProductQuery(locale: string) {
    return Product.query()
        .where("status", "publish")
        .whereNull("deleted_at")
        .whereNot("catalog_visibility", "hidden")
        .preload("translations", (query) => query.where("locale", locale))
        .preload("categories", (query) => query.preload("translations", (translation) => translation.where("locale", locale)))
        .preload("brands", (query) => query.preload("translations", (translation) => translation.where("locale", locale)))
        .preload("attributeLinks", (query) =>
            query
                .preload("attribute", (attribute) =>
                    attribute.preload("translations", (translation) => translation.where("locale", locale)),
                )
                .preload("terms", (term) => term.preload("translations", (translation) => translation.where("locale", locale))),
        );
}

function serializeDocument(product: Product, locale: string) {
    const translation = product.translations[0];
    const categoryIds = product.categories.map((category) => Number(category.id));
    const categoryNames = product.categories.flatMap((category) => category.translations.map((item) => item.name));
    const brandNames = product.brands.flatMap((brand) => brand.translations.map((item) => item.name));
    const attributeTerms = product.attributeLinks.flatMap((link) => [
        ...link.attribute.translations.map((item) => item.name),
        ...link.terms.flatMap((term) => term.translations.map((item) => item.name)),
    ]);
    const name = translation?.name ?? product.sku ?? `#${product.id}`;
    return {
        id: Number(product.id),
        sku: product.sku,
        name,
        slug: translation?.slug ?? null,
        price_minor: priceOf(product),
        status: product.status,
        catalog_visibility: product.catalogVisibility,
        locale,
        category_ids: categoryIds,
        category_names: categoryNames,
        brand_names: brandNames,
        attribute_terms: attributeTerms,
        search_terms: [name, product.sku, ...categoryNames, ...brandNames, ...attributeTerms].filter(Boolean).join(" "),
    };
}

async function hydrate(ids: number[], locale: string) {
    if (ids.length === 0) return [];
    const products = await Product.query()
        .whereIn("id", ids)
        .where("status", "publish")
        .whereNull("deleted_at")
        .whereNot("catalog_visibility", "hidden")
        .preload("translations", (query) => query.where("locale", locale));
    const byId = new Map(products.map((product) => [Number(product.id), product]));
    return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((product) => {
            const current = product!;
            const translation = current.translations[0];
            return {
                id: Number(current.id),
                sku: current.sku,
                name: translation?.name ?? current.sku ?? `#${current.id}`,
                slug: translation?.slug ?? null,
                price_minor: priceOf(current),
                status: current.status,
                catalog_visibility: current.catalogVisibility,
            };
        });
}

async function categoryMap(ids: number[]): Promise<Map<number, number[]>> {
    if (ids.length === 0) return new Map();
    const rows = await Product.query().whereIn("id", ids).preload("categories");
    return new Map(rows.map((row) => [Number(row.id), row.categories.map((category) => Number(category.id))]));
}

function expandQuery(normalized: string, rules: Awaited<ReturnType<typeof synonyms>>): string {
    const expanded = new Set([normalized]);
    for (const rule of rules) {
        const term = normalizeDiscoveryQuery(rule.term);
        const values = Array.isArray(rule.synonyms) ? rule.synonyms.map((value) => normalizeDiscoveryQuery(String(value))) : [];
        const matchesTerm = term === normalized;
        const matchesEquivalent = rule.mode === "equivalent" && values.includes(normalized);
        if (!matchesTerm && !matchesEquivalent) continue;
        expanded.add(term);
        for (const value of values) expanded.add(value);
    }
    return [...expanded].filter(Boolean).join(" ");
}

async function postgresFallback(normalized: string, locale: string, limit: number, categoryId?: number): Promise<number[]> {
    const needle = `%${normalized}%`;
    const query = Product.query()
        .where("status", "publish")
        .whereNull("deleted_at")
        .whereNot("catalog_visibility", "hidden")
        .where((builder) => {
            builder
                .whereRaw("LOWER(COALESCE(sku, '')) LIKE LOWER(?)", [needle])
                .orWhereHas("translations", (translation) =>
                    translation.where("locale", locale).whereRaw("LOWER(name) LIKE LOWER(?)", [needle]),
                )
                .orWhereHas("categories", (category) =>
                    category.whereHas("translations", (translation) =>
                        translation.where("locale", locale).whereRaw("LOWER(name) LIKE LOWER(?)", [needle]),
                    ),
                )
                .orWhereHas("brands", (brand) =>
                    brand.whereHas("translations", (translation) =>
                        translation.where("locale", locale).whereRaw("LOWER(name) LIKE LOWER(?)", [needle]),
                    ),
                )
                .orWhereHas("attributeLinks", (link) =>
                    link.whereHas("terms", (term) =>
                        term.whereHas("translations", (translation) =>
                            translation.where("locale", locale).whereRaw("LOWER(name) LIKE LOWER(?)", [needle]),
                        ),
                    ),
                );
        });
    if (categoryId) query.whereHas("categories", (category) => category.where("product_categories.id", categoryId));
    return (await query.limit(Math.min(limit * 3, 100))).map((row) => Number(row.id));
}

export async function searchProducts(input: DiscoverySearchInput) {
    const locale = input.locale === "en" ? "en" : "fa";
    const normalized = normalizeDiscoveryQuery(input.query);
    const policy = await activePolicy();
    const limit = Math.min(input.limit ?? policy?.maxResults ?? 40, 100);
    const expanded = expandQuery(normalized, await synonyms(locale, input.category_id));

    let ids: number[] = [];
    let source: "meilisearch" | "postgres" = "postgres";
    const meili = getMeilisearch();
    if (meili) {
        try {
            const result = await meili.index(indexName(locale)).search(expanded, {
                limit: Math.min(limit * 3, 100),
                filter: input.category_id ? `category_ids = ${input.category_id}` : undefined,
            });
            ids = result.hits.map((hit) => Number((hit as { id: unknown }).id)).filter(Number.isSafeInteger);
            source = "meilisearch";
        } catch {
            source = "postgres";
        }
    }
    if (ids.length === 0) ids = await postgresFallback(normalized, locale, limit, input.category_id);

    const categories = await categoryMap(ids);
    const ruleSet = await rulesFor(normalized);
    const ranked = applyMerchandising(
        ids.map((id, index) => ({
            id,
            categoryIds: categories.get(id) ?? [],
            score: Math.max(0.001, 1 - index / Math.max(ids.length, 1)),
        })),
        ruleSet,
    ).slice(0, limit);
    const products = await hydrate(
        ranked.map((row) => row.id),
        locale,
    );
    return {
        data: products,
        meta: {
            query: input.query,
            normalized_query: normalized,
            expanded_query: expanded,
            result_count: products.length,
            retrieval_source: source,
            retrieval_version: "phase16-v1",
            policy_version: policy ? String(policy.versionNumber) : "default",
            degraded: source === "postgres",
            rules_applied: ruleSet.map((rule) => rule.id),
        },
    };
}

export async function productDocument(productId: number, locale: string) {
    const product = await richProductQuery(locale).where("products.id", productId).first();
    return product ? serializeDocument(product, locale) : null;
}

const configuredIndexes = new Set<string>();

async function configureIndex(locale: string, force = false): Promise<void> {
    const meili = getMeilisearch();
    if (!meili) return;
    const name = indexName(locale);
    if (!force && configuredIndexes.has(name)) return;
    const policy = await activePolicy();
    const index = meili.index(name);
    const filterable = await index.updateFilterableAttributes(["category_ids", "status", "catalog_visibility", "locale"]);
    await waitForSuccessfulTask(meili, filterable.taskUid);
    const searchable = await index.updateSearchableAttributes([
        "name",
        "sku",
        "category_names",
        "brand_names",
        "attribute_terms",
        "search_terms",
    ]);
    await waitForSuccessfulTask(meili, searchable.taskUid);
    const typo = await index.updateTypoTolerance({
        enabled: policy?.typoTolerance ?? true,
        minWordSizeForTypos: { oneTypo: 5, twoTypos: policy?.typoMaxEdits === 2 ? 9 : 255 },
        disableOnNumbers: true,
    });
    await waitForSuccessfulTask(meili, typo.taskUid);
    configuredIndexes.add(name);
}

export async function syncProductNow(productId: number) {
    const meili = getMeilisearch();
    if (!meili) return;
    for (const locale of ["fa", "en"]) {
        const document = await productDocument(productId, locale);
        const index = meili.index(indexName(locale));
        if (document) {
            const task = await index.addDocuments([document], { primaryKey: "id" });
            await waitForSuccessfulTask(meili, task.taskUid);
            await configureIndex(locale);
        } else {
            const task = await index.deleteDocument(productId);
            await waitForSuccessfulTask(meili, task.taskUid);
        }
    }
}

export async function applyActivePolicyToIndexes() {
    const meili = getMeilisearch();
    if (!meili) return;
    for (const locale of ["fa", "en"]) {
        try {
            await configureIndex(locale, true);
        } catch {
            // Index may legitimately not exist before its first rebuild.
        }
    }
}

export async function rebuildIndexes() {
    const meili = getMeilisearch();
    if (!meili) return { available: false };
    const suffix = Date.now();
    for (const locale of ["fa", "en"]) {
        const canonical = indexName(locale);
        const target = `${canonical}_build_${suffix}`;
        const products = await richProductQuery(locale);
        const documents = products.map((product) => serializeDocument(product, locale));
        const targetIndex = meili.index(target);
        const add = await targetIndex.addDocuments(documents, { primaryKey: "id" });
        await waitForSuccessfulTask(meili, add.taskUid);
        const filterable = await targetIndex.updateFilterableAttributes([
            "category_ids",
            "status",
            "catalog_visibility",
            "locale",
        ]);
        await waitForSuccessfulTask(meili, filterable.taskUid);
        const searchable = await targetIndex.updateSearchableAttributes([
            "name",
            "sku",
            "category_names",
            "brand_names",
            "attribute_terms",
            "search_terms",
        ]);
        await waitForSuccessfulTask(meili, searchable.taskUid);
        const policy = await activePolicy();
        const typo = await targetIndex.updateTypoTolerance({
            enabled: policy?.typoTolerance ?? true,
            minWordSizeForTypos: { oneTypo: 5, twoTypos: policy?.typoMaxEdits === 2 ? 9 : 255 },
            disableOnNumbers: true,
        });
        await waitForSuccessfulTask(meili, typo.taskUid);

        let exists = true;
        try {
            await meili.index(canonical).getStats();
        } catch {
            exists = false;
        }
        if (exists) {
            const swap = await meili.swapIndexes([{ indexes: [canonical, target], rename: false }]);
            await waitForSuccessfulTask(meili, swap.taskUid);
            const cleanup = await meili.deleteIndex(target);
            await waitForSuccessfulTask(meili, cleanup.taskUid);
        } else {
            const create = await meili.createIndex(canonical, { primaryKey: "id" });
            await waitForSuccessfulTask(meili, create.taskUid);
            const direct = await meili.index(canonical).addDocuments(documents, { primaryKey: "id" });
            await waitForSuccessfulTask(meili, direct.taskUid);
            await configureIndex(locale);
            const cleanup = await meili.deleteIndex(target);
            await waitForSuccessfulTask(meili, cleanup.taskUid);
        }
    }
    return { available: true };
}

export function hashSession(value: string | null | undefined) {
    return value ? createHash("sha256").update(value).digest("hex") : null;
}

export async function probeSearchBackend() {
    const meili = getMeilisearch();
    if (!meili) return { configured: false, reachable: false };
    try {
        await meili.health();
        return { configured: true, reachable: true };
    } catch (error) {
        return { configured: true, reachable: false, error: error instanceof Error ? error.message : String(error) };
    }
}
