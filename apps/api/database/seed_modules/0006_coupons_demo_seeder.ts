import { BaseSeeder } from "@adonisjs/lucid/seeders";
import { DateTime } from "luxon";

interface DemoCoupon {
    code: string;
    discountType: "percent" | "fixed_cart" | "fixed_product" | "free_shipping";
    amountMinor?: number;
    amountPercent?: string;
    expiresInDays?: number;
    individualUse?: boolean;
    excludeSaleItems?: boolean;
    minimumAmount?: number;
    usageLimitGlobal?: number;
    usageLimitPerUser?: number;
    freeShipping?: boolean;
    description: { fa: string; en: string };
    categoryName?: string;
    emailRestrictions?: string[];
}

/**
 * Five demo coupons covering each discount type and common modifiers. All reads and writes use the
 * seeder's injected client so multi-tenant demo seeding stays on the transaction that already owns
 * the active `app.current_tenant` RLS context.
 */
export default class CouponsDemoSeeder extends BaseSeeder {
    async run() {
        const apparelCategoryId = await this.findCategoryIdByName("پوشاک");
        const demo: DemoCoupon[] = [
            {
                code: "WELCOME10",
                discountType: "percent",
                amountPercent: "10.00",
                expiresInDays: 30,
                usageLimitPerUser: 1,
                description: { fa: "تخفیف ۱۰٪ خوش‌آمدگویی", en: "Welcome 10% off" },
            },
            {
                code: "FLAT500K",
                discountType: "fixed_cart",
                amountMinor: 5_000_000,
                minimumAmount: 30_000_000,
                description: { fa: "۵۰۰٬۰۰۰ تومان تخفیف نقدی", en: "5,000,000 IRR cart discount" },
            },
            {
                code: "SHIPFREE",
                discountType: "free_shipping",
                individualUse: true,
                freeShipping: true,
                description: { fa: "ارسال رایگان", en: "Free shipping" },
            },
            {
                code: "SUMMER25",
                discountType: "percent",
                amountPercent: "25.00",
                excludeSaleItems: true,
                description: { fa: "۲۵٪ تخفیف پوشاک تابستان", en: "25% off summer apparel" },
                categoryName: "پوشاک",
            },
            {
                code: "VIPCASH",
                discountType: "fixed_cart",
                amountMinor: 10_000_000,
                usageLimitGlobal: 10,
                description: { fa: "تخفیف نقدی ویژه VIP", en: "VIP-only cash discount" },
                emailRestrictions: ["vip@*"],
            },
        ];

        for (const row of demo) await this.upsertCoupon(row, apparelCategoryId);
    }

    private async upsertCoupon(row: DemoCoupon, apparelCategoryId: number | null): Promise<void> {
        const now = DateTime.utc().toSQL();
        const code = row.code.trim().toUpperCase();
        const expiresAt = row.expiresInDays === undefined ? null : DateTime.utc().plus({ days: row.expiresInDays }).toSQL();
        const values = {
            code,
            discount_type: row.discountType,
            amount_minor: row.amountMinor ?? null,
            amount_percent: row.amountPercent ?? null,
            starts_at: null,
            expires_at: expiresAt,
            individual_use: row.individualUse ?? false,
            exclude_sale_items: row.excludeSaleItems ?? false,
            minimum_amount: row.minimumAmount ?? null,
            maximum_amount: null,
            usage_limit_global: row.usageLimitGlobal ?? null,
            usage_limit_per_user: row.usageLimitPerUser ?? null,
            limit_usage_to_x_items: null,
            free_shipping: row.freeShipping ?? false,
            status: "active",
            attributes: JSON.stringify({}),
            updated_at: now,
        };

        const existing = await this.client.from("coupons").where("code", code).select("id").first();
        let couponId: number;
        if (existing) {
            couponId = Number(existing.id);
            await this.client.from("coupons").where("id", couponId).update(values);
        } else {
            const [inserted] = await this.client
                .table("coupons")
                .insert({ ...values, created_at: now })
                .returning("id");
            couponId = Number(inserted.id);
        }

        await this.client.from("coupon_translations").where("coupon_id", couponId).delete();
        await this.client.table("coupon_translations").insert(
            Object.entries(row.description).map(([locale, description]) => ({
                coupon_id: couponId,
                locale,
                description,
                created_at: now,
                updated_at: now,
            })),
        );

        await this.client.from("coupon_category_constraints").where("coupon_id", couponId).delete();
        if (row.categoryName === "پوشاک" && apparelCategoryId !== null) {
            await this.client.table("coupon_category_constraints").insert({
                coupon_id: couponId,
                category_id: apparelCategoryId,
                mode: "include",
                created_at: now,
                updated_at: now,
            });
        }

        await this.client.from("coupon_email_restrictions").where("coupon_id", couponId).delete();
        if (row.emailRestrictions?.length) {
            await this.client.table("coupon_email_restrictions").insert(
                row.emailRestrictions.map((emailPattern) => ({
                    coupon_id: couponId,
                    email_pattern: emailPattern,
                    created_at: now,
                    updated_at: now,
                })),
            );
        }
    }

    private async findCategoryIdByName(faName: string): Promise<number | null> {
        const row = await this.client.from("product_category_translations").where("locale", "fa").where("name", faName).first();
        return row ? Number(row.category_id) : null;
    }
}
