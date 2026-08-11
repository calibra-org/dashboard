from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Fixed-cart coupons must honor exclude_sale_items line-by-line, not merely reject an all-sale cart.
path = Path("apps/api/app/services/discounter_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    const eligible = items.filter((item) => isItemEligible(item, coupon));
    if (eligible.length === 0) return;
    if (coupon.excludeSaleItems && eligible.every((item) => item.onSale)) return;
''',
    '''    const eligible = items.filter(
        (item) => isItemEligible(item, coupon) && (!coupon.excludeSaleItems || !item.onSale),
    );
    if (eligible.length === 0) return;
''',
    "sale-item filtering before discount allocation",
)
path.write_text(text)

# individual_use is bidirectional: a normal coupon cannot be stacked on top of an already-applied
# individual coupon. The previous check only rejected the inverse order.
path = Path("apps/api/app/controllers/cart/coupons_controller.ts")
text = path.read_text()
text = replace_once(
    text,
    '''import { checkEligibility, countRedemptions, loadSnapshotByCode } from "#services/discounter_service";''',
    '''import { checkEligibility, countRedemptions, loadSnapshotByCode, loadSnapshots } from "#services/discounter_service";''',
    "load existing coupon snapshots import",
)
text = replace_once(
    text,
    '''        const otherIds = ctx.cart.appliedCoupons.map((row) => Number(row.couponId));

        const globalRedemptions = snapshot.usageLimitGlobal === null ? 0 : await countRedemptions(snapshot.id);''',
    '''        const otherIds = ctx.cart.appliedCoupons.map((row) => Number(row.couponId));
        if (otherIds.length > 0 && !snapshot.individualUse) {
            const existingSnapshots = await loadSnapshots(
                ctx.cart.appliedCoupons.map((row) => ({ id: Number(row.couponId), code: row.codeSnapshot })),
            );
            if (existingSnapshots.some((existing) => existing.individualUse)) {
                return this.errorResponse(ctx, 422, "individual_use_conflict", { code: snapshot.code });
            }
        }

        const globalRedemptions = snapshot.usageLimitGlobal === null ? 0 : await countRedemptions(snapshot.id);''',
    "reverse individual-use conflict",
)
path.write_text(text)

# Unit regression: mixed sale/non-sale fixed-cart allocation must never discount the sale line.
path = Path("apps/api/tests/unit/coupons/discounter.spec.ts")
text = path.read_text()
anchor = '''    test("coupon worth more than the cart caps at remaining subtotal", ({ assert }) => {'''
if anchor not in text:
    raise SystemExit("fixed-cart test anchor missing")
case = '''    test("exclude_sale_items keeps fixed_cart allocation off sale lines", ({ assert }) => {
        const items = [
            item({ lineKey: "sale", quantity: 1, priceSnapshot: 100_000, onSale: true }),
            item({ lineKey: "regular", quantity: 1, priceSnapshot: 100_000, onSale: false }),
        ];
        const { input: i, snapshots } = input(items, [
            coupon({
                code: "NOSALE",
                discountType: "fixed_cart",
                amountMinor: 50_000,
                amountPercent: null,
                excludeSaleItems: true,
            }),
        ]);
        const result = computeDiscounts(i, snapshots);
        assert.equal(result.perLineDiscounts.get("sale") ?? 0, 0);
        assert.equal(result.perLineDiscounts.get("regular") ?? 0, 50_000);
    });

'''
text = text.replace(anchor, case + anchor, 1)
path.write_text(text)

# Functional regression: stacking order must not bypass individual_use.
path = Path("apps/api/tests/functional/coupons/cart_apply.spec.ts")
text = path.read_text()
anchor = '''    test("case-insensitive lookup resolves welcome10 to WELCOME10", async ({ client, assert }) => {'''
if anchor not in text:
    raise SystemExit("cart apply stacking test anchor missing")
case = '''    test("normal coupon cannot stack after an individual_use coupon", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        await CouponFactory.merge({ code: "SOLO", individualUse: true, amountPercent: "20.00" }).create();
        await CouponFactory.merge({ code: "STACK", amountPercent: "10.00" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);

        const first = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "SOLO" });
        first.assertStatus(200);

        const second = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "STACK" });
        second.assertStatus(422);
        assert.equal(second.body().error, "individual_use_conflict");
    });

'''
text = text.replace(anchor, case + anchor, 1)
path.write_text(text)
