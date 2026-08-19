import { randomUUID } from "node:crypto";

import { type ProductReadinessDimension, weightedReadiness } from "#services/agentic_gateway/contracts";
import { currentTenantId, currentTrx } from "#services/tenant_context";

const EVALUATOR_VERSION = "agent-readiness-v1";

function freshness(value: unknown) {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function productGraph(productId: number, locale = "fa") {
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const product = await trx
        .from("products")
        .where("tenant_id", tenantId)
        .where("id", productId)
        .whereNull("deleted_at")
        .first();
    if (!product) throw Object.assign(new Error("Product not found"), { status: 404, code: "E_AGENTIC_PRODUCT_NOT_FOUND" });

    const translation = await trx
        .from("product_translations")
        .where("tenant_id", tenantId)
        .where("product_id", productId)
        .where("locale", locale)
        .first();
    const variations = await trx
        .from("product_variations")
        .where("tenant_id", tenantId)
        .where("product_id", productId)
        .whereNull("deleted_at")
        .select("id", "sku", "regular_price", "sale_price", "attributes", "updated_at");
    const inventory = await trx
        .from("inventory_items")
        .where("tenant_id", tenantId)
        .where("product_id", productId)
        .select("variation_id", "location_id", "stock_quantity", "stock_status", "updated_at");
    const images = await trx
        .from("product_images")
        .where("tenant_id", tenantId)
        .where("product_id", productId)
        .orderBy("position", "asc")
        .select("media_id", "position", "updated_at");
    const attributes = await trx
        .from("product_attribute_links as pal")
        .join("product_attributes as pa", "pa.id", "pal.attribute_id")
        .where("pal.tenant_id", tenantId)
        .where("pa.tenant_id", tenantId)
        .where("pal.product_id", productId)
        .select("pa.code", "pal.visible", "pal.used_for_variation", "pal.position");

    const effectivePrice = product.sale_price ?? product.regular_price ?? null;
    return {
        identity: { id: Number(product.id), sku: product.sku, global_unique_id: product.global_unique_id, type: product.type },
        canonical: {
            title: translation?.name ?? null,
            slug: translation?.slug ?? null,
            status: product.status,
            visibility: product.catalog_visibility,
        },
        offer: {
            regular_price_minor: product.regular_price,
            sale_price_minor: product.sale_price,
            effective_price_minor: effectivePrice,
            sale_starts_at: product.sale_starts_at,
            sale_ends_at: product.sale_ends_at,
        },
        attributes: { structured: product.attributes ?? {}, definitions: attributes },
        variants: variations,
        availability: inventory,
        media: images,
        fulfillment: {
            shipping_class_id: product.shipping_class_id ?? null,
            weight_grams: product.weight_grams ?? null,
            dimensions_mm: {
                length: product.length_mm ?? null,
                width: product.width_mm ?? null,
                height: product.height_mm ?? null,
            },
        },
        policy_facts: {
            sold_individually: Boolean(product.sold_individually),
            virtual: Boolean(product.virtual),
            downloadable: Boolean(product.downloadable),
            tax_status: product.tax_status,
        },
        evidence: {
            source: "canonical_catalog",
            product_updated_at: freshness(product.updated_at),
            translation_updated_at: freshness(translation?.updated_at),
            inventory_updated_at: inventory.map((row) => freshness(row.updated_at)).filter(Boolean),
            media_updated_at: images.map((row) => freshness(row.updated_at)).filter(Boolean),
        },
        unavailable_facts: ["returns_warranty", "compatibility_graph", "legal_safety_facts"],
    };
}

export async function evaluateProductReadiness(productId: number, locale = "fa") {
    const graph = await productGraph(productId, locale);
    const dimensions: ProductReadinessDimension[] = [
        {
            key: "identity",
            weightBp: 1300,
            scoreBp: graph.identity.sku || graph.identity.global_unique_id ? 10000 : 5000,
            missing: graph.identity.sku || graph.identity.global_unique_id ? [] : ["stable_external_identity"],
        },
        {
            key: "attributes",
            weightBp: 1500,
            scoreBp: Object.keys(graph.attributes.structured ?? {}).length || graph.attributes.definitions.length ? 9000 : 3000,
            missing:
                Object.keys(graph.attributes.structured ?? {}).length || graph.attributes.definitions.length
                    ? []
                    : ["structured_attributes"],
        },
        { key: "compatibility", weightBp: 1200, scoreBp: 0, missing: ["compatibility_graph"] },
        {
            key: "media",
            weightBp: 900,
            scoreBp: graph.media.length ? 10000 : 0,
            missing: graph.media.length ? [] : ["product_media"],
        },
        {
            key: "price_stock_freshness",
            weightBp: 1700,
            scoreBp: graph.offer.effective_price_minor !== null && graph.availability.length ? 9000 : 3500,
            missing: [
                graph.offer.effective_price_minor === null ? "price" : null,
                graph.availability.length ? null : "inventory",
            ].filter(Boolean) as string[],
        },
        {
            key: "fulfillment",
            weightBp: 1000,
            scoreBp: graph.fulfillment.shipping_class_id || graph.policy_facts.virtual ? 8500 : 3500,
            missing: graph.fulfillment.shipping_class_id || graph.policy_facts.virtual ? [] : ["fulfillment_facts"],
        },
        { key: "policy_legal", weightBp: 1200, scoreBp: 3000, missing: ["returns_warranty", "legal_safety_facts"] },
        {
            key: "evidence_quality",
            weightBp: 1200,
            scoreBp: graph.evidence.product_updated_at ? 8000 : 4000,
            missing: graph.evidence.product_updated_at ? [] : ["freshness_timestamp"],
        },
    ];
    const scoreBp = weightedReadiness(dimensions);
    const tenantId = Number(currentTenantId());
    const trx = currentTrx();
    const latest = await trx
        .from("agentic_product_readiness")
        .where("tenant_id", tenantId)
        .where("product_id", productId)
        .max("snapshot_version as version")
        .first();
    const snapshotVersion = Number(latest?.version ?? 0) + 1;
    await trx.table("agentic_product_readiness").insert({
        tenant_id: tenantId,
        product_id: productId,
        snapshot_version: snapshotVersion,
        score_bp: scoreBp,
        decomposition: dimensions,
        missing_facts: dimensions.flatMap((d) => d.missing),
        source_freshness: graph.evidence,
        evaluator_version: EVALUATOR_VERSION,
    });
    return {
        evaluation_id: randomUUID(),
        product_id: productId,
        score_bp: scoreBp,
        decomposition: dimensions,
        missing_facts: dimensions.flatMap((d) => d.missing),
        evaluator_version: EVALUATOR_VERSION,
    };
}

export async function listReadiness(limit = 50) {
    const tenantId = Number(currentTenantId());
    return currentTrx()
        .from("agentic_product_readiness as apr")
        .join("products as p", function join() {
            this.on("p.id", "apr.product_id").andOn("p.tenant_id", "apr.tenant_id");
        })
        .leftJoin("product_translations as pt", function join() {
            this.on("pt.product_id", "apr.product_id").andOn("pt.tenant_id", "apr.tenant_id").andOnVal("pt.locale", "fa");
        })
        .where("apr.tenant_id", tenantId)
        .whereRaw(
            "apr.snapshot_version = (SELECT MAX(x.snapshot_version) FROM agentic_product_readiness x WHERE x.tenant_id = apr.tenant_id AND x.product_id = apr.product_id)",
        )
        .orderBy("apr.score_bp", "asc")
        .limit(limit)
        .select(
            "apr.product_id",
            "apr.score_bp",
            "apr.decomposition",
            "apr.missing_facts",
            "apr.source_freshness",
            "apr.evaluator_version",
            "apr.evaluated_at",
            "p.sku",
            "pt.name",
        );
}
