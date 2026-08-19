import { Link } from "#/lib/i18n/navigation";
import type { SocialContent } from "#/lib/social-api";
import { SocialProductAction } from "./social-product-action";
export function StoryRail({ items, locale }: { items: SocialContent[]; locale: string }) {
    if (!items.length) return null;
    return (
        <section className="space-y-4" aria-labelledby="story-rail-title">
            <div className="flex items-center justify-between">
                <h2 id="story-rail-title" className="font-semibold text-2xl">
                    {locale === "fa" ? "استوری‌های فروشگاهی" : "Shop stories"}
                </h2>
                <Link href="/discover" className="text-sm text-accent hover:underline">
                    {locale === "fa" ? "مشاهده Discover" : "Open Discover"}
                </Link>
            </div>
            <ul className="flex gap-4 overflow-x-auto pb-2">
                {items.map((item) => {
                    const marker = item.product_markers?.[0];
                    return (
                        <li key={item.id} className="w-56 shrink-0 rounded-2xl border bg-card p-4 shadow-sm">
                            <div className="mb-3 aspect-[9/12] rounded-xl bg-gradient-to-b from-muted to-muted/40 p-3">
                                <span className="rounded-full bg-background/90 px-2 py-1 text-xs">{item.kind}</span>
                                <p className="mt-4 line-clamp-3 font-semibold">{item.title}</p>
                            </div>
                            {marker?.product ? (
                                <div className="space-y-2">
                                    <p className="line-clamp-1 text-sm">{marker.product.name ?? `#${marker.product.id}`}</p>
                                    <SocialProductAction
                                        productId={marker.product.id}
                                        label={locale === "fa" ? "افزودن به سبد" : "Add to cart"}
                                    />
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
