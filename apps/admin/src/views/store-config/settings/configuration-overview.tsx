"use client";

import { useLocale } from "next-intl";

import { ConfirmDialog } from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { ArrowLeft, Boxes, CheckCircle2, Clock3, History, RotateCcw, Settings2, ShieldCheck } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import {
    type ConfigurationRevision,
    type ConfigurationScope,
    useConfigurationHistory,
    useConfigurationRegistry,
    useRollbackConfigurationRevision,
} from "#/lib/queries/configuration";
import { cn } from "#/lib/utils";

const CATEGORIES = ["site", "commerce", "communications", "governance", "developer", "change_management"] as const;

export function ConfigurationOverview() {
    const locale = useLocale();
    const fa = locale === "fa";
    const registry = useConfigurationRegistry();
    const history = useConfigurationHistory();
    const rollback = useRollbackConfigurationRevision();

    const settingsCount = registry.data?.filter((item) => item.mode === "settings").length ?? 0;
    const linkedCount = registry.data?.filter((item) => item.mode !== "settings").length ?? 0;

    return (
        <div className="flex flex-col gap-7">
            <section className="grid gap-3 sm:grid-cols-3">
                <MetricCard icon={ShieldCheck} label={fa ? "پیکربندی قابل ویرایش" : "Editable configuration"} value={settingsCount} />
                <MetricCard icon={Boxes} label={fa ? "دامنه‌های متصل" : "Connected domains"} value={linkedCount} />
                <MetricCard icon={History} label={fa ? "نسخه‌های اخیر" : "Recent revisions"} value={history.data?.length ?? 0} />
            </section>

            <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{fa ? "مرکز پیکربندی" : "Configuration workspace"}</h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                            {fa
                                ? "تنظیمات سیاستی در این مرکز نسخه‌دار، قابل پیش‌نمایش و قابل بازگردانی هستند؛ مالیات، ارسال، پرداخت و کاتالوگ همچنان از دامنه‌های اصلی خود استفاده می‌کنند."
                                : "Policy settings are versioned, previewable and reversible here; tax, shipping, payments and catalog remain owned by their canonical domains."}
                        </p>
                    </div>
                    <Badge variant="secondary" className="gap-1.5">
                        <CheckCircle2 className="size-3.5" />
                        {fa ? "متصل به API واقعی" : "Live API connected"}
                    </Badge>
                </div>

                {registry.isPending ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="h-44 animate-pulse rounded-xl border bg-muted/35" />
                        ))}
                    </div>
                ) : registry.isError ? (
                    <StateCard text={fa ? "بارگذاری رجیستری پیکربندی ناموفق بود." : "Configuration registry could not be loaded."} />
                ) : (
                    <div className="space-y-6">
                        {CATEGORIES.map((category) => {
                            const items = registry.data?.filter((item) => item.category === category) ?? [];
                            if (items.length === 0) return null;
                            return (
                                <div key={category} className="space-y-2.5">
                                    <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {categoryLabel(category, fa)}
                                    </h3>
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {items.map((item) => (
                                            <Link
                                                key={item.key}
                                                href={item.href as never}
                                                className="group rounded-xl border bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/45 shadow-inner">
                                                        {item.mode === "settings" ? <Settings2 className="size-4" /> : <Boxes className="size-4" />}
                                                    </div>
                                                    <ArrowLeft
                                                        className={cn(
                                                            "size-4 text-muted-foreground transition-transform group-hover:-translate-x-1",
                                                            !fa && "rotate-180",
                                                        )}
                                                    />
                                                </div>
                                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                                    <h4 className="font-semibold">{fa ? item.label_fa : item.label_en}</h4>
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {modeLabel(item.mode, fa)}
                                                    </Badge>
                                                </div>
                                                <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
                                                    {fa ? item.description_fa : item.description_en}
                                                </p>
                                                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{item.definition_count.toLocaleString(locale)} {fa ? "تعریف" : "definitions"}</span>
                                                    {item.history_enabled ? (
                                                        <>
                                                            <span aria-hidden="true">•</span>
                                                            <History className="size-3.5" />
                                                            <span>{fa ? "تاریخچه نسخه" : "Revision history"}</span>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{fa ? "تغییرات اخیر" : "Recent changes"}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {fa
                                ? "بازگردانی تاریخچه را حذف نمی‌کند؛ یک نسخه جدید و قابل ممیزی ایجاد می‌شود."
                                : "Rollback never erases history; it appends a new auditable revision."}
                        </p>
                    </div>
                    <History className="size-5 text-muted-foreground" />
                </div>

                {rollback.isError ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {fa ? "بازگردانی انجام نشد؛ تنظیمات فعال بدون تغییر باقی ماند." : "Rollback failed; active configuration was left unchanged."}
                    </div>
                ) : null}

                {history.isPending ? (
                    <div className="h-44 animate-pulse rounded-xl border bg-muted/35" />
                ) : history.isError ? (
                    <StateCard text={fa ? "تاریخچه در دسترس نیست." : "History is unavailable."} />
                ) : history.data?.length === 0 ? (
                    <StateCard text={fa ? "هنوز نسخه‌ای ثبت نشده است." : "No configuration revision has been recorded yet."} />
                ) : (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{fa ? "آخرین نسخه‌ها" : "Latest revisions"}</CardTitle>
                            <CardDescription>{fa ? "جدیدترین تغییرات ابتدا نمایش داده می‌شوند." : "Newest revisions appear first."}</CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y p-0">
                            {history.data?.map((item) => (
                                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                            <Clock3 className="size-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">{scopeLabel(item.scope, fa)}</span>
                                                <Badge variant={item.source === "rollback" ? "outline" : "secondary"} className="text-[10px]">
                                                    {revisionSourceLabel(item.source, fa)}
                                                </Badge>
                                            </div>
                                            <p className="mt-0.5 max-w-xl truncate text-xs text-muted-foreground">
                                                {item.changed_keys.length > 0 ? item.changed_keys.join("، ") : fa ? "نسخه پایه" : "Baseline revision"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-left text-xs text-muted-foreground" dir="ltr">
                                            <div>r{item.revision}</div>
                                            <time dateTime={item.created_at}>
                                                {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}
                                            </time>
                                        </div>
                                        <RollbackAction
                                            item={item}
                                            fa={fa}
                                            pending={rollback.isPending}
                                            onRollback={() => rollback.mutate({ scope: item.scope, revision: item.revision })}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </section>
        </div>
    );
}

function RollbackAction({ item, fa, pending, onRollback }: { item: ConfigurationRevision; fa: boolean; pending: boolean; onRollback: () => void }) {
    return (
        <ConfirmDialog
            trigger={
                <Button variant="ghost" size="sm" disabled={pending} className="gap-1.5">
                    <RotateCcw className="size-3.5" />
                    <span className="hidden sm:inline">{fa ? "بازگردانی" : "Rollback"}</span>
                </Button>
            }
            title={fa ? `بازگردانی ${scopeLabel(item.scope, true)} به نسخه ${item.revision}؟` : `Restore ${scopeLabel(item.scope, false)} to revision ${item.revision}?`}
            description={
                fa
                    ? "مقادیر نسخه انتخابی دوباره روی تنظیمات فعال نوشته می‌شوند و یک نسخه بازگردانی جدید ساخته می‌شود."
                    : "The selected snapshot is restored and a new rollback revision is appended."
            }
            confirmLabel={fa ? "تأیید بازگردانی" : "Confirm rollback"}
            cancelLabel={fa ? "انصراف" : "Cancel"}
            isConfirming={pending}
            onConfirm={onRollback}
        />
    );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Settings2; label: string; value: number }) {
    return (
        <Card className="overflow-hidden">
            <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/45 shadow-inner">
                    <Icon className="size-4" />
                </div>
                <div>
                    <div className="text-xl font-semibold tabular-nums">{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function StateCard({ text }: { text: string }) {
    return <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function revisionSourceLabel(source: ConfigurationRevision["source"], fa: boolean) {
    if (source === "baseline") return fa ? "نسخه پایه" : "Baseline";
    if (source === "rollback") return fa ? "بازگردانی" : "Rollback";
    return fa ? "ویرایش" : "Update";
}

function modeLabel(mode: string, fa: boolean) {
    if (mode === "settings") return fa ? "تنظیمات" : "Settings";
    if (mode === "hybrid") return fa ? "متصل" : "Linked";
    return fa ? "دامنه اصلی" : "Canonical domain";
}

function categoryLabel(category: string, fa: boolean) {
    const labels: Record<string, [string, string]> = {
        site: ["سایت", "Site"],
        commerce: ["تجارت", "Commerce"],
        communications: ["ارتباطات", "Communications"],
        governance: ["حاکمیت", "Governance"],
        developer: ["توسعه‌دهنده", "Developer"],
        change_management: ["مدیریت تغییر", "Change Management"],
    };
    return labels[category]?.[fa ? 0 : 1] ?? category;
}

function scopeLabel(scope: ConfigurationScope, fa: boolean) {
    const labels: Partial<Record<ConfigurationScope, [string, string]>> = {
        general: ["همگانی", "General"],
        publishing: ["انتشار", "Publishing"],
        reading: ["خواندن", "Reading"],
        community: ["دیدگاه و جامعه", "Community"],
        media: ["رسانه", "Media"],
        urls: ["پیوندها", "URLs"],
        catalog: ["کاتالوگ", "Catalog"],
        inventory: ["موجودی", "Inventory"],
        tax: ["مالیات", "Tax"],
        shipping: ["ارسال", "Shipping"],
        payments: ["پرداخت", "Payments"],
        checkout: ["تسویه", "Checkout"],
        notifications: ["اعلان‌ها", "Notifications"],
        privacy: ["حریم خصوصی", "Privacy"],
        visibility: ["نمایانی", "Visibility"],
        integrations: ["یکپارچه‌سازی", "Integrations"],
        infrastructure: ["زیرساخت", "Infrastructure"],
        change_management: ["مدیریت تغییر", "Change Management"],
        datetime: ["تاریخ و زمان", "Date & Time"],
        branding: ["هویت بصری", "Branding"],
    };
    return labels[scope]?.[fa ? 0 : 1] ?? scope;
}
