import { getLocale } from "next-intl/server";
import { apiServer } from "#/lib/api";
import { Link } from "#/lib/i18n/navigation";
import { formatPrice, getMoneyFormatConfig } from "#/lib/money";

interface DealProduct {
    id: number;
    name: string | null;
    slug: string | null;
    featured_image_url: string | null;
    regular_price: number | null;
    effective_price: number | null;
    discount_percent: number;
    campaign_name?: string;
}
export async function AmazingDealsSection() {
    const locale = await getLocale();
    const api = await apiServer();
    const moneyConfig = await getMoneyFormatConfig();
    let items: DealProduct[] = [];
    try {
        const r = await api.http.get<{ data: DealProduct[] }>("/personalization/amazing-deals", { query: { limit: 8 } });
        items = r.data ?? [];
    } catch {
        return null;
    }
    if (!items.length) return null;
    return (
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-labelledby="amazing-deals-title">
            <div className="overflow-hidden rounded-3xl border bg-card">
                <div className="flex flex-col gap-2 border-b bg-gradient-to-l from-primary/10 via-background to-background px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-primary text-xs font-semibold">
                            {locale === "fa" ? "فرصت‌های واقعی امروز" : "Real offers today"}
                        </p>
                        <h2 id="amazing-deals-title" className="mt-1 font-bold text-xl sm:text-2xl">
                            {locale === "fa" ? "پیشنهادات شگفت‌انگیز" : "Amazing Deals"}
                        </h2>
                    </div>
                    <p className="max-w-xl text-muted-foreground text-sm">
                        {locale === "fa"
                            ? "محصولات دارای تخفیف فعال و موجودی معتبر؛ انتخاب ممکن است بر اساس کمپین یا چرخش کنترل‌شده تغییر کند."
                            : "Products with active real discounts and valid availability, selected by campaign or controlled rotation."}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                    {items.map((p) => (
                        <Link
                            key={p.id}
                            href={`/products/${p.slug ?? p.id}` as never}
                            className="group overflow-hidden rounded-2xl border bg-background transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                            <div className="relative aspect-square overflow-hidden bg-muted">
                                {p.featured_image_url ? (
                                    <img
                                        src={p.featured_image_url}
                                        alt={p.name ?? ""}
                                        className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                    />
                                ) : null}
                                <span className="absolute start-2 top-2 rounded-full bg-destructive px-2 py-1 font-bold text-destructive-foreground text-xs">
                                    {p.discount_percent}٪
                                </span>
                            </div>
                            <div className="space-y-2 p-3">
                                <h3 className="line-clamp-2 min-h-10 font-medium text-sm">
                                    {p.name ?? (locale === "fa" ? "محصول" : "Product")}
                                </h3>
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <span className="font-bold text-sm">
                                        {p.effective_price != null ? formatPrice(p.effective_price, moneyConfig, locale) : "—"}
                                    </span>
                                    {p.regular_price != null ? (
                                        <span className="text-muted-foreground text-xs line-through">
                                            {formatPrice(p.regular_price, moneyConfig, locale)}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
