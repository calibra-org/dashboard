import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { currentTrx } from "#services/tenant_context";

type JsonRow = Record<string, unknown>;
type SnapshotLine = { node_id?: number; quantity?: number };
type SourceLocation = { public_id?: string };
type CapacityRequirement = { capacity_window_id?: number; windowId?: number; units?: number };

function asRecord(value: unknown): JsonRow {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRow;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function positiveInt(value: unknown): number {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
}

function mergeRequirements(requirements: Array<{ windowId: number; units: number }>) {
    const merged = new Map<number, number>();
    for (const requirement of requirements) {
        merged.set(requirement.windowId, (merged.get(requirement.windowId) ?? 0) + requirement.units);
    }
    return [...merged.entries()].map(([windowId, units]) => ({ windowId, units })).sort((a, b) => a.windowId - b.windowId);
}

async function requirementsForQuote(quote: JsonRow): Promise<Array<{ windowId: number; units: number }>> {
    const trace = asRecord(quote.decision_trace);
    const explicit = asArray<CapacityRequirement>(trace.capacity_requirements)
        .map((requirement) => ({
            windowId: positiveInt(requirement.capacity_window_id ?? requirement.windowId),
            units: positiveInt(requirement.units),
        }))
        .filter((requirement) => requirement.windowId > 0 && requirement.units > 0);
    if (explicit.length) return mergeRequirements(explicit);

    const lines = asArray<SnapshotLine>(quote.line_snapshot);
    if (
        String(quote.strategy) === "single_location" ||
        String(quote.strategy) === "pickup" ||
        String(quote.strategy) === "transfer_then_fulfill"
    ) {
        const windowId = positiveInt(quote.capacity_window_id);
        const units = lines.reduce((sum, line) => sum + positiveInt(line.quantity), 0);
        if (!windowId || !units) {
            throw new Exception("Promise quote capacity evidence is incomplete", {
                status: 409,
                code: "E_PROMISE_CAPACITY_EVIDENCE",
            });
        }
        return [{ windowId, units }];
    }

    const locations = asArray<SourceLocation>(trace.source_locations);
    const windows = asArray<number>(trace.capacity_window_ids).map(positiveInt);
    if (!locations.length || locations.length !== windows.length || windows.some((id) => id === 0)) {
        throw new Exception("Split promise capacity evidence is incomplete", {
            status: 409,
            code: "E_PROMISE_CAPACITY_EVIDENCE",
        });
    }
    const trx = currentTrx();
    const requirements: Array<{ windowId: number; units: number }> = [];
    for (let index = 0; index < locations.length; index += 1) {
        const publicId = locations[index]?.public_id;
        if (!publicId) {
            throw new Exception("Split promise source evidence is incomplete", {
                status: 409,
                code: "E_PROMISE_CAPACITY_EVIDENCE",
            });
        }
        const node = await trx.from("fulfillment_network_nodes").where("public_id", publicId).select("id").first();
        if (!node) {
            throw new Exception("Split promise source node is unavailable", {
                status: 409,
                code: "E_PROMISE_SOURCE_UNAVAILABLE",
            });
        }
        const units = lines
            .filter((line) => positiveInt(line.node_id) === Number(node.id))
            .reduce((sum, line) => sum + positiveInt(line.quantity), 0);
        if (!units) {
            throw new Exception("Split promise has no units for a capacity source", {
                status: 409,
                code: "E_PROMISE_CAPACITY_EVIDENCE",
            });
        }
        requirements.push({ windowId: windows[index]!, units });
    }
    return mergeRequirements(requirements);
}

export async function releaseExpiredCapacityHolds(now = DateTime.utc()): Promise<number> {
    const trx = currentTrx();
    const holds = await trx
        .from("fulfillment_capacity_holds")
        .where("status", "held")
        .where("expires_at", "<=", now.toJSDate())
        .orderBy("capacity_window_id", "asc")
        .orderBy("id", "asc")
        .forUpdate();
    let released = 0;
    for (const hold of holds) {
        const window = await trx.from("fulfillment_capacity_windows").where("id", hold.capacity_window_id).forUpdate().first();
        if (window) {
            await trx
                .from("fulfillment_capacity_windows")
                .where("id", window.id)
                .update({
                    reserved_units: Math.max(0, Number(window.reserved_units) - Number(hold.units)),
                    version: Number(window.version) + 1,
                    updated_at: new Date(),
                });
        }
        await trx
            .from("fulfillment_capacity_holds")
            .where("id", hold.id)
            .update({ status: "expired", released_at: new Date(), updated_at: new Date() });
        released += 1;
    }
    return released;
}

export async function holdPromiseCapacity(publicId: string | null): Promise<{ held: number } | null> {
    if (!publicId) return null;
    await releaseExpiredCapacityHolds();
    const trx = currentTrx();
    const quote = await trx.from("fulfillment_promise_quotes").where("public_id", publicId).forUpdate().first();
    if (!quote) {
        throw new Exception("Selected promise quote not found", { status: 409, code: "E_PROMISE_QUOTE_NOT_FOUND" });
    }
    const expiresAt = DateTime.fromJSDate(new Date(quote.expires_at));
    if (!expiresAt.isValid || expiresAt <= DateTime.utc()) {
        throw new Exception("Selected promise quote expired", { status: 409, code: "E_PROMISE_QUOTE_EXPIRED" });
    }

    const existing = await trx
        .from("fulfillment_capacity_holds")
        .where("promise_quote_id", quote.id)
        .orderBy("capacity_window_id", "asc")
        .forUpdate();
    if (existing.length && existing.every((row) => row.status === "committed")) return { held: existing.length };
    if (existing.length && existing.every((row) => row.status === "held")) return { held: existing.length };
    if (existing.length) {
        throw new Exception("Selected promise capacity hold cannot be reused", {
            status: 409,
            code: "E_PROMISE_CAPACITY_HOLD_EXPIRED",
        });
    }

    const requirements = await requirementsForQuote(quote);
    const locked: Array<{ window: JsonRow; units: number }> = [];
    for (const requirement of requirements) {
        const window = await trx.from("fulfillment_capacity_windows").where("id", requirement.windowId).forUpdate().first();
        if (!window || window.status !== "open") {
            throw new Exception("Promise capacity window is unavailable", {
                status: 409,
                code: "E_PROMISE_CAPACITY_UNAVAILABLE",
            });
        }
        const available = Number(window.capacity_units) - Number(window.reserved_units);
        if (available < requirement.units) {
            throw new Exception("Promise capacity was consumed by another checkout", {
                status: 409,
                code: "E_PROMISE_CAPACITY_EXHAUSTED",
            });
        }
        locked.push({ window, units: requirement.units });
    }

    for (const item of locked) {
        await trx
            .from("fulfillment_capacity_windows")
            .where("id", Number(item.window.id))
            .update({
                reserved_units: Number(item.window.reserved_units) + item.units,
                version: Number(item.window.version) + 1,
                updated_at: new Date(),
            });
        await trx.table("fulfillment_capacity_holds").insert({
            promise_quote_id: quote.id,
            capacity_window_id: Number(item.window.id),
            units: item.units,
            status: "held",
            idempotency_key: `${publicId}:${item.window.id}`,
            expires_at: new Date(quote.expires_at),
        });
    }
    return { held: locked.length };
}

export async function releasePromiseCapacity(publicId: string | null): Promise<{ released: number } | null> {
    if (!publicId) return null;
    const trx = currentTrx();
    const quote = await trx.from("fulfillment_promise_quotes").where("public_id", publicId).first();
    if (!quote) return { released: 0 };
    const holds = await trx
        .from("fulfillment_capacity_holds")
        .where("promise_quote_id", quote.id)
        .where("status", "held")
        .orderBy("capacity_window_id", "asc")
        .forUpdate();
    let released = 0;
    for (const hold of holds) {
        const window = await trx.from("fulfillment_capacity_windows").where("id", hold.capacity_window_id).forUpdate().first();
        if (window) {
            await trx
                .from("fulfillment_capacity_windows")
                .where("id", window.id)
                .update({
                    reserved_units: Math.max(0, Number(window.reserved_units) - Number(hold.units)),
                    version: Number(window.version) + 1,
                    updated_at: new Date(),
                });
        }
        await trx
            .from("fulfillment_capacity_holds")
            .where("id", hold.id)
            .update({ status: "released", released_at: new Date(), updated_at: new Date() });
        released += 1;
    }
    return { released };
}

export async function commitPromiseCapacity(publicId: string | null, orderId: number): Promise<{ committed: number } | null> {
    if (!publicId) return null;
    const trx = currentTrx();
    const quote = await trx.from("fulfillment_promise_quotes").where("public_id", publicId).first();
    if (!quote) {
        throw new Exception("Promise quote not found while committing capacity", {
            status: 409,
            code: "E_PROMISE_QUOTE_NOT_FOUND",
        });
    }
    const holds = await trx
        .from("fulfillment_capacity_holds")
        .where("promise_quote_id", quote.id)
        .whereIn("status", ["held", "committed"])
        .orderBy("capacity_window_id", "asc")
        .forUpdate();
    if (!holds.length) {
        throw new Exception("Promise capacity hold is missing", {
            status: 409,
            code: "E_PROMISE_CAPACITY_HOLD_MISSING",
        });
    }
    let committed = 0;
    for (const hold of holds) {
        if (hold.status === "committed" && Number(hold.order_id) === orderId) {
            committed += 1;
            continue;
        }
        if (hold.status !== "held") {
            throw new Exception("Promise capacity hold has an invalid state", {
                status: 409,
                code: "E_PROMISE_CAPACITY_HOLD_STATE",
            });
        }
        await trx
            .from("fulfillment_capacity_holds")
            .where("id", hold.id)
            .update({ status: "committed", order_id: orderId, committed_at: new Date(), updated_at: new Date() });
        committed += 1;
    }
    return { committed };
}
