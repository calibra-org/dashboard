from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("apps/api/app/services/discounter_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '    const couponsQuery = Coupon.query({ client }).whereIn("id", ids);',
    '    const couponsQuery = Coupon.query({ client }).whereIn("id", ids).whereNull("deleted_at");',
    "exclude soft-deleted coupons from cart recomputation",
)
path.write_text(text)

path = Path("apps/api/app/services/order_finalizer.ts")
text = path.read_text()
text = replace_once(
    text,
    '        const lines = await OrderCouponLine.query({ client: trx }).where("order_id", Number(order.id));',
    '''        /** Deterministic coupon lock order avoids A→B / B→A deadlocks across concurrent orders. */
        const lines = await OrderCouponLine.query({ client: trx })
            .where("order_id", Number(order.id))
            .orderBy("coupon_id", "asc")
            .orderBy("id", "asc");''',
    "deterministic coupon lock order",
)
path.write_text(text)

path = Path("apps/api/tests/functional/coupons/cart_apply.spec.ts")
text = path.read_text()
anchor = '''    test("normal coupon cannot stack after an individual_use coupon", async ({ client, assert }) => {'''
if anchor not in text:
    raise SystemExit("cart apply soft-delete test anchor missing")
case = '''    test("soft-deleted applied coupon stops discounting on the next cart recompute", async ({ client, assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const coupon = await CouponFactory.merge({ code: "GONE10", amountPercent: "10.00" }).create();
        const added = await client.post("/api/v1/cart/items").json({ product_id: Number(product.id), quantity: 1 });
        const token = tokenFromResponse(added);

        const applied = await client.post("/api/v1/cart/coupons").cookie("cart_token", token).json({ code: "GONE10" });
        applied.assertStatus(200);
        assert.equal(applied.body().data.totals.discount_total, 100_000);

        coupon.deletedAt = DateTime.utc();
        await coupon.save();

        const refreshed = await client.get("/api/v1/cart").cookie("cart_token", token);
        refreshed.assertStatus(200);
        assert.equal(refreshed.body().data.totals.discount_total, 0);
    });

'''
path.write_text(text.replace(anchor, case + anchor, 1))
