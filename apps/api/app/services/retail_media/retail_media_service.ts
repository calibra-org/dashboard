import { randomUUID } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import type Cart from "#models/cart";
import { currentTenantId, currentTrx, maybeTenantContext } from "#services/tenant_context";

export const RETAIL_MEDIA_ENGINE_VERSION = "retail-media-v1.0.0";

type AdminActor = { id: string | number | bigint };
type JsonRecord = Record<string, unknown>;
type CampaignRow = {
    id: number;
    public_id: string;
    status: string;
    bid_model: "cpc" | "cpm";
    default_bid_minor: number | string;
    budget_total_minor: number | string;
    daily_pacing_cap_minor: number | string | null;
    currency: string;
    starts_at: Date | string | null;
    ends_at: Date | string | null;
    version: number;
};

type AffiliateTouch = {
    affiliate_link_public_id: string;
    code: string;
    touched_at: string;
    expires_at: string;
    creator_public_id: string;
    disclosure_text: string;
};

const tenantId = () => Number(currentTenantId());
const asNumber = (value: unknown) => Number(value ?? 0);

function notFound(message: string, code: string): never {
    throw new Exception(message, { status: 404, code });
}

function conflict(message: string, code: string): never {
    throw new Exception(message, { status: 409, code });
}

function parseJsonRecord(value: unknown): JsonRecord {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
    if (typeof value !== "string") return {};
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonRecord) : {};
    } catch {
        return {};
    }
}

function parseOptionalDate(value: string | undefined, field: string) {
    if (!value) return null;
    const date = DateTime.fromISO(value, { setZone: true });
    if (!date.isValid) {
        throw new Exception(`${field} must be a valid ISO date`, { status: 422, code: "E_RETAIL_MEDIA_DATE_INVALID" });
    }
    return date.toUTC().toSQL();
}

function assertSchedule(startsAt: string | undefined, endsAt: string | undefined) {
    if (!startsAt || !endsAt) return;
    const start = DateTime.fromISO(startsAt, { setZone: true });
    const end = DateTime.fromISO(endsAt, { setZone: true });
    if (!start.isValid || !end.isValid || end <= start) {
        throw new Exception("Campaign/link end must be after start", { status: 422, code: "E_RETAIL_MEDIA_WINDOW_INVALID" });
    }
}

const FORBIDDEN_EVENT_KEY = /(email|phone|mobile|name|address|password|secret|token|credential|national|card|iban)/i;

export function assertPrivacySafeContext(value: unknown, path = "context") {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertPrivacySafeContext(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as JsonRecord)) {
        if (FORBIDDEN_EVENT_KEY.test(key)) {
            throw new Exception(`Public measurement context contains a restricted field at ${path}.${key}`, {
                status: 422,
                code: "E_RETAIL_MEDIA_PRIVACY_FIELD_RESTRICTED",
            });
        }
        assertPrivacySafeContext(item, `${path}.${key}`);
    }
}

export type RetailMediaRankCandidate = {
    campaign_public_id: string;
    paid_bid_minor: number;
    relevance_bps: number;
    quality_bps: number;
};

/**
 * Rank ONLY candidates that already passed schedule, safety, catalog, availability and budget gates.
 * Bid is deliberately capped to a 10% percentile signal so money cannot buy past relevance/quality.
 */
export function rankEligibleRetailMediaCandidates<T extends RetailMediaRankCandidate>(candidates: readonly T[]): T[] {
    const ranked = [...candidates];
    if (ranked.length <= 1) return ranked;
    const byBid = [...ranked].sort((a, b) => a.paid_bid_minor - b.paid_bid_minor);
    const bidPercentile = new Map<T, number>();
    byBid.forEach((candidate, index) => {
        bidPercentile.set(candidate, Math.round((index / (byBid.length - 1)) * 10000));
    });
    return ranked.sort((a, b) => {
        const scoreA = Math.round(a.relevance_bps * 0.7 + a.quality_bps * 0.2 + (bidPercentile.get(a) ?? 0) * 0.1);
        const scoreB = Math.round(b.relevance_bps * 0.7 + b.quality_bps * 0.2 + (bidPercentile.get(b) ?? 0) * 0.1);
        if (scoreA !== scoreB) return scoreB - scoreA;
        if (a.relevance_bps !== b.relevance_bps) return b.relevance_bps - a.relevance_bps;
        return a.campaign_public_id.localeCompare(b.campaign_public_id);
    });
}

export function calculateCreatorRefundAdjustment(
    commissionMinor: number,
    refundBasisMinor: number,
    denominatorMinor: number,
    priorAdjustmentsMinor = 0,
): number {
    if (commissionMinor <= 0 || refundBasisMinor <= 0 || denominatorMinor <= 0) return 0;
    const desired = Math.max(1, Math.floor(commissionMinor * Math.min(1, refundBasisMinor / denominatorMinor)));
    const remaining = Math.max(0, commissionMinor + Math.min(0, priorAdjustmentsMinor));
    return Math.min(remaining, desired);
}

async function requireCampaign(publicId: string, lock = false): Promise<CampaignRow> {
    let query = currentTrx().from("retail_media_campaigns").where({ tenant_id: tenantId(), public_id: publicId });
    if (lock) query = query.forUpdate();
    const row = await query.first();
    if (!row) notFound("Retail media campaign not found", "E_RETAIL_MEDIA_CAMPAIGN_NOT_FOUND");
    return row as CampaignRow;
}

async function requireCreator(publicId: string, lock = false) {
    let query = currentTrx().from("retail_media_creators").where({ tenant_id: tenantId(), public_id: publicId });
    if (lock) query = query.forUpdate();
    const row = await query.first();
    if (!row) notFound("Creator not found", "E_RETAIL_MEDIA_CREATOR_NOT_FOUND");
    return row;
}

async function campaignSpend(campaignId: number, from?: DateTime) {
    let query = currentTrx()
        .from("retail_media_budget_ledger")
        .where({ tenant_id: tenantId(), campaign_id: campaignId })
        .whereIn("entry_kind", ["spend", "refund", "adjustment"]);
    if (from) query = query.where("occurred_at", ">=", from.toUTC().toSQL());
    const row = await query.sum({ total: "amount_minor" }).first();
    return asNumber(row?.total);
}

async function campaignFunding(campaignId: number) {
    const row = await currentTrx()
        .from("retail_media_budget_ledger")
        .where({ tenant_id: tenantId(), campaign_id: campaignId, entry_kind: "funding" })
        .sum({ total: "amount_minor" })
        .first();
    return asNumber(row?.total);
}

async function budgetSnapshot(campaign: CampaignRow) {
    const [rawSpend, funded] = await Promise.all([campaignSpend(campaign.id), campaignFunding(campaign.id)]);
    const spent = Math.max(0, rawSpend);
    const authorizedBudget = Math.min(asNumber(campaign.budget_total_minor), funded);
    return {
        budget_total_minor: asNumber(campaign.budget_total_minor),
        funded_minor: funded,
        authorized_budget_minor: authorizedBudget,
        spent_minor: spent,
        remaining_minor: Math.max(0, authorizedBudget - spent),
        currency: campaign.currency,
    };
}

async function applySpend(campaignId: number, amountMinor: number, currency: string, idempotencyKey: string, sourceRef: string) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { billed: false, reason: "zero_bid" };
    const trx = currentTrx();
    const existing = await trx
        .from("retail_media_budget_ledger")
        .where({ tenant_id: tenantId(), idempotency_key: idempotencyKey })
        .first();
    if (existing) return { billed: true, replay: true, amount_minor: asNumber(existing.amount_minor) };

    const campaign = (await trx
        .from("retail_media_campaigns")
        .where({ tenant_id: tenantId(), id: campaignId })
        .forUpdate()
        .first()) as CampaignRow | undefined;
    if (!campaign || campaign.status !== "active") return { billed: false, reason: "campaign_inactive" };

    const [rawSpend, funded] = await Promise.all([campaignSpend(campaign.id), campaignFunding(campaign.id)]);
    const totalSpent = Math.max(0, rawSpend);
    const authorizedBudget = Math.min(asNumber(campaign.budget_total_minor), funded);
    if (totalSpent + amountMinor > authorizedBudget) return { billed: false, reason: "budget_exhausted" };

    if (campaign.daily_pacing_cap_minor !== null) {
        const today = DateTime.utc().startOf("day");
        const todaySpent = Math.max(0, await campaignSpend(campaign.id, today));
        if (todaySpent + amountMinor > asNumber(campaign.daily_pacing_cap_minor)) {
            return { billed: false, reason: "daily_pacing_exhausted" };
        }
    }

    await trx.table("retail_media_budget_ledger").insert({
        tenant_id: tenantId(),
        campaign_id: campaign.id,
        entry_kind: "spend",
        amount_minor: amountMinor,
        currency,
        funding_source: null,
        source_ref: sourceRef,
        idempotency_key: idempotencyKey,
        metadata: {},
    });
    return { billed: true, replay: false, amount_minor: amountMinor };
}

async function productAvailable(productId: number, variationId: number | null) {
    let query = currentTrx().from("inventory_items").where({ tenant_id: tenantId(), product_id: productId });
    query = variationId === null ? query.whereNull("variation_id") : query.where("variation_id", variationId);
    const rows = await query.select("stock_status");
    if (rows.length === 0) return true;
    return rows.some((row) => row.stock_status !== "outofstock");
}

function activeNow(row: { starts_at?: unknown; ends_at?: unknown }) {
    const now = DateTime.utc();
    if (row.starts_at && DateTime.fromJSDate(new Date(String(row.starts_at))).toUTC() > now) return false;
    if (row.ends_at && DateTime.fromJSDate(new Date(String(row.ends_at))).toUTC() <= now) return false;
    return true;
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [campaigns, activeCampaigns, creators, placements, spend, commissions, adjustments, pending] = await Promise.all([
        trx.from("retail_media_campaigns").where("tenant_id", tenant).count("* as c").first(),
        trx.from("retail_media_campaigns").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx.from("retail_media_creators").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx.from("retail_media_placements").where({ tenant_id: tenant, status: "active" }).count("* as c").first(),
        trx
            .from("retail_media_budget_ledger")
            .where("tenant_id", tenant)
            .whereIn("entry_kind", ["spend", "refund", "adjustment"])
            .sum({ total: "amount_minor" })
            .first(),
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenant, entry_kind: "commission" })
            .sum({ total: "amount_minor" })
            .first(),
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenant, entry_kind: "refund_adjustment" })
            .sum({ total: "amount_minor" })
            .first(),
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenant, entry_kind: "commission" })
            .where("available_at", ">", new Date())
            .sum({ total: "amount_minor" })
            .first(),
    ]);
    return {
        engine_version: RETAIL_MEDIA_ENGINE_VERSION,
        kpis: {
            campaigns: asNumber(campaigns?.c),
            active_campaigns: asNumber(activeCampaigns?.c),
            active_creators: asNumber(creators?.c),
            active_placements: asNumber(placements?.c),
            net_media_spend_minor: Math.max(0, asNumber(spend?.total)),
            creator_commission_minor: asNumber(commissions?.total),
            refund_adjustments_minor: asNumber(adjustments?.total),
            pending_commission_minor: asNumber(pending?.total),
        },
        measurement_posture: "privacy_thresholded_incrementality_first",
    };
}

export async function listAdvertisers() {
    return currentTrx().from("retail_media_advertisers").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(200);
}

export async function createAdvertiser(
    input: { name: string; kind: "brand" | "supplier" | "merchant" | "agency"; supplier_id?: number; metadata: JsonRecord },
    actor: AdminActor,
) {
    if (input.supplier_id) {
        const supplier = await currentTrx().from("suppliers").where({ tenant_id: tenantId(), id: input.supplier_id }).first();
        if (!supplier) notFound("Supplier not found", "E_RETAIL_MEDIA_SUPPLIER_NOT_FOUND");
    }
    const [row] = await currentTrx()
        .table("retail_media_advertisers")
        .insert({
            tenant_id: tenantId(),
            name: input.name,
            kind: input.kind,
            supplier_id: input.supplier_id ?? null,
            metadata: input.metadata,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function listCampaigns() {
    const rows = await currentTrx()
        .from("retail_media_campaigns as c")
        .innerJoin("retail_media_advertisers as a", "a.id", "c.advertiser_id")
        .where("c.tenant_id", tenantId())
        .select("c.*", "a.name as advertiser_name", "a.kind as advertiser_kind")
        .orderBy("c.updated_at", "desc")
        .limit(300);
    return Promise.all(
        rows.map(async (row) => ({
            ...row,
            budget: await budgetSnapshot(row as CampaignRow),
        })),
    );
}

export async function campaignDetail(publicId: string) {
    const campaign = await requireCampaign(publicId);
    const trx = currentTrx();
    const [advertiser, products, placements, ledger] = await Promise.all([
        trx
            .from("retail_media_advertisers")
            .where({ tenant_id: tenantId(), id: (campaign as unknown as { advertiser_id: number }).advertiser_id })
            .first(),
        trx
            .from("retail_media_campaign_products as cp")
            .innerJoin("products as p", "p.id", "cp.product_id")
            .where({ "cp.tenant_id": tenantId(), "cp.campaign_id": campaign.id })
            .select("cp.*", "p.sku", "p.status as product_status")
            .orderBy("cp.updated_at", "desc"),
        trx
            .from("retail_media_campaign_placements as link")
            .innerJoin("retail_media_placements as p", "p.id", "link.placement_id")
            .where({ "link.tenant_id": tenantId(), "link.campaign_id": campaign.id })
            .select("link.*", "p.public_id as placement_public_id", "p.placement_key", "p.name", "p.surface", "p.disclosure_text"),
        trx
            .from("retail_media_budget_ledger")
            .where({ tenant_id: tenantId(), campaign_id: campaign.id })
            .orderBy("occurred_at", "desc")
            .limit(200),
    ]);
    return { campaign, advertiser, products, placements, ledger, budget: await budgetSnapshot(campaign) };
}

export async function createCampaign(
    input: {
        advertiser_public_id: string;
        name: string;
        objective: string;
        bid_model: "cpc" | "cpm";
        default_bid_minor: number;
        budget_total_minor: number;
        daily_pacing_cap_minor?: number;
        currency: string;
        attribution_window_days: number;
        experiment_id?: number;
        holdout_id?: number;
        starts_at?: string;
        ends_at?: string;
    },
    actor: AdminActor,
) {
    assertSchedule(input.starts_at, input.ends_at);
    const trx = currentTrx();
    const advertiser = await trx
        .from("retail_media_advertisers")
        .where({ tenant_id: tenantId(), public_id: input.advertiser_public_id, status: "active" })
        .first();
    if (!advertiser) notFound("Active advertiser not found", "E_RETAIL_MEDIA_ADVERTISER_NOT_FOUND");
    if (input.experiment_id) {
        const experiment = await trx.from("experiments").where({ tenant_id: tenantId(), id: input.experiment_id }).first();
        if (!experiment) notFound("Experiment not found", "E_RETAIL_MEDIA_EXPERIMENT_NOT_FOUND");
    }
    if (input.holdout_id) {
        const holdout = await trx.from("experiment_holdouts").where({ tenant_id: tenantId(), id: input.holdout_id }).first();
        if (!holdout || holdout.scope !== "marketing") {
            throw new Exception("Phase 30 holdout must be a marketing holdout", {
                status: 422,
                code: "E_RETAIL_MEDIA_HOLDOUT_INVALID",
            });
        }
    }
    const [row] = await trx
        .table("retail_media_campaigns")
        .insert({
            tenant_id: tenantId(),
            advertiser_id: advertiser.id,
            name: input.name,
            objective: input.objective,
            bid_model: input.bid_model,
            default_bid_minor: input.default_bid_minor,
            budget_total_minor: input.budget_total_minor,
            daily_pacing_cap_minor: input.daily_pacing_cap_minor ?? null,
            currency: input.currency.toUpperCase(),
            attribution_window_days: input.attribution_window_days,
            experiment_id: input.experiment_id ?? null,
            holdout_id: input.holdout_id ?? null,
            starts_at: parseOptionalDate(input.starts_at, "starts_at"),
            ends_at: parseOptionalDate(input.ends_at, "ends_at"),
            created_by_user_id: Number(actor.id),
            updated_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function updateCampaign(
    publicId: string,
    input: {
        version: number;
        default_bid_minor?: number;
        budget_total_minor?: number;
        daily_pacing_cap_minor?: number | null;
        attribution_window_days?: number;
        starts_at?: string | null;
        ends_at?: string | null;
    },
    actor: AdminActor,
) {
    const campaign = await requireCampaign(publicId, true);
    if (Number(campaign.version) !== input.version) {
        conflict("Campaign was changed by another operator", "E_RETAIL_MEDIA_CAMPAIGN_VERSION_CONFLICT");
    }
    if (campaign.status === "ended" || campaign.status === "archived") {
        throw new Exception("Ended or archived campaigns are immutable", {
            status: 422,
            code: "E_RETAIL_MEDIA_CAMPAIGN_IMMUTABLE",
        });
    }
    const patch: JsonRecord = { updated_by_user_id: Number(actor.id), updated_at: new Date(), version: input.version + 1 };
    if (input.default_bid_minor !== undefined) patch.default_bid_minor = input.default_bid_minor;
    if (input.budget_total_minor !== undefined) {
        const spent = Math.max(0, await campaignSpend(campaign.id));
        if (input.budget_total_minor < spent) {
            throw new Exception("Budget cannot be reduced below already-booked spend", {
                status: 422,
                code: "E_RETAIL_MEDIA_BUDGET_BELOW_SPEND",
            });
        }
        patch.budget_total_minor = input.budget_total_minor;
    }
    if (input.daily_pacing_cap_minor !== undefined) patch.daily_pacing_cap_minor = input.daily_pacing_cap_minor;
    if (input.attribution_window_days !== undefined) patch.attribution_window_days = input.attribution_window_days;
    if (input.starts_at !== undefined) patch.starts_at = input.starts_at === null ? null : parseOptionalDate(input.starts_at, "starts_at");
    if (input.ends_at !== undefined) patch.ends_at = input.ends_at === null ? null : parseOptionalDate(input.ends_at, "ends_at");
    const startCandidate = input.starts_at === undefined ? campaign.starts_at : input.starts_at;
    const endCandidate = input.ends_at === undefined ? campaign.ends_at : input.ends_at;
    if (startCandidate && endCandidate && new Date(String(endCandidate)).getTime() <= new Date(String(startCandidate)).getTime()) {
        throw new Exception("Campaign end must be after start", { status: 422, code: "E_RETAIL_MEDIA_WINDOW_INVALID" });
    }
    await currentTrx().from("retail_media_campaigns").where({ tenant_id: tenantId(), id: campaign.id }).update(patch);
    return requireCampaign(publicId);
}

export async function setCampaignStatus(publicId: string, status: "review" | "active" | "paused" | "ended" | "archived", actor: AdminActor) {
    const campaign = await requireCampaign(publicId, true);
    if (status === "active") {
        if (!activeNow(campaign)) {
            throw new Exception("Campaign schedule is not active", { status: 422, code: "E_RETAIL_MEDIA_CAMPAIGN_SCHEDULE_INACTIVE" });
        }
        const [product, placement, funded] = await Promise.all([
            currentTrx()
                .from("retail_media_campaign_products")
                .where({ tenant_id: tenantId(), campaign_id: campaign.id, safety_status: "approved" })
                .first(),
            currentTrx()
                .from("retail_media_campaign_placements")
                .where({ tenant_id: tenantId(), campaign_id: campaign.id, status: "active" })
                .first(),
            campaignFunding(campaign.id),
        ]);
        if (!product || !placement || funded <= 0) {
            throw new Exception("Activation requires an approved product, active placement and recorded funding", {
                status: 422,
                code: "E_RETAIL_MEDIA_CAMPAIGN_NOT_DELIVERABLE",
            });
        }
    }
    await currentTrx()
        .from("retail_media_campaigns")
        .where({ tenant_id: tenantId(), id: campaign.id })
        .update({ status, version: Number(campaign.version) + 1, updated_by_user_id: Number(actor.id), updated_at: new Date() });
    return requireCampaign(publicId);
}

export async function addCampaignProduct(
    publicId: string,
    input: {
        product_id: number;
        variation_id?: number;
        relevance_bps: number;
        quality_bps: number;
        safety_status: "review" | "approved" | "blocked";
        custom_bid_minor?: number;
    },
) {
    const campaign = await requireCampaign(publicId);
    const trx = currentTrx();
    const product = await trx.from("products").where({ id: input.product_id, status: "publish" }).whereNull("deleted_at").first();
    if (!product) notFound("Published product not found", "E_RETAIL_MEDIA_PRODUCT_NOT_FOUND");
    if (input.variation_id) {
        const variation = await trx
            .from("product_variations")
            .where({ id: input.variation_id, product_id: input.product_id })
            .whereNull("deleted_at")
            .first();
        if (!variation) throw new Exception("Variation does not belong to product", { status: 422, code: "E_RETAIL_MEDIA_VARIATION_MISMATCH" });
    }
    const existing = await trx
        .from("retail_media_campaign_products")
        .where({ tenant_id: tenantId(), campaign_id: campaign.id, product_id: input.product_id })
        .whereRaw("COALESCE(variation_id, 0) = ?", [input.variation_id ?? 0])
        .first();
    if (existing) {
        await trx.from("retail_media_campaign_products").where({ tenant_id: tenantId(), id: existing.id }).update({
            relevance_bps: input.relevance_bps,
            quality_bps: input.quality_bps,
            safety_status: input.safety_status,
            custom_bid_minor: input.custom_bid_minor ?? null,
            updated_at: new Date(),
        });
        return trx.from("retail_media_campaign_products").where({ tenant_id: tenantId(), id: existing.id }).first();
    }
    const [row] = await trx
        .table("retail_media_campaign_products")
        .insert({
            tenant_id: tenantId(),
            campaign_id: campaign.id,
            product_id: input.product_id,
            variation_id: input.variation_id ?? null,
            relevance_bps: input.relevance_bps,
            quality_bps: input.quality_bps,
            safety_status: input.safety_status,
            custom_bid_minor: input.custom_bid_minor ?? null,
        })
        .returning("*");
    return row;
}

export async function listPlacements() {
    return currentTrx().from("retail_media_placements").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(200);
}

export async function createPlacement(
    input: {
        placement_key: string;
        name: string;
        surface: string;
        disclosure_text: string;
        minimum_relevance_bps: number;
        minimum_quality_bps: number;
        privacy_min_cohort: number;
        metadata: JsonRecord;
    },
    actor: AdminActor,
) {
    if (!input.disclosure_text.trim()) {
        throw new Exception("Sponsored disclosure is mandatory", { status: 422, code: "E_RETAIL_MEDIA_DISCLOSURE_REQUIRED" });
    }
    const [row] = await currentTrx()
        .table("retail_media_placements")
        .insert({ ...input, tenant_id: tenantId(), created_by_user_id: Number(actor.id) })
        .returning("*");
    return row;
}

export async function setPlacementStatus(publicId: string, status: "active" | "paused" | "archived") {
    const row = await currentTrx().from("retail_media_placements").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!row) notFound("Placement not found", "E_RETAIL_MEDIA_PLACEMENT_NOT_FOUND");
    await currentTrx().from("retail_media_placements").where({ tenant_id: tenantId(), id: row.id }).update({ status, updated_at: new Date() });
    return currentTrx().from("retail_media_placements").where({ tenant_id: tenantId(), id: row.id }).first();
}

export async function attachCampaignPlacement(
    campaignPublicId: string,
    input: { placement_public_id: string; bid_multiplier_bps: number; creative: JsonRecord; creative_source_ref?: string },
) {
    const campaign = await requireCampaign(campaignPublicId);
    const trx = currentTrx();
    const placement = await trx
        .from("retail_media_placements")
        .where({ tenant_id: tenantId(), public_id: input.placement_public_id })
        .first();
    if (!placement) notFound("Placement not found", "E_RETAIL_MEDIA_PLACEMENT_NOT_FOUND");
    if (!String(placement.disclosure_text ?? "").trim()) {
        throw new Exception("Sponsored placement is missing a disclosure label", {
            status: 422,
            code: "E_RETAIL_MEDIA_DISCLOSURE_REQUIRED",
        });
    }
    await trx
        .table("retail_media_campaign_placements")
        .insert({
            tenant_id: tenantId(),
            campaign_id: campaign.id,
            placement_id: placement.id,
            bid_multiplier_bps: input.bid_multiplier_bps,
            creative: input.creative,
            creative_source_ref: input.creative_source_ref ?? null,
        })
        .onConflict(["tenant_id", "campaign_id", "placement_id"])
        .merge({
            status: "active",
            bid_multiplier_bps: input.bid_multiplier_bps,
            creative: input.creative,
            creative_source_ref: input.creative_source_ref ?? null,
            updated_at: new Date(),
        });
    return trx
        .from("retail_media_campaign_placements")
        .where({ tenant_id: tenantId(), campaign_id: campaign.id, placement_id: placement.id })
        .first();
}

export async function fundCampaign(
    campaignPublicId: string,
    input: { amount_minor: number; funding_source: "merchant" | "supplier" | "brand"; source_ref?: string; idempotency_key: string; metadata: JsonRecord },
    actor: AdminActor,
) {
    const campaign = await requireCampaign(campaignPublicId, true);
    const trx = currentTrx();
    const existing = await trx
        .from("retail_media_budget_ledger")
        .where({ tenant_id: tenantId(), idempotency_key: input.idempotency_key })
        .first();
    if (existing) {
        if (Number(existing.campaign_id) !== campaign.id || asNumber(existing.amount_minor) !== input.amount_minor) {
            conflict("Budget idempotency key was reused with different data", "E_RETAIL_MEDIA_BUDGET_IDEMPOTENCY_MISMATCH");
        }
        return existing;
    }
    const funded = await campaignFunding(campaign.id);
    if (funded + input.amount_minor > asNumber(campaign.budget_total_minor)) {
        throw new Exception("Recorded funding cannot exceed campaign budget", {
            status: 422,
            code: "E_RETAIL_MEDIA_FUNDING_EXCEEDS_BUDGET",
        });
    }
    const [row] = await trx
        .table("retail_media_budget_ledger")
        .insert({
            tenant_id: tenantId(),
            campaign_id: campaign.id,
            entry_kind: "funding",
            amount_minor: input.amount_minor,
            currency: campaign.currency,
            funding_source: input.funding_source,
            source_ref: input.source_ref ?? null,
            idempotency_key: input.idempotency_key,
            metadata: input.metadata,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function servePlacement(
    placementKey: string,
    input: { subject_hash?: string; consent_context?: string; context: JsonRecord },
) {
    if (!maybeTenantContext()) notFound("Sponsored placement not found", "E_RETAIL_MEDIA_PUBLIC_NOT_FOUND");
    assertPrivacySafeContext(input.context);
    const trx = currentTrx();
    const placement = await trx
        .from("retail_media_placements")
        .where({ tenant_id: tenantId(), placement_key: placementKey, status: "active" })
        .first();
    if (!placement) notFound("Sponsored placement not found", "E_RETAIL_MEDIA_PUBLIC_NOT_FOUND");
    if (!String(placement.disclosure_text ?? "").trim()) {
        throw new Exception("Sponsored disclosure is unavailable", { status: 503, code: "E_RETAIL_MEDIA_DISCLOSURE_UNAVAILABLE" });
    }

    const now = new Date();
    const candidates = await trx
        .from("retail_media_campaign_placements as link")
        .innerJoin("retail_media_campaigns as c", "c.id", "link.campaign_id")
        .innerJoin("retail_media_campaign_products as cp", "cp.campaign_id", "c.id")
        .innerJoin("products as product", "product.id", "cp.product_id")
        .innerJoin("retail_media_advertisers as advertiser", "advertiser.id", "c.advertiser_id")
        .where({
            "link.tenant_id": tenantId(),
            "link.placement_id": placement.id,
            "link.status": "active",
            "c.status": "active",
            "cp.safety_status": "approved",
            "product.status": "publish",
            "advertiser.status": "active",
        })
        .whereNull("product.deleted_at")
        .where("cp.relevance_bps", ">=", Number(placement.minimum_relevance_bps))
        .where("cp.quality_bps", ">=", Number(placement.minimum_quality_bps))
        .where((builder) => builder.whereNull("c.starts_at").orWhere("c.starts_at", "<=", now))
        .where((builder) => builder.whereNull("c.ends_at").orWhere("c.ends_at", ">", now))
        .select(
            "c.id as campaign_id",
            "c.public_id as campaign_public_id",
            "c.name as campaign_name",
            "c.bid_model",
            "c.default_bid_minor",
            "c.budget_total_minor",
            "c.daily_pacing_cap_minor",
            "c.currency",
            "cp.product_id",
            "cp.variation_id",
            "cp.relevance_bps",
            "cp.quality_bps",
            "cp.custom_bid_minor",
            "link.bid_multiplier_bps",
            "link.creative",
            "link.creative_source_ref",
            "advertiser.public_id as advertiser_public_id",
            "advertiser.name as advertiser_name",
        )
        .limit(200);

    const eligible: Array<JsonRecord & { paid_bid_minor: number; relevance_bps: number; quality_bps: number }> = [];
    for (const candidate of candidates) {
        const available = await productAvailable(Number(candidate.product_id), candidate.variation_id == null ? null : Number(candidate.variation_id));
        if (!available) continue;
        const snapshot = await budgetSnapshot({
            id: Number(candidate.campaign_id),
            public_id: String(candidate.campaign_public_id),
            status: "active",
            bid_model: candidate.bid_model as "cpc" | "cpm",
            default_bid_minor: candidate.default_bid_minor,
            budget_total_minor: candidate.budget_total_minor,
            daily_pacing_cap_minor: candidate.daily_pacing_cap_minor,
            currency: String(candidate.currency),
            starts_at: null,
            ends_at: null,
            version: 1,
        });
        if (snapshot.remaining_minor <= 0) continue;
        const baseBid = asNumber(candidate.custom_bid_minor ?? candidate.default_bid_minor);
        const paidBid = Math.floor((baseBid * asNumber(candidate.bid_multiplier_bps)) / 10000);
        eligible.push({
            ...candidate,
            paid_bid_minor: Math.max(0, paidBid),
            relevance_bps: asNumber(candidate.relevance_bps),
            quality_bps: asNumber(candidate.quality_bps),
        });
    }
    if (eligible.length === 0) return { data: null, reason: "no_eligible_sponsored_candidate" };

    const ranked = rankEligibleRetailMediaCandidates(eligible);
    const selected = ranked[0];
    if (!selected) return { data: null, reason: "no_eligible_sponsored_candidate" };

    const eventId = randomUUID();
    await trx.table("retail_media_delivery_events").insert({
        tenant_id: tenantId(),
        event_id: eventId,
        parent_event_id: null,
        campaign_id: Number(selected.campaign_id),
        placement_id: Number(placement.id),
        product_id: Number(selected.product_id),
        variation_id: selected.variation_id == null ? null : Number(selected.variation_id),
        event_type: "impression",
        subject_hash: input.subject_hash ?? null,
        consent_context: input.consent_context ?? null,
        revenue_minor: null,
        contribution_minor: null,
        metadata: input.context,
        occurred_at: new Date(),
    });

    let billing: JsonRecord = { billed: false, reason: "cpc_bills_on_click" };
    if (selected.bid_model === "cpm" && selected.paid_bid_minor > 0) {
        const countRow = await trx
            .from("retail_media_delivery_events")
            .where({ tenant_id: tenantId(), campaign_id: Number(selected.campaign_id), event_type: "impression" })
            .count("* as c")
            .first();
        if (asNumber(countRow?.c) % 1000 === 0) {
            billing = await applySpend(
                Number(selected.campaign_id),
                selected.paid_bid_minor,
                String(selected.currency),
                `delivery:${eventId}:cpm`,
                `impression:${eventId}`,
            );
        } else billing = { billed: false, reason: "cpm_accrues_per_1000_impressions" };
    }

    void billing;
    return {
        data: {
            event_id: eventId,
            sponsored: true,
            disclosure: String(placement.disclosure_text),
            advertiser: {
                public_id: String(selected.advertiser_public_id),
                name: String(selected.advertiser_name),
            },
            campaign: {
                public_id: String(selected.campaign_public_id),
                name: String(selected.campaign_name),
            },
            product: {
                id: Number(selected.product_id),
                variation_id: selected.variation_id == null ? null : Number(selected.variation_id),
            },
            creative: parseJsonRecord(selected.creative),
            creative_source_ref: selected.creative_source_ref ?? null,
            ranking_policy: "eligibility_relevance_quality_then_bounded_bid_v1",
        },
    };
}

export async function recordClick(impressionEventId: string, input: { context: JsonRecord }) {
    if (!maybeTenantContext()) notFound("Sponsored impression not found", "E_RETAIL_MEDIA_PUBLIC_NOT_FOUND");
    assertPrivacySafeContext(input.context);
    const trx = currentTrx();
    const impression = await trx
        .from("retail_media_delivery_events as e")
        .innerJoin("retail_media_campaigns as c", "c.id", "e.campaign_id")
        .where({ "e.tenant_id": tenantId(), "e.event_id": impressionEventId, "e.event_type": "impression" })
        .select("e.*", "c.bid_model", "c.default_bid_minor", "c.currency")
        .first();
    if (!impression) notFound("Sponsored impression not found", "E_RETAIL_MEDIA_IMPRESSION_NOT_FOUND");
    const existing = await trx
        .from("retail_media_delivery_events")
        .where({ tenant_id: tenantId(), parent_event_id: impressionEventId, event_type: "click" })
        .first();
    if (existing) return { data: existing, replay: true };

    const productBid = await trx
        .from("retail_media_campaign_products")
        .where({ tenant_id: tenantId(), campaign_id: impression.campaign_id, product_id: impression.product_id })
        .whereRaw("COALESCE(variation_id, 0) = ?", [impression.variation_id ?? 0])
        .first();
    const placementLink = await trx
        .from("retail_media_campaign_placements")
        .where({ tenant_id: tenantId(), campaign_id: impression.campaign_id, placement_id: impression.placement_id })
        .first();
    const baseBid = asNumber(productBid?.custom_bid_minor ?? impression.default_bid_minor);
    const paidBid = Math.floor((baseBid * asNumber(placementLink?.bid_multiplier_bps ?? 10000)) / 10000);
    const eventId = randomUUID();
    const [row] = await trx
        .table("retail_media_delivery_events")
        .insert({
            tenant_id: tenantId(),
            event_id: eventId,
            parent_event_id: impressionEventId,
            campaign_id: impression.campaign_id,
            placement_id: impression.placement_id,
            product_id: impression.product_id,
            variation_id: impression.variation_id,
            event_type: "click",
            subject_hash: impression.subject_hash,
            consent_context: impression.consent_context,
            revenue_minor: null,
            contribution_minor: null,
            metadata: input.context,
            occurred_at: new Date(),
        })
        .returning("*");
    const billing =
        impression.bid_model === "cpc"
            ? await applySpend(
                  Number(impression.campaign_id),
                  paidBid,
                  String(impression.currency),
                  `delivery:${eventId}:cpc`,
                  `click:${eventId}`,
              )
            : { billed: false, reason: "cpm_billed_on_impression_batches" };
    return { data: row, replay: false, billing };
}

export async function listCreators() {
    const trx = currentTrx();
    const creators = await trx.from("retail_media_creators").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(300);
    return Promise.all(
        creators.map(async (creator) => {
            const [links, balance] = await Promise.all([
                trx
                    .from("retail_media_affiliate_links")
                    .where({ tenant_id: tenantId(), creator_id: creator.id })
                    .orderBy("updated_at", "desc"),
                creatorBalance(Number(creator.id)),
            ]);
            return { ...creator, links, balance };
        }),
    );
}

export async function createCreator(
    input: { display_name: string; handle?: string; holding_days: number; disclosure_text: string; payout_ref?: string; metadata: JsonRecord },
    actor: AdminActor,
) {
    if (!input.disclosure_text.trim()) {
        throw new Exception("Creator disclosure is mandatory", { status: 422, code: "E_RETAIL_MEDIA_DISCLOSURE_REQUIRED" });
    }
    const [row] = await currentTrx()
        .table("retail_media_creators")
        .insert({
            tenant_id: tenantId(),
            display_name: input.display_name,
            handle: input.handle ?? null,
            holding_days: input.holding_days,
            disclosure_text: input.disclosure_text,
            payout_ref: input.payout_ref ?? null,
            metadata: input.metadata,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function createAffiliateLink(
    creatorPublicId: string,
    input: {
        campaign_public_id?: string;
        product_id?: number;
        variation_id?: number;
        code: string;
        commission_bps: number;
        fixed_commission_minor?: number;
        attribution_window_days: number;
        starts_at?: string;
        ends_at?: string;
    },
) {
    assertSchedule(input.starts_at, input.ends_at);
    const creator = await requireCreator(creatorPublicId);
    if (creator.status !== "active") throw new Exception("Creator is not active", { status: 422, code: "E_RETAIL_MEDIA_CREATOR_INACTIVE" });
    const trx = currentTrx();
    let campaignId: number | null = null;
    if (input.campaign_public_id) campaignId = (await requireCampaign(input.campaign_public_id)).id;
    if (input.product_id) {
        const product = await trx.from("products").where({ id: input.product_id, status: "publish" }).whereNull("deleted_at").first();
        if (!product) notFound("Published product not found", "E_RETAIL_MEDIA_PRODUCT_NOT_FOUND");
    }
    if (input.variation_id) {
        if (!input.product_id) throw new Exception("variation_id requires product_id", { status: 422, code: "E_RETAIL_MEDIA_VARIATION_PRODUCT_REQUIRED" });
        const variation = await trx
            .from("product_variations")
            .where({ id: input.variation_id, product_id: input.product_id })
            .whereNull("deleted_at")
            .first();
        if (!variation) throw new Exception("Variation does not belong to product", { status: 422, code: "E_RETAIL_MEDIA_VARIATION_MISMATCH" });
    }
    const [row] = await trx
        .table("retail_media_affiliate_links")
        .insert({
            tenant_id: tenantId(),
            creator_id: creator.id,
            campaign_id: campaignId,
            product_id: input.product_id ?? null,
            variation_id: input.variation_id ?? null,
            code: input.code,
            commission_bps: input.commission_bps,
            fixed_commission_minor: input.fixed_commission_minor ?? null,
            attribution_window_days: input.attribution_window_days,
            starts_at: parseOptionalDate(input.starts_at, "starts_at"),
            ends_at: parseOptionalDate(input.ends_at, "ends_at"),
        })
        .returning("*");
    return row;
}

export async function touchAffiliate(code: string, cart: Cart) {
    if (!maybeTenantContext()) notFound("Affiliate link not found", "E_RETAIL_MEDIA_PUBLIC_NOT_FOUND");
    const trx = currentTrx();
    const row = await trx
        .from("retail_media_affiliate_links as link")
        .innerJoin("retail_media_creators as creator", "creator.id", "link.creator_id")
        .where({ "link.tenant_id": tenantId(), "link.code": code, "link.status": "active", "creator.status": "active" })
        .select(
            "link.public_id",
            "link.code",
            "link.attribution_window_days",
            "link.starts_at",
            "link.ends_at",
            "creator.public_id as creator_public_id",
            "creator.disclosure_text",
        )
        .first();
    if (!row || !activeNow(row)) notFound("Affiliate link not found", "E_RETAIL_MEDIA_AFFILIATE_NOT_FOUND");
    const touched = DateTime.utc();
    const touch: AffiliateTouch = {
        affiliate_link_public_id: String(row.public_id),
        code: String(row.code),
        touched_at: touched.toISO() ?? touched.toString(),
        expires_at: touched.plus({ days: Number(row.attribution_window_days) }).toISO() ?? touched.toString(),
        creator_public_id: String(row.creator_public_id),
        disclosure_text: String(row.disclosure_text),
    };
    const attributes = parseJsonRecord(cart.attributes);
    cart.attributes = { ...attributes, retail_media_attribution: touch };
    await cart.save();
    return { applied: true, creator_public_id: touch.creator_public_id, disclosure: touch.disclosure_text, expires_at: touch.expires_at };
}

function readAffiliateTouch(attributes: unknown): AffiliateTouch | null {
    const root = parseJsonRecord(attributes);
    const value = root.retail_media_attribution;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const touch = value as JsonRecord;
    if (
        typeof touch.affiliate_link_public_id !== "string" ||
        typeof touch.code !== "string" ||
        typeof touch.touched_at !== "string" ||
        typeof touch.expires_at !== "string"
    )
        return null;
    return touch as unknown as AffiliateTouch;
}

export async function settleCreatorCommissions(orderId: number) {
    const trx = currentTrx();
    const order = await trx.from("orders").where({ tenant_id: tenantId(), id: orderId }).first();
    if (!order) return { created: 0, reason: "order_missing" };
    const touch = readAffiliateTouch(order.attributes);
    if (!touch) return { created: 0, reason: "no_affiliate_attribution" };
    const completedAt = order.date_completed_at ? DateTime.fromJSDate(new Date(order.date_completed_at)) : DateTime.utc();
    const touchedAt = DateTime.fromISO(touch.touched_at, { setZone: true });
    const expiresAt = DateTime.fromISO(touch.expires_at, { setZone: true });
    if (!touchedAt.isValid || !expiresAt.isValid || completedAt.toUTC() > expiresAt.toUTC()) {
        return { created: 0, reason: "attribution_expired" };
    }
    const link = await trx
        .from("retail_media_affiliate_links as link")
        .innerJoin("retail_media_creators as creator", "creator.id", "link.creator_id")
        .where({
            "link.tenant_id": tenantId(),
            "link.public_id": touch.affiliate_link_public_id,
            "link.status": "active",
            "creator.status": "active",
        })
        .select("link.*", "creator.holding_days", "creator.public_id as creator_public_id")
        .first();
    if (!link || !activeNow(link)) return { created: 0, reason: "affiliate_inactive" };
    const authoritativeExpiry = touchedAt.plus({ days: Number(link.attribution_window_days) });
    if (completedAt.toUTC() > authoritativeExpiry.toUTC()) return { created: 0, reason: "attribution_expired" };

    const lines = await trx.from("order_line_items").where({ tenant_id: tenantId(), order_id: orderId }).orderBy("id");
    let created = 0;
    for (const line of lines) {
        if (link.product_id && Number(link.product_id) !== Number(line.product_id)) continue;
        if (link.variation_id && Number(link.variation_id) !== Number(line.variation_id)) continue;
        const base = Math.max(0, asNumber(line.total));
        const amount =
            link.fixed_commission_minor !== null && link.fixed_commission_minor !== undefined
                ? asNumber(link.fixed_commission_minor) * Math.max(1, asNumber(line.quantity))
                : Math.floor((base * asNumber(link.commission_bps)) / 10000);
        if (amount <= 0) continue;
        const idempotencyKey = `creator-commission:order:${orderId}:line:${line.id}:link:${link.id}`;
        const rows = await trx
            .table("retail_media_commission_ledger")
            .insert({
                tenant_id: tenantId(),
                creator_id: link.creator_id,
                affiliate_link_id: link.id,
                order_id: orderId,
                order_line_item_id: line.id,
                refund_id: null,
                entry_kind: "commission",
                amount_minor: amount,
                currency: order.currency,
                idempotency_key: idempotencyKey,
                source_ref: `order:${orderId}`,
                available_at: completedAt.plus({ days: Number(link.holding_days) }).toUTC().toSQL(),
                occurred_at: completedAt.toUTC().toSQL(),
                metadata: { commission_basis_minor: base, holding_days: Number(link.holding_days) },
            })
            .onConflict(["tenant_id", "idempotency_key"])
            .ignore()
            .returning("*");
        if (rows.length === 0) continue;
        created += 1;
        if (link.campaign_id) {
            await trx.table("retail_media_delivery_events").insert({
                tenant_id: tenantId(),
                event_id: randomUUID(),
                parent_event_id: null,
                campaign_id: link.campaign_id,
                placement_id: null,
                product_id: line.product_id,
                variation_id: line.variation_id,
                event_type: "conversion",
                subject_hash: null,
                consent_context: "first_party_order",
                revenue_minor: base,
                contribution_minor: null,
                metadata: { source: "creator_affiliate", order_id: orderId, order_line_item_id: Number(line.id) },
                occurred_at: completedAt.toUTC().toSQL(),
            });
        }
    }
    return { created };
}

export async function reconcileCreatorRefund(refundId: number) {
    const trx = currentTrx();
    const refund = await trx.from("order_refunds").where({ tenant_id: tenantId(), id: refundId }).first();
    if (!refund) return { created: 0, reason: "refund_missing" };
    const order = await trx.from("orders").where({ tenant_id: tenantId(), id: refund.order_id }).first();
    if (!order) return { created: 0, reason: "order_missing" };
    const commissions = await trx
        .from("retail_media_commission_ledger")
        .where({ tenant_id: tenantId(), order_id: refund.order_id, entry_kind: "commission" })
        .orderBy("id");
    if (commissions.length === 0) return { created: 0, reason: "no_creator_commission" };
    const refundLines = await trx
        .from("order_refund_line_items")
        .where({ tenant_id: tenantId(), refund_id: refundId })
        .orderBy("id");
    const refundByLine = new Map(refundLines.map((line) => [Number(line.order_line_item_id), asNumber(line.refund_amount_minor)]));
    const orderLines = await trx.from("order_line_items").where({ tenant_id: tenantId(), order_id: refund.order_id }).select("id", "total");
    const lineTotals = new Map(orderLines.map((line) => [Number(line.id), Math.max(1, asNumber(line.total))]));
    const orderTotal = Math.max(1, asNumber(order.grand_total));
    let created = 0;

    for (const commission of commissions) {
        const lineId = commission.order_line_item_id == null ? null : Number(commission.order_line_item_id);
        const refundBasis = lineId !== null && refundByLine.has(lineId) ? (refundByLine.get(lineId) ?? 0) : asNumber(refund.amount_minor);
        const denominator = lineId !== null && refundByLine.has(lineId) ? (lineTotals.get(lineId) ?? orderTotal) : orderTotal;
        if (refundBasis <= 0 || denominator <= 0) continue;
        const prior = await trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenantId(), entry_kind: "refund_adjustment" })
            .whereRaw("metadata->>'commission_ledger_id' = ?", [String(commission.id)])
            .sum({ total: "amount_minor" })
            .first();
        const adjustment = calculateCreatorRefundAdjustment(
            asNumber(commission.amount_minor),
            refundBasis,
            denominator,
            asNumber(prior?.total),
        );
        if (adjustment <= 0) continue;
        const idempotencyKey = `creator-refund:${refundId}:commission:${commission.id}`;
        const rows = await trx
            .table("retail_media_commission_ledger")
            .insert({
                tenant_id: tenantId(),
                creator_id: commission.creator_id,
                affiliate_link_id: commission.affiliate_link_id,
                order_id: refund.order_id,
                order_line_item_id: commission.order_line_item_id,
                refund_id: refundId,
                entry_kind: "refund_adjustment",
                amount_minor: -adjustment,
                currency: commission.currency,
                idempotency_key: idempotencyKey,
                source_ref: `refund:${refundId}`,
                available_at: null,
                occurred_at: refund.processed_at ?? new Date(),
                metadata: { commission_ledger_id: Number(commission.id), refund_basis_minor: refundBasis, denominator_minor: denominator },
            })
            .onConflict(["tenant_id", "idempotency_key"])
            .ignore()
            .returning("*");
        if (rows.length > 0) created += 1;
    }
    return { created };
}

async function creatorBalance(creatorId: number) {
    const trx = currentTrx();
    const now = new Date();
    const [availablePositive, negative, pending] = await Promise.all([
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenantId(), creator_id: creatorId, entry_kind: "commission" })
            .where("available_at", "<=", now)
            .sum({ total: "amount_minor" })
            .first(),
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenantId(), creator_id: creatorId })
            .whereIn("entry_kind", ["refund_adjustment", "payout", "manual_adjustment"])
            .sum({ total: "amount_minor" })
            .first(),
        trx
            .from("retail_media_commission_ledger")
            .where({ tenant_id: tenantId(), creator_id: creatorId, entry_kind: "commission" })
            .where("available_at", ">", now)
            .sum({ total: "amount_minor" })
            .first(),
    ]);
    const available = asNumber(availablePositive?.total) + asNumber(negative?.total);
    return { available_minor: available, pending_minor: asNumber(pending?.total) };
}

export async function listCommissionLedger() {
    return currentTrx()
        .from("retail_media_commission_ledger as ledger")
        .innerJoin("retail_media_creators as creator", "creator.id", "ledger.creator_id")
        .where("ledger.tenant_id", tenantId())
        .select("ledger.*", "creator.public_id as creator_public_id", "creator.display_name as creator_name")
        .orderBy("ledger.occurred_at", "desc")
        .limit(500);
}

export async function recordCreatorPayout(
    creatorPublicId: string,
    input: { amount_minor: number; currency: string; payout_ref: string; idempotency_key: string },
    actor: AdminActor,
) {
    const creator = await requireCreator(creatorPublicId, true);
    const trx = currentTrx();
    const existing = await trx
        .from("retail_media_commission_ledger")
        .where({ tenant_id: tenantId(), idempotency_key: input.idempotency_key })
        .first();
    if (existing) {
        if (Number(existing.creator_id) !== Number(creator.id) || asNumber(existing.amount_minor) !== -input.amount_minor) {
            conflict("Payout idempotency key was reused with different data", "E_RETAIL_MEDIA_PAYOUT_IDEMPOTENCY_MISMATCH");
        }
        return existing;
    }
    const balance = await creatorBalance(Number(creator.id));
    if (input.amount_minor > balance.available_minor) {
        throw new Exception("Payout exceeds available creator balance", { status: 422, code: "E_RETAIL_MEDIA_PAYOUT_EXCEEDS_BALANCE" });
    }
    const [row] = await trx
        .table("retail_media_commission_ledger")
        .insert({
            tenant_id: tenantId(),
            creator_id: creator.id,
            affiliate_link_id: null,
            order_id: null,
            order_line_item_id: null,
            refund_id: null,
            entry_kind: "payout",
            amount_minor: -input.amount_minor,
            currency: input.currency.toUpperCase(),
            idempotency_key: input.idempotency_key,
            source_ref: input.payout_ref,
            available_at: null,
            metadata: { payout_ref: input.payout_ref },
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function measurement() {
    const trx = currentTrx();
    const campaigns = await trx
        .from("retail_media_campaigns")
        .where("tenant_id", tenantId())
        .select("id", "public_id", "name", "currency", "experiment_id", "holdout_id")
        .orderBy("updated_at", "desc")
        .limit(200);
    const results = [];
    for (const campaign of campaigns) {
        const [events, subjects, placementThreshold, spend, analysis, knowledge] = await Promise.all([
            trx
                .from("retail_media_delivery_events")
                .where({ tenant_id: tenantId(), campaign_id: campaign.id })
                .select(
                    trx.raw("COUNT(*) FILTER (WHERE event_type = 'impression')::bigint AS impressions"),
                    trx.raw("COUNT(*) FILTER (WHERE event_type = 'click')::bigint AS clicks"),
                    trx.raw("COUNT(*) FILTER (WHERE event_type = 'conversion')::bigint AS conversions"),
                    trx.raw("COALESCE(SUM(revenue_minor) FILTER (WHERE event_type = 'conversion'), 0)::bigint AS revenue_minor"),
                )
                .first(),
            trx
                .from("retail_media_delivery_events")
                .where({ tenant_id: tenantId(), campaign_id: campaign.id })
                .whereNotNull("subject_hash")
                .countDistinct({ count: "subject_hash" })
                .first(),
            trx
                .from("retail_media_campaign_placements as link")
                .innerJoin("retail_media_placements as p", "p.id", "link.placement_id")
                .where({ "link.tenant_id": tenantId(), "link.campaign_id": campaign.id })
                .max({ threshold: "p.privacy_min_cohort" })
                .first(),
            campaignSpend(Number(campaign.id)),
            campaign.experiment_id
                ? trx
                      .from("experiment_analysis_runs")
                      .where({ tenant_id: tenantId(), experiment_id: campaign.experiment_id })
                      .orderBy("created_at", "desc")
                      .first()
                : Promise.resolve(null),
            campaign.experiment_id
                ? trx
                      .from("experiment_causal_knowledge")
                      .where({ tenant_id: tenantId(), experiment_id: campaign.experiment_id })
                      .orderBy("last_evaluated_at", "desc")
                      .first()
                : Promise.resolve(null),
        ]);
        const uniqueSubjects = asNumber(subjects?.count);
        const threshold = Math.max(20, asNumber(placementThreshold?.threshold ?? 20));
        const hasTrackedSubjects = asNumber(events?.impressions) + asNumber(events?.clicks) > 0;
        const suppressed = hasTrackedSubjects && uniqueSubjects < threshold;
        const effect = parseJsonRecord(knowledge?.effect_snapshot);
        results.push({
            campaign_public_id: String(campaign.public_id),
            name: String(campaign.name),
            currency: String(campaign.currency),
            privacy: { threshold, cohort: suppressed ? null : uniqueSubjects, suppressed },
            delivery: {
                impressions: suppressed ? null : asNumber(events?.impressions),
                clicks: suppressed ? null : asNumber(events?.clicks),
                conversions: suppressed ? null : asNumber(events?.conversions),
                revenue_minor: suppressed ? null : asNumber(events?.revenue_minor),
                spend_minor: Math.max(0, spend),
            },
            incrementality: {
                experiment_id: campaign.experiment_id ?? null,
                holdout_id: campaign.holdout_id ?? null,
                causal_strength: analysis?.causal_strength ?? null,
                status: analysis?.status ?? (campaign.experiment_id ? "pending" : "not_configured"),
                incremental_contribution_minor:
                    !suppressed && typeof effect.incremental_contribution_minor === "number"
                        ? effect.incremental_contribution_minor
                        : null,
            },
        });
    }
    return { engine_version: RETAIL_MEDIA_ENGINE_VERSION, campaigns: results };
}
