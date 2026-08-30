import { setRequestLocale } from "next-intl/server";
import { Link } from "#/lib/i18n/navigation";
import { getDiscover } from "#/lib/social-api";
import { SocialProductAction } from "#/components/social/social-product-action";
const tabs = ["for_you", "following", "trending", "latest", "live", "tutorials", "reviews", "deals", "questions"] as const;
export default async function DiscoverPage({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    const [{ locale }, { tab }] = await Promise.all([params, searchParams]);
    setRequestLocale(locale);
    const active = tabs.includes(tab as (typeof tabs)[number]) ? tab! : "latest";
    const feed = await getDiscover(locale, active);
    return (
        <section className="space-y-6 py-10">
            <header>
                <h1 className="font-bold text-3xl">Discover</h1>
                <p className="mt-2 text-muted-foreground">
                    {locale === "fa"
                        ? "ویدئو، استوری، Live، آموزش، نقد و پرسش‌های جامعه"
                        : "Video, stories, Live, tutorials, reviews and community questions"}
                </p>
            </header>
            <nav className="flex flex-wrap gap-2" aria-label="Discover feeds">
                {tabs.map((x) => (
                    <Link
                        key={x}
                        href={`/discover?tab=${x}` as never}
                        className={`rounded-full border px-3 py-1.5 text-sm ${x === active ? "bg-accent text-accent-foreground" : "bg-card"}`}
                    >
                        {x.replaceAll("_", " ")}
                    </Link>
                ))}
            </nav>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {feed.data.map((item) => {
                    const marker = item.product_markers?.[0];
                    return (
                        <article key={item.id} className="rounded-2xl border bg-card p-4">
                            <div className="aspect-video rounded-xl bg-muted p-4">
                                <span className="text-xs uppercase text-muted-foreground">{item.kind}</span>
                                <h2 className="mt-3 line-clamp-2 font-semibold text-lg">{item.title}</h2>
                                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.description}</p>
                            </div>
                            {marker?.product ? (
                                <div className="mt-4">
                                    <p className="mb-2 text-sm">{marker.product.name ?? `#${marker.product.id}`}</p>
                                    <SocialProductAction productId={marker.product.id} />
                                </div>
                            ) : null}
                        </article>
                    );
                })}
            </div>
            {feed.data.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    {locale === "fa" ? "هنوز محتوایی در این فید نیست." : "No content in this feed yet."}
                </div>
            ) : null}
        </section>
    );
}
