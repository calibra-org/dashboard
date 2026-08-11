"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { Info, Settings2 } from "#/icons";
import { usePaymentGateway, useUpdatePaymentGateway } from "#/lib/queries/payments";
import { cn } from "#/lib/utils";

const FIELD_COPY: Record<string, { fa: string; en: string; hintFa?: string; hintEn?: string }> = {
    terminal_id: { fa: "شماره ترمینال", en: "Terminal ID" },
    username: { fa: "نام کاربری", en: "Username" },
    password: { fa: "رمز عبور", en: "Password" },
    merchant_id: { fa: "شماره پذیرنده / Merchant ID", en: "Merchant ID" },
    terminal_key: { fa: "کلید ترمینال", en: "Terminal key" },
    login_account: { fa: "رمز پذیرنده (Login Account)", en: "Login Account" },
    api_key: { fa: "کلید API", en: "API key" },
    card_number: { fa: "شماره کارت مقصد", en: "Destination card number" },
    card_holder: { fa: "نام صاحب کارت", en: "Card holder" },
    iban: { fa: "شماره شبا", en: "IBAN" },
};

const SECRET_KEYS = new Set(["password", "terminal_key", "login_account", "api_key", "merchant_id", "card_number"]);

export function PaymentGatewayDetailView({ code }: { code: string }) {
    const locale = useLocale() as Locale;
    const fa = locale === "fa";
    const { data: gateway, isLoading } = usePaymentGateway(code);
    const update = useUpdatePaymentGateway();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [enabled, setEnabled] = useState(false);
    const [ordering, setOrdering] = useState("0");
    const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        if (!gateway) return;
        setSettings(gateway.settings);
        setEnabled(gateway.enabled);
        setOrdering(String(gateway.ordering));
    }, [gateway]);

    const missingOnForm = useMemo(() => {
        if (!gateway) return [];
        return gateway.credentialFields
            .filter((field) => field.required)
            .filter((field) => {
                const value = settings[field.key]?.trim() ?? "";
                return value.length === 0;
            })
            .map((field) => field.key);
    }, [gateway, settings]);

    if (isLoading || gateway === undefined) {
        return (
            <section className="flex flex-col gap-6">
                <Skeleton className="h-16 w-full rounded-lg" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Skeleton className="h-96 w-full rounded-xl lg:col-span-2" />
                    <Skeleton className="h-80 w-full rounded-xl" />
                </div>
            </section>
        );
    }

    if (gateway === null) {
        return (
            <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
                {fa ? "درگاه پیدا نشد." : "Gateway not found."}
            </div>
        );
    }

    const stub = gateway.implementationStatus === "stub";
    const enableBlocked = stub || missingOnForm.length > 0;

    async function save() {
        if (!gateway) return;
        setMessage(null);
        try {
            await update.mutateAsync({
                id: gateway.id,
                enabled: enabled && !enableBlocked,
                ordering: Number(ordering) || 0,
                settings,
            });
            setMessage({ tone: "success", text: fa ? "پیکربندی امن درگاه ذخیره شد." : "Secure gateway configuration saved." });
        } catch {
            setMessage({
                tone: "error",
                text: fa
                    ? "ذخیره پیکربندی ناموفق بود. اطلاعات پذیرنده و وضعیت Adapter را بررسی کنید."
                    : "Configuration save failed. Check merchant credentials and adapter status.",
            });
        }
    }

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title={gateway.title[locale]}
                subtitle={gateway.description[locale]}
                actions={
                    <Button onClick={save} disabled={update.isPending}>
                        {update.isPending ? (fa ? "در حال ذخیره…" : "Saving…") : fa ? "ذخیره پیکربندی" : "Save configuration"}
                    </Button>
                }
            />

            {message ? (
                <div
                    className={cn(
                        "rounded-lg border px-4 py-3 text-sm",
                        message.tone === "error"
                            ? "border-destructive/30 bg-destructive/5 text-destructive"
                            : "border-success/40 bg-success/10",
                    )}
                >
                    {message.text}
                </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>{fa ? "وضعیت و نمایش در صفحه پرداخت" : "Checkout availability"}</CardTitle>
                            <CardDescription>
                                {fa
                                    ? "چند درگاه می‌توانند هم‌زمان فعال باشند. درگاه بدون Adapter واقعی یا اطلاعات پذیرنده کامل فعال نمی‌شود."
                                    : "Multiple gateways may be active at once. A gateway without a real adapter or complete merchant credentials cannot be enabled."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5 md:grid-cols-2">
                            <div className="flex items-center justify-between rounded-lg border p-4 md:col-span-2">
                                <div>
                                    <Label htmlFor={`enabled-${gateway.code}`} className="font-medium text-sm">
                                        {fa ? "فعال در پرداخت" : "Enabled at checkout"}
                                    </Label>
                                    <p className="mt-1 text-muted-foreground text-xs">
                                        {enableBlocked
                                            ? fa
                                                ? "ابتدا الزامات پیکربندی را تکمیل کنید."
                                                : "Complete configuration requirements first."
                                            : fa
                                              ? "این روش به مشتری نمایش داده می‌شود."
                                              : "Customers will see this payment method."}
                                    </p>
                                </div>
                                <Switch
                                    id={`enabled-${gateway.code}`}
                                    checked={enabled && !enableBlocked}
                                    disabled={enableBlocked}
                                    onCheckedChange={setEnabled}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="gateway-ordering">{fa ? "اولویت نمایش" : "Checkout order"}</Label>
                                <Input
                                    id="gateway-ordering"
                                    inputMode="numeric"
                                    value={ordering}
                                    onChange={(event) => setOrdering(event.target.value.replace(/\D/g, ""))}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label>{fa ? "کد داخلی Adapter" : "Adapter code"}</Label>
                                <Input value={gateway.code} readOnly className="font-mono" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{fa ? "اطلاعات اتصال پذیرنده" : "Merchant connection credentials"}</CardTitle>
                            <CardDescription>
                                {fa
                                    ? "مقادیر محرمانه پس از ذخیره با رمزنگاری authenticated در پایگاه داده نگهداری و در خواندن مجدد فقط به‌صورت ماسک نمایش داده می‌شوند."
                                    : "Sensitive values are stored with authenticated encryption and are returned only as masks."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            {gateway.credentialFields.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm md:col-span-2">
                                    {stub
                                        ? fa
                                            ? "فیلدهای پذیرنده تا دریافت مستندات رسمی این سرویس تعریف نمی‌شوند."
                                            : "Merchant fields stay undefined until official provider documentation is available."
                                        : fa
                                          ? "این روش به اطلاعات اتصال خارجی نیاز ندارد."
                                          : "This method does not require remote merchant credentials."}
                                </div>
                            ) : (
                                gateway.credentialFields.map((field) => {
                                    const copy = FIELD_COPY[field.key] ?? { fa: field.key, en: field.key };
                                    const value = settings[field.key] ?? "";
                                    return (
                                        <div key={field.key} className="flex flex-col gap-2">
                                            <Label htmlFor={`gateway-${field.key}`}>
                                                {copy[locale]}
                                                {field.required ? <span className="ms-1 text-destructive">*</span> : null}
                                            </Label>
                                            <Input
                                                id={`gateway-${field.key}`}
                                                type={SECRET_KEYS.has(field.key) ? "password" : "text"}
                                                autoComplete="off"
                                                spellCheck={false}
                                                value={value}
                                                onFocus={(event) => {
                                                    if (event.currentTarget.value === "***")
                                                        setSettings((current) => ({ ...current, [field.key]: "" }));
                                                }}
                                                onChange={(event) =>
                                                    setSettings((current) => ({ ...current, [field.key]: event.target.value }))
                                                }
                                                placeholder={value === "***" ? "••••••••" : undefined}
                                            />
                                            <p className="text-[11px] text-muted-foreground">
                                                {value === "***"
                                                    ? fa
                                                        ? "مقدار قبلی محفوظ است؛ برای تغییر، مقدار جدید را وارد کنید."
                                                        : "Existing value is preserved; type a new value to replace it."
                                                    : copy.hintFa && fa
                                                      ? copy.hintFa
                                                      : copy.hintEn && !fa
                                                        ? copy.hintEn
                                                        : null}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    {stub ? (
                        <Card className="border-warning/40">
                            <CardContent className="flex gap-3 p-5 text-sm leading-6">
                                <Info className="mt-1 size-4 shrink-0" aria-hidden="true" />
                                <div>
                                    <p className="font-medium">
                                        {fa ? "فعال‌سازی عمداً قفل است" : "Activation is intentionally locked"}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        {fa
                                            ? "کالیبرا برای این سرویس Adapter ساختگی تولید نمی‌کند. پس از دریافت قرارداد/مستندات Merchant رسمی و تست Sandbox، Adapter در یک تغییر مستقل به حالت عملیاتی ارتقا داده می‌شود."
                                            : "Calibra never fabricates a provider adapter. Once official merchant documentation and sandbox validation are available, the adapter can be promoted in a dedicated change."}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>

                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">{fa ? "سلامت اتصال" : "Connection health"}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4 text-sm">
                            <StatusRow
                                label={fa ? "Adapter" : "Adapter"}
                                value={
                                    gateway.implementationStatus === "stub"
                                        ? fa
                                            ? "قفل"
                                            : "Locked"
                                        : gateway.implementationStatus === "implemented"
                                          ? fa
                                              ? "پیاده‌سازی‌شده"
                                              : "Implemented"
                                          : fa
                                            ? "عملیاتی"
                                            : "Live"
                                }
                                tone={gateway.implementationStatus === "stub" ? "warning" : "success"}
                            />
                            <StatusRow
                                label={fa ? "پیکربندی" : "Configuration"}
                                value={healthLabel(gateway.healthStatus, fa)}
                                tone={
                                    gateway.healthStatus === "error"
                                        ? "danger"
                                        : gateway.healthStatus === "healthy"
                                          ? "success"
                                          : "neutral"
                                }
                            />
                            <StatusRow
                                label={fa ? "صفحه پرداخت" : "Checkout"}
                                value={gateway.enabled ? (fa ? "فعال" : "Enabled") : fa ? "غیرفعال" : "Disabled"}
                                tone={gateway.enabled ? "success" : "neutral"}
                            />
                            {gateway.lastError ? (
                                <div className="rounded-md bg-destructive/5 p-3 text-destructive text-xs">
                                    {gateway.lastError}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">{fa ? "امنیت اطلاعات" : "Credential security"}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-muted-foreground text-xs leading-5">
                            <SecurityLine>
                                {fa
                                    ? "رمزنگاری ChaCha20-Poly1305 با Purpose اختصاصی هر درگاه"
                                    : "ChaCha20-Poly1305 encryption with per-gateway purpose binding"}
                            </SecurityLine>
                            <SecurityLine>
                                {fa
                                    ? "Secretها در پاسخ API، لاگ و UI برگردانده نمی‌شوند"
                                    : "Secrets are never returned through API, logs or UI"}
                            </SecurityLine>
                            <SecurityLine>
                                {fa
                                    ? "Callbackها با Idempotency، Amount Guard و Lock سفارش محافظت می‌شوند"
                                    : "Callbacks are protected by idempotency, amount guards and order locks"}
                            </SecurityLine>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="flex items-start gap-3 p-5 text-muted-foreground text-xs leading-5">
                            <Settings2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <p>
                                {fa
                                    ? "بعد از دریافت اطلاعات پذیرنده از بانک/PSP، آن‌ها را فقط در همین صفحه وارد کنید. هیچ Secret واقعی نباید داخل سورس، فایل تنظیمات عمومی یا توضیحات سفارش ثبت شود."
                                    : "Enter merchant credentials only on this screen. Never put live secrets in source code, public configuration files, or order notes."}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </section>
    );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <StatusBadge tone={tone}>{value}</StatusBadge>
        </div>
    );
}

function SecurityLine({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden="true" />
            <span>{children}</span>
        </div>
    );
}

function healthLabel(status: "unconfigured" | "configured" | "healthy" | "error", fa: boolean): string {
    if (status === "healthy") return fa ? "تاییدشده" : "Verified";
    if (status === "configured") return fa ? "پیکربندی‌شده" : "Configured";
    if (status === "error") return fa ? "خطا" : "Error";
    return fa ? "تکمیل نشده" : "Incomplete";
}
