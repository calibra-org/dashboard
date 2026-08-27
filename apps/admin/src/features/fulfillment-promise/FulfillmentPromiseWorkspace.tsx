"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { Boxes, CalendarClock, ChartNoAxesCombined, type Package, ShieldCheck, Sparkles } from "#/icons";
import {
    type AllocationRecommendation,
    type FulfillmentNode,
    type FulfillmentPromiseAccessRow,
    type FulfillmentPromiseOverview,
    type FulfillmentPromiseRow,
    type FulfillmentServiceProfile,
    type PromiseAccuracy,
    useFulfillmentPromiseMutation,
    useFulfillmentPromiseResource,
} from "#/lib/queries/fulfillment-promise";

type Tab = "overview" | "nodes" | "services" | "promises" | "allocations" | "access";
const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "نمای کلی" },
    { key: "nodes", label: "گره‌ها و ظرفیت" },
    { key: "services", label: "کالیبراسیون سرویس" },
    { key: "promises", label: "شواهد وعده" },
    { key: "allocations", label: "تخصیص پیشنهادی" },
    { key: "access", label: "دسترسی" },
];
const number = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const money = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const dateTime = (value: string | null | undefined) =>
    value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function MetricCard({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof Package }) {
    return (
        <Card className="relative overflow-hidden border-border/70 p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-muted-foreground text-xs">{title}</p>
                    <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
                </div>
                <div className="rounded-xl border bg-primary/5 p-2.5 text-primary">
                    <Icon className="size-5" />
                </div>
            </div>
            <p className="mt-3 text-muted-foreground text-xs leading-5">{hint}</p>
        </Card>
    );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Label>{label}</Label>
                {hint ? <HelperTooltip text={hint} /> : null}
            </div>
            {children}
        </div>
    );
}
function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
            <Sparkles className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-muted-foreground text-sm">{body}</p>
        </div>
    );
}
function ErrorState({ message }: { message: string }) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">{message}</div>;
}
function Pill({ children }: { children: ReactNode }) {
    return <span className="inline-flex rounded-full border bg-muted/50 px-2.5 py-1 font-medium text-[11px]">{children}</span>;
}

export function FulfillmentPromiseWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const overview = useFulfillmentPromiseResource<FulfillmentPromiseOverview>("overview");
    const nodes = useFulfillmentPromiseResource<FulfillmentNode[]>("nodes", tab === "nodes" || tab === "overview");
    const services = useFulfillmentPromiseResource<FulfillmentServiceProfile[]>(
        "service-profiles",
        tab === "services" || tab === "overview",
    );
    const promises = useFulfillmentPromiseResource<FulfillmentPromiseRow[]>(
        "promises?limit=100",
        tab === "promises" || tab === "overview",
    );
    const allocations = useFulfillmentPromiseResource<AllocationRecommendation[]>("allocations?limit=100", tab === "allocations");
    const accuracy = useFulfillmentPromiseResource<PromiseAccuracy>("accuracy", tab === "overview" || tab === "promises");
    const access = useFulfillmentPromiseResource<FulfillmentPromiseAccessRow[]>("access", tab === "access");
    const post = useFulfillmentPromiseMutation<Record<string, unknown>>();
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const run = (path: string, body: Record<string, unknown>) => {
        setMessage("");
        setError("");
        post.mutate(
            { path, body },
            { onSuccess: () => setMessage("تغییر با موفقیت و با ممیزی کامل ثبت شد."), onError: (err) => setError(err.message) },
        );
    };
    const accuracyChart = useMemo(
        () =>
            (accuracy.data?.outcomes ?? [])
                .slice(0, 40)
                .reverse()
                .map((row, index) => ({
                    name: `${index + 1}`,
                    lateness: Number(row.lateness_minutes ?? 0),
                    confidence: Math.round(Number(row.confidence_bps ?? 0) / 100),
                })),
        [accuracy.data],
    );

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="وعده تحویل و شبکه تأمین محلی"
                subtitle="وعده‌ای که فقط وقتی نمایش داده می‌شود که موجودی canonical تازه، ظرفیت واقعی و سرویس حمل کالیبره‌شده هم‌زمان آن را پشتیبانی کنند."
            />
            <Card className="relative overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-background to-muted/30 p-6 shadow-sm">
                <div className="absolute -start-24 -top-24 size-56 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs">
                            <CalendarClock className="size-4 text-primary" /> Phase 31 · Hyperlocal Promise
                        </div>
                        <h2 className="font-semibold text-2xl">قول دقیق‌تر، بدون ساختن حقیقت موازی</h2>
                        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-7">
                            موجودی، نرخ ارسال و اجرای fulfillment همان authorityهای فعلی Calibra می‌مانند. این لایه فقط promise،
                            ظرفیت، کالیبراسیون و recommendation قابل‌ممیزی می‌سازد و در checkout دوباره اعتبارسنجی می‌کند.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                            "موجودی stale = بدون وعده",
                            "ETA فقط با calibration",
                            "Trust قبل از Promise",
                            "Predicted vs actual",
                        ].map((item) => (
                            <div key={item} className="rounded-2xl border bg-background/70 p-3">
                                <ShieldCheck className="mb-2 size-4 text-primary" />
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
            </Card>
            <div className="flex flex-wrap gap-2 rounded-2xl border bg-muted/20 p-2">
                {tabs.map((item) => (
                    <Button
                        key={item.key}
                        type="button"
                        variant={tab === item.key ? "default" : "ghost"}
                        className="rounded-xl"
                        onClick={() => setTab(item.key)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>
            {message ? <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{message}</div> : null}
            {error ? <ErrorState message={error} /> : null}
            {tab === "overview" ? (
                <OverviewTab
                    overview={overview.data}
                    loading={overview.isLoading}
                    error={overview.error}
                    accuracy={accuracy.data}
                    chart={accuracyChart}
                />
            ) : null}
            {tab === "nodes" ? <NodesTab rows={nodes.data ?? []} run={run} /> : null}
            {tab === "services" ? <ServicesTab rows={services.data ?? []} nodes={nodes.data ?? []} run={run} /> : null}
            {tab === "promises" ? <PromisesTab rows={promises.data ?? []} accuracy={accuracy.data} run={run} /> : null}
            {tab === "allocations" ? <AllocationsTab rows={allocations.data ?? []} /> : null}
            {tab === "access" ? <AccessTab rows={access.data ?? []} run={run} /> : null}
        </div>
    );
}

function OverviewTab({
    overview,
    loading,
    error,
    accuracy,
    chart,
}: {
    overview?: FulfillmentPromiseOverview;
    loading: boolean;
    error: Error | null;
    accuracy?: PromiseAccuracy;
    chart: Array<{ name: string; lateness: number; confidence: number }>;
}) {
    if (loading)
        return (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {["nodes", "services", "promises", "accuracy"].map((key) => (
                    <Card key={key} className="h-36 animate-pulse bg-muted/30" />
                ))}
            </div>
        );
    if (error) return <ErrorState message={error.message} />;
    if (!overview)
        return (
            <EmptyState
                title="داده عملیاتی موجود نیست"
                body="بعد از تعریف گره، ظرفیت و کالیبراسیون واقعی، شاخص‌ها از API نمایش داده می‌شوند."
            />
        );
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="گره فعال"
                    value={number(overview.active_nodes)}
                    hint="انبار، فروشگاه یا hub فعال"
                    icon={Boxes}
                />
                <MetricCard
                    title="سرویس کالیبره"
                    value={number(overview.calibrated_services)}
                    hint="فقط پروفایل‌های دارای حداقل شواهد"
                    icon={ShieldCheck}
                />
                <MetricCard
                    title="وعده ۳۰ روز"
                    value={number(overview.promises_30d)}
                    hint="quoteهای واقعی؛ بدون demo metric"
                    icon={CalendarClock}
                />
                <MetricCard
                    title="دقت وعده"
                    value={overview.promise_accuracy_bps === null ? "—" : `${number(overview.promise_accuracy_bps / 100)}٪`}
                    hint={`${number(overview.on_time_promises)} به‌موقع از ${number(overview.measured_outcomes)} outcome`}
                    icon={ChartNoAxesCombined}
                />
            </div>
            <Card className="p-5">
                <div className="mb-5">
                    <h3 className="font-semibold">خطای وعده در برابر confidence</h3>
                    <p className="mt-1 text-muted-foreground text-xs">
                        هر ستون از outcome واقعی shipment؛ مقدار مثبت یعنی دیرتر از انتهای window.
                    </p>
                </div>
                {chart.length ? (
                    <div className="h-80" dir="ltr">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chart}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="lateness" name="lateness min" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyState
                        title="Outcome کافی نداریم"
                        body={
                            accuracy?.measured_outcomes
                                ? "Outcomeها هنوز برای نمودار آماده نشده‌اند."
                                : "پس از رویداد delivered، نمودار با داده واقعی ساخته می‌شود."
                        }
                    />
                )}
            </Card>
        </div>
    );
}

function NodesTab({ rows, run }: { rows: FulfillmentNode[]; run: (path: string, body: Record<string, unknown>) => void }) {
    const [form, setForm] = useState({
        node_code: "",
        name: "",
        node_type: "warehouse",
        timezone: "Asia/Tehran",
        country: "IR",
        handling_minutes: "60",
        stale: "15",
        reason: "تعریف گره عملیاتی",
    });
    return (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <Card className="overflow-hidden">
                <div className="border-b p-5">
                    <h3 className="font-semibold">گره‌های شبکه</h3>
                    <p className="mt-1 text-muted-foreground text-xs">
                        هر inventory item فقط یک source node دارد؛ quantity دوباره ذخیره نمی‌شود.
                    </p>
                </div>
                <div className="divide-y">
                    {rows.length ? (
                        rows.map((row) => (
                            <div key={row.public_id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]">
                                <div>
                                    <p className="font-medium">{row.name}</p>
                                    <p className="mt-1 text-muted-foreground text-xs">
                                        {row.node_code} · {row.city ?? row.country} · {row.timezone}
                                    </p>
                                </div>
                                <Pill>{row.node_type}</Pill>
                                <div className="text-xs">
                                    <span className="text-muted-foreground">stale:</span>{" "}
                                    {number(row.inventory_stale_after_minutes)} دقیقه
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-5">
                            <EmptyState title="گرهی تعریف نشده" body="اولین گره را با داده واقعی ایجاد کنید." />
                        </div>
                    )}
                </div>
            </Card>
            <Card className="p-5">
                <h3 className="font-semibold">افزودن گره</h3>
                <div className="mt-5 grid gap-4">
                    <Field label="کد پایدار">
                        <Input value={form.node_code} onChange={(e) => setForm({ ...form, node_code: e.target.value })} />
                    </Field>
                    <Field label="نام">
                        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="نوع">
                            <Select value={form.node_type} onValueChange={(v) => setForm({ ...form, node_type: String(v) })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="warehouse">انبار</SelectItem>
                                    <SelectItem value="store">فروشگاه</SelectItem>
                                    <SelectItem value="hub">هاب</SelectItem>
                                    <SelectItem value="cross_dock">Cross-dock</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="کشور">
                            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Handling دقیقه">
                            <Input
                                type="number"
                                value={form.handling_minutes}
                                onChange={(e) => setForm({ ...form, handling_minutes: e.target.value })}
                            />
                        </Field>
                        <Field label="Freshness دقیقه" hint="اگر inventory.updated_at قدیمی‌تر باشد، promise نمایش داده نمی‌شود.">
                            <Input
                                type="number"
                                value={form.stale}
                                onChange={(e) => setForm({ ...form, stale: e.target.value })}
                            />
                        </Field>
                    </div>
                    <Field label="دلیل تغییر">
                        <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    </Field>
                    <Button
                        onClick={() =>
                            run("nodes", {
                                node_code: form.node_code,
                                name: form.name,
                                node_type: form.node_type,
                                timezone: form.timezone,
                                country: form.country,
                                handling_minutes: Number(form.handling_minutes),
                                inventory_stale_after_minutes: Number(form.stale),
                                operating_hours: {},
                                metadata: {},
                                reason: form.reason,
                            })
                        }
                    >
                        ثبت گره
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function ServicesTab({
    rows,
    nodes,
    run,
}: {
    rows: FulfillmentServiceProfile[];
    nodes: FulfillmentNode[];
    run: (path: string, body: Record<string, unknown>) => void;
}) {
    const [node, setNode] = useState(nodes[0]?.public_id ?? "");
    const [shippingMethod, setShippingMethod] = useState("");
    const [p50, setP50] = useState("");
    const [p90, setP90] = useState("");
    const [samples, setSamples] = useState("");
    const [confidence, setConfidence] = useState("");
    return (
        <div className="space-y-6">
            <Card className="overflow-hidden">
                <div className="border-b p-5">
                    <h3 className="font-semibold">پروفایل‌های کالیبره‌شده</h3>
                </div>
                <div className="divide-y">
                    {rows.length ? (
                        rows.map((row) => (
                            <div key={row.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto_auto_auto]">
                                <div>
                                    <p className="font-medium">{row.node_name}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {row.method_title} · {row.method_code}
                                    </p>
                                </div>
                                <Pill>
                                    {number(row.calibration_sample_count)} / {number(row.minimum_sample_count)} نمونه
                                </Pill>
                                <Pill>
                                    p50 {number(row.transit_minutes_p50)}m · p90 {number(row.transit_minutes_p90)}m
                                </Pill>
                                <Pill>{number(row.confidence_bps / 100)}٪</Pill>
                            </div>
                        ))
                    ) : (
                        <div className="p-5">
                            <EmptyState
                                title="سرویس کالیبره نداریم"
                                body="بدون حداقل نمونه و timestamp کالیبراسیون، ETA قابل‌نمایش تولید نمی‌شود."
                            />
                        </div>
                    )}
                </div>
            </Card>
            <Card className="p-5">
                <h3 className="font-semibold">ثبت کالیبراسیون سرویس</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <Field label="گره">
                        <Select value={node} onValueChange={(value) => setNode(String(value))}>
                            <SelectTrigger>
                                <SelectValue placeholder="انتخاب گره" />
                            </SelectTrigger>
                            <SelectContent>
                                {nodes.map((item) => (
                                    <SelectItem key={item.public_id} value={item.public_id}>
                                        {item.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Shipping zone method ID">
                        <Input type="number" value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} />
                    </Field>
                    <Field label="p50 دقیقه">
                        <Input type="number" value={p50} onChange={(e) => setP50(e.target.value)} />
                    </Field>
                    <Field label="p90 دقیقه">
                        <Input type="number" value={p90} onChange={(e) => setP90(e.target.value)} />
                    </Field>
                    <Field label="تعداد نمونه">
                        <Input type="number" value={samples} onChange={(e) => setSamples(e.target.value)} />
                    </Field>
                    <Field label="Confidence bps">
                        <Input type="number" value={confidence} onChange={(e) => setConfidence(e.target.value)} />
                    </Field>
                </div>
                <Button
                    className="mt-4"
                    disabled={!node}
                    onClick={() =>
                        run(`nodes/${node}/service-profiles`, {
                            shipping_zone_method_id: Number(shippingMethod),
                            status: "active",
                            transit_minutes_p50: Number(p50),
                            transit_minutes_p90: Number(p90),
                            calibration_sample_count: Number(samples),
                            minimum_sample_count: 20,
                            confidence_bps: Number(confidence),
                            max_calibration_age_hours: 168,
                            last_calibrated_at: new Date().toISOString(),
                            service_weekdays: [1, 2, 3, 4, 5, 6, 7],
                            metadata: {},
                            reason: "به‌روزرسانی کالیبراسیون سرویس",
                        })
                    }
                >
                    ثبت کالیبراسیون
                </Button>
            </Card>
        </div>
    );
}

function PromisesTab({
    rows,
    accuracy,
    run,
}: {
    rows: FulfillmentPromiseRow[];
    accuracy?: PromiseAccuracy;
    run: (path: string, body: Record<string, unknown>) => void;
}) {
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-semibold">Promise evidence</h3>
                    <p className="text-muted-foreground text-xs">
                        window، confidence، source و constraints ثبت‌شده؛ نه تخمین نمایشی.
                    </p>
                </div>
                <Button variant="outline" onClick={() => run("outcomes/sync", {})}>
                    همگام‌سازی delivered outcomes
                </Button>
            </div>
            <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-muted-foreground text-xs">
                        <tr>
                            <th className="p-3 text-start">استراتژی</th>
                            <th className="p-3 text-start">پنجره</th>
                            <th className="p-3 text-start">Confidence</th>
                            <th className="p-3 text-start">هزینه</th>
                            <th className="p-3 text-start">وضعیت</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.public_id} className="border-t">
                                <td className="p-3">
                                    <Pill>{row.strategy}</Pill>
                                </td>
                                <td className="p-3">
                                    <div>{dateTime(row.window_start_at)}</div>
                                    <div className="text-muted-foreground text-xs">تا {dateTime(row.window_end_at)}</div>
                                </td>
                                <td className="p-3">{number(row.confidence_bps / 100)}٪</td>
                                <td className="p-3">
                                    {money(row.shipping_cost_minor)} {row.currency}
                                </td>
                                <td className="p-3">
                                    <Pill>{row.status}</Pill>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!rows.length ? (
                    <div className="p-5">
                        <EmptyState title="وعده ثبت نشده" body="API storefront فقط وقتی شواهد کافی باشد quote ثبت می‌کند." />
                    </div>
                ) : null}
            </Card>
            <Card className="p-5">
                <p className="font-medium">دقت اندازه‌گیری‌شده</p>
                <p className="mt-2 font-semibold text-3xl">
                    {accuracy?.accuracy_bps == null ? "—" : `${number(accuracy.accuracy_bps / 100)}٪`}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">{number(accuracy?.measured_outcomes)} outcome واقعی</p>
            </Card>
        </div>
    );
}

function AllocationsTab({ rows }: { rows: AllocationRecommendation[] }) {
    return (
        <Card className="overflow-x-auto">
            <div className="border-b p-5">
                <h3 className="font-semibold">Allocation recommendation</h3>
                <p className="mt-1 text-muted-foreground text-xs">
                    این جدول fulfillment truth نیست؛ پذیرش recommendation به‌تنهایی shipment یا fulfillment ایجاد نمی‌کند.
                </p>
            </div>
            <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground text-xs">
                    <tr>
                        <th className="p-3 text-start">سفارش</th>
                        <th className="p-3 text-start">استراتژی</th>
                        <th className="p-3 text-start">Score</th>
                        <th className="p-3 text-start">وضعیت</th>
                        <th className="p-3 text-start">زمان</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id} className="border-t">
                            <td className="p-3">#{number(row.order_id)}</td>
                            <td className="p-3">
                                <Pill>{row.strategy}</Pill>
                            </td>
                            <td className="p-3">{number(row.score_bps / 100)}٪</td>
                            <td className="p-3">
                                <Pill>{row.status}</Pill>
                            </td>
                            <td className="p-3">{dateTime(row.created_at)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {!rows.length ? (
                <div className="p-5">
                    <EmptyState
                        title="Recommendation نداریم"
                        body="پس از مصرف یک promise توسط سفارش، recommendation evidence ساخته می‌شود."
                    />
                </div>
            ) : null}
        </Card>
    );
}

function AccessTab({
    rows,
    run,
}: {
    rows: FulfillmentPromiseAccessRow[];
    run: (path: string, body: Record<string, unknown>) => void;
}) {
    return (
        <div className="space-y-4">
            {rows.map((row) => (
                <Card key={row.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="font-medium">{row.identity}</p>
                            <p className="mt-1 text-muted-foreground text-xs">
                                {Object.values(row.permissions).filter(Boolean).length} دسترسی فعال
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Select
                                onValueChange={(preset) =>
                                    run("access/preset", { user_id: row.id, preset, reason: "به‌روزرسانی سطح دسترسی Promise OS" })
                                }
                            >
                                <SelectTrigger className="w-44">
                                    <SelectValue placeholder="Preset" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="owner">Owner</SelectItem>
                                    <SelectItem value="operations">Operations</SelectItem>
                                    <SelectItem value="warehouse">Warehouse</SelectItem>
                                    <SelectItem value="logistics">Logistics</SelectItem>
                                    <SelectItem value="analyst">Analyst</SelectItem>
                                    <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </Card>
            ))}
            {!rows.length ? <EmptyState title="کاربر ادمین یافت نشد" body="Access API فقط هویت mask‌شده نمایش می‌دهد." /> : null}
        </div>
    );
}
