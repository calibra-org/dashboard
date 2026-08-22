"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ResourcePicker } from "#/components/ui/resource-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import {
    Activity,
    BarChart3,
    CheckCircle2,
    FileSearch,
    ListChecks,
    Loader2,
    MousePointerClick,
    Network,
    Plus,
    RefreshCcw,
    RotateCcw,
    Search,
    Settings2,
    ShieldCheck,
    ShoppingCart,
    Sparkles,
    Target,
    TrendingUp,
    TriangleAlert,
} from "#/icons";
import { useResourceResolver, useResourceSearcher } from "#/lib/queries/resource-search";
import { cn } from "#/lib/utils";

import {
    useDiscoveryCapabilities,
    useDiscoveryMutations,
    useDiscoveryOverview,
    useIndexHealth,
    useMerchandising,
    useOpportunities,
    usePolicies,
    useRelationships,
    useSearchEvents,
    useSynonyms,
    useZeroResults,
} from "./queries";
import type { MerchRule, Opportunity, Relationship, SearchEvent, SynonymRule } from "./types";

export type DiscoveryMode =
    | "overview"
    | "queries"
    | "zero-results"
    | "simulator"
    | "merchandising"
    | "compatibility"
    | "opportunities"
    | "governance";
const modeIcon = {
    overview: Activity,
    queries: Search,
    "zero-results": TriangleAlert,
    simulator: Sparkles,
    merchandising: Target,
    compatibility: Network,
    opportunities: TrendingUp,
    governance: Settings2,
} as const;
const modeKey: Record<DiscoveryMode, string> = {
    overview: "overview",
    queries: "queries",
    "zero-results": "zeroResults",
    simulator: "simulator",
    merchandising: "merchandising",
    compatibility: "compatibility",
    opportunities: "opportunities",
    governance: "governance",
};

function Info({ children }: { children: string }) {
    return <HelperTooltip side="top">{children}</HelperTooltip>;
}
function InfoTitle({ title, help }: { title: string; help: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <span>{title}</span>
            <Info>{help}</Info>
        </div>
    );
}
function FieldLabel({ htmlFor, children, help }: { htmlFor?: string; children: string; help: string }) {
    return (
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
            <span>{children}</span>
            <Info>{help}</Info>
        </Label>
    );
}
function InfoHead({ children, help }: { children: string; help: string }) {
    return (
        <TableHead>
            <div className="flex items-center gap-1.5">
                <span>{children}</span>
                <Info>{help}</Info>
            </div>
        </TableHead>
    );
}
function Metric({
    label,
    value,
    help,
    icon: Icon,
    tone = "default",
}: {
    label: string;
    value: string;
    help: string;
    icon: typeof Activity;
    tone?: "default" | "warning" | "success";
}) {
    return (
        <Card className={cn(tone === "warning" && "border-warning/30", tone === "success" && "border-success/30")}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div>
                    <CardDescription>
                        <InfoTitle title={label} help={help} />
                    </CardDescription>
                    <CardTitle className="mt-2 text-2xl tabular-nums">{value}</CardTitle>
                </div>
                <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                </span>
            </CardHeader>
        </Card>
    );
}
function Empty({ title, description }: { title: string; description: string }) {
    return (
        <div className="grid min-h-36 place-items-center rounded-xl border border-dashed p-6 text-center">
            <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-muted-foreground text-sm">{description}</p>
            </div>
        </div>
    );
}
function ErrorBox() {
    return (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-danger text-sm">
            بارگذاری داده‌ها ناموفق بود. اتصال API و دسترسی فروشگاه را بررسی کنید.
        </div>
    );
}
function Loading() {
    return (
        <div className="flex min-h-32 items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="size-4 animate-spin" />
            در حال دریافت داده واقعی…
        </div>
    );
}
const statusLabel = (v: string) =>
    ({
        active: "فعال",
        draft: "پیش‌نویس",
        paused: "متوقف",
        archived: "بایگانی",
        detected: "شناسایی‌شده",
        triaged: "بررسی اولیه",
        accepted: "پذیرفته",
        assigned: "واگذارشده",
        in_progress: "در حال انجام",
        implemented: "اجراشده",
        measuring: "در حال اندازه‌گیری",
        validated: "تأییدشده",
        closed: "بسته",
        rejected: "ردشده",
        duplicate: "تکراری",
        insufficient_evidence: "شواهد ناکافی",
        compatible: "سازگار",
        not_compatible: "ناسازگار",
        unknown: "نامشخص",
        revoked: "لغوشده",
    })[v] ?? v;
const pct = (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toLocaleString("fa-IR", { maximumFractionDigits: 1 })}٪`;
const num = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("fa-IR"));
function Pager({
    page,
    setPage,
    meta,
    fetching = false,
}: {
    page: number;
    setPage: (page: number) => void;
    meta?: { page: number; limit: number; total: number; lastPage: number };
    fetching?: boolean;
}) {
    if (!meta || meta.lastPage <= 1) return null;
    return (
        <div className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
                <InfoTitle
                    title={`صفحه ${num(page)} از ${num(meta.lastPage)}`}
                    help={`در مجموع ${num(meta.total)} رکورد وجود دارد و هر صفحه حداکثر ${num(meta.limit)} ردیف نمایش می‌دهد.`}
                />
            </span>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || fetching}
                    onClick={() => setPage(Math.max(1, page - 1))}
                >
                    صفحه قبل
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= meta.lastPage || fetching}
                    onClick={() => setPage(Math.min(meta.lastPage, page + 1))}
                >
                    صفحه بعد
                </Button>
            </div>
        </div>
    );
}

export function DiscoveryWorkspace({ mode }: { mode: DiscoveryMode }) {
    const t = useTranslations("Discovery");
    const Icon = modeIcon[mode];
    const key = modeKey[mode];
    return (
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className="font-semibold text-2xl tracking-tight">{t(`${key}.title`)}</h1>
                        <p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-6">{t(`${key}.description`)}</p>
                    </div>
                </div>
                <Badge variant="outline" className="w-fit gap-1.5">
                    <ShieldCheck className="size-3.5" aria-hidden="true" />
                    داده واقعی · tenant-safe · RLS
                </Badge>
            </div>
            {mode === "overview" ? (
                <Overview />
            ) : mode === "queries" ? (
                <Queries />
            ) : mode === "zero-results" ? (
                <ZeroResults />
            ) : mode === "simulator" ? (
                <Simulator />
            ) : mode === "merchandising" ? (
                <Merchandising />
            ) : mode === "compatibility" ? (
                <Compatibility />
            ) : mode === "opportunities" ? (
                <Opportunities />
            ) : (
                <Governance />
            )}
        </div>
    );
}

function Overview() {
    const q = useDiscoveryOverview();
    if (q.isLoading) return <Loading />;
    if (q.isError || !q.data) return <ErrorBox />;
    const d = q.data.data;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                    label="جست‌وجوهای ۳۰ روز"
                    value={num(d.searches)}
                    help="تعداد رویدادهای search_performed ثبت‌شده در ۳۰ روز گذشته."
                    icon={Search}
                />
                <Metric
                    label="نرخ بدون نتیجه"
                    value={pct(d.zero_result_rate)}
                    help="سهم جست‌وجوهایی که رویداد zero_result داشته‌اند؛ عدد بالا الزاماً فقط کمبود محصول نیست."
                    icon={TriangleAlert}
                    tone={d.zero_result_rate != null && d.zero_result_rate > 0.1 ? "warning" : "default"}
                />
                <Metric
                    label="نرخ کلیک پس از جست‌وجو"
                    value={pct(d.click_rate)}
                    help="نسبت result_clicked به search_performed در همین بازه؛ برای تشخیص کیفیت بازیابی استفاده می‌شود."
                    icon={MousePointerClick}
                />
                <Metric
                    label="نرخ خرید پس از جست‌وجو"
                    value={pct(d.purchase_rate)}
                    help="نسبت purchase به search_performed بر پایه رویدادهای ثبت‌شده، نه ادعای علیت."
                    icon={ShoppingCart}
                    tone="success"
                />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>
                            <InfoTitle
                                title="اقدام‌های پیشنهادی امروز"
                                help="این بخش به‌جای امتیاز AI ساختگی، شمارنده‌های واقعیِ فرصت، قانون و دانش سازگاری را به اقدام قابل پیگیری تبدیل می‌کند."
                            />
                        </CardTitle>
                        <CardDescription>اول مواردی را بررسی کنید که مستقیم روی پیدا شدن محصول و خرید اثر دارند.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border p-4">
                            <p className="text-muted-foreground text-xs">فرصت‌های باز</p>
                            <p className="mt-2 font-semibold text-2xl">{num(d.open_opportunities)}</p>
                            <p className="mt-2 text-muted-foreground text-xs">از صفرنتیجه، شکاف بازیابی و شواهد کاتالوگ.</p>
                        </div>
                        <div className="rounded-xl border p-4">
                            <p className="text-muted-foreground text-xs">قوانین فعال نمایش</p>
                            <p className="mt-2 font-semibold text-2xl">{num(d.active_rules)}</p>
                            <p className="mt-2 text-muted-foreground text-xs">Boost / Bury / Pin / Hide با سابقه ممیزی.</p>
                        </div>
                        <div className="rounded-xl border p-4">
                            <p className="text-muted-foreground text-xs">روابط محصول</p>
                            <p className="mt-2 font-semibold text-2xl">{num(d.relationship_count)}</p>
                            <p className="mt-2 text-muted-foreground text-xs">
                                رابطه‌های فعال با وضعیت سازگار، ناسازگار یا نامشخص.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>
                            <InfoTitle
                                title="مرز اختیار Phase 16"
                                help="برای جلوگیری از ساخت منبع حقیقت دوم، این فاز Search/Discovery را کنترل می‌کند و داده‌های Catalog/Recommendation/Pricing را مصرف می‌کند."
                            />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <span>Search & Discovery</span>
                            <Badge>Phase 16</Badge>
                        </div>
                        <div className="flex justify-between">
                            <span>Catalog truth</span>
                            <Badge variant="outline">Catalog</Badge>
                        </div>
                        <div className="flex justify-between">
                            <span>Recommendation</span>
                            <Badge variant="outline">Phase 9</Badge>
                        </div>
                        <div className="flex justify-between">
                            <span>Pricing</span>
                            <Badge variant="outline">Phase 18</Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

function Queries() {
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const data = useSearchEvents(q, page);
    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <InfoTitle
                        title="Query Explorer"
                        help="هر ردیف یک رویداد واقعی جست‌وجو است. عبارت نرمال‌شده برای تحلیل استفاده می‌شود و PII پیش از ذخیره ماسک می‌شود."
                    />
                </CardTitle>
                <CardDescription>مسیر جست‌وجو، نتیجه، کلیک و تغییر عبارت را بدون داده ساختگی بررسی کنید.</CardDescription>
                <Input
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                    }}
                    placeholder="جست‌وجو در عبارت‌های ثبت‌شده…"
                    className="mt-3 max-w-md"
                />
            </CardHeader>
            <CardContent>
                {data.isLoading ? (
                    <Loading />
                ) : data.isError ? (
                    <ErrorBox />
                ) : !data.data?.data.length ? (
                    <Empty
                        title="رویدادی پیدا نشد"
                        description="پس از اتصال Storefront و ثبت Search Event داده‌ها اینجا ظاهر می‌شوند."
                    />
                ) : (
                    <>
                        <EventTable rows={data.data.data} />
                        <Pager page={page} setPage={setPage} meta={data.data.meta} fetching={data.isFetching} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
function EventTable({ rows }: { rows: SearchEvent[] }) {
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <InfoHead help="نوع رویداد در taxonomy جست‌وجو؛ مانند search_performed، zero_result یا purchase.">
                            رویداد
                        </InfoHead>
                        <InfoHead help="نسخه پاک‌سازی و نرمال‌شده عبارت؛ ایمیل و شماره تلفن ماسک می‌شوند.">عبارت نرمال‌شده</InfoHead>
                        <InfoHead help="تعداد نتایج گزارش‌شده برای این رویداد، در صورت وجود.">نتیجه</InfoHead>
                        <InfoHead help="سطحی که رویداد از آن آمده؛ مثلاً storefront.">سطح</InfoHead>
                        <InfoHead help="زمان ثبت‌شده رویداد با timezone.">زمان</InfoHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => (
                        <TableRow key={r.id}>
                            <TableCell>
                                <Badge variant="outline">{r.event_type}</Badge>
                            </TableCell>
                            <TableCell className="max-w-80 truncate font-medium">{r.normalized_query ?? "—"}</TableCell>
                            <TableCell>{r.result_count ?? "—"}</TableCell>
                            <TableCell>{r.surface}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                                {new Date(r.occurred_at).toLocaleString("fa-IR")}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function ZeroResults() {
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const data = useZeroResults(q, page);
    const m = useDiscoveryMutations();
    const can = useDiscoveryCapabilities().data?.data.permissions["opportunity:write"] ?? false;
    return (
        <Card>
            <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle>
                            <InfoTitle
                                title="مرکز جست‌وجوهای بدون نتیجه"
                                help="Zero Result فقط نشانه است؛ موتور Opportunity دوباره Catalog را بررسی می‌کند تا بین کمبود محصول و شکاف بازیابی تفاوت بگذارد."
                            />
                        </CardTitle>
                        <CardDescription>
                            قبل از خرید محصول جدید، ریشه مشکل را از کاتالوگ، ویژگی، synonym، visibility یا index جدا کنید.
                        </CardDescription>
                    </div>
                    <Button onClick={() => m.detect.mutate()} disabled={!can || m.detect.isPending}>
                        <RefreshCcw className={cn("size-4", m.detect.isPending && "animate-spin")} />
                        تحلیل فرصت‌ها
                    </Button>
                </div>
                <Input
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                    }}
                    placeholder="فیلتر عبارت…"
                    className="max-w-md"
                />
            </CardHeader>
            <CardContent>
                {data.isLoading ? (
                    <Loading />
                ) : data.isError ? (
                    <ErrorBox />
                ) : !data.data?.data.length ? (
                    <Empty
                        title="Zero Result ثبت نشده"
                        description="این وضعیت خوب است یا هنوز رویدادهای Storefront متصل نشده‌اند."
                    />
                ) : (
                    <>
                        <EventTable rows={data.data.data} />
                        <Pager page={page} setPage={setPage} meta={data.data.meta} fetching={data.isFetching} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function Simulator() {
    const [query, setQuery] = useState("");
    const [locale, setLocale] = useState("fa");
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const categorySearch = useResourceSearcher("categories");
    const categoryResolve = useResourceResolver("categories");
    const m = useDiscoveryMutations();
    const d = m.simulate.data?.data;
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="ورودی شبیه‌سازی"
                            help="شبیه‌ساز همان مسیر واقعی Search را بدون ایجاد خرید یا تغییر کاتالوگ اجرا می‌کند؛ برای بررسی normalization، retrieval، policy و merchandising است."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <FieldLabel htmlFor="sim-query" help="عبارت دقیق کاربر. نسخه نرمال‌شده در خروجی نمایش داده می‌شود.">
                            عبارت جست‌وجو
                        </FieldLabel>
                        <Input
                            id="sim-query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="mt-2"
                            placeholder="مثلاً فیلتر مناسب لوله ۲ اینچ"
                        />
                    </div>
                    <div>
                        <FieldLabel help="دسته اختیاری، بازیابی را به محصولات canonical همان دسته محدود می‌کند و در Meilisearch و fallback PostgreSQL یکسان اعمال می‌شود.">
                            محدودکردن به دسته
                        </FieldLabel>
                        <ResourcePicker
                            value={categoryId}
                            onChange={setCategoryId}
                            search={categorySearch}
                            onResolve={categoryResolve}
                            placeholder="همه دسته‌ها"
                            emptyHint="دسته‌ای پیدا نشد"
                            className="mt-2"
                        />
                    </div>
                    <div>
                        <FieldLabel help="Search index برای fa و en جداست تا واژگان و ranking دو زبان مخلوط نشوند.">
                            زبان
                        </FieldLabel>
                        <Select value={locale} onValueChange={(v) => setLocale(v as string)}>
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="fa">فارسی</SelectItem>
                                <SelectItem value="en">English</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        className="w-full"
                        disabled={!query.trim() || m.simulate.isPending}
                        onClick={() => m.simulate.mutate({ query, locale, category_id: categoryId ?? undefined })}
                    >
                        {m.simulate.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        اجرای شبیه‌سازی
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="ردیابی تصمیم Search"
                            help="این خروجی Explainability نشان می‌دهد موتور چه عبارتی فهمیده، از کدام مسیر بازیابی کرده و چه Ruleهایی روی رتبه‌بندی اثر گذاشته‌اند."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!d ? (
                        <Empty
                            title="هنوز شبیه‌سازی اجرا نشده"
                            description="یک عبارت وارد کنید تا trace واقعی موتور نمایش داده شود."
                        />
                    ) : (
                        <div className="space-y-5">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-muted-foreground text-xs">نرمال‌شده</p>
                                    <p className="mt-1 font-medium">{d.normalized_query}</p>
                                </div>
                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-muted-foreground text-xs">منبع بازیابی</p>
                                    <p className="mt-1 font-medium">{d.retrieval_source}</p>
                                </div>
                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-muted-foreground text-xs">Policy</p>
                                    <p className="mt-1 font-medium">{d.policy_version}</p>
                                </div>
                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-muted-foreground text-xs">نتیجه</p>
                                    <p className="mt-1 font-medium">{num(d.result_count)}</p>
                                </div>
                            </div>
                            {d.degraded && (
                                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
                                    Meilisearch در این اجرا در دسترس نبوده و fallback کنترل‌شده PostgreSQL استفاده شده است.
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <InfoHead help="رتبه نهایی پس از eligibility و merchandising.">رتبه</InfoHead>
                                            <InfoHead help="محصول canonical دوباره از PostgreSQL خوانده شده تا وضعیت و visibility قدیمی نمایش داده نشود.">
                                                محصول
                                            </InfoHead>
                                            <InfoHead help="SKU از Catalog؛ Search authority مالک آن نیست.">SKU</InfoHead>
                                            <InfoHead help="قیمت زنده از Catalog؛ موتور Search قیمت‌گذاری نمی‌کند.">قیمت</InfoHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {d.results.map((r, i) => (
                                            <TableRow key={r.id}>
                                                <TableCell>{i + 1}</TableCell>
                                                <TableCell>{r.name}</TableCell>
                                                <TableCell>{r.sku ?? "—"}</TableCell>
                                                <TableCell>{r.price_minor == null ? "—" : num(r.price_minor)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function Merchandising() {
    const [page, setPage] = useState(1);
    const data = useMerchandising(page);
    const m = useDiscoveryMutations();
    const can = useDiscoveryCapabilities().data?.data.permissions["merchandising:write"] ?? false;
    const productSearch = useResourceSearcher("products");
    const productResolve = useResourceResolver("products");
    const categorySearch = useResourceSearcher("categories");
    const categoryResolve = useResourceResolver("categories");
    const [name, setName] = useState("");
    const [action, setAction] = useState("boost");
    const [targetType, setTargetType] = useState<"product" | "category">("product");
    const [productId, setProductId] = useState<number | null>(null);
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [query, setQuery] = useState("");
    const [reason, setReason] = useState("");
    const [priority, setPriority] = useState("100");
    const [boostFactor, setBoostFactor] = useState("1.35");
    const [pinPosition, setPinPosition] = useState("1");
    const [startsAt, setStartsAt] = useState("");
    const [endsAt, setEndsAt] = useState("");
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(20rem,.75fr)_minmax(0,1.6fr)]">
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="قانون جدید Merchandising"
                            help="این لایه بعد از relevance پایه اعمال می‌شود. Hide/Pin اولویت عملیاتی بالاتری از Boost/Bury دارند و دلیل تغییر اجباری است."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <FieldLabel htmlFor="rule-name" help="نام داخلی برای ممیزی؛ به مشتری نمایش داده نمی‌شود.">
                            نام قانون
                        </FieldLabel>
                        <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-2" />
                    </div>
                    <div>
                        <FieldLabel help="Boost رتبه را بالا می‌برد، Bury پایین می‌آورد، Pin جایگاه ثابت و Hide حذف سخت است.">
                            عملیات
                        </FieldLabel>
                        <Select value={action} onValueChange={(v) => setAction(v as string)}>
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="boost">تقویت رتبه (Boost)</SelectItem>
                                <SelectItem value="bury">کاهش رتبه (Bury)</SelectItem>
                                <SelectItem value="pin">ثابت‌کردن جایگاه (Pin)</SelectItem>
                                <SelectItem value="hide">پنهان‌کردن (Hide)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <FieldLabel help="قانون می‌تواند یک محصول یا تمام محصولات canonical یک دسته را هدف بگیرد؛ هیچ کدام authority کاتالوگ را تغییر نمی‌دهد.">
                            نوع هدف
                        </FieldLabel>
                        <Select
                            value={targetType}
                            onValueChange={(v) => {
                                setTargetType(v as "product" | "category");
                                setProductId(null);
                                setCategoryId(null);
                            }}
                        >
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="product">محصول</SelectItem>
                                <SelectItem value="category">دسته محصول</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {targetType === "product" ? (
                        <div>
                            <FieldLabel help="محصول canonical را از Catalog همین فروشگاه انتخاب می‌کند.">محصول هدف</FieldLabel>
                            <ResourcePicker
                                value={productId}
                                onChange={setProductId}
                                search={productSearch}
                                onResolve={productResolve}
                                placeholder="جست‌وجوی نام یا SKU محصول…"
                                emptyHint="محصولی پیدا نشد"
                                disabled={!can}
                                className="mt-2"
                            />
                        </div>
                    ) : (
                        <div>
                            <FieldLabel help="Rule روی تمام candidateهایی اعمال می‌شود که عضویت canonical در این دسته دارند.">
                                دسته هدف
                            </FieldLabel>
                            <ResourcePicker
                                value={categoryId}
                                onChange={setCategoryId}
                                search={categorySearch}
                                onResolve={categoryResolve}
                                placeholder="جست‌وجوی دسته…"
                                emptyHint="دسته‌ای پیدا نشد"
                                disabled={!can}
                                className="mt-2"
                            />
                        </div>
                    )}
                    <div>
                        <FieldLabel
                            htmlFor="rule-query"
                            help="اگر خالی باشد قانون بدون شرط Query روی هدف اعمال می‌شود؛ در v1 تطبیق عبارت نرمال‌شده دقیق است."
                        >
                            عبارت هدف
                        </FieldLabel>
                        <Input id="rule-query" value={query} onChange={(e) => setQuery(e.target.value)} className="mt-2" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <FieldLabel
                                htmlFor="rule-priority"
                                help="عدد بزرگ‌تر زودتر اعمال می‌شود؛ برای برخورد Ruleها ترتیب قطعی ایجاد می‌کند."
                            >
                                اولویت اجرا
                            </FieldLabel>
                            <Input
                                id="rule-priority"
                                inputMode="numeric"
                                value={priority}
                                onChange={(e) => setPriority(e.target.value)}
                                className="mt-2"
                            />
                        </div>
                        {action === "boost" || action === "bury" ? (
                            <div>
                                <FieldLabel
                                    htmlFor="rule-factor"
                                    help="ضریب امتیاز پس از relevance پایه؛ برای Bury مقداری کمتر از ۱ و برای Boost بیشتر از ۱ انتخاب کنید."
                                >
                                    ضریب رتبه
                                </FieldLabel>
                                <Input
                                    id="rule-factor"
                                    inputMode="decimal"
                                    value={action === "bury" && boostFactor === "1.35" ? "0.35" : boostFactor}
                                    onChange={(e) => setBoostFactor(e.target.value)}
                                    className="mt-2"
                                />
                            </div>
                        ) : action === "pin" ? (
                            <div>
                                <FieldLabel htmlFor="rule-pin" help="جایگاه یک‌مبنایی نتیجه پس از رتبه‌بندی؛ ۱ یعنی اولین نتیجه.">
                                    جایگاه ثابت
                                </FieldLabel>
                                <Input
                                    id="rule-pin"
                                    inputMode="numeric"
                                    value={pinPosition}
                                    onChange={(e) => setPinPosition(e.target.value)}
                                    className="mt-2"
                                />
                            </div>
                        ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <FieldLabel htmlFor="rule-start" help="اختیاری؛ Rule پیش از این زمان اجرا نمی‌شود.">
                                شروع زمان‌بندی
                            </FieldLabel>
                            <Input
                                id="rule-start"
                                type="datetime-local"
                                value={startsAt}
                                onChange={(e) => setStartsAt(e.target.value)}
                                className="mt-2"
                            />
                        </div>
                        <div>
                            <FieldLabel htmlFor="rule-end" help="اختیاری؛ پس از این زمان Rule از موتور اجرا خارج می‌شود.">
                                پایان زمان‌بندی
                            </FieldLabel>
                            <Input
                                id="rule-end"
                                type="datetime-local"
                                value={endsAt}
                                onChange={(e) => setEndsAt(e.target.value)}
                                className="mt-2"
                            />
                        </div>
                    </div>
                    <div>
                        <FieldLabel htmlFor="rule-reason" help="برای Audit و Rollback باید دلیل کسب‌وکاری/عملیاتی ثبت شود.">
                            دلیل
                        </FieldLabel>
                        <Textarea id="rule-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2" />
                    </div>
                    <Button
                        disabled={!can || !name || !(productId || categoryId) || !reason || m.createRule.isPending}
                        onClick={() =>
                            m.createRule.mutate({
                                name,
                                action,
                                product_id: productId ?? undefined,
                                category_id: categoryId ?? undefined,
                                query_pattern: query || undefined,
                                reason,
                                boost_factor:
                                    action === "bury"
                                        ? Number(boostFactor === "1.35" ? "0.35" : boostFactor)
                                        : action === "boost"
                                          ? Number(boostFactor)
                                          : undefined,
                                pin_position: action === "pin" ? Number(pinPosition) : undefined,
                                priority: Number(priority),
                                starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
                                ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
                            })
                        }
                    >
                        <Plus className="size-4" />
                        ثبت پیش‌نویس
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="قوانین نمایش"
                            help="فقط Ruleهایی که واقعاً موتور اجرا می‌کند در UI وجود دارند؛ کنترل تزئینی یا action بدون backend نمایش داده نمی‌شود."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.isLoading ? (
                        <Loading />
                    ) : data.isError ? (
                        <ErrorBox />
                    ) : !data.data?.data.length ? (
                        <Empty
                            title="قانونی وجود ندارد"
                            description="اولین قانون را به‌صورت پیش‌نویس بسازید و پس از بازبینی فعال کنید."
                        />
                    ) : (
                        <>
                            <RuleTable
                                rows={data.data.data}
                                canEdit={can}
                                onStatus={(id, status) => m.ruleStatus.mutate({ id, status })}
                            />
                            <Pager page={page} setPage={setPage} meta={data.data.meta} fetching={data.isFetching} />
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
function RuleTable({
    rows,
    onStatus,
    canEdit,
}: {
    rows: MerchRule[];
    onStatus: (id: number, status: string) => void;
    canEdit: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <InfoHead help="نام داخلی و قابل ممیزی قانون.">قانون</InfoHead>
                        <InfoHead help="نوع تغییر مجاز در v1.">عملیات</InfoHead>
                        <InfoHead help="وضعیت اجرایی Rule؛ فقط active روی Search اثر دارد.">وضعیت</InfoHead>
                        <InfoHead help="شناسه Product/Category هدف.">هدف</InfoHead>
                        <InfoHead help="فعال/توقف از API واقعی انجام می‌شود.">اقدام</InfoHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => (
                        <TableRow key={r.id}>
                            <TableCell>
                                <div className="font-medium">{r.name}</div>
                                <div className="text-muted-foreground text-xs">{r.reason}</div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">{r.action}</Badge>
                            </TableCell>
                            <TableCell>{statusLabel(r.status)}</TableCell>
                            <TableCell>
                                {r.product_id ? `محصول #${r.product_id}` : r.category_id ? `دسته #${r.category_id}` : "—"}
                            </TableCell>
                            <TableCell>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!canEdit}
                                    onClick={() => onStatus(r.id, r.status === "active" ? "paused" : "active")}
                                >
                                    {r.status === "active" ? "توقف" : "فعال‌سازی"}
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function Compatibility() {
    const [page, setPage] = useState(1);
    const data = useRelationships(page);
    const m = useDiscoveryMutations();
    const can = useDiscoveryCapabilities().data?.data.permissions["compatibility:write"] ?? false;
    const productSearch = useResourceSearcher("products");
    const productResolve = useResourceResolver("products");
    const [a, setA] = useState<number | null>(null);
    const [b, setB] = useState<number | null>(null);
    const [state, setState] = useState("compatible");
    const [relationType, setRelationType] = useState("compatible_with");
    const [source, setSource] = useState("");
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(20rem,.75fr)_minmax(0,1.6fr)]">
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="ثبت رابطه محصول"
                            help="سازگاری Fact است، نه حدس AI. هر Edge باید وضعیت، منبع و سطح اطمینان داشته باشد؛ Unknown هرگز Compatible نیست."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <FieldLabel help="محصول مبدأ رابطه از Catalog همین فروشگاه.">محصول اول</FieldLabel>
                        <ResourcePicker
                            value={a}
                            onChange={setA}
                            search={productSearch}
                            onResolve={productResolve}
                            placeholder="جست‌وجوی محصول اول…"
                            emptyHint="محصولی پیدا نشد"
                            disabled={!can}
                            className="mt-2"
                        />
                    </div>
                    <div>
                        <FieldLabel help="محصول مقصد رابطه؛ نباید با محصول اول یکسان باشد.">محصول دوم</FieldLabel>
                        <ResourcePicker
                            value={b}
                            onChange={setB}
                            search={productSearch}
                            onResolve={productResolve}
                            placeholder="جست‌وجوی محصول دوم…"
                            emptyHint="محصولی پیدا نشد"
                            disabled={!can}
                            className="mt-2"
                        />
                    </div>
                    <div>
                        <FieldLabel help="نوع Edge معنای رابطه را مشخص می‌کند و برای Agent/Bundle/Replacement قابل مصرف است.">
                            نوع رابطه
                        </FieldLabel>
                        <Select
                            value={relationType}
                            onValueChange={(v) => {
                                setRelationType(v as string);
                                if (v === "not_compatible_with") setState("not_compatible");
                                else if (state === "not_compatible") setState("compatible");
                            }}
                        >
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="compatible_with">سازگار با</SelectItem>
                                <SelectItem value="not_compatible_with">ناسازگار با</SelectItem>
                                <SelectItem value="requires">نیازمند</SelectItem>
                                <SelectItem value="optionally_requires">نیازمند اختیاری</SelectItem>
                                <SelectItem value="accessory_to">لوازم جانبیِ</SelectItem>
                                <SelectItem value="replacement_for">جایگزینِ</SelectItem>
                                <SelectItem value="alternative_to">گزینه جایگزین</SelectItem>
                                <SelectItem value="similar_to">مشابه</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <FieldLabel help="ناسازگاری Edge منفی و first-class است؛ نبود رابطه به معنی سازگاری نیست.">
                            وضعیت
                        </FieldLabel>
                        <Select value={state} onValueChange={(v) => setState(v as string)}>
                            <SelectTrigger className="mt-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="compatible">سازگار</SelectItem>
                                <SelectItem value="not_compatible">ناسازگار</SelectItem>
                                <SelectItem value="unknown">نامشخص</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <FieldLabel htmlFor="rel-source" help="شماره مستند سازنده، لینک داخلی، تست اپراتور یا مرجع قابل بازبینی.">
                            مرجع منبع
                        </FieldLabel>
                        <Input id="rel-source" value={source} onChange={(e) => setSource(e.target.value)} className="mt-2" />
                    </div>
                    <Button
                        disabled={!can || !a || !b || m.createRelationship.isPending}
                        onClick={() =>
                            m.createRelationship.mutate({
                                subject_product_id: a!,
                                object_product_id: b!,
                                relation_type: state === "not_compatible" ? "not_compatible_with" : relationType,
                                state,
                                confidence_class: source ? "operator_confirmed" : "unknown",
                                source_type: "operator",
                                source_ref: source || undefined,
                                evidence: {},
                            })
                        }
                    >
                        <Plus className="size-4" />
                        ثبت Edge
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>
                        <InfoTitle
                            title="Knowledge & Compatibility Graph"
                            help="Graph در v1 روی PostgreSQL و Edgeهای typed ذخیره می‌شود؛ Graph DB جدا تا زمان وجود شواهد bottleneck اضافه نمی‌شود."
                        />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.isLoading ? (
                        <Loading />
                    ) : data.isError ? (
                        <ErrorBox />
                    ) : !data.data?.data.length ? (
                        <Empty title="رابطه‌ای ثبت نشده" description="روابط تأییدشده و منفی را از مستندات واقعی اضافه کنید." />
                    ) : (
                        <>
                            <RelationshipTable
                                rows={data.data.data}
                                canEdit={can}
                                onRevoke={(id) => m.revokeRelationship.mutate(id)}
                                onVerify={(r) =>
                                    m.resolveRelationship.mutate({
                                        id: r.id,
                                        state: r.state,
                                        confidence_class: "verified",
                                        source_ref: r.source_ref ?? undefined,
                                        evidence: r.evidence,
                                        expected_version: r.version,
                                    })
                                }
                            />
                            <Pager page={page} setPage={setPage} meta={data.data.meta} fetching={data.isFetching} />
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
function RelationshipTable({
    rows,
    onRevoke,
    onVerify,
    canEdit,
}: {
    rows: Relationship[];
    onRevoke: (id: number) => void;
    onVerify: (r: Relationship) => void;
    canEdit: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <InfoHead help="Edge جهت‌دار از subject به object.">محصول‌ها</InfoHead>
                        <InfoHead help="Predicate typed مثل compatible_with یا requires.">رابطه</InfoHead>
                        <InfoHead help="سه حالت واقعی: compatible، not_compatible، unknown.">وضعیت</InfoHead>
                        <InfoHead help="منشأ و کلاس اطمینان برای جلوگیری از hallucination.">شواهد</InfoHead>
                        <InfoHead help="تأیید شواهد یا لغو Edge از API واقعی و با version conflict protection انجام می‌شود.">
                            اقدام
                        </InfoHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => (
                        <TableRow key={r.id}>
                            <TableCell>
                                #{r.subject_product_id} ← #{r.object_product_id}
                            </TableCell>
                            <TableCell>{r.relation_type}</TableCell>
                            <TableCell>
                                <Badge variant={r.state === "not_compatible" ? "destructive" : "outline"}>
                                    {statusLabel(r.state)}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div>{r.confidence_class}</div>
                                <div className="max-w-48 truncate text-muted-foreground text-xs">
                                    {r.source_ref ?? "منبع ثبت نشده"}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!canEdit || r.status === "revoked" || r.confidence_class === "verified"}
                                        onClick={() => onVerify(r)}
                                    >
                                        تأیید شواهد
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={!canEdit || r.status === "revoked"}
                                        onClick={() => onRevoke(r.id)}
                                    >
                                        {r.status === "revoked" ? "لغوشده" : "لغو"}
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function Opportunities() {
    const [page, setPage] = useState(1);
    const data = useOpportunities(page);
    const m = useDiscoveryMutations();
    const can = useDiscoveryCapabilities().data?.data.permissions["opportunity:write"] ?? false;
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle>
                            <InfoTitle
                                title="مرکز فرصت محصول"
                                help="Opportunity از شواهد قابل Trace ساخته می‌شود و خودش Product/PO ایجاد نمی‌کند؛ اقدام بعدی به مالک دامنه مناسب واگذار می‌شود."
                            />
                        </CardTitle>
                        <CardDescription>
                            تقاضای بدون پاسخ، شکاف بازیابی و نیاز به اصلاح کاتالوگ را از هم جدا کنید.
                        </CardDescription>
                    </div>
                    <Button onClick={() => m.detect.mutate()} disabled={!can || m.detect.isPending}>
                        <RefreshCcw className={cn("size-4", m.detect.isPending && "animate-spin")} />
                        بازتحلیل ۳۰ روز
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {data.isLoading ? (
                    <Loading />
                ) : data.isError ? (
                    <ErrorBox />
                ) : !data.data?.data.length ? (
                    <Empty
                        title="فرصتی شناسایی نشده"
                        description="پس از حداقل سه Zero Result مشابه، تحلیلگر می‌تواند فرصت مبتنی بر شواهد بسازد."
                    />
                ) : (
                    <>
                        <OpportunityTable
                            rows={data.data.data}
                            canEdit={can}
                            onAction={(row, action) =>
                                m.opportunityAction.mutate({ id: row.id, action, expected_version: row.version })
                            }
                        />
                        <Pager page={page} setPage={setPage} meta={data.data.meta} fetching={data.isFetching} />
                    </>
                )}
            </CardContent>
        </Card>
    );
}
function OpportunityTable({
    rows,
    onAction,
    canEdit,
}: {
    rows: Opportunity[];
    onAction: (r: Opportunity, a: string) => void;
    canEdit: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <InfoHead help="نوع ریشه‌ای فرصت؛ کمبود محصول با شکاف بازیابی یکسان نیست.">نوع</InfoHead>
                        <InfoHead help="عنوان و خلاصه از داده واقعی Query ساخته می‌شود؛ درآمد فرضی تولید نمی‌شود.">فرصت</InfoHead>
                        <InfoHead help="تعداد Zero Result و session یکتا در پنجره تحلیل.">شواهد</InfoHead>
                        <InfoHead help="Workflow قابل ممیزی از شناسایی تا تأیید و بستن.">وضعیت</InfoHead>
                        <InfoHead help="هر Action با expected_version ارسال می‌شود تا تغییر هم‌زمان بی‌صدا overwrite نشود.">
                            اقدام
                        </InfoHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((r) => {
                        const next =
                            r.status === "detected"
                                ? "accept"
                                : r.status === "accepted"
                                  ? "start"
                                  : r.status === "in_progress"
                                    ? "implement"
                                    : r.status === "implemented"
                                      ? "measure"
                                      : r.status === "measuring"
                                        ? "validate"
                                        : r.status === "validated"
                                          ? "close"
                                          : null;
                        const label =
                            next === "accept"
                                ? "پذیرش"
                                : next === "start"
                                  ? "شروع اجرا"
                                  : next === "implement"
                                    ? "ثبت اجرا"
                                    : next === "measure"
                                      ? "اندازه‌گیری"
                                      : next === "validate"
                                        ? "تأیید نتیجه"
                                        : next === "close"
                                          ? "بستن"
                                          : null;
                        return (
                            <TableRow key={r.id}>
                                <TableCell>
                                    <Badge variant="outline">{r.type}</Badge>
                                </TableCell>
                                <TableCell className="max-w-md">
                                    <div className="font-medium">{r.title}</div>
                                    <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">{r.summary}</div>
                                </TableCell>
                                <TableCell>
                                    {num(r.query_count)} جست‌وجو · {num(r.unique_sessions)} session
                                </TableCell>
                                <TableCell>{statusLabel(r.status)}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                        {next && label ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!canEdit}
                                                onClick={() => onAction(r, next)}
                                            >
                                                {label}
                                            </Button>
                                        ) : null}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={!canEdit || ["rejected", "closed"].includes(r.status)}
                                            onClick={() => onAction(r, "reject")}
                                        >
                                            رد
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

function Governance() {
    const [synPage, setSynPage] = useState(1);
    const [policyPage, setPolicyPage] = useState(1);
    const syn = useSynonyms(synPage);
    const policies = usePolicies(policyPage);
    const health = useIndexHealth();
    const m = useDiscoveryMutations();
    const caps = useDiscoveryCapabilities().data?.data.permissions;
    const can = caps?.["governance:write"] ?? false;
    const canSearch = caps?.["search:write"] ?? false;
    const categorySearch = useResourceSearcher("categories");
    const categoryResolve = useResourceResolver("categories");
    const [term, setTerm] = useState("");
    const [syns, setSyns] = useState("");
    const [synMode, setSynMode] = useState("equivalent");
    const [synCategory, setSynCategory] = useState<number | null>(null);
    const [policyName, setPolicyName] = useState("");
    const [maxResults, setMaxResults] = useState("60");
    const [typo, setTypo] = useState(true);
    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
                <Metric
                    label="محصولات فعال Catalog"
                    value={num(health.data?.data.product_count)}
                    help="تعداد canonical محصولات publish؛ Index مالک این عدد نیست."
                    icon={ListChecks}
                />
                <Metric
                    label="اسناد Index فارسی"
                    value={num(health.data?.data.fa_index ?? undefined)}
                    help="تعداد سندهای index مخصوص fa؛ جدا از en نگهداری می‌شود."
                    icon={FileSearch}
                />
                <Metric
                    label="اسناد Index انگلیسی"
                    value={num(health.data?.data.en_index ?? undefined)}
                    help="تعداد سندهای index مخصوص en؛ اختلاف با Catalog در Search Health قابل بررسی است."
                    icon={BarChart3}
                />
            </div>
            {health.data?.data.degraded && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
                    <InfoTitle
                        title="حالت Degraded فعال است"
                        help="وقتی Meilisearch تنظیم یا قابل دسترس نباشد Search به PostgreSQL ILIKE برمی‌گردد؛ این وضعیت پنهان نمی‌شود."
                    />
                </div>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle>
                                <InfoTitle
                                    title="Synonym Governance"
                                    help="Synonym داده اجرایی نسخه‌پذیر است، نه آرایه hard-coded. Equivalent و Directional معنای متفاوت دارند."
                                />
                            </CardTitle>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => m.rebuildIndex.mutate()}
                                disabled={!can || m.rebuildIndex.isPending}
                            >
                                <RotateCcw className={cn("size-4", m.rebuildIndex.isPending && "animate-spin")} />
                                بازسازی Index
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="syn-term" help="صورت اصلی واژه در Query پس از normalization.">
                                    عبارت
                                </FieldLabel>
                                <Input id="syn-term" value={term} onChange={(e) => setTerm(e.target.value)} className="mt-2" />
                            </div>
                            <div>
                                <FieldLabel
                                    htmlFor="syn-values"
                                    help="معادل‌ها را با ویرگول جدا کنید. هر Rule tenant و locale مستقل دارد."
                                >
                                    معادل‌ها
                                </FieldLabel>
                                <Input id="syn-values" value={syns} onChange={(e) => setSyns(e.target.value)} className="mt-2" />
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <FieldLabel help="Equivalent دوطرفه است؛ Directional فقط عبارت اصلی را به گزینه‌های جایگزین گسترش می‌دهد.">
                                    نوع هم‌معنی
                                </FieldLabel>
                                <Select value={synMode} onValueChange={(v) => setSynMode(v as string)}>
                                    <SelectTrigger className="mt-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="equivalent">معادل دوطرفه</SelectItem>
                                        <SelectItem value="directional">گسترش یک‌طرفه</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <FieldLabel help="اختیاری؛ با انتخاب دسته، Rule فقط در همان دامنه کاتالوگ تعریف می‌شود و از گسترش ناخواسته جلوگیری می‌کند.">
                                    دامنه دسته
                                </FieldLabel>
                                <ResourcePicker
                                    value={synCategory}
                                    onChange={setSynCategory}
                                    search={categorySearch}
                                    onResolve={categoryResolve}
                                    placeholder="همه دسته‌ها"
                                    emptyHint="دسته‌ای پیدا نشد"
                                    disabled={!canSearch}
                                    className="mt-2"
                                />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            disabled={!canSearch || !term || !syns}
                            onClick={() =>
                                m.createSynonym.mutate({
                                    locale: "fa",
                                    term,
                                    synonyms: syns
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean),
                                    mode: synMode,
                                    category_id: synCategory ?? undefined,
                                    enabled: true,
                                })
                            }
                        >
                            <Plus className="size-4" />
                            افزودن هم‌معنی
                        </Button>
                        {syn.isLoading ? (
                            <Loading />
                        ) : syn.data?.data.length ? (
                            <div className="space-y-2">
                                {syn.data.data.map((r: SynonymRule) => (
                                    <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                            <div className="font-medium text-sm">{r.term}</div>
                                            <div className="text-muted-foreground text-xs">
                                                {Array.isArray(r.synonyms) ? r.synonyms.join("، ") : "—"}
                                            </div>
                                        </div>
                                        <Switch
                                            checked={r.enabled}
                                            disabled={!canSearch}
                                            onCheckedChange={() => m.toggleSynonym.mutate(r.id)}
                                            aria-label={`تغییر وضعیت هم‌معنی ${r.term}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Empty title="هم‌معنی ثبت نشده" description="فقط واژگان تأییدشده دامنه را اضافه کنید." />
                        )}
                        <Pager page={synPage} setPage={setSynPage} meta={syn.data?.meta} fetching={syn.isFetching} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>
                            <InfoTitle
                                title="Search Policy & Versioning"
                                help="max_results، typo tolerance و ranking config داخل نسخه immutable نگهداری می‌شوند؛ فعال‌سازی و rollback تحت lock tenant انجام می‌شود."
                            />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <FieldLabel
                                htmlFor="policy-name"
                                help="نام سیاست برای تشخیص محیط/هدف؛ نسخه‌های بعدی زیر همین سیاست ثبت می‌شوند."
                            >
                                نام Policy
                            </FieldLabel>
                            <Input
                                id="policy-name"
                                value={policyName}
                                onChange={(e) => setPolicyName(e.target.value)}
                                className="mt-2"
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <FieldLabel htmlFor="policy-max" help="سقف نهایی نتایج پاسخ Search؛ بین ۱ تا ۱۰۰.">
                                    حداکثر نتایج
                                </FieldLabel>
                                <Input
                                    id="policy-max"
                                    inputMode="numeric"
                                    value={maxResults}
                                    onChange={(e) => setMaxResults(e.target.value)}
                                    className="mt-2"
                                />
                            </div>
                            <div className="flex items-end justify-between rounded-lg border p-3">
                                <div>
                                    <div className="flex items-center gap-1.5 font-medium text-sm">
                                        تحمل خطای تایپی{" "}
                                        <Info>
                                            اگر فعال باشد provider می‌تواند typo tolerance محدود داشته باشد؛ مقدار در نسخه Policy
                                            ذخیره می‌شود.
                                        </Info>
                                    </div>
                                    <p className="text-muted-foreground text-xs">حداکثر ۱ ویرایش در v1</p>
                                </div>
                                <Switch checked={typo} onCheckedChange={setTypo} aria-label="تحمل خطای تایپی" />
                            </div>
                        </div>
                        <Button
                            disabled={!can || !policyName}
                            onClick={() =>
                                m.createPolicy.mutate({
                                    name: policyName,
                                    max_results: Number(maxResults),
                                    typo_tolerance: typo,
                                    typo_max_edits: typo ? 1 : 0,
                                    ranking_weights: { lexical: 1, availability: 0.2 },
                                    reason: "ایجاد از مرکز حاکمیت Phase 16",
                                })
                            }
                        >
                            <Plus className="size-4" />
                            ساخت Policy
                        </Button>
                        {policies.isLoading ? (
                            <Loading />
                        ) : policies.data?.data.length ? (
                            <div className="space-y-2">
                                {policies.data.data.map((p) => (
                                    <div
                                        key={p.id}
                                        className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <div className="font-medium">{p.name}</div>
                                            <div className="text-muted-foreground text-xs">
                                                نسخه رکورد {p.version} · نسخه فعال {p.active_version ?? "—"}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">{statusLabel(p.status)}</Badge>
                                            {p.status !== "active" && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={!can}
                                                    onClick={() =>
                                                        m.activatePolicy.mutate({ id: p.id, version: p.active_version ?? 1 })
                                                    }
                                                >
                                                    فعال‌سازی v{p.active_version ?? 1}
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                disabled={!can}
                                                onClick={() =>
                                                    m.versionPolicy.mutate({
                                                        id: p.id,
                                                        max_results: Number(maxResults),
                                                        typo_tolerance: typo,
                                                        typo_max_edits: typo ? 1 : 0,
                                                        ranking_weights: { lexical: 1, availability: 0.2 },
                                                        reason: "نسخه جدید از مرکز حاکمیت",
                                                        expected_version: p.version,
                                                    })
                                                }
                                            >
                                                نسخه جدید
                                            </Button>
                                            {p.status === "active" && p.active_version && p.active_version > 1 ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={!can}
                                                    onClick={() =>
                                                        m.rollbackPolicy.mutate({ id: p.id, version: p.active_version! - 1 })
                                                    }
                                                >
                                                    بازگشت به v{p.active_version - 1}
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Empty
                                title="Policy ثبت نشده"
                                description="بدون Policy فعال، موتور از تنظیمات امن پیش‌فرض استفاده می‌کند."
                            />
                        )}
                        <Pager
                            page={policyPage}
                            setPage={setPolicyPage}
                            meta={policies.data?.meta}
                            fetching={policies.isFetching}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
