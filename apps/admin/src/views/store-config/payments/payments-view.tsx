"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useMemo, useState } from "react";

import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { ArrowUpRight, Banknote, Info, Settings2 } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import {
    type AdminPaymentGateway,
    type PaymentGatewayCategory,
    useBulkUpdatePaymentGateways,
    usePaymentGateways,
    useUpdatePaymentGateway,
} from "#/lib/queries/payments";
import { cn } from "#/lib/utils";

const BRAND_MARKS: Record<string, string> = {
    mellat: "ملت",
    sadad: "سداد",
    parsian: "پارسیان",
    zarinpal: "زرین",
    bitpay: "Bit",
    digipay: "Digi",
    snapppay: "Snapp",
    azkivam: "Azki",
    card_to_card: "کارت",
    cod: "COD",
};

const CATEGORY_ORDER: PaymentGatewayCategory[] = ["bank", "psp", "bnpl", "offline"];

function gatewayCanEnable(gateway: AdminPaymentGateway): boolean {
    return gateway.implementationStatus !== "stub" && gateway.healthStatus !== "unconfigured";
}

function healthTone(gateway: AdminPaymentGateway): "success" | "warning" | "danger" | "neutral" {
    if (gateway.implementationStatus === "stub") return "warning";
    if (gateway.healthStatus === "healthy") return "success";
    if (gateway.healthStatus === "error") return "danger";
    return "neutral";
}

export function PaymentsView() {
    const locale = useLocale() as Locale;
    const fa = locale === "fa";
    const { data, isLoading, isError, refetch } = usePaymentGateways();
    const update = useUpdatePaymentGateway();
    const bulk = useBulkUpdatePaymentGateways();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<PaymentGatewayCategory | "all">("all");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

    const visible = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase(locale);
        return (data ?? []).filter((gateway) => {
            if (category !== "all" && gateway.category !== category) return false;
            if (!needle) return true;
            return `${gateway.title[locale]} ${gateway.description[locale]} ${gateway.code}`
                .toLocaleLowerCase(locale)
                .includes(needle);
        });
    }, [category, data, locale, query]);

    const selectedRows = (data ?? []).filter((gateway) => selected.has(gateway.id));
    const bulkEnableBlocked = selectedRows.some((gateway) => !gatewayCanEnable(gateway));
    const activeCount = (data ?? []).filter((gateway) => gateway.enabled).length;
    const healthyCount = (data ?? []).filter((gateway) => gateway.healthStatus === "healthy").length;
    const configuredCount = (data ?? []).filter(
        (gateway) => gateway.healthStatus === "configured" || gateway.healthStatus === "healthy",
    ).length;

    function toggleSelected(id: number) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function toggleGateway(gateway: AdminPaymentGateway, enabled: boolean) {
        setMessage(null);
        try {
            await update.mutateAsync({ id: gateway.id, enabled });
            setMessage({ tone: "success", text: fa ? "وضعیت درگاه ذخیره شد." : "Gateway status saved." });
        } catch {
            setMessage({
                tone: "error",
                text: fa
                    ? "تغییر وضعیت درگاه انجام نشد. پیکربندی را بررسی کنید."
                    : "Gateway update failed. Check its configuration.",
            });
        }
    }

    async function applyBulk(enabled: boolean) {
        if (selectedRows.length === 0) return;
        if (enabled && bulkEnableBlocked) {
            setMessage({
                tone: "error",
                text: fa
                    ? "در انتخاب فعلی درگاهی وجود دارد که هنوز Adapter واقعی یا اطلاعات پذیرنده کامل ندارد."
                    : "The selection contains a gateway without a real adapter or complete merchant credentials.",
            });
            return;
        }
        setMessage(null);
        try {
            await bulk.mutateAsync({ ids: selectedRows.map((gateway) => gateway.id), enabled });
            setSelected(new Set());
            setMessage({ tone: "success", text: fa ? "تغییر گروهی درگاه‌ها ذخیره شد." : "Bulk gateway update saved." });
        } catch {
            setMessage({
                tone: "error",
                text: fa
                    ? "بخشی از تغییر گروهی انجام نشد؛ وضعیت سرور دوباره بارگذاری شد."
                    : "A bulk update failed; server state was refreshed.",
            });
        }
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {["a", "b", "c", "d", "e", "f"].map((row) => (
                    <Skeleton key={row} className="h-56 w-full rounded-xl" />
                ))}
            </div>
        );
    }

    if (isError || data === undefined) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-14 text-center">
                <p className="text-muted-foreground text-sm">
                    {fa ? "بارگذاری درگاه‌ها با خطا مواجه شد." : "Failed to load payment gateways."}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                    {fa ? "تلاش مجدد" : "Retry"}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <SummaryCard
                    label={fa ? "درگاه‌های قابل مدیریت" : "Managed gateways"}
                    value={String(data.length)}
                    hint={fa ? "کاتالوگ تاییدشده کالیبرا" : "Calibra curated catalog"}
                />
                <SummaryCard
                    label={fa ? "فعال در پرداخت" : "Active at checkout"}
                    value={String(activeCount)}
                    hint={fa ? "امکان فعال‌سازی چند مورد" : "Multiple methods supported"}
                />
                <SummaryCard
                    label={fa ? "پیکربندی‌شده" : "Configured"}
                    value={String(configuredCount)}
                    hint={`${healthyCount} ${fa ? "اتصال تاییدشده" : "verified"}`}
                />
                <SummaryCard
                    label={fa ? "حفاظت اطلاعات پذیرنده" : "Merchant secret protection"}
                    value={fa ? "رمزنگاری" : "Encrypted"}
                    hint={fa ? "ChaCha20-Poly1305 + Mask-on-read" : "ChaCha20-Poly1305 + mask-on-read"}
                />
            </div>

            <Card>
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Banknote className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={fa ? "جستجوی درگاه یا روش پرداخت…" : "Search gateways…"}
                            className="max-w-md"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <FilterButton active={category === "all"} onClick={() => setCategory("all")}>
                            {fa ? "همه" : "All"}
                        </FilterButton>
                        {CATEGORY_ORDER.map((item) => (
                            <FilterButton key={item} active={category === item} onClick={() => setCategory(item)}>
                                {categoryLabel(item, fa)}
                            </FilterButton>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {selectedRows.length > 0 ? (
                <div className="sticky top-3 z-20 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="font-medium text-sm">
                            {fa ? `${selectedRows.length} درگاه انتخاب شده` : `${selectedRows.length} gateways selected`}
                        </p>
                        {bulkEnableBlocked ? (
                            <p className="mt-1 text-muted-foreground text-xs">
                                {fa
                                    ? "برای فعال‌سازی گروهی، همه موارد باید Adapter واقعی و پیکربندی کامل داشته باشند."
                                    : "Bulk activation requires a real adapter and complete configuration for every selection."}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={bulk.isPending} onClick={() => applyBulk(false)}>
                            {fa ? "غیرفعال‌سازی انتخاب‌ها" : "Disable selected"}
                        </Button>
                        <Button size="sm" disabled={bulk.isPending || bulkEnableBlocked} onClick={() => applyBulk(true)}>
                            {fa ? "فعال‌سازی انتخاب‌ها" : "Enable selected"}
                        </Button>
                    </div>
                </div>
            ) : null}

            {message ? (
                <div
                    className={cn(
                        "rounded-lg border px-4 py-3 text-sm",
                        message.tone === "error"
                            ? "border-destructive/30 bg-destructive/5 text-destructive"
                            : "border-success/40 bg-success/10 text-foreground",
                    )}
                >
                    {message.text}
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {visible.map((gateway) => {
                    const canEnable = gatewayCanEnable(gateway);
                    return (
                        <Card
                            key={gateway.id}
                            className={cn(
                                "overflow-hidden transition-shadow hover:shadow-sm",
                                selected.has(gateway.id) && "ring-1 ring-primary/40",
                            )}
                        >
                            <CardContent className="flex h-full flex-col gap-5 p-5">
                                <div className="flex items-start gap-4">
                                    <label className="mt-1 inline-flex size-5 shrink-0 items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(gateway.id)}
                                            onChange={() => toggleSelected(gateway.id)}
                                            className="size-4 rounded border-input accent-primary"
                                            aria-label={fa ? `انتخاب ${gateway.title.fa}` : `Select ${gateway.title.en}`}
                                        />
                                    </label>
                                    <BrandMark code={gateway.code} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-semibold">{gateway.title[locale]}</h3>
                                            <StatusBadge tone={healthTone(gateway)}>
                                                {gatewayStatusLabel(gateway, fa)}
                                            </StatusBadge>
                                        </div>
                                        <p className="mt-1 text-muted-foreground text-sm leading-6">
                                            {gateway.description[locale]}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/35 p-3 text-xs">
                                    <Meta label={fa ? "نوع" : "Type"} value={categoryLabel(gateway.category, fa)} />
                                    <Meta label={fa ? "وضعیت فنی" : "Adapter"} value={implementationLabel(gateway, fa)} />
                                    <Meta label={fa ? "اولویت پرداخت" : "Checkout order"} value={String(gateway.ordering)} />
                                    <Meta
                                        label={fa ? "بازگشت وجه" : "Refund"}
                                        value={gateway.supportsRefunds ? (fa ? "پشتیبانی" : "Supported") : fa ? "—" : "—"}
                                    />
                                </div>

                                {gateway.implementationStatus === "stub" ? (
                                    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-muted-foreground text-xs leading-5">
                                        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                        <span>
                                            {fa
                                                ? "این روش در کاتالوگ نمایش داده می‌شود اما تا دریافت مستندات رسمی پذیرنده و تست Sandbox اجازه فعال‌شدن ندارد؛ هیچ اتصال نمایشی ساخته نشده است."
                                                : "Visible in the catalog, but activation stays locked until official merchant documentation and sandbox validation exist. No fake integration is exposed."}
                                        </span>
                                    </div>
                                ) : gateway.healthStatus === "unconfigured" ? (
                                    <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-muted-foreground text-xs leading-5">
                                        <Settings2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                        <span>
                                            {fa
                                                ? "برای فعال‌سازی، ابتدا اطلاعات پذیرنده این درگاه را در صفحه پیکربندی ثبت کنید."
                                                : "Enter this gateway's merchant credentials before activation."}
                                        </span>
                                    </div>
                                ) : null}

                                <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={gateway.enabled}
                                            disabled={update.isPending || (!gateway.enabled && !canEnable)}
                                            onCheckedChange={(checked) => toggleGateway(gateway, checked)}
                                            aria-label={fa ? `فعال‌سازی ${gateway.title.fa}` : `Enable ${gateway.title.en}`}
                                        />
                                        <span className="font-medium text-sm">
                                            {gateway.enabled ? (fa ? "فعال" : "Enabled") : fa ? "غیرفعال" : "Disabled"}
                                        </span>
                                    </div>
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/payments/${gateway.code}` as never}>
                                            {fa ? "پیکربندی" : "Configure"}
                                            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                                        </Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {visible.length === 0 ? (
                <div className="rounded-xl border border-dashed py-14 text-center text-muted-foreground text-sm">
                    {fa ? "درگاهی با این فیلتر پیدا نشد." : "No gateways match this filter."}
                </div>
            ) : null}
        </div>
    );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-2 font-semibold text-xl tracking-tight">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
            </CardContent>
        </Card>
    );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
            {children}
        </Button>
    );
}

function BrandMark({ code }: { code: string }) {
    return (
        <div
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background font-bold text-xs tracking-tight shadow-xs"
            aria-hidden="true"
        >
            {BRAND_MARKS[code] ?? code.slice(0, 4).toUpperCase()}
        </div>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-medium text-foreground">{value}</div>
        </div>
    );
}

function categoryLabel(category: PaymentGatewayCategory, fa: boolean): string {
    const faLabels: Record<PaymentGatewayCategory, string> = {
        bank: "بانکی مستقیم",
        psp: "پرداخت‌یار",
        bnpl: "اعتباری / BNPL",
        offline: "آفلاین",
        legacy: "قدیمی",
    };
    const enLabels: Record<PaymentGatewayCategory, string> = {
        bank: "Direct bank",
        psp: "PSP",
        bnpl: "BNPL",
        offline: "Offline",
        legacy: "Legacy",
    };
    return (fa ? faLabels : enLabels)[category];
}

function gatewayStatusLabel(gateway: AdminPaymentGateway, fa: boolean): string {
    if (gateway.implementationStatus === "stub") return fa ? "قفل تا اتصال رسمی" : "Locked pending official integration";
    if (gateway.healthStatus === "healthy") return fa ? "متصل و تاییدشده" : "Verified connection";
    if (gateway.healthStatus === "error") return fa ? "خطای اتصال" : "Connection error";
    if (gateway.healthStatus === "configured") return fa ? "پیکربندی‌شده" : "Configured";
    return fa ? "نیازمند پیکربندی" : "Needs configuration";
}

function implementationLabel(gateway: AdminPaymentGateway, fa: boolean): string {
    if (gateway.implementationStatus === "live") return fa ? "عملیاتی" : "Live";
    if (gateway.implementationStatus === "implemented") return fa ? "Adapter واقعی" : "Real adapter";
    return fa ? "بدون Adapter" : "No adapter";
}
