import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import type { TransactionClientContract } from "@adonisjs/lucid/types/database";
import { DateTime } from "luxon";

import type Cart from "#models/cart";
import type Order from "#models/order";
import { comparePromiseOptions, isCalibratedServiceProfile, isInventoryFreshAt } from "#services/fulfillment_promise/policy";
import { enumerateShippingRates, type ShippingRateOption } from "#services/shipping_rate_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

type DbRow = Record<string, unknown>;
type Actor = { id: string | number | bigint };

type PromiseLine = {
    product_id: number;
    variation_id: number | null;
    quantity: number;
    inventory_item_id: number;
    node_id: number;
    stock_quantity: number;
    manage_stock: boolean;
    inventory_updated_at: string;
};

type NodeCandidate = {
    node: DbRow;
    profile: DbRow;
    capacity: DbRow;
    lines: PromiseLine[];
    startAt: DateTime;
    endAt: DateTime;
    confidenceBps: number;
};

export interface PromiseOption {
    public_id: string;
    strategy: "single_location" | "split_shipment";
    window_start_at: string;
    window_end_at: string;
    confidence_bps: number;
    cost_minor: number;
    currency: string;
    source_locations: Array<{ public_id: string; code: string; name: string }>;
    constraints: string[];
    expires_at: string;
}

const QUOTE_TTL_MINUTES = 10;
const MAX_PROMISE_OPTIONS = 6;
const MAX_CAPACITY_HORIZON_DAYS = 14;

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value);
}

function parseJson<T>(value: unknown, fallback: T): T {
    if (value && typeof value === "object") return value as T;
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback;
        }
    }
    return fallback;
}

function asDateTime(value: unknown): DateTime | null {
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: "utc" });
    if (typeof value === "string") {
        const iso = DateTime.fromISO(value, { zone: "utc" });
        if (iso.isValid) return iso;
        const sql = DateTime.fromSQL(value, { zone: "utc" });
        return sql.isValid ? sql : null;
    }
    return null;
}

function fingerprint(value: unknown): string {
    const canonical = JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
            : item,
    );
    return createHash("sha256").update(canonical).digest("hex");
}

function destinationFingerprint(cart: Cart): string {
    return fingerprint({
        country: cart.country?.toUpperCase() ?? null,
        region_id: cart.regionId === null ? null : Number(cart.regionId),
        postcode: cart.postcode?.trim().toUpperCase() ?? null,
    });
}

function lineFingerprint(lines: Array<{ product_id: number; variation_id: number | null; quantity: number }>): string {
    return fingerprint(
        [...lines].sort(
            (a, b) => a.product_id - b.product_id || (a.variation_id ?? 0) - (b.variation_id ?? 0) || a.quantity - b.quantity,
        ),
    );
}

async function resolveInventoryItem(
    trx: TransactionClientContract,
    productId: number,
    variationId: number | null,
): Promise<DbRow | null> {
    let effectiveVariationId = variationId;
    if (effectiveVariationId !== null) {
        const variation = await trx
            .from("product_variations")
            .where("id", effectiveVariationId)
            .select("manage_stock_mode")
            .first();
        if (variation?.manage_stock_mode === "parent") effectiveVariationId = null;
    }
    const query = trx.from("inventory_items").where("product_id", productId);
    if (effectiveVariationId === null) query.whereNull("variation_id");
    else query.where("variation_id", effectiveVariationId);
    return (await query.first()) ?? null;
}

async function loadPromiseLines(cart: Cart): Promise<PromiseLine[]> {
    const trx = currentTrx();
    await cart.load("items");
    if (cart.items.length === 0) {
        throw new Exception("Cannot promise an empty cart", { status: 422, code: "E_PROMISE_CART_EMPTY" });
    }

    const lines: PromiseLine[] = [];
    for (const item of cart.items) {
        const productId = Number(item.productId);
        const variationId = item.variationId === null ? null : Number(item.variationId);
        const quantity = Number(item.quantity);
        const inventory = await resolveInventoryItem(trx, productId, variationId);
        if (!inventory) {
            throw new Exception("A cart line has no canonical inventory source", {
                status: 409,
                code: "E_PROMISE_INVENTORY_UNAVAILABLE",
            });
        }
        const inventoryItemId = numberValue(inventory.id);
        const source = await trx
            .from("fulfillment_node_inventory_sources as source")
            .innerJoin("fulfillment_network_nodes as node", "node.id", "source.node_id")
            .where("source.inventory_item_id", inventoryItemId)
            .where("source.status", "active")
            .where("node.status", "active")
            .select("source.node_id")
            .first();
        if (!source) {
            throw new Exception("Canonical inventory is not mapped to an active fulfillment node", {
                status: 409,
                code: "E_PROMISE_SOURCE_NODE_UNAVAILABLE",
            });
        }
        const stock = numberValue(inventory.stock_quantity);
        const manageStock = Boolean(inventory.manage_stock);
        if (manageStock && stock < quantity) {
            throw new Exception("Canonical inventory cannot support this promise", {
                status: 409,
                code: "E_PROMISE_INSUFFICIENT_STOCK",
            });
        }
        const updatedAt = asDateTime(inventory.updated_at);
        if (!updatedAt) {
            throw new Exception("Inventory freshness is unknown", { status: 409, code: "E_PROMISE_INVENTORY_STALE" });
        }
        lines.push({
            product_id: productId,
            variation_id: variationId,
            quantity,
            inventory_item_id: inventoryItemId,
            node_id: numberValue(source.node_id),
            stock_quantity: stock,
            manage_stock: manageStock,
            inventory_updated_at: updatedAt.toUTC().toISO()!,
        });
    }
    return lines;
}

function calibratedProfile(profile: DbRow, now: DateTime): boolean {
    return isCalibratedServiceProfile(
        {
            calibrationSampleCount: numberValue(profile.calibration_sample_count),
            minimumSampleCount: Math.max(1, numberValue(profile.minimum_sample_count)),
            confidenceBps: numberValue(profile.confidence_bps),
            lastCalibratedAt: asDateTime(profile.last_calibrated_at)?.toISO() ?? null,
            maxCalibrationAgeHours: Math.max(1, numberValue(profile.max_calibration_age_hours)),
        },
        now.toISO()!,
    );
}

async function selectCapacityWindow(node: DbRow, quantity: number, now: DateTime): Promise<DbRow | null> {
    const trx = currentTrx();
    const timezone = stringValue(node.timezone) || "UTC";
    const localNow = now.setZone(timezone);
    const rows = await trx
        .from("fulfillment_capacity_windows")
        .where("node_id", numberValue(node.id))
        .where("status", "open")
        .whereBetween("service_date", [localNow.toISODate()!, localNow.plus({ days: MAX_CAPACITY_HORIZON_DAYS }).toISODate()!])
        .whereRaw("capacity_units - reserved_units >= ?", [quantity])
        .orderBy("service_date", "asc")
        .orderBy("window_start_local", "asc");

    const cutoff = node.cutoff_local_time ? stringValue(node.cutoff_local_time) : null;
    for (const row of rows) {
        const date = stringValue(row.service_date).slice(0, 10);
        const start = stringValue(row.window_start_local);
        const end = stringValue(row.window_end_local);
        const startAt = DateTime.fromSQL(`${date} ${start}`, { zone: timezone });
        const endAt = DateTime.fromSQL(`${date} ${end}`, { zone: timezone });
        if (!startAt.isValid || !endAt.isValid) continue;
        if (endAt <= localNow) continue;
        if (date === localNow.toISODate() && cutoff) {
            const cutoffAt = DateTime.fromSQL(`${date} ${cutoff}`, { zone: timezone });
            if (cutoffAt.isValid && localNow > cutoffAt) continue;
        }
        return row;
    }
    return null;
}

async function nodeCandidate(
    nodeId: number,
    rate: ShippingRateOption,
    lines: PromiseLine[],
    now: DateTime,
): Promise<NodeCandidate | null> {
    const trx = currentTrx();
    const node = await trx.from("fulfillment_network_nodes").where("id", nodeId).where("status", "active").first();
    if (!node) return null;

    const staleMinutes = Math.max(1, numberValue(node.inventory_stale_after_minutes));
    for (const line of lines) {
        const observed = DateTime.fromISO(line.inventory_updated_at, { zone: "utc" });
        if (!observed.isValid || !isInventoryFreshAt(observed.toISO(), staleMinutes, now.toISO()!)) return null;
        if (line.manage_stock && line.stock_quantity < line.quantity) return null;
    }

    const profile = await trx
        .from("fulfillment_service_profiles")
        .where("node_id", nodeId)
        .where("shipping_zone_method_id", rate.id)
        .where("status", "active")
        .first();
    if (!profile || !calibratedProfile(profile, now)) return null;

    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const capacity = await selectCapacityWindow(node, quantity, now);
    if (!capacity) return null;

    const timezone = stringValue(node.timezone) || "UTC";
    const date = stringValue(capacity.service_date).slice(0, 10);
    const capacityEnd = DateTime.fromSQL(`${date} ${stringValue(capacity.window_end_local)}`, { zone: timezone });
    if (!capacityEnd.isValid) return null;
    const handlingMinutes = Math.max(0, numberValue(node.handling_minutes));
    const dispatchAt = capacityEnd.plus({ minutes: handlingMinutes });
    const p50 = Math.max(0, numberValue(profile.transit_minutes_p50));
    const p90 = Math.max(p50, numberValue(profile.transit_minutes_p90));
    return {
        node,
        profile,
        capacity,
        lines,
        startAt: dispatchAt.plus({ minutes: p50 }).toUTC(),
        endAt: dispatchAt.plus({ minutes: p90 }).toUTC(),
        confidenceBps: numberValue(profile.confidence_bps),
    };
}

function groupByNode(lines: PromiseLine[]): Map<number, PromiseLine[]> {
    const groups = new Map<number, PromiseLine[]>();
    for (const line of lines) groups.set(line.node_id, [...(groups.get(line.node_id) ?? []), line]);
    return groups;
}

async function persistOption(
    cart: Cart,
    rate: ShippingRateOption,
    candidates: NodeCandidate[],
    strategy: "single_location" | "split_shipment",
    lines: PromiseLine[],
    now: DateTime,
): Promise<PromiseOption> {
    const trx = currentTrx();
    const startAt = candidates.reduce(
        (latest, candidate) => (candidate.startAt > latest ? candidate.startAt : latest),
        candidates[0].startAt,
    );
    const endAt = candidates.reduce(
        (latest, candidate) => (candidate.endAt > latest ? candidate.endAt : latest),
        candidates[0].endAt,
    );
    const confidence = Math.min(...candidates.map((candidate) => candidate.confidenceBps));
    const freshness = candidates.flatMap((candidate) =>
        candidate.lines.map((line) =>
            DateTime.fromISO(line.inventory_updated_at, { zone: "utc" }).plus({
                minutes: numberValue(candidate.node.inventory_stale_after_minutes),
            }),
        ),
    );
    const freshUntil = freshness.reduce((earliest, value) => (value < earliest ? value : earliest), freshness[0]);
    const expiresAt = DateTime.min(now.plus({ minutes: QUOTE_TTL_MINUTES }), freshUntil);
    const primary = candidates[0];
    const constraints = [
        "canonical_inventory_fresh",
        "canonical_shipping_rate_eligible",
        "calibrated_service_profile",
        "pick_pack_capacity_available",
        ...(strategy === "split_shipment" ? ["multi_node_split_required"] : []),
    ];
    const sourceLocations = candidates.map((candidate) => ({
        public_id: stringValue(candidate.node.public_id),
        code: stringValue(candidate.node.node_code),
        name: stringValue(candidate.node.name),
    }));
    const [row] = await trx
        .table("fulfillment_promise_quotes")
        .insert({
            cart_id: Number(cart.id),
            node_id: strategy === "single_location" ? numberValue(primary.node.id) : null,
            shipping_zone_method_id: rate.id,
            capacity_window_id: strategy === "single_location" ? numberValue(primary.capacity.id) : null,
            service_profile_id: strategy === "single_location" ? numberValue(primary.profile.id) : null,
            strategy,
            status: "quoted",
            window_start_at: startAt.toJSDate(),
            window_end_at: endAt.toJSDate(),
            confidence_bps: confidence,
            shipping_cost_minor: rate.cost,
            transfer_cost_minor: 0,
            currency: cart.currency ?? "IRR",
            inventory_observed_at: DateTime.min(...lines.map((line) => DateTime.fromISO(line.inventory_updated_at))).toJSDate(),
            inventory_fresh_until: freshUntil.toJSDate(),
            destination_fingerprint: destinationFingerprint(cart),
            line_snapshot: lines,
            constraints,
            decision_trace: {
                rate_id: rate.id,
                method_code: rate.methodCode,
                source_locations: sourceLocations,
                capacity_window_ids: candidates.map((candidate) => numberValue(candidate.capacity.id)),
                service_profile_ids: candidates.map((candidate) => numberValue(candidate.profile.id)),
                line_fingerprint: lineFingerprint(lines),
            },
            expires_at: expiresAt.toJSDate(),
        })
        .returning("*");
    return {
        public_id: stringValue(row.public_id),
        strategy,
        window_start_at: startAt.toISO()!,
        window_end_at: endAt.toISO()!,
        confidence_bps: confidence,
        cost_minor: rate.cost,
        currency: cart.currency ?? "IRR",
        source_locations: sourceLocations,
        constraints,
        expires_at: expiresAt.toISO()!,
    };
}

export async function quoteCart(cart: Cart): Promise<{ options: PromiseOption[]; unavailable_reasons: string[] }> {
    if (!cart.country) {
        return { options: [], unavailable_reasons: ["shipping_destination_required"] };
    }
    const now = DateTime.utc();
    const lines = await loadPromiseLines(cart);
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.priceSnapshot) * Number(item.quantity), 0);
    const rates = await enumerateShippingRates(
        {
            country: cart.country,
            regionId: cart.regionId === null ? null : Number(cart.regionId),
            postcode: cart.postcode,
        },
        subtotal,
    );
    if (rates.length === 0) return { options: [], unavailable_reasons: ["canonical_shipping_rate_unavailable"] };

    const groups = groupByNode(lines);
    const options: PromiseOption[] = [];
    for (const rate of rates) {
        const candidates: NodeCandidate[] = [];
        for (const [nodeId, nodeLines] of groups) {
            const candidate = await nodeCandidate(nodeId, rate, nodeLines, now);
            if (!candidate) {
                candidates.length = 0;
                break;
            }
            candidates.push(candidate);
        }
        if (candidates.length !== groups.size || candidates.length === 0) continue;
        const strategy = candidates.length === 1 ? "single_location" : "split_shipment";
        options.push(await persistOption(cart, rate, candidates, strategy, lines, now));
    }
    options.sort((a, b) =>
        comparePromiseOptions(
            { confidenceBps: a.confidence_bps, windowEndMs: new Date(a.window_end_at).getTime(), costMinor: a.cost_minor },
            { confidenceBps: b.confidence_bps, windowEndMs: new Date(b.window_end_at).getTime(), costMinor: b.cost_minor },
        ),
    );
    return {
        options: options.slice(0, MAX_PROMISE_OPTIONS),
        unavailable_reasons: options.length === 0 ? ["no_fresh_calibrated_capacity_candidate"] : [],
    };
}

async function quoteByPublicId(publicId: string): Promise<DbRow> {
    const row = await currentTrx().from("fulfillment_promise_quotes").where("public_id", publicId).first();
    if (!row) throw new Exception("Promise quote not found", { status: 404, code: "E_PROMISE_QUOTE_NOT_FOUND" });
    return row;
}

async function assertQuoteMatchesCart(cart: Cart, quote: DbRow): Promise<void> {
    const now = DateTime.utc();
    if (stringValue(quote.status) !== "quoted") {
        throw new Exception("Promise quote is no longer selectable", { status: 409, code: "E_PROMISE_QUOTE_STATE" });
    }
    const expires = asDateTime(quote.expires_at);
    if (!expires || expires <= now)
        throw new Exception("Promise quote expired", { status: 409, code: "E_PROMISE_QUOTE_EXPIRED" });
    if (stringValue(quote.destination_fingerprint) !== destinationFingerprint(cart)) {
        throw new Exception("Shipping destination changed after promise creation", {
            status: 409,
            code: "E_PROMISE_DESTINATION_CHANGED",
        });
    }
    const currentLines = await loadPromiseLines(cart);
    const snapshot = parseJson<PromiseLine[]>(quote.line_snapshot, []);
    if (lineFingerprint(currentLines) !== lineFingerprint(snapshot)) {
        throw new Exception("Cart contents changed after promise creation", { status: 409, code: "E_PROMISE_CART_CHANGED" });
    }
    for (const line of currentLines) {
        const prior = snapshot.find(
            (item) =>
                item.product_id === line.product_id && item.variation_id === line.variation_id && item.quantity === line.quantity,
        );
        if (!prior || prior.inventory_item_id !== line.inventory_item_id || prior.node_id !== line.node_id) {
            throw new Exception("Fulfillment source changed after promise creation", {
                status: 409,
                code: "E_PROMISE_SOURCE_CHANGED",
            });
        }
        const sourceNode = await currentTrx()
            .from("fulfillment_network_nodes")
            .where("id", line.node_id)
            .where("status", "active")
            .first();
        if (!sourceNode)
            throw new Exception("Fulfillment source is unavailable", { status: 409, code: "E_PROMISE_SOURCE_UNAVAILABLE" });
        const observed = DateTime.fromISO(line.inventory_updated_at, { zone: "utc" });
        if (
            !isInventoryFreshAt(
                observed.toISO(),
                Math.max(1, numberValue(sourceNode.inventory_stale_after_minutes)),
                now.toISO()!,
            )
        ) {
            throw new Exception("Inventory became stale before checkout", { status: 409, code: "E_PROMISE_INVENTORY_STALE" });
        }
    }
}

export async function selectCartPromise(cart: Cart, publicId: string) {
    const quote = await quoteByPublicId(publicId);
    if (Number(quote.cart_id) !== Number(cart.id)) {
        throw new Exception("Promise quote does not belong to this cart", { status: 403, code: "E_PROMISE_CART_OWNERSHIP" });
    }
    await assertQuoteMatchesCart(cart, quote);
    cart.attributes = {
        ...((cart.attributes as Record<string, unknown> | null) ?? {}),
        fulfillment_promise_quote_public_id: publicId,
    };
    await cart.save();
    return { selected: true, public_id: publicId };
}

export async function checkoutGuard(cart: Cart, draft: Order): Promise<string | null> {
    const attributes = (cart.attributes as Record<string, unknown> | null) ?? {};
    const publicId =
        typeof attributes.fulfillment_promise_quote_public_id === "string"
            ? attributes.fulfillment_promise_quote_public_id
            : null;
    if (!publicId) return null;
    const quote = await quoteByPublicId(publicId);
    if (Number(quote.cart_id) !== Number(cart.id)) {
        throw new Exception("Selected promise no longer belongs to the cart", { status: 409, code: "E_PROMISE_CART_OWNERSHIP" });
    }
    await assertQuoteMatchesCart(cart, quote);
    const orderAttributes = (draft.attributes as Record<string, unknown> | null) ?? {};
    if (orderAttributes.fulfillment_promise_quote_public_id !== publicId) {
        draft.attributes = { ...orderAttributes, fulfillment_promise_quote_public_id: publicId };
        await draft.save();
    }
    return publicId;
}

export async function commitOrderPromise(order: Order, publicId: string | null) {
    if (!publicId) return null;
    const trx = currentTrx();
    const quote = await trx.from("fulfillment_promise_quotes").where("public_id", publicId).forUpdate().first();
    if (!quote) return null;
    if (quote.status === "consumed" && Number(quote.order_id) === Number(order.id)) return quote;
    if (quote.status !== "quoted") {
        throw new Exception("Promise quote cannot be consumed", { status: 409, code: "E_PROMISE_QUOTE_STATE" });
    }
    const [updated] = await trx
        .from("fulfillment_promise_quotes")
        .where("id", quote.id)
        .update({ order_id: Number(order.id), status: "consumed", consumed_at: new Date(), updated_at: new Date() })
        .returning("*");
    const trace = parseJson<Record<string, unknown>>(quote.decision_trace, {});
    await trx.table("fulfillment_allocation_recommendations").insert({
        order_id: Number(order.id),
        promise_quote_id: Number(quote.id),
        strategy: quote.strategy,
        score_bps: numberValue(quote.confidence_bps),
        recommendation: {
            source_locations: trace.source_locations ?? [],
            shipping_zone_method_id: Number(quote.shipping_zone_method_id),
            promise_window: [quote.window_start_at, quote.window_end_at],
        },
        constraints: parseJson(quote.constraints, []),
        status: "recommended",
    });
    return updated;
}

export async function overview() {
    const trx = currentTrx();
    const [nodes, profiles, promises, accuracy, allocations] = await Promise.all([
        trx.from("fulfillment_network_nodes").count("id as count").where("status", "active").first(),
        trx
            .from("fulfillment_service_profiles")
            .count("id as count")
            .where("status", "active")
            .whereRaw("calibration_sample_count >= minimum_sample_count")
            .first(),
        trx
            .from("fulfillment_promise_quotes")
            .where("created_at", ">=", DateTime.utc().minus({ days: 30 }).toJSDate())
            .count("id as count")
            .first(),
        trx
            .from("fulfillment_promise_outcomes")
            .whereNotNull("on_time")
            .select(trx.raw("COUNT(*)::int as total"), trx.raw("COUNT(*) FILTER (WHERE on_time = true)::int as on_time"))
            .first(),
        trx
            .from("fulfillment_allocation_recommendations")
            .where("created_at", ">=", DateTime.utc().minus({ days: 30 }).toJSDate())
            .count("id as count")
            .first(),
    ]);
    const total = numberValue(accuracy?.total);
    return {
        active_nodes: numberValue(nodes?.count),
        calibrated_services: numberValue(profiles?.count),
        promises_30d: numberValue(promises?.count),
        allocation_recommendations_30d: numberValue(allocations?.count),
        on_time_promises: numberValue(accuracy?.on_time),
        measured_outcomes: total,
        promise_accuracy_bps: total > 0 ? Math.round((numberValue(accuracy?.on_time) / total) * 10000) : null,
    };
}

export async function listNodes() {
    return currentTrx()
        .from("fulfillment_network_nodes")
        .select(
            "id",
            "public_id",
            "node_code",
            "name",
            "node_type",
            "status",
            "timezone",
            "country",
            "region_id",
            "city",
            "cutoff_local_time",
            "handling_minutes",
            "inventory_stale_after_minutes",
            "version",
            "updated_at",
        )
        .orderBy("name", "asc");
}

export async function createNode(payload: Record<string, unknown>, actor: Actor) {
    const [row] = await currentTrx()
        .table("fulfillment_network_nodes")
        .insert({
            node_code: payload.node_code,
            name: payload.name,
            node_type: payload.node_type,
            timezone: payload.timezone,
            country: String(payload.country).toUpperCase(),
            region_id: payload.region_id ?? null,
            city: payload.city ?? null,
            postcode_prefix: payload.postcode_prefix ?? null,
            cutoff_local_time: payload.cutoff_local_time ?? null,
            handling_minutes: payload.handling_minutes,
            inventory_stale_after_minutes: payload.inventory_stale_after_minutes,
            operating_hours: payload.operating_hours ?? {},
            metadata: payload.metadata ?? {},
            created_by_user_id: Number(actor.id),
            updated_by_user_id: Number(actor.id),
        })
        .returning("*");
    return row;
}

export async function mapInventorySource(nodePublicId: string, inventoryItemId: number) {
    const trx = currentTrx();
    const node = await trx.from("fulfillment_network_nodes").where("public_id", nodePublicId).where("status", "active").first();
    if (!node) throw new Exception("Fulfillment node not found", { status: 404, code: "E_FULFILLMENT_NODE_NOT_FOUND" });
    const inventory = await trx.from("inventory_items").where("id", inventoryItemId).first();
    if (!inventory)
        throw new Exception("Canonical inventory item not found", { status: 404, code: "E_INVENTORY_ITEM_NOT_FOUND" });
    const existing = await trx.from("fulfillment_node_inventory_sources").where("inventory_item_id", inventoryItemId).first();
    if (existing && Number(existing.node_id) !== Number(node.id)) {
        throw new Exception("Canonical inventory item already has a source node", {
            status: 409,
            code: "E_INVENTORY_SOURCE_ALREADY_MAPPED",
        });
    }
    const [row] = await trx
        .table("fulfillment_node_inventory_sources")
        .insert({ node_id: node.id, inventory_item_id: inventoryItemId, status: "active" })
        .onConflict(["tenant_id", "inventory_item_id"])
        .merge({ node_id: node.id, status: "active", updated_at: new Date() })
        .returning("*");
    return row;
}

export async function upsertCapacity(nodePublicId: string, payload: Record<string, unknown>) {
    const trx = currentTrx();
    const node = await trx.from("fulfillment_network_nodes").where("public_id", nodePublicId).first();
    if (!node) throw new Exception("Fulfillment node not found", { status: 404, code: "E_FULFILLMENT_NODE_NOT_FOUND" });
    const [row] = await trx
        .table("fulfillment_capacity_windows")
        .insert({
            node_id: node.id,
            service_date: payload.service_date,
            window_start_local: payload.window_start_local,
            window_end_local: payload.window_end_local,
            capacity_units: payload.capacity_units,
            status: payload.status ?? "open",
        })
        .onConflict(["tenant_id", "node_id", "service_date", "window_start_local", "window_end_local"])
        .merge({
            capacity_units: payload.capacity_units,
            status: payload.status ?? "open",
            version: trx.raw("fulfillment_capacity_windows.version + 1"),
            updated_at: new Date(),
        })
        .returning("*");
    return row;
}

export async function listServiceProfiles() {
    return currentTrx()
        .from("fulfillment_service_profiles as profile")
        .innerJoin("fulfillment_network_nodes as node", "node.id", "profile.node_id")
        .innerJoin("shipping_zone_methods as szm", "szm.id", "profile.shipping_zone_method_id")
        .innerJoin("shipping_methods as method", "method.id", "szm.method_id")
        .select(
            "profile.*",
            "node.public_id as node_public_id",
            "node.name as node_name",
            "method.code as method_code",
            "method.title_default as method_title",
        )
        .orderBy("node.name", "asc");
}

export async function upsertServiceProfile(nodePublicId: string, payload: Record<string, unknown>) {
    const trx = currentTrx();
    const node = await trx.from("fulfillment_network_nodes").where("public_id", nodePublicId).first();
    if (!node) throw new Exception("Fulfillment node not found", { status: 404, code: "E_FULFILLMENT_NODE_NOT_FOUND" });
    const rate = await trx.from("shipping_zone_methods").where("id", Number(payload.shipping_zone_method_id)).first();
    if (!rate)
        throw new Exception("Canonical shipping method instance not found", { status: 404, code: "E_SHIPPING_METHOD_NOT_FOUND" });
    const [row] = await trx
        .table("fulfillment_service_profiles")
        .insert({
            node_id: node.id,
            shipping_zone_method_id: payload.shipping_zone_method_id,
            status: payload.status ?? "active",
            transit_minutes_p50: payload.transit_minutes_p50,
            transit_minutes_p90: payload.transit_minutes_p90,
            calibration_sample_count: payload.calibration_sample_count,
            minimum_sample_count: payload.minimum_sample_count,
            confidence_bps: payload.confidence_bps,
            max_calibration_age_hours: payload.max_calibration_age_hours,
            last_calibrated_at: payload.last_calibrated_at,
            service_weekdays: payload.service_weekdays,
            metadata: payload.metadata ?? {},
        })
        .onConflict(["tenant_id", "node_id", "shipping_zone_method_id"])
        .merge({
            status: payload.status ?? "active",
            transit_minutes_p50: payload.transit_minutes_p50,
            transit_minutes_p90: payload.transit_minutes_p90,
            calibration_sample_count: payload.calibration_sample_count,
            minimum_sample_count: payload.minimum_sample_count,
            confidence_bps: payload.confidence_bps,
            max_calibration_age_hours: payload.max_calibration_age_hours,
            last_calibrated_at: payload.last_calibrated_at,
            service_weekdays: payload.service_weekdays,
            metadata: payload.metadata ?? {},
            version: trx.raw("fulfillment_service_profiles.version + 1"),
            updated_at: new Date(),
        })
        .returning("*");
    return row;
}

export async function upsertTransferLane(payload: Record<string, unknown>) {
    const trx = currentTrx();
    const [from, to] = await Promise.all([
        trx.from("fulfillment_network_nodes").where("public_id", payload.from_node_public_id).first(),
        trx.from("fulfillment_network_nodes").where("public_id", payload.to_node_public_id).first(),
    ]);
    if (!from || !to) throw new Exception("Transfer lane node not found", { status: 404, code: "E_TRANSFER_NODE_NOT_FOUND" });
    if (Number(from.id) === Number(to.id))
        throw new Exception("Transfer lane nodes must differ", { status: 422, code: "E_TRANSFER_NODE_SAME" });
    const [row] = await trx
        .table("fulfillment_transfer_lanes")
        .insert({
            from_node_id: from.id,
            to_node_id: to.id,
            status: payload.status ?? "active",
            transfer_minutes_p90: payload.transfer_minutes_p90,
            cost_minor: payload.cost_minor,
            confidence_bps: payload.confidence_bps,
            calibration_sample_count: payload.calibration_sample_count,
            last_calibrated_at: payload.last_calibrated_at ?? null,
        })
        .onConflict(["tenant_id", "from_node_id", "to_node_id"])
        .merge({
            status: payload.status ?? "active",
            transfer_minutes_p90: payload.transfer_minutes_p90,
            cost_minor: payload.cost_minor,
            confidence_bps: payload.confidence_bps,
            calibration_sample_count: payload.calibration_sample_count,
            last_calibrated_at: payload.last_calibrated_at ?? null,
            updated_at: new Date(),
        })
        .returning("*");
    return row;
}

export async function listRecentPromises(limit = 100) {
    return currentTrx()
        .from("fulfillment_promise_quotes as quote")
        .leftJoin("fulfillment_network_nodes as node", "node.id", "quote.node_id")
        .select(
            "quote.public_id",
            "quote.strategy",
            "quote.status",
            "quote.window_start_at",
            "quote.window_end_at",
            "quote.confidence_bps",
            "quote.shipping_cost_minor",
            "quote.currency",
            "quote.constraints",
            "quote.created_at",
            "node.name as source_name",
        )
        .orderBy("quote.created_at", "desc")
        .limit(Math.min(500, Math.max(1, limit)));
}

export async function listAllocationRecommendations(limit = 100) {
    return currentTrx()
        .from("fulfillment_allocation_recommendations")
        .select("id", "order_id", "strategy", "score_bps", "recommendation", "constraints", "status", "accepted_at", "created_at")
        .orderBy("created_at", "desc")
        .limit(Math.min(500, Math.max(1, limit)));
}

export async function syncDeliveryOutcomes() {
    const trx = currentTrx();
    const rows = await trx
        .from("fulfillment_promise_quotes as quote")
        .innerJoin("orders as order", "order.id", "quote.order_id")
        .innerJoin("order_fulfillments as fulfillment", "fulfillment.order_id", "order.id")
        .innerJoin("order_shipments as shipment", "shipment.fulfillment_id", "fulfillment.id")
        .innerJoin("order_shipment_events as event", "event.shipment_id", "shipment.id")
        .leftJoin("fulfillment_promise_outcomes as outcome", "outcome.promise_quote_id", "quote.id")
        .where("quote.status", "consumed")
        .where("event.status", "delivered")
        .whereNull("outcome.id")
        .select(
            "quote.id as quote_id",
            "quote.order_id",
            "quote.window_end_at",
            "shipment.id as shipment_id",
            "event.occurred_at",
        )
        .orderBy("event.occurred_at", "asc");
    let inserted = 0;
    for (const row of rows) {
        const deliveredAt = asDateTime(row.occurred_at);
        const promisedEnd = asDateTime(row.window_end_at);
        if (!deliveredAt || !promisedEnd) continue;
        const lateness = Math.round(deliveredAt.diff(promisedEnd, "minutes").minutes);
        await trx
            .table("fulfillment_promise_outcomes")
            .insert({
                promise_quote_id: row.quote_id,
                order_id: row.order_id,
                shipment_id: row.shipment_id,
                actual_delivered_at: deliveredAt.toJSDate(),
                lateness_minutes: lateness,
                on_time: lateness <= 0,
                source: "shipment_event",
            })
            .onConflict(["tenant_id", "promise_quote_id"])
            .ignore();
        inserted += 1;
    }
    return { synchronized: inserted };
}

export async function promiseAccuracy() {
    const trx = currentTrx();
    const rows = await trx
        .from("fulfillment_promise_outcomes as outcome")
        .innerJoin("fulfillment_promise_quotes as quote", "quote.id", "outcome.promise_quote_id")
        .leftJoin("fulfillment_network_nodes as node", "node.id", "quote.node_id")
        .select(
            "outcome.on_time",
            "outcome.lateness_minutes",
            "outcome.actual_delivered_at",
            "quote.strategy",
            "quote.confidence_bps",
            "quote.window_end_at",
            "node.name as node_name",
        )
        .orderBy("outcome.actual_delivered_at", "desc")
        .limit(500);
    const measured = rows.filter((row) => row.on_time !== null);
    const onTime = measured.filter((row) => Boolean(row.on_time)).length;
    const lateness = measured.map((row) => numberValue(row.lateness_minutes)).sort((a, b) => a - b);
    return {
        measured_outcomes: measured.length,
        on_time_count: onTime,
        accuracy_bps: measured.length ? Math.round((onTime / measured.length) * 10000) : null,
        median_lateness_minutes: lateness.length ? lateness[Math.floor(lateness.length / 2)] : null,
        outcomes: rows,
    };
}

export function tenantIdForDiagnostics() {
    return Number(currentTenantId());
}
