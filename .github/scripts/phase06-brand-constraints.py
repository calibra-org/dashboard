from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# The admin editor already exposes brand include/exclude rules. Carry brand ids through every
# runtime path so those controls affect eligibility instead of being display-only metadata.
path = Path("apps/api/app/contracts/discounter.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    /** Product tag ids the line carries — used to match coupon tag include/exclude lists. */
    tagIds: number[];
    /** True when `priceSnapshot` reflects an active sale price — drives `exclude_sale_items`. */''',
    '''    /** Product tag ids the line carries — available to discount extensions. */
    tagIds: number[];
    /** Product brand ids — used by the coupon brand include/exclude rules exposed in admin. */
    brandIds?: number[];
    /** True when `priceSnapshot` reflects an active sale price — drives `exclude_sale_items`. */''',
    "discounter item brand ids",
)
path.write_text(text)

path = Path("apps/api/app/services/cart_totals_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    /** Optional tag ids — passed through to the discounter only. */
    tagIds?: number[];
    /** True when the snapshot price reflects an active sale — passed through to the discounter. */''',
    '''    /** Optional tag ids — passed through to the discounter only. */
    tagIds?: number[];
    /** Optional brand ids — passed through to coupon eligibility. */
    brandIds?: number[];
    /** True when the snapshot price reflects an active sale — passed through to the discounter. */''',
    "cart totals brand ids",
)
text = replace_once(
    text,
    '''        categoryIds: item.categoryIds ?? [],
        tagIds: item.tagIds ?? [],
        onSale: item.onSale ?? false,''',
    '''        categoryIds: item.categoryIds ?? [],
        tagIds: item.tagIds ?? [],
        brandIds: item.brandIds ?? [],
        onSale: item.onSale ?? false,''',
    "cart totals pass brand ids",
)
path.write_text(text)

path = Path("apps/api/app/services/cart_view_builder.ts")
text = path.read_text()
text = replace_once(
    text,
    '''                    .preload("categories")
                    .preload("tags")
                    .preload("images", (img) => {''',
    '''                    .preload("categories")
                    .preload("tags")
                    .preload("brands")
                    .preload("images", (img) => {''',
    "cart view preload brands",
)
text = replace_once(
    text,
    '''        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const tagIds = (product?.tags ?? []).map((t) => Number(t.id));
        return {''',
    '''        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const tagIds = (product?.tags ?? []).map((t) => Number(t.id));
        const brandIds = (product?.brands ?? []).map((b) => Number(b.id));
        return {''',
    "cart view collect brands",
)
text = replace_once(
    text,
    '''            categoryIds,
            tagIds,
            onSale,''',
    '''            categoryIds,
            tagIds,
            brandIds,
            onSale,''',
    "cart view pass brands",
)
path.write_text(text)

path = Path("apps/api/app/controllers/cart/coupons_controller.ts")
text = path.read_text()
text = replace_once(
    text,
    '''        .preload("product", (q) => {
            q.preload("categories").preload("tags");
        });''',
    '''        .preload("product", (q) => {
            q.preload("categories").preload("tags").preload("brands");
        });''',
    "coupon apply preload brands",
)
text = replace_once(
    text,
    '''            categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
            tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
            onSale,''',
    '''            categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
            tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
            brandIds: ((product?.brands ?? []) as Array<{ id: bigint | number }>).map((b) => Number(b.id)),
            onSale,''',
    "coupon apply pass brands",
)
path.write_text(text)

path = Path("apps/api/app/services/order_factory.ts")
text = path.read_text()
text = replace_once(
    text,
    '''                : await Product.query({ client: trx }).whereIn("id", productIds).preload("categories").preload("tags");''',
    '''                : await Product.query({ client: trx })
                      .whereIn("id", productIds)
                      .preload("categories")
                      .preload("tags")
                      .preload("brands");''',
    "order factory preload brands",
)
text = replace_once(
    text,
    '''                categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
                tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
                onSale,''',
    '''                categoryIds: ((product?.categories ?? []) as Array<{ id: bigint | number }>).map((c) => Number(c.id)),
                tagIds: ((product?.tags ?? []) as Array<{ id: bigint | number }>).map((t) => Number(t.id)),
                brandIds: ((product?.brands ?? []) as Array<{ id: bigint | number }>).map((b) => Number(b.id)),
                onSale,''',
    "order factory pass brands",
)
path.write_text(text)

path = Path("apps/api/app/services/discounter_service.ts")
text = path.read_text()
text = replace_once(
    text,
    'import Coupon, { type CouponDiscountType } from "#models/coupon";\n',
    'import Coupon, { type CouponDiscountType } from "#models/coupon";\nimport CouponBrandConstraint from "#models/coupon_brand_constraint";\n',
    "brand constraint import",
)
text = replace_once(
    text,
    '''    categoryConstraints: ReadonlyArray<{ categoryId: number; mode: "include" | "exclude" }>;
    emailRestrictions: ReadonlyArray<string>;''',
    '''    categoryConstraints: ReadonlyArray<{ categoryId: number; mode: "include" | "exclude" }>;
    brandConstraints: ReadonlyArray<{ brandId: number; mode: "include" | "exclude" }>;
    emailRestrictions: ReadonlyArray<string>;''',
    "snapshot brand constraints",
)
text = replace_once(
    text,
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client }).whereIn("coupon_id", ids);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).whereIn("coupon_id", ids);

    return coupons.map((coupon) => toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions));''',
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client }).whereIn("coupon_id", ids);
    const brandConstraints = await CouponBrandConstraint.query({ client }).whereIn("coupon_id", ids);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).whereIn("coupon_id", ids);

    return coupons.map((coupon) =>
        toSnapshot(coupon, productConstraints, categoryConstraints, brandConstraints, emailRestrictions),
    );''',
    "load brand constraints batch",
)
text = replace_once(
    text,
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions);''',
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client }).where("coupon_id", couponId);
    const brandConstraints = await CouponBrandConstraint.query({ client }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, brandConstraints, emailRestrictions);''',
    "load brand constraints by code",
)
text = replace_once(
    text,
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client: trx }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client: trx }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, emailRestrictions);''',
    '''    const categoryConstraints = await CouponCategoryConstraint.query({ client: trx }).where("coupon_id", couponId);
    const brandConstraints = await CouponBrandConstraint.query({ client: trx }).where("coupon_id", couponId);
    const emailRestrictions = await CouponEmailRestriction.query({ client: trx }).where("coupon_id", couponId);

    return toSnapshot(coupon, productConstraints, categoryConstraints, brandConstraints, emailRestrictions);''',
    "load brand constraints for update",
)
text = replace_once(
    text,
    '''    categoryConstraints: ReadonlyArray<CouponCategoryConstraint>,
    emailRestrictions: ReadonlyArray<CouponEmailRestriction>,''',
    '''    categoryConstraints: ReadonlyArray<CouponCategoryConstraint>,
    brandConstraints: ReadonlyArray<CouponBrandConstraint>,
    emailRestrictions: ReadonlyArray<CouponEmailRestriction>,''',
    "to snapshot brand argument",
)
text = replace_once(
    text,
    '''        categoryConstraints: categoryConstraints
            .filter((c) => Number(c.couponId) === Number(coupon.id))
            .map((c) => ({ categoryId: Number(c.categoryId), mode: c.mode as "include" | "exclude" })),
        emailRestrictions:''',
    '''        categoryConstraints: categoryConstraints
            .filter((c) => Number(c.couponId) === Number(coupon.id))
            .map((c) => ({ categoryId: Number(c.categoryId), mode: c.mode as "include" | "exclude" })),
        brandConstraints: brandConstraints
            .filter((c) => Number(c.couponId) === Number(coupon.id))
            .map((c) => ({ brandId: Number(c.brandId), mode: c.mode as "include" | "exclude" })),
        emailRestrictions:''',
    "to snapshot brand mapping",
)
text = replace_once(
    text,
    '''    const categoryIncludes = coupon.categoryConstraints.filter((c) => c.mode === "include");
    const categoryExcludes = coupon.categoryConstraints.filter((c) => c.mode === "exclude");

    if (productExcludes.some((c) => c.productId === item.productId)) return false;
    if (categoryExcludes.some((c) => item.categoryIds.includes(c.categoryId))) return false;

    const hasProductInclude = productIncludes.length > 0;
    const hasCategoryInclude = categoryIncludes.length > 0;
    if (!hasProductInclude && !hasCategoryInclude) return true;

    const productMatch = hasProductInclude && productIncludes.some((c) => c.productId === item.productId);
    const categoryMatch = hasCategoryInclude && categoryIncludes.some((c) => item.categoryIds.includes(c.categoryId));
    /**
     * Match either set when present — the WC convention is that include lists are unioned, not
     * intersected, so a coupon "for product A OR category B" works as customers expect.
     */
    return productMatch || categoryMatch;''',
    '''    const categoryIncludes = coupon.categoryConstraints.filter((c) => c.mode === "include");
    const categoryExcludes = coupon.categoryConstraints.filter((c) => c.mode === "exclude");
    const brandIncludes = coupon.brandConstraints.filter((c) => c.mode === "include");
    const brandExcludes = coupon.brandConstraints.filter((c) => c.mode === "exclude");
    const itemBrandIds = item.brandIds ?? [];

    if (productExcludes.some((c) => c.productId === item.productId)) return false;
    if (categoryExcludes.some((c) => item.categoryIds.includes(c.categoryId))) return false;
    if (brandExcludes.some((c) => itemBrandIds.includes(c.brandId))) return false;

    const hasProductInclude = productIncludes.length > 0;
    const hasCategoryInclude = categoryIncludes.length > 0;
    const hasBrandInclude = brandIncludes.length > 0;
    if (!hasProductInclude && !hasCategoryInclude && !hasBrandInclude) return true;

    const productMatch = hasProductInclude && productIncludes.some((c) => c.productId === item.productId);
    const categoryMatch = hasCategoryInclude && categoryIncludes.some((c) => item.categoryIds.includes(c.categoryId));
    const brandMatch = hasBrandInclude && brandIncludes.some((c) => itemBrandIds.includes(c.brandId));
    /**
     * Include dimensions are unioned: product A OR category B OR brand C. Excludes always win.
     */
    return productMatch || categoryMatch || brandMatch;''',
    "brand eligibility",
)
path.write_text(text)

path = Path("apps/api/app/services/coupon_test_runner.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    const products = await Product.query().whereIn("id", productIds).preload("categories");''',
    '''    const products = await Product.query().whereIn("id", productIds).preload("categories").preload("brands");''',
    "quick test preload brands",
)
text = replace_once(
    text,
    '''        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const onSale =''',
    '''        const categoryIds = (product?.categories ?? []).map((c) => Number(c.id));
        const brandIds = (product?.brands ?? []).map((b) => Number(b.id));
        const onSale =''',
    "quick test brand ids",
)
text = replace_once(
    text,
    '''            categoryIds,
            tagIds: [],
            onSale,''',
    '''            categoryIds,
            tagIds: [],
            brandIds,
            onSale,''',
    "quick test pass brand ids",
)
text = replace_once(
    text,
    '''    const emailRestrictions = (coupon.emailRestrictions ?? []).map((row) => row.emailPattern);

    const snapshot = {''',
    '''    const brandConstraints = (coupon.brandConstraints ?? []).map((row) => ({
        brandId: Number(row.brandId),
        mode: row.mode as "include" | "exclude",
    }));
    const emailRestrictions = (coupon.emailRestrictions ?? []).map((row) => row.emailPattern);

    const snapshot = {''',
    "quick test brand constraints",
)
text = replace_once(
    text,
    '''        productConstraints,
        categoryConstraints,
        emailRestrictions,''',
    '''        productConstraints,
        categoryConstraints,
        brandConstraints,
        emailRestrictions,''',
    "quick test snapshot brands",
)
text = text.replace(
    "Brand\n * constraints are folded into the same `productConstraints` set so the existing item-eligibility\n * logic enforces them without a parallel code path.",
    "Brand\n * constraints are carried as their own dimension and evaluated by the same item-eligibility routine.",
)
path.write_text(text)

# Snapshot factories declare the empty brand dimension explicitly, then add a regression for both
# include and exclude behavior.
for test_path in [
    "apps/api/tests/unit/coupons/coupon_eligibility.spec.ts",
    "apps/api/tests/unit/coupons/discounter.spec.ts",
]:
    path = Path(test_path)
    text = path.read_text()
    text = replace_once(
        text,
        '''        categoryConstraints: [],
        emailRestrictions: [],''',
        '''        categoryConstraints: [],
        brandConstraints: [],
        emailRestrictions: [],''',
        f"{test_path} snapshot brand defaults",
    )
    path.write_text(text)

path = Path("apps/api/tests/unit/coupons/coupon_eligibility.spec.ts")
text = path.read_text()
text = replace_once(
    text,
    '''            categoryIds: [10],
            tagIds: [],
            onSale: false,''',
    '''            categoryIds: [10],
            tagIds: [],
            brandIds: [20],
            onSale: false,''',
    "eligibility item brand fixture",
)
anchor = '''    test("only_sale_items when every eligible item is on sale and exclude_sale_items is set", ({ assert }) => {'''
if anchor not in text:
    raise SystemExit("eligibility brand test anchor missing")
brand_tests = '''    test("brand include/exclude constraints affect real item eligibility", ({ assert }) => {
        const included = checkEligibility({
            coupon: snap({ brandConstraints: [{ brandId: 20, mode: "include" }] }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isTrue(included.ok);

        const excluded = checkEligibility({
            coupon: snap({ brandConstraints: [{ brandId: 20, mode: "exclude" }] }),
            items: items(),
            itemsTotal: 1_000_000,
            otherAppliedCouponIds: [],
            customer: null,
            globalRedemptionCount: 0,
            perUserRedemptionCount: 0,
            now: NOW,
        });
        assert.isFalse(excluded.ok);
        if (!excluded.ok) assert.equal(excluded.reason, "no_eligible_items");
    });

'''
text = text.replace(anchor, brand_tests + anchor, 1)
path.write_text(text)
