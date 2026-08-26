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
type Strategy = "single_location" | "split_shipment" | "transfer_then_fulfill" | "pickup";

type PromiseLine = {
    product_id: number;
    variation_id: number | null;
    quantity: number;
    inventory_item_id: number;
    node_id: number;
    node_public_id: string;
    node_code: string;
    node_name: string;
    stock_quantity: number;
    manage_stock: boolean;
    inventory_updated_at: string;
    inventory_fresh_until: string;
};

type LineCandidateSet = {
    product_id: number;
    variation_id: number | null;
    quantity: number;
    alternatives: PromiseLine[];
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

type TransferEvidence = {
    lane_id: number;
    from_node_id: number;
    to_node_id: number;
    from_node_public_id: string;
    to_node_public_id: string;
    transfer_minutes_p90: number;
    confidence_bps: number;
    cost_minor: number;
};

type PromisePlan = {
    strategy: Strategy;
    candidates: NodeCandidate[];
    lines: PromiseLine[];
    transferLanes: TransferEvidence[];
    transferCostMinor: number;
    destinationNode: DbRow | null;
};

export interface PromiseOption {
    public_id: string;
    strategy: Strategy;
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
const MAX_SPLIT_COMBINATIONS = 64;
const MAX_ALTERNATIVES_PER_LINE = 3;
const TRANSFER_MIN_SAMPLE_COUNT = 10;
const TRANSFER_MAX_CALIBRATION_AGE_HOURS = 168;

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

function sourceFingerprint(lines: PromiseLine[]): string {
    return fingerprint(
        [...lines]
            .map((line) => ({
                product_id: line.product_id,
                variation_id: line.variation_id,
                quantity: line.quantity,
                inventory_item_id: line.inventory_item_id,
                node_id: line.node_id,
            }))
            .sort(
                (a, b) =>
                    a.product_id - b.product_id ||
                    (a.variation_id ?? 0) - (b.variation_id ?? 0) ||
                    a.inventory_item_id - b.inventory_item_id,
            ),
    );
}

async function effectiveVariationId(trx: TransactionClientContract, variationId: number | null): Promise<number | null> {
    if (variationId === null) return null;
    const variation = await trx.from("product_variations").where("id", variationId).select("manage_stock_mode").first();
    return variation?.manage_stock_mode === "parent" ? null : variationId;
}

async function inventoryAlternativesForLine(
    trx: TransactionClientContract,
    productId: number,
    variationId: number | null,
    quantity: number,
    now: DateTime,
): Promise<PromiseLine[]> {
    const effective = await effectiveVariationId(trx, variationId);
    const query = trx
        .from("inventory_items as inventory")
        .innerJoin("fulfillment_node_inventory_sources as source", "source.inventory_item_id", "inventory.id")
        .innerJoin("fulfillment_network_nodes as node", "node.id", "source.node_id")
        .where("inventory.product_id", productId)
        .where("source.status", "active")
        .where("node.status", "active");
    if (effective === null) query.whereNull("inventory.variation_id");
    else query.where("inventory.variation_id", effective);

    const rows = await query
        .select(
            "inventory.id as inventory_item_id",
            "inventory.stock_quantity",
            "inventory.manage_stock",
            "inventory.updated_at as inventory_updated_at",
            "source.node_id",
            "node.public_id as node_public_id",
            "node.node_code",
            "node.name as node_name",
            "node.inventory_stale_after_minutes",
        )
        .orderBy("inventory.updated_at", "desc");

    const byNode = new Map<number, PromiseLine>();
    for (const row of rows) {
        const nodeId = numberValue(row.node_id);
        if (!nodeId || byNode.has(nodeId)) continue;
        const observed = asDateTime(row.inventory_updated_at);
        const staleMinutes = Math.max(1, numberValue(row.inventory_stale_after_minutes));
        if (!observed || !isInventoryFreshAt(observed.toISO(), staleMinutes, now.toISO()!)) continue;
        const stock = numberValue(row.stock_quantity);
        const manageStock = Boolean(row.manage_stock);
        if (manageStock && stock < quantity) continue;
        const freshUntil = observed.plus({ minutes: staleMinutes });
        byNode.set(nodeId, {
            product_id: productId,
            variation_id: variationId,
            quantity,
            inventory_item_id: numberValue(row.inventory_item_id),
            node_id: nodeId,
            node_public_id: stringValue(row.node_public_id),
            node_code: stringValue(row.node_code),
            node_name: stringValue(row.node_name),
            stock_quantity: stock,
            manage_stock: manageStock,
            inventory_updated_at: observed.toUTC().toISO()!,
            inventory_fresh_until: freshUntil.toUTC().toISO()!,
        });
    }
    return [...byNode.values()];
}

async function loadLineCandidateSets(cart: Cart, now = DateTime.utc()): Promise<LineCandidateSet[]> {
    const trx = currentTrx();
    await cart.load("items");
    if (cart.items.length === 0) {
        throw new Exception("Cannot promise an empty cart", { status: 422, code: "E_PROMISE_CART_EMPTY" });
    }
    const sets: LineCandidateSet[] = [];
    for (const item of cart.items) {
        const productId = Number(item.productId);
        const variationId = item.variationId === null ? null : Number(item.variationId);
        const quantity = Number(item.quantity);
        const alternatives = await inventoryAlternativesForLine(trx, productId, variationId, quantity, now);
        sets.push({ product_id: productId, variation_id: variationId, quantity, alternatives });
    }
    return sets;
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

function calibratedTransferLane(lane: DbRow, now: DateTime): boolean {
    return isCalibratedServiceProfile(
        {
            calibrationSampleCount: numberValue(lane.calibration_sample_count),
            minimumSampleCount: TRANSFER_MIN_SAMPLE_COUNT,
            confidenceBps: numberValue(lane.confidence_bps),
            lastCalibratedAt: asDateTime(lane.last_calibrated_at)?.toISO() ?? null,
            maxCalibrationAgeHours: TRANSFER_MAX_CALIBRATION_AGE_HOURS,
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
        if (!startAt.isValid || !endAt.isValid || endAt <= localNow) continue;
        if (date === localNow.toISODate() && cutoff) {
            const cutoffAt = DateTime.fromSQL(`${date} ${cutoff}`, { zone: timezone });
            if (cutoffAt.isValid && localNow > cutoffAt) continue;
        }
        return row;
    }
    return null;
}

async function destinationCandidate(
    nodeId: number,
    rate: ShippingRateOption,
    lines: PromiseLine[],
    now: DateTime,
    extraTransitMinutes = 0,
    confidenceCeiling = 10000,
): Promise<NodeCandidate | null> {
    const trx = currentTrx();
    const node = await trx.from("fulfillment_network_nodes").where("id", nodeId).where("status", "active").first();
    if (!node) return null;
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
    const dispatchAt = capacityEnd.plus({ minutes: handlingMinutes + Math.max(0, extraTransitMinutes) });
    const p50 = Math.max(0, numberValue(profile.transit_minutes_p50));
    const p90 = Math.max(p50, numberValue(profile.transit_minutes_p90));
    return {
        node,
        profile,
        capacity,
        lines,
        startAt: dispatchAt.plus({ minutes: p50 }).toUTC(),
        endAt: dispatchAt.plus({ minutes: p90 }).toUTC(),
        confidenceBps: Math.min(numberValue(profile.confidence_bps), confidenceCeiling),
    };
}

async function nodeCandidate(
    nodeId: number,
    rate: ShippingRateOption,
    lines: PromiseLine[],
    now: DateTime,
): Promise<NodeCandidate | null> {
    if (lines.some((line) => line.node_id !== nodeId)) return null;
    for (const line of lines) {
        const freshUntil = DateTime.fromISO(line.inventory_fresh_until, { zone: "utc" });
        if (!freshUntil.isValid || freshUntil < now) return null;
        if (line.manage_stock && line.stock_quantity < line.quantity) return null;
    }
    return destinationCandidate(nodeId, rate, lines, now);
}

function singleLocationNodeIds(sets: LineCandidateSet[]): number[] {
    if (!sets.length) return [];
    let shared = new Set(sets[0].alternatives.map((item) => item.node_id));
    for (const set of sets.slice(1)) {
        const nodes = new Set(set.alternatives.map((item) => item.node_id));
        shared = new Set([...shared].filter((id) => nodes.has(id)));
    }
    return [...shared].sort((a, b) => a - b);
}

function linesForNode(sets: LineCandidateSet[], nodeId: number): PromiseLine[] | null {
    const lines: PromiseLine[] = [];
    for (const set of sets) {
        const line = set.alternatives.find((candidate) => candidate.node_id === nodeId);
        if (!line) return null;
        lines.push(line);
    }
    return lines;
}

function candidateRank(candidate: NodeCandidate): { confidenceBps: number; windowEndMs: number; costMinor: number } {
    return { confidenceBps: candidate.confidenceBps, windowEndMs: candidate.endAt.toMillis(), costMinor: 0 };
}

async function buildSplitPlan(rate: ShippingRateOption, sets: LineCandidateSet[], now: DateTime): Promise<PromisePlan | null> {
    if (sets.length < 2 || sets.some((set) => set.alternatives.length === 0)) return null;
    const ranked: Array<Array<{ line: PromiseLine; candidate: NodeCandidate }>> = [];
    for (const set of sets) {
        const options: Array<{ line: PromiseLine; candidate: NodeCandidate }> = [];
        for (const line of set.alternatives) {
            const candidate = await nodeCandidate(line.node_id, rate, [line], now);
            if (candidate) options.push({ line, candidate });
        }
        options.sort((a, b) => comparePromiseOptions(candidateRank(a.candidate), candidateRank(b.candidate)));
        if (!options.length) return null;
        ranked.push(options.slice(0, MAX_ALTERNATIVES_PER_LINE));
    }

    let explored = 0;
    let best: PromisePlan | null = null;
    const chosen: PromiseLine[] = [];

    const evaluate = async () => {
        const byNode = new Map<number, PromiseLine[]>();
        for (const line of chosen) byNode.set(line.node_id, [...(byNode.get(line.node_id) ?? []), line]);
        if (byNode.size < 2) return;
        const candidates: NodeCandidate[] = [];
        for (const [nodeId, lines] of byNode) {
            const candidate = await nodeCandidate(nodeId, rate, lines, now);
            if (!candidate) return;
            candidates.push(candidate);
        }
        const plan: PromisePlan = {
            strategy: "split_shipment",
            candidates,
            lines: [...chosen],
            transferLanes: [],
            transferCostMinor: 0,
            destinationNode: null,
        };
        if (!best) {
            best = plan;
            return;
        }
        const score = {
            confidenceBps: Math.min(...plan.candidates.map((item) => item.confidenceBps)),
            windowEndMs: Math.max(...plan.candidates.map((item) => item.endAt.toMillis())),
            costMinor: rate.cost,
        };
        const bestScore = {
            confidenceBps: Math.min(...best.candidates.map((item) => item.confidenceBps)),
            windowEndMs: Math.max(...best.candidates.map((item) => item.endAt.toMillis())),
            costMinor: rate.cost,
        };
        if (comparePromiseOptions(score, bestScore) < 0) best = plan;
    };

    const visit = async (index: number): Promise<void> => {
        if (explored >= MAX_SPLIT_COMBINATIONS) return;
        if (index === ranked.length) {
            explored += 1;
            await evaluate();
            return;
        }
        for (const option of ranked[index]) {
            chosen.push(option.line);
            await visit(index + 1);
            chosen.pop();
            if (explored >= MAX_SPLIT_COMBINATIONS) break;
        }
    };
    await visit(0);
    return best;
}

async function activeTransferLane(fromNodeId: number, toNodeId: number, now: DateTime): Promise<DbRow | null> {
    const lane = await currentTrx()
        .from("fulfillment_transfer_lanes")
        .where({ from_node_id: fromNodeId, to_node_id: toNodeId, status: "active" })
        .first();
    return lane && calibratedTransferLane(lane, now) ? lane : null;
}

async function buildTransferPlans(rate: ShippingRateOption, sets: LineCandidateSet[], now: DateTime): Promise<PromisePlan[]> {
    if (sets.some((set) => set.alternatives.length === 0)) return [];
    const nodes = await currentTrx()
        .from("fulfillment_network_nodes")
        .where("status", "active")
        .whereIn("node_type", ["warehouse", "store", "micro_fulfillment", "hub"])
        .orderBy("id", "asc");
    const plans: PromisePlan[] = [];
    for (const destination of nodes) {
        const destinationId = numberValue(destination.id);
        const selected: PromiseLine[] = [];
        const transferEvidence: TransferEvidence[] = [];
        let transferCostMinor = 0;
        let maxTransferMinutes = 0;
        let transferConfidence = 10000;
        let feasible = true;

        for (const set of sets) {
            const local = set.alternatives.find((line) => line.node_id === destinationId);
            if (local) {
                selected.push(local);
                continue;
            }
            const laneCandidates: Array<{ line: PromiseLine; lane: DbRow }> = [];
            for (const line of set.alternatives) {
                const lane = await activeTransferLane(line.node_id, destinationId, now);
                if (lane) laneCandidates.push({ line, lane });
            }
            laneCandidates.sort(
                (a, b) =>
                    numberValue(b.lane.confidence_bps) - numberValue(a.lane.confidence_bps) ||
                    numberValue(a.lane.transfer_minutes_p90) - numberValue(b.lane.transfer_minutes_p90) ||
                    numberValue(a.lane.cost_minor) - numberValue(b.lane.cost_minor),
            );
            const selectedLane = laneCandidates[0];
            if (!selectedLane) {
                feasible = false;
                break;
            }
            selected.push(selectedLane.line);
            transferCostMinor += numberValue(selectedLane.lane.cost_minor);
            maxTransferMinutes = Math.max(maxTransferMinutes, numberValue(selectedLane.lane.transfer_minutes_p90));
            transferConfidence = Math.min(transferConfidence, numberValue(selectedLane.lane.confidence_bps));
            transferEvidence.push({
                lane_id: numberValue(selectedLane.lane.id),
                from_node_id: selectedLane.line.node_id,
                to_node_id: destinationId,
                from_node_public_id: selectedLane.line.node_public_id,
                to_node_public_id: stringValue(destination.public_id),
                transfer_minutes_p90: numberValue(selectedLane.lane.transfer_minutes_p90),
                confidence_bps: numberValue(selectedLane.lane.confidence_bps),
                cost_minor: numberValue(selectedLane.lane.cost_minor),
            });
        }
        if (!feasible || transferEvidence.length === 0) continue;
        const destinationPlan = await destinationCandidate(
            destinationId,
            rate,
            selected,
            now,
            maxTransferMinutes,
            transferConfidence,
        );
        if (!destinationPlan) continue;
        plans.push({
            strategy: "transfer_then_fulfill",
            candidates: [destinationPlan],
            lines: selected,
            transferLanes: transferEvidence,
            transferCostMinor,
            destinationNode: destination,
        });
    }
    return plans;
}

function sourceLocations(lines: PromiseLine[]) {
    const locations = new Map<number, { public_id: string; code: string; name: string }>();
    for (const line of lines) {
        locations.set(line.node_id, { public_id: line.node_public_id, code: line.node_code, name: line.node_name });
    }
    return [...locations.values()];
}

function capacityRequirements(candidates: NodeCandidate[]) {
    return candidates.map((candidate) => ({
        capacity_window_id: numberValue(candidate.capacity.id),
        node_id: numberValue(candidate.node.id),
        units: candidate.lines.reduce((sum, line) => sum + line.quantity, 0),
    }));
}

async function persistOption(cart: Cart, rate: ShippingRateOption, plan: PromisePlan, now: DateTime): Promise<PromiseOption> {
    const trx = currentTrx();
    const startAt = plan.candidates.reduce(
        (latest, candidate) => (candidate.startAt > latest ? candidate.startAt : latest),
        plan.candidates[0].startAt,
    );
    const endAt = plan.candidates.reduce(
        (latest, candidate) => (candidate.endAt > latest ? candidate.endAt : latest),
        plan.candidates[0].endAt,
    );
    const confidence = Math.min(...plan.candidates.map((candidate) => candidate.confidenceBps));
    const firstLine = plan.lines[0];
    if (!firstLine) {
        throw new Exception("Promise plan has no source lines", { status: 409, code: "E_PROMISE_PLAN_EMPTY" });
    }
    const freshUntil = plan.lines.slice(1).reduce(
        (earliest, line) => {
            const value = DateTime.fromISO(line.inventory_fresh_until, { zone: "utc" });
            return value < earliest ? value : earliest;
        },
        DateTime.fromISO(firstLine.inventory_fresh_until, { zone: "utc" }),
    );
    const observedAt = plan.lines.slice(1).reduce(
        (earliest, line) => {
            const value = DateTime.fromISO(line.inventory_updated_at, { zone: "utc" });
            return value < earliest ? value : earliest;
        },
        DateTime.fromISO(firstLine.inventory_updated_at, { zone: "utc" }),
    );
    const ttlExpiry = now.plus({ minutes: QUOTE_TTL_MINUTES });
    const expiresAt = freshUntil < ttlExpiry ? freshUntil : ttlExpiry;
    const primary = plan.candidates[0];
    const sources = sourceLocations(plan.lines);
    const constraints = [
        "canonical_inventory_fresh",
        "canonical_shipping_rate_eligible",
        "calibrated_service_profile",
        "pick_pack_capacity_available",
        ...(plan.strategy === "split_shipment" ? ["multi_node_split_required"] : []),
        ...(plan.strategy === "transfer_then_fulfill" ? ["calibrated_transfer_lane", "transfer_before_fulfillment"] : []),
        ...(plan.strategy === "pickup" ? ["canonical_pickup_method"] : []),
    ];
    const shippingCost = plan.strategy === "split_shipment" ? rate.cost * plan.candidates.length : rate.cost;
    const totalCost = shippingCost + plan.transferCostMinor;
    const anchorNode = plan.strategy === "split_shipment" ? null : numberValue(plan.destinationNode?.id ?? primary.node.id);
    const anchorCapacity = plan.strategy === "split_shipment" ? null : numberValue(primary.capacity.id);
    const anchorProfile = plan.strategy === "split_shipment" ? null : numberValue(primary.profile.id);
    const [row] = await trx
        .table("fulfillment_promise_quotes")
        .insert({
            cart_id: Number(cart.id),
            node_id: anchorNode,
            shipping_zone_method_id: rate.id,
            capacity_window_id: anchorCapacity,
            service_profile_id: anchorProfile,
            strategy: plan.strategy,
            status: "quoted",
            window_start_at: startAt.toJSDate(),
            window_end_at: endAt.toJSDate(),
            confidence_bps: confidence,
            shipping_cost_minor: shippingCost,
            transfer_cost_minor: plan.transferCostMinor,
            currency: cart.currency ?? "IRR",
            inventory_observed_at: observedAt.toJSDate(),
            inventory_fresh_until: freshUntil.toJSDate(),
            destination_fingerprint: destinationFingerprint(cart),
            line_snapshot: plan.lines,
            constraints,
            decision_trace: {
                rate_id: rate.id,
                method_code: rate.methodCode,
                source_locations: sources,
                destination_node: plan.destinationNode
                    ? {
                          public_id: stringValue(plan.destinationNode.public_id),
                          code: stringValue(plan.destinationNode.node_code),
                          name: stringValue(plan.destinationNode.name),
                      }
                    : null,
                capacity_requirements: capacityRequirements(plan.candidates),
                service_profile_ids: plan.candidates.map((candidate) => numberValue(candidate.profile.id)),
                transfer_lanes: plan.transferLanes,
                line_fingerprint: lineFingerprint(plan.lines),
                source_fingerprint: sourceFingerprint(plan.lines),
            },
            expires_at: expiresAt.toJSDate(),
        })
        .returning("*");
    return {
        public_id: stringValue(row.public_id),
        strategy: plan.strategy,
        window_start_at: startAt.toISO()!,
        window_end_at: endAt.toISO()!,
        confidence_bps: confidence,
        cost_minor: totalCost,
        currency: cart.currency ?? "IRR",
        source_locations: sources,
        constraints,
        expires_at: expiresAt.toISO()!,
    };
}

async function planOptionsForRate(
    cart: Cart,
    rate: ShippingRateOption,
    sets: LineCandidateSet[],
    now: DateTime,
): Promise<PromiseOption[]> {
    const options: PromiseOption[] = [];
    for (const nodeId of singleLocationNodeIds(sets)) {
        const lines = linesForNode(sets, nodeId);
        if (!lines) continue;
        const candidate = await nodeCandidate(nodeId, rate, lines, now);
        if (!candidate) continue;
        const strategy: Strategy = /(?:^|[_-])(?:local_)?pickup(?:$|[_-])/i.test(rate.methodCode) ? "pickup" : "single_location";
        options.push(
            await persistOption(
                cart,
                rate,
                {
                    strategy,
                    candidates: [candidate],
                    lines,
                    transferLanes: [],
                    transferCostMinor: 0,
                    destinationNode: candidate.node,
                },
                now,
            ),
        );
    }

    const split = await buildSplitPlan(rate, sets, now);
    if (split) options.push(await persistOption(cart, rate, split, now));
    for (const transfer of await buildTransferPlans(rate, sets, now)) {
        options.push(await persistOption(cart, rate, transfer, now));
    }
    return options;
}

export async function quoteCart(cart: Cart): Promise<{ options: PromiseOption[]; unavailable_reasons: string[] }> {
    if (!cart.country) return { options: [], unavailable_reasons: ["shipping_destination_required"] };
    const now = DateTime.utc();
    const sets = await loadLineCandidateSets(cart, now);
    if (sets.some((set) => set.alternatives.length === 0)) {
        return { options: [], unavailable_reasons: ["canonical_inventory_fresh_capacity_unavailable"] };
    }
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.priceSnapshot) * Number(item.quantity), 0);
    const rates = await enumerateShippingRates(
        { country: cart.country, regionId: cart.regionId === null ? null : Number(cart.regionId), postcode: cart.postcode },
        subtotal,
    );
    if (rates.length === 0) return { options: [], unavailable_reasons: ["canonical_shipping_rate_unavailable"] };

    const options: PromiseOption[] = [];
    for (const rate of rates) options.push(...(await planOptionsForRate(cart, rate, sets, now)));
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

async function currentLineForSnapshot(snapshot: PromiseLine, now: DateTime): Promise<PromiseLine | null> {
    const inventory = await currentTrx()
        .from("inventory_items as inventory")
        .innerJoin("fulfillment_node_inventory_sources as source", "source.inventory_item_id", "inventory.id")
        .innerJoin("fulfillment_network_nodes as node", "node.id", "source.node_id")
        .where("inventory.id", snapshot.inventory_item_id)
        .where("source.node_id", snapshot.node_id)
        .where("source.status", "active")
        .where("node.status", "active")
        .select(
            "inventory.id as inventory_item_id",
            "inventory.stock_quantity",
            "inventory.manage_stock",
            "inventory.updated_at as inventory_updated_at",
            "source.node_id",
            "node.public_id as node_public_id",
            "node.node_code",
            "node.name as node_name",
            "node.inventory_stale_after_minutes",
        )
        .first();
    if (!inventory) return null;
    const observed = asDateTime(inventory.inventory_updated_at);
    const staleMinutes = Math.max(1, numberValue(inventory.inventory_stale_after_minutes));
    if (!observed || !isInventoryFreshAt(observed.toISO(), staleMinutes, now.toISO()!)) return null;
    const stock = numberValue(inventory.stock_quantity);
    const manageStock = Boolean(inventory.manage_stock);
    if (manageStock && stock < snapshot.quantity) return null;
    return {
        ...snapshot,
        stock_quantity: stock,
        manage_stock: manageStock,
        inventory_updated_at: observed.toUTC().toISO()!,
        inventory_fresh_until: observed.plus({ minutes: staleMinutes }).toUTC().toISO()!,
        node_public_id: stringValue(inventory.node_public_id),
        node_code: stringValue(inventory.node_code),
        node_name: stringValue(inventory.node_name),
    };
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
    await cart.load("items");
    const currentShape = cart.items.map((item) => ({
        product_id: Number(item.productId),
        variation_id: item.variationId === null ? null : Number(item.variationId),
        quantity: Number(item.quantity),
    }));
    const snapshot = parseJson<PromiseLine[]>(quote.line_snapshot, []);
    if (lineFingerprint(currentShape) !== lineFingerprint(snapshot)) {
        throw new Exception("Cart contents changed after promise creation", { status: 409, code: "E_PROMISE_CART_CHANGED" });
    }
    for (const line of snapshot) {
        const current = await currentLineForSnapshot(line, now);
        if (!current) {
            throw new Exception("Fulfillment source became unavailable or stale", {
                status: 409,
                code: "E_PROMISE_SOURCE_CHANGED",
            });
        }
    }
    const trace = parseJson<Record<string, unknown>>(quote.decision_trace, {});
    if (stringValue(trace.source_fingerprint) && stringValue(trace.source_fingerprint) !== sourceFingerprint(snapshot)) {
        throw new Exception("Promise source evidence changed", { status: 409, code: "E_PROMISE_SOURCE_CHANGED" });
    }
    if (stringValue(quote.strategy) === "transfer_then_fulfill") {
        const lanes = parseJson<TransferEvidence[]>(trace.transfer_lanes, []);
        if (!lanes.length)
            throw new Exception("Transfer evidence is missing", { status: 409, code: "E_PROMISE_TRANSFER_EVIDENCE" });
        for (const evidence of lanes) {
            const lane = await currentTrx()
                .from("fulfillment_transfer_lanes")
                .where("id", evidence.lane_id)
                .where("status", "active")
                .first();
            if (!lane || !calibratedTransferLane(lane, now)) {
                throw new Exception("Transfer lane is no longer calibrated", { status: 409, code: "E_PROMISE_TRANSFER_STALE" });
            }
        }
    }
    const requirements = parseJson<Array<{ capacity_window_id: number; units: number }>>(trace.capacity_requirements, []);
    for (const requirement of requirements) {
        const window = await currentTrx()
            .from("fulfillment_capacity_windows")
            .where("id", requirement.capacity_window_id)
            .first();
        if (
            !window ||
            window.status !== "open" ||
            numberValue(window.capacity_units) - numberValue(window.reserved_units) < requirement.units
        ) {
            throw new Exception("Promise capacity is no longer available", {
                status: 409,
                code: "E_PROMISE_CAPACITY_UNAVAILABLE",
            });
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
            destination_node: trace.destination_node ?? null,
            transfer_lanes: trace.transfer_lanes ?? [],
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
    const [nodes, profiles, promises, accuracy, allocations, lanes] = await Promise.all([
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
        trx.from("fulfillment_transfer_lanes").where("status", "active").count("id as count").first(),
    ]);
    const total = numberValue(accuracy?.total);
    return {
        active_nodes: numberValue(nodes?.count),
        calibrated_services: numberValue(profiles?.count),
        active_transfer_lanes: numberValue(lanes?.count),
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
        trx.from("fulfillment_network_nodes").where("public_id", String(payload.from_node_public_id)).first(),
        trx.from("fulfillment_network_nodes").where("public_id", String(payload.to_node_public_id)).first(),
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
            "quote.transfer_cost_minor",
            "quote.currency",
            "quote.constraints",
            "quote.decision_trace",
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
        const result = await trx
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
            .ignore()
            .returning("id");
        if (result.length) inserted += 1;
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
