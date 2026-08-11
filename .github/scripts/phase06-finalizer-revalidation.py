from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("apps/api/app/services/order_finalizer.ts")
text = path.read_text()
text = replace_once(
    text,
    'import { OrderStatus } from "#enums/order_status";\n',
    'import type { DiscounterItem } from "#contracts/discounter";\nimport { OrderStatus } from "#enums/order_status";\n',
    "discounter item import",
)
text = replace_once(
    text,
    'import OrderLineItem from "#models/order_line_item";\n',
    'import OrderLineItem from "#models/order_line_item";\nimport Product from "#models/product";\nimport ProductVariation from "#models/product_variation";\n',
    "product imports",
)
text = replace_once(
    text,
    'import { checkRedemptionLimits, countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";\n',
    'import { checkEligibility, countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";\n',
    "full eligibility import",
)
text = replace_once(
    text,
    'import { OrderFactory } from "#services/order_factory";\n',
    'import { OrderFactory } from "#services/order_factory";\nimport { resolvePrice } from "#services/price_resolver";\n',
    "price resolver import",
)
text = replace_once(
    text,
    '''     * For each coupon line on the draft, lock the coupon row, re-validate the limits, and INSERT
     * the redemption row. UNIQUE `(coupon_id, order_id)` makes the INSERT idempotent under
     * `Idempotency-Key` replay — a retry of the same order returns the existing row instead of
     * double-counting. Limit re-validation throws E_COUPON_LIMIT_EXHAUSTED on race loss; the
     * surrounding transaction rolls back so no half-finalized order survives.
     */
    private async writeRedemptionLedger(order: Order, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderCouponLine.query({ client: trx }).where("order_id", Number(order.id));
        if (lines.length === 0) return;

        const customerId = order.customerId === null || order.customerId === undefined ? null : Number(order.customerId);
        const email = order.billingEmail ?? null;
''',
    '''     * For each coupon line on the draft, lock the coupon row, re-validate the complete live
     * eligibility state, and INSERT the redemption row. This matters because status/dates/catalog
     * constraints can change after draft creation just as usage counters can change concurrently.
     * UNIQUE `(coupon_id, order_id)` keeps idempotency replays from double-counting.
     */
    private async writeRedemptionLedger(order: Order, trx: TransactionClientContract): Promise<void> {
        const lines = await OrderCouponLine.query({ client: trx }).where("order_id", Number(order.id));
        if (lines.length === 0) return;

        const customerId = order.customerId === null || order.customerId === undefined ? null : Number(order.customerId);
        const email = order.billingEmail ?? null;
        const couponItems = await this.loadCouponEligibilityItems(order, trx);
        const itemsTotal = couponItems.reduce((sum, item) => sum + item.lineSubtotal, 0);
        const appliedCouponIds = lines
            .map((line) => (line.couponId === null || line.couponId === undefined ? null : Number(line.couponId)))
            .filter((id): id is number => id !== null);
''',
    "redemption method setup",
)
old = '''            /**
             * Only the mutable counters need the submit-time race check. Do not feed a synthetic
             * product into full eligibility: product/category constraints can fail before the limit
             * gate and accidentally let an exhausted constrained coupon through.
             */
            const result = checkRedemptionLimits({
                coupon: snapshot,
                globalRedemptionCount: globalCount,
                perUserRedemptionCount: perUserCount,
            });
            if (!result.ok) {
                throw new Exception(`Coupon ${line.codeSnapshot} limit reached`, {
                    status: 409,
                    code: "E_COUPON_LIMIT_EXHAUSTED",
                });
            }
'''
new = '''            const result = checkEligibility({
                coupon: snapshot,
                items: couponItems,
                itemsTotal,
                otherAppliedCouponIds: appliedCouponIds.filter((id) => id !== couponId),
                customer: { customerId, email },
                globalRedemptionCount: globalCount,
                perUserRedemptionCount: perUserCount,
            });
            if (!result.ok) {
                /**
                 * Keep the established checkout conflict code for backward compatibility. The
                 * message records the precise stable eligibility reason for diagnostics/UI retry.
                 */
                throw new Exception(`Coupon ${line.codeSnapshot} is no longer eligible: ${result.reason}`, {
                    status: 409,
                    code: "E_COUPON_LIMIT_EXHAUSTED",
                });
            }
'''
text = replace_once(text, old, new, "full submit eligibility")
marker = '''    /**
     * Opaque 32-char hex key. Used in the guest pay-link URL.'''
if marker not in text:
    raise SystemExit("generate key marker missing")
helper = '''    private async loadCouponEligibilityItems(order: Order, trx: TransactionClientContract): Promise<DiscounterItem[]> {
        const orderItems = await OrderLineItem.query({ client: trx }).where("order_id", Number(order.id));
        const productIds = [...new Set(orderItems.map((line) => Number(line.productId)).filter((id) => id > 0))];
        const products =
            productIds.length === 0
                ? ([] as Product[])
                : await Product.query({ client: trx })
                      .whereIn("id", productIds)
                      .preload("categories")
                      .preload("tags")
                      .preload("brands");
        const productById = new Map(products.map((product) => [Number(product.id), product]));

        const variationIds = [
            ...new Set(
                orderItems
                    .map((line) => (line.variationId === null ? null : Number(line.variationId)))
                    .filter((id): id is number => id !== null),
            ),
        ];
        const variations =
            variationIds.length === 0
                ? ([] as ProductVariation[])
                : await ProductVariation.query({ client: trx }).whereIn("id", variationIds);
        const variationById = new Map(variations.map((variation) => [Number(variation.id), variation]));

        return orderItems.map((line) => {
            const productId = Number(line.productId);
            const variationId = line.variationId === null ? null : Number(line.variationId);
            const product = productById.get(productId);
            const variation = variationId === null ? null : (variationById.get(variationId) ?? null);
            const priceSnapshot = Number(line.priceSnapshot);
            return {
                lineKey: String(line.id),
                productId,
                variationId,
                quantity: line.quantity,
                priceSnapshot,
                lineSubtotal: priceSnapshot * line.quantity,
                categoryIds: (product?.categories ?? []).map((category) => Number(category.id)),
                tagIds: (product?.tags ?? []).map((tag) => Number(tag.id)),
                brandIds: (product?.brands ?? []).map((brand) => Number(brand.id)),
                onSale: product ? resolvePrice(product, variation).onSale : false,
            };
        });
    }

'''
text = text.replace(marker, helper + marker, 1)
path.write_text(text)

# Regression: once a draft is created, disabling the coupon before submit must make the submit
# conflict and must not write a redemption. This proves finalization uses real order items instead
# of the old synthetic dummy item or a limit-only shortcut.
path = Path("apps/api/tests/functional/coupons/checkout_redemption.spec.ts")
text = path.read_text()
anchor = '''    test("usage_limit_global=1 cannot be exceeded across two distinct submits", async ({ client, assert }) => {'''
if anchor not in text:
    raise SystemExit("checkout redemption test anchor missing")
case = '''    test("submit revalidates coupon status after draft creation", async ({ client, assert }) => {
        const coupon = await CouponFactory.merge({ code: "DRAFT10", amountPercent: "10.00" }).create();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const regionId = await iranRegionId();
        const gateway = await PaymentGateway.findByOrFail("code", "cod");
        const seeded = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(seeded);

        const applied = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "DRAFT10" });
        applied.assertStatus(200);
        await client
            .post("/api/v1/cart/customer")
            .cookie("cart_token", token)
            .json({ country: "IR", region_id: regionId, postcode: "1234567890" });
        const draft = await client
            .put("/api/v1/checkout")
            .cookie("cart_token", token)
            .json({
                billing_address: {
                    first_name: "S",
                    last_name: "T",
                    address_line_1: "Vali-Asr 1",
                    city: "Tehran",
                    country: "IR",
                    region_id: regionId,
                    postcode: "1234567890",
                    phone: "+989121234567",
                    email: "buyer@example.test",
                },
                payment_gateway_id: Number(gateway.id),
            });
        draft.assertStatus(200);

        coupon.status = "disabled";
        await coupon.save();

        const finalize = await client
            .post("/api/v1/checkout/submit")
            .cookie("cart_token", token)
            .header("Idempotency-Key", "redeem-DRAFT10");
        finalize.assertStatus(409);

        const redemptions = await CouponRedemption.query().where("coupon_id", Number(coupon.id));
        assert.equal(redemptions.length, 0, "invalidated draft coupon must never enter the redemption ledger");
    });

'''
path.write_text(text.replace(anchor, case + anchor, 1))
