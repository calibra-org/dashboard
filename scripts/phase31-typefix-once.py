from pathlib import Path

capacity = Path("apps/api/app/services/fulfillment_promise/capacity_service.ts")
s = capacity.read_text()
s = s.replace('.where("id", item.window.id)', '.where("id", Number(item.window.id))')
s = s.replace('capacity_window_id: item.window.id,', 'capacity_window_id: Number(item.window.id),')
capacity.write_text(s)

promise = Path("apps/api/app/services/fulfillment_promise/promise_service.ts")
s = promise.read_text()
old = '''    const confidence = Math.min(...plan.candidates.map((candidate) => candidate.confidenceBps));
    const freshUntil = DateTime.min(...plan.lines.map((line) => DateTime.fromISO(line.inventory_fresh_until, { zone: "utc" })));
    const observedAt = DateTime.min(...plan.lines.map((line) => DateTime.fromISO(line.inventory_updated_at, { zone: "utc" })));
    const expiresAt = DateTime.min(now.plus({ minutes: QUOTE_TTL_MINUTES }), freshUntil);'''
new = '''    const confidence = Math.min(...plan.candidates.map((candidate) => candidate.confidenceBps));
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
    const expiresAt = freshUntil < ttlExpiry ? freshUntil : ttlExpiry;'''
if old not in s:
    raise SystemExit("promise DateTime patch target not found")
s = s.replace(old, new)
s = s.replace('.where("public_id", payload.from_node_public_id)', '.where("public_id", String(payload.from_node_public_id))')
s = s.replace('.where("public_id", payload.to_node_public_id)', '.where("public_id", String(payload.to_node_public_id))')
promise.write_text(s)
