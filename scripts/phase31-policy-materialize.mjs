import fs from "node:fs";

const source = fs.readFileSync(
    new URL("../apps/api/app/services/fulfillment_promise/promise_service.ts", import.meta.url),
    "utf8",
);
const must = (condition, message) => {
    if (!condition) throw new Error(message);
};

for (const marker of [
    'from "#services/fulfillment_promise/policy"',
    "isCalibratedServiceProfile(",
    "isInventoryFreshAt(",
    "comparePromiseOptions(",
]) {
    must(source.includes(marker), `Phase31 promise policy integration missing ${marker}`);
}

console.log("PASS Phase 31 promise policy is already materialized");
