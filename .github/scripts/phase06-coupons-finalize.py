from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# 1) Demo coupons are part of the real tenant seed, after the catalog exists.
path = Path("apps/api/database/seeders/main_seeder.ts")
text = path.read_text()
text = replace_once(
    text,
    'import AttributesSeeder from "#database/seed_modules/0002_attributes_seeder";\n',
    'import AttributesSeeder from "#database/seed_modules/0002_attributes_seeder";\nimport CouponsDemoSeeder from "#database/seed_modules/0006_coupons_demo_seeder";\n',
    "main seeder coupon import",
)
text = replace_once(
    text,
    '''                await new AttributesSeeder(trx).run();
                await new BulkDatasetSeeder(trx).setOptions(volumes).run();''',
    '''                await new AttributesSeeder(trx).run();
                await new BulkDatasetSeeder(trx).setOptions(volumes).run();
                /** Coupon demos depend on the catalog/category tree created above. */
                await new CouponsDemoSeeder(trx).run();''',
    "main seeder coupon execution",
)
path.write_text(text)

# Make demo relation replacement genuinely idempotent if the fixture definition changes later.
path = Path("apps/api/database/seed_modules/0006_coupons_demo_seeder.ts")
text = path.read_text()
text = replace_once(
    text,
    '''        if (row.categoryName && apparelCategoryId !== null && row.categoryName === "پوشاک") {
            await CouponCategoryConstraint.query().where("coupon_id", couponId).delete();
            await CouponCategoryConstraint.create({''',
    '''        await CouponCategoryConstraint.query().where("coupon_id", couponId).delete();
        if (row.categoryName && apparelCategoryId !== null && row.categoryName === "پوشاک") {
            await CouponCategoryConstraint.create({''',
    "demo category full replacement",
)
text = replace_once(
    text,
    '''        if (row.emailRestrictions && row.emailRestrictions.length > 0) {
            await CouponEmailRestriction.query().where("coupon_id", couponId).delete();
            for (const pattern of row.emailRestrictions) {''',
    '''        await CouponEmailRestriction.query().where("coupon_id", couponId).delete();
        if (row.emailRestrictions && row.emailRestrictions.length > 0) {
            for (const pattern of row.emailRestrictions) {''',
    "demo email full replacement",
)
path.write_text(text)

# 2) Wire-format validators match the Phase 06 contract.
path = Path("apps/api/app/validators/coupons/coupon_validator.ts")
text = path.read_text()
text = replace_once(
    text,
    'const CONSTRAINT_MODES = ["include", "exclude"] as const;\n',
    'const CONSTRAINT_MODES = ["include", "exclude"] as const;\nconst COUPON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;\n',
    "coupon code pattern",
)
text = text.replace(
    'vine.string().trim().minLength(2).maxLength(64)',
    'vine.string().trim().minLength(4).maxLength(64).regex(COUPON_CODE_PATTERN)',
)
text = replace_once(
    text,
    'amount_percent: vine.number().min(0).max(100).nullable().optional(),',
    'amount_percent: vine.number().min(0.01).max(100).nullable().optional(),',
    "percent lower bound",
)
path.write_text(text)

path = Path("apps/api/app/validators/coupons/apply_validator.ts")
text = path.read_text()
text = replace_once(
    text,
    'import vine from "@vinejs/vine";\n',
    'import vine from "@vinejs/vine";\n\nconst COUPON_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;\n',
    "apply code pattern",
)
text = replace_once(
    text,
    'code: vine.string().trim().minLength(2).maxLength(64),',
    'code: vine.string().trim().minLength(4).maxLength(64).regex(COUPON_CODE_PATTERN),',
    "apply code bounds",
)
path.write_text(text)

# Cross-field date window validation belongs at the admin boundary, including PATCH and batch.
path = Path("apps/api/app/controllers/admin/coupons_controller.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createCouponValidator);
        const coupon = await withTenantTransaction(async (trx) => {''',
    '''    async store(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(createCouponValidator);
        assertCouponWindow(payload);
        const coupon = await withTenantTransaction(async (trx) => {''',
    "store coupon window",
)
text = replace_once(
    text,
    '''        if (!coupon) throw notFound();
        const payload = await ctx.request.validateUsing(updateCouponValidator);

        await withTenantTransaction(async (trx) => {''',
    '''        if (!coupon) throw notFound();
        const payload = await ctx.request.validateUsing(updateCouponValidator);
        assertCouponWindow(payload, coupon);

        await withTenantTransaction(async (trx) => {''',
    "update coupon window",
)
text = replace_once(
    text,
    '''            for (const row of payload.create ?? []) {
                const created = await Coupon.create(this.buildAttributes(row as CreatePayload, "create"), { client: trx });''',
    '''            for (const row of payload.create ?? []) {
                assertCouponWindow(row);
                const created = await Coupon.create(this.buildAttributes(row as CreatePayload, "create"), { client: trx });''',
    "batch create coupon window",
)
text = replace_once(
    text,
    '''                const coupon = await Coupon.query({ client: trx }).where("id", row.id).whereNull("deleted_at").first();
                if (!coupon) continue;
                coupon.merge(this.buildAttributes(row as UpdatePayload, "update"));''',
    '''                const coupon = await Coupon.query({ client: trx }).where("id", row.id).whereNull("deleted_at").first();
                if (!coupon) continue;
                assertCouponWindow(row, coupon);
                coupon.merge(this.buildAttributes(row as UpdatePayload, "update"));''',
    "batch update coupon window",
)
marker = '''function parseList(input: unknown): string[] {'''
if marker not in text:
    raise SystemExit("admin coupon helper marker missing")
helper = '''function assertCouponWindow(
    payload: { starts_at?: Date | null; expires_at?: Date | null },
    current?: { startsAt?: DateTime | null; expiresAt?: DateTime | null },
): void {
    const startsAt =
        payload.starts_at === undefined
            ? (current?.startsAt ?? null)
            : payload.starts_at === null
              ? null
              : DateTime.fromJSDate(payload.starts_at);
    const expiresAt =
        payload.expires_at === undefined
            ? (current?.expiresAt ?? null)
            : payload.expires_at === null
              ? null
              : DateTime.fromJSDate(payload.expires_at);

    if (startsAt && expiresAt && startsAt.toMillis() >= expiresAt.toMillis()) {
        throw new Exception("Coupon starts_at must be earlier than expires_at", {
            status: 422,
            code: "E_COUPON_DATE_WINDOW",
        });
    }
}

'''
text = text.replace(marker, helper + marker, 1)
path.write_text(text)

# 3) Preserve exact per-coupon allocation instead of inventing an equal split at order snapshot time.
path = Path("apps/api/app/contracts/discounter.ts")
text = path.read_text()
text = replace_once(
    text,
    '''export interface DiscounterResult {
    /** Total of all discounts applied to line subtotals. */''',
    '''export interface DiscounterCouponDiscount {
    discount: number;
    discountTax: number;
}

export interface DiscounterResult {
    /** Total of all discounts applied to line subtotals. */''',
    "per coupon contract type",
)
text = replace_once(
    text,
    '''    /** Per-line discount allocation keyed by `DiscounterItem.lineKey`, in minor units. */
    perLineDiscounts: Map<string, number>;
}''',
    '''    /** Per-line discount allocation keyed by `DiscounterItem.lineKey`, in minor units. */
    perLineDiscounts: Map<string, number>;
    /** Exact allocation per canonical coupon code; order snapshots must never guess/split totals. */
    perCouponDiscounts: Map<string, DiscounterCouponDiscount>;
}''',
    "per coupon result map",
)
text = replace_once(
    text,
    '''            freeShipping: false,
            perLineDiscounts: new Map(),''',
    '''            freeShipping: false,
            perLineDiscounts: new Map(),
            perCouponDiscounts: new Map(),''',
    "noop per coupon map",
)
path.write_text(text)

# 4) Runtime discounter revalidates live coupon state every recompute; redemption limits get a dedicated gate.
path = Path("apps/api/app/services/discounter_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '''        const snapshots = await loadSnapshots(input.appliedCoupons);
        return computeDiscounts(input, snapshots);''',
    '''        const snapshots = await loadSnapshots(input.appliedCoupons);
        /**
         * Re-evaluate every applied coupon against current state on every totals pass. A coupon may
         * have expired, been disabled, crossed a usage limit, or had its constraints changed after
         * it was first added to the cart. Stale cart rows must never keep granting a discount.
         */
        const candidates = pickActiveCoupons(sortCouponsByType(snapshots));
        const eligible: CouponSnapshot[] = [];
        const customer = input.customer ?? null;
        for (const snapshot of candidates) {
            const globalRedemptionCount =
                snapshot.usageLimitGlobal === null ? 0 : await countRedemptions(snapshot.id);
            const perUserRedemptionCount =
                snapshot.usageLimitPerUser === null
                    ? 0
                    : await countRedemptions(snapshot.id, {
                          customerId: customer?.customerId,
                          email: customer?.email,
                      });
            const eligibility = checkEligibility({
                coupon: snapshot,
                items: input.items,
                itemsTotal: input.itemsTotal,
                otherAppliedCouponIds: candidates.filter((other) => other.id !== snapshot.id).map((other) => other.id),
                customer,
                globalRedemptionCount,
                perUserRedemptionCount,
            });
            if (eligibility.ok) eligible.push(snapshot);
        }
        return computeDiscounts(input, eligible);''',
    "runtime coupon revalidation",
)
text = replace_once(
    text,
    '''    const perLine = new Map<string, number>();
    /**''',
    '''    const perLine = new Map<string, number>();
    const perCouponDiscounts = new Map<string, { discount: number; discountTax: number }>();
    /**''',
    "per coupon allocation init",
)
text = replace_once(
    text,
    '''    let freeShipping = false;
    for (const coupon of active) {
        if (coupon.freeShipping || coupon.discountType === "free_shipping") {
            freeShipping = true;
        }
        if (coupon.discountType === "free_shipping") continue;
        applyCouponToLines(coupon, input.items, remaining, perLine);
    }

    const discountTotal = sumMapValues(perLine);
    return {
        discountTotal,
        discountTaxTotal: 0,
        freeShipping,
        perLineDiscounts: perLine,
    };''',
    '''    let freeShipping = false;
    for (const coupon of active) {
        if (coupon.freeShipping || coupon.discountType === "free_shipping") {
            freeShipping = true;
        }
        const before = sumMapValues(perLine);
        if (coupon.discountType !== "free_shipping") {
            applyCouponToLines(coupon, input.items, remaining, perLine);
        }
        const discount = Math.max(0, sumMapValues(perLine) - before);
        perCouponDiscounts.set(coupon.code, { discount, discountTax: 0 });
    }

    const discountTotal = sumMapValues(perLine);
    return {
        discountTotal,
        discountTaxTotal: 0,
        freeShipping,
        perLineDiscounts: perLine,
        perCouponDiscounts,
    };''',
    "exact per coupon allocation",
)
# Dedicated limit function immediately before full eligibility.
anchor = '''export function checkEligibility(args: {
'''
if anchor not in text:
    raise SystemExit("checkEligibility anchor missing")
limit_helper = '''export function checkRedemptionLimits(args: {
    coupon: CouponSnapshot;
    globalRedemptionCount: number;
    perUserRedemptionCount: number;
}): EligibilityResult {
    if (args.coupon.usageLimitGlobal !== null && args.globalRedemptionCount >= args.coupon.usageLimitGlobal) {
        return { ok: false, reason: "usage_limit_global_reached" };
    }
    if (args.coupon.usageLimitPerUser !== null && args.perUserRedemptionCount >= args.coupon.usageLimitPerUser) {
        return { ok: false, reason: "usage_limit_per_user_reached" };
    }
    return { ok: true };
}

'''
text = text.replace(anchor, limit_helper + anchor, 1)
text = replace_once(
    text,
    '''    if (args.coupon.usageLimitGlobal !== null && args.globalRedemptionCount >= args.coupon.usageLimitGlobal) {
        return { ok: false, reason: "usage_limit_global_reached" };
    }
    if (args.coupon.usageLimitPerUser !== null && args.perUserRedemptionCount >= args.coupon.usageLimitPerUser) {
        return { ok: false, reason: "usage_limit_per_user_reached" };
    }

    return { ok: true };''',
    '''    return checkRedemptionLimits({
        coupon: args.coupon,
        globalRedemptionCount: args.globalRedemptionCount,
        perUserRedemptionCount: args.perUserRedemptionCount,
    });''',
    "eligibility limit delegation",
)
text = replace_once(
    text,
    '''    const query = (options.client ?? db).from("coupon_redemptions").where("coupon_id", couponId);
    if (options.customerId !== undefined || options.email !== undefined) {
        query.andWhere((q) => {
            if (options.customerId !== undefined && options.customerId !== null) {
                q.orWhere("customer_id", options.customerId);
            }
            if (options.email) {
                q.orWhereRaw("lower(email_snapshot) = lower(?)", [options.email]);
            }
        });
    }''',
    '''    const query = (options.client ?? db).from("coupon_redemptions").where("coupon_id", couponId);
    const identityScoped = options.customerId !== undefined || options.email !== undefined;
    const customerId = options.customerId ?? null;
    const email = options.email?.trim() || null;
    /** Anonymous carts without a stable identity defer per-user enforcement to checkout. */
    if (identityScoped && customerId === null && email === null) return 0;
    if (identityScoped) {
        query.andWhere((q) => {
            if (customerId !== null) q.orWhere("customer_id", customerId);
            if (email) q.orWhereRaw("lower(email_snapshot) = lower(?)", [email]);
        });
    }''',
    "anonymous per user count",
)
text = replace_once(
    text,
    '''        freeShipping: false,
        perLineDiscounts: new Map(),
    };''',
    '''        freeShipping: false,
        perLineDiscounts: new Map(),
        perCouponDiscounts: new Map(),
    };''',
    "empty per coupon result",
)
path.write_text(text)

# 5) Carry exact per-coupon allocation through totals to the order snapshot.
path = Path("apps/api/app/services/cart_totals_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '''    discountTotal: number;
    discountTaxTotal: number;
    taxTotal: number;''',
    '''    discountTotal: number;
    discountTaxTotal: number;
    perCouponDiscounts: DiscounterResult["perCouponDiscounts"];
    taxTotal: number;''',
    "cart totals per coupon type",
)
text = replace_once(
    text,
    '''        discountTotal: input.discounterResult.discountTotal,
        discountTaxTotal: input.discounterResult.discountTaxTotal,
        taxTotal,''',
    '''        discountTotal: input.discounterResult.discountTotal,
        discountTaxTotal: input.discounterResult.discountTaxTotal,
        perCouponDiscounts: input.discounterResult.perCouponDiscounts,
        taxTotal,''',
    "cart totals per coupon result",
)
path.write_text(text)

path = Path("apps/api/app/services/order_factory.ts")
text = path.read_text()
text = replace_once(
    text,
    '''     * total across the codes. Allocation is simple: the cart's `discountTotal` goes to the single
     * applied coupon, or splits evenly when several stack, with the rounding residual landing on
     * the first row. `discount_tax` is always 0 — line tax already gets recomputed on the
     * post-discount base in the totals service, so this column is reserved for future
     * tax-inclusive carts that need a separate audit field.''',
    '''     * exact amount produced by the discount engine for each canonical code. Never split the
     * aggregate evenly: stacked percent/fixed coupons commonly contribute different amounts, and
     * the order snapshot is an audit record that must preserve the actual calculation.''',
    "order coupon line documentation",
)
text = replace_once(
    text,
    '''        totals: { discountTotal: number; discountTaxTotal: number },''',
    '''        totals: {
            discountTotal: number;
            discountTaxTotal: number;
            perCouponDiscounts: Map<string, { discount: number; discountTax: number }>;
        },''',
    "order coupon totals type",
)
text = replace_once(
    text,
    '''        /** Equal split when multiple coupons stack; residual goes to the first row. */
        const share = Math.floor(totals.discountTotal / codes.length);
        let residual = totals.discountTotal - share * codes.length;

        for (const entry of codes) {
            const line = new OrderCouponLine();''',
    '''        for (const entry of codes) {
            const allocation = totals.perCouponDiscounts.get(entry.code) ?? { discount: 0, discountTax: 0 };
            const line = new OrderCouponLine();''',
    "remove guessed equal split",
)
text = replace_once(
    text,
    '''            line.codeSnapshot = entry.code;
            line.discount = share + residual;
            line.discountTax = 0;
            residual = 0;
            await line.save();''',
    '''            line.codeSnapshot = entry.code;
            line.discount = allocation.discount;
            line.discountTax = allocation.discountTax;
            await line.save();''',
    "write exact coupon allocation",
)
path.write_text(text)

# 6) Finalize race safety checks limits directly while holding the coupon row lock.
path = Path("apps/api/app/services/order_finalizer.ts")
text = path.read_text()
text = replace_once(
    text,
    'import { checkEligibility, countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";',
    'import { checkRedemptionLimits, countRedemptions, loadSnapshotForUpdate } from "#services/discounter_service";',
    "order finalizer limit import",
)
old = '''            /** Eligibility re-runs without item state — we only re-check the limit gates here. */
            const result = checkEligibility({
                coupon: snapshot,
                items: [
                    {
                        lineKey: "1",
                        productId: 0,
                        variationId: null,
                        quantity: 1,
                        priceSnapshot: 0,
                        lineSubtotal: 0,
                        categoryIds: [],
                        tagIds: [],
                    },
                ],
                itemsTotal: Number(order.itemsTotal),
                otherAppliedCouponIds: [],
                customer: { customerId, email },
                globalRedemptionCount: globalCount,
                perUserRedemptionCount: perUserCount,
            });
            if (
                !result.ok &&
                (result.reason === "usage_limit_global_reached" || result.reason === "usage_limit_per_user_reached")
            ) {'''
new = '''            /**
             * Only the mutable counters need the submit-time race check. Do not feed a synthetic
             * product into full eligibility: product/category constraints can fail before the limit
             * gate and accidentally let an exhausted constrained coupon through.
             */
            const result = checkRedemptionLimits({
                coupon: snapshot,
                globalRedemptionCount: globalCount,
                perUserRedemptionCount: perUserCount,
            });
            if (!result.ok) {'''
text = replace_once(text, old, new, "finalizer direct limit gate")
path.write_text(text)

# 7) Unit fixtures + regression assertions for the newly enforced invariants.
path = Path("apps/api/tests/unit/cart/cart_totals.spec.ts")
text = path.read_text()
text = text.replace(
    '''            freeShipping: false,
            perLineDiscounts: new Map(),''',
    '''            freeShipping: false,
            perLineDiscounts: new Map(),
            perCouponDiscounts: new Map(),''',
)
text = text.replace(
    '''                    freeShipping: true,
                    perLineDiscounts: new Map(),''',
    '''                    freeShipping: true,
                    perLineDiscounts: new Map(),
                    perCouponDiscounts: new Map(),''',
)
text = text.replace(
    '''                    freeShipping: false,
                    perLineDiscounts: new Map([["1", 1_100_000]]),''',
    '''                    freeShipping: false,
                    perLineDiscounts: new Map([["1", 1_100_000]]),
                    perCouponDiscounts: new Map([["TEST", { discount: 1_100_000, discountTax: 100_000 }]]),''',
)
path.write_text(text)

path = Path("apps/api/tests/unit/coupons/discounter.spec.ts")
text = path.read_text()
text = replace_once(
    text,
    '''        assert.equal(a.discountTotal, 100_000 + 90_000 + 50_000);
    });''',
    '''        assert.equal(a.discountTotal, 100_000 + 90_000 + 50_000);
        assert.equal(a.perCouponDiscounts.get("FP")?.discount, 100_000);
        assert.equal(a.perCouponDiscounts.get("P10")?.discount, 90_000);
        assert.equal(a.perCouponDiscounts.get("FC")?.discount, 50_000);
    });''',
    "per coupon allocation regression",
)
path.write_text(text)

path = Path("apps/api/tests/unit/coupons/coupon_eligibility.spec.ts")
text = path.read_text()
text = replace_once(
    text,
    'import { type CouponSnapshot, checkEligibility } from "#services/discounter_service";',
    'import { type CouponSnapshot, checkEligibility, checkRedemptionLimits } from "#services/discounter_service";',
    "eligibility test import",
)
text += '''

test.group("Coupon redemption limit gate", () => {
    test("detects an exhausted constrained coupon without synthetic item eligibility", ({ assert }) => {
        const result = checkRedemptionLimits({
            coupon: snap({
                usageLimitGlobal: 1,
                productConstraints: [{ productId: 999, mode: "include" }],
            }),
            globalRedemptionCount: 1,
            perUserRedemptionCount: 0,
        });
        assert.isFalse(result.ok);
        if (!result.ok) assert.equal(result.reason, "usage_limit_global_reached");
    });
});
'''
path.write_text(text)
