"use client";

import { type ReactNode, useState } from "react";

import { StatusBadge, type StatusTone } from "#/components/StatusBadge";
import { ConfirmDialog } from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { Activity, CircleGauge, History, LockKeyhole, RefreshCw, Send, ShieldAlert, ShieldCheck } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import { useIdentityMutation, useIdentityResource } from "#/lib/queries/identity";

export type IdentitySection =
    | "overview"
    | "verifications"
    | "methods"
    | "policies"
    | "providers"
    | "delivery"
    | "risk"
    | "credentials"
    | "sessions"
    | "step-up"
    | "audit"
    | "analytics"
    | "settings"
    | "sms-settings";

interface AnyRecord {
    id?: number | string;
    public_id?: string;
    purpose?: string;
    method?: string;
    channel?: string;
    identifier?: string | null;
    status?: string;
    risk_score?: number;
    action_scope?: string | null;
    expires_at?: string | null;
    verified_at?: string | null;
    created_at?: string | null;
    event_type?: string;
    score?: number;
    decision?: string;
    reasons?: string[];
    recent_risk_events?: AnyRecord[];
    kpis?: Record<string, number | null | undefined>;
    key?: string;
    label?: string | null;
    enabled?: boolean;
    phishing_resistant?: boolean;
    providers?: number;
    policy_key?: string;
    version?: number;
    methods?: string[];
    provider_key?: string;
    driver?: string;
    credential_configured?: boolean;
    health_state?: string;
    priority?: number;
    attempts_24h?: number;
    delivered_24h?: number;
    failed_24h?: number;
    delivery_rate?: number | null;
    average_latency_ms?: number | null;
    cost_minor_24h?: number;
    subject_hash?: string | null;
    type?: string;
    last_used_at?: string | null;
    revoked_at?: string | null;
    device_label?: string | null;
    user_agent?: string | null;
    ip_masked?: string | null;
    auth_method?: string;
    last_seen_at?: string | null;
    active?: boolean;
    user_id?: number | null;
    actor_user_id?: number | null;
    outcome?: string;
    severity?: string;
    request_id?: string | null;
    provider_attempts?: number;
    delivery_confirmed?: number;
    provider_cost_minor?: number;
    verification_methods?: AnyRecord[];
    requested?: number;
    verified?: number;
    success_rate?: number | null;
    identity?: string;
    permissions?: Record<string, boolean>;
    passkeys?: boolean;
    totp_enrollment?: boolean;
    recovery_codes_generation?: boolean;
    sms_enabled?: boolean;
    daily_send_limit?: number;
    daily_spend_limit_minor?: number;
    per_identifier_10m_limit?: number;
    per_ip_10m_limit?: number;
    per_device_10m_limit?: number;
    resend_10m_limit?: number;
    resend_cooldown_seconds?: number;
    [key: string]: unknown;
}

const COPY = {
    eyebrow: "مرکز هویت و امنیت",
    refresh: "به‌روزرسانی",
    stepUpAction: "اثبات مجدد هویت",
    evidenceTitle: "داده‌های مبتنی بر شواهد",
    evidenceHelp: "وضعیت Provider، تحویل، هزینه و سلامت فقط زمانی نمایش داده می‌شود که شواهد واقعی در ledger ثبت شده باشد.",
    evidenceBody:
        "برای جلوگیری از اعتماد کاذب، وضعیت نامشخص با خط تیره یا برچسب نامشخص نمایش داده می‌شود و هیچ Healthy یا Delivered ساختگی تولید نمی‌شود.",
    riskRecent: "رویدادهای ریسک اخیر",
    todayActions: "اقدام‌های پیشنهادی",
    verificationLedger: "دفتر تراکنش‌های تأیید",
    empty: "داده‌ای برای نمایش وجود ندارد.",
    sections: {
        overview: ["نمای کلی", "وضعیت عملیاتی تأیید هویت، نشست‌ها، ریسک و سلامت ارسال در یک نمای تصمیم‌محور."],
        verifications: ["تراکنش‌های تأیید", "دفتر tenant-scoped درخواست، ارسال، تحویل، اثبات و نتیجهٔ نهایی تأییدها."],
        methods: ["روش‌های تأیید", "روش‌های فعال ورود و بازیابی با نمایش قدرت امنیتی و وابستگی Provider."],
        policies: ["سیاست‌های هویت", "نسخه‌های تغییرناپذیر Policy برای purpose، TTL، تلاش‌ها، resend و Step-up."],
        providers: ["ارائه‌دهندگان و مسیریابی", "پیکربندی write-only Credential، اولویت، Failover و تست سلامت Provider."],
        delivery: ["سلامت ارسال", "شواهد ارسال، تحویل، شکست، latency و هزینه از Provider Attempt ledger."],
        risk: ["ریسک و سوءاستفاده", "رویدادهای OTP pumping، velocity و تصمیم‌های allow/block با شناسه‌های redacted."],
        credentials: ["Passkey و اعتبارنامه‌ها", "مدیریت Passkey، TOTP و Recovery Code بدون نمایش secret خام."],
        sessions: ["نشست‌ها و دستگاه‌ها", "نشست‌های متصل به access token واقعی با IP ماسک‌شده و امکان revoke."],
        "step-up": ["احراز هویت تکمیلی", "ایجاد proof تازه و scope-bound برای عملیات امنیتی حساس."],
        audit: ["رویدادها و ممیزی", "تاریخچهٔ امنیتی redacted شامل actor، outcome، request ID و علت عملیات حساس."],
        analytics: ["گزارش‌ها و تحلیل", "قیف واقعی تأیید، موفقیت، ریسک، هزینه و adoption بر پایه ledger."],
        settings: ["تنظیمات هویت و دسترسی", "Feature flagهای backend-enforced و دسترسی‌های ریزدانه مدیران."],
        "sms-settings": ["تنظیمات پنل SMS", "کنترل Runtime برای بودجه، ضد SMS Pumping، resend و سرویس SMS tenant."],
    } satisfies Record<IdentitySection, readonly [string, string]>,
    metrics: {
        requested: "درخواست‌ها",
        verified: "تأیید موفق",
        successRate: "نرخ موفقیت",
        blocked: "مسدودشده",
        activeSessions: "نشست فعال",
        cost: "هزینهٔ ارسال",
    },
    help: {
        requestedHelp: "تعداد Verification Transactionهای ایجادشده در ۲۴ ساعت گذشته.",
        verifiedHelp: "تعداد تراکنش‌هایی که proof معتبر دریافت کرده‌اند.",
        successRateHelp: "نسبت verified به requested؛ از ledger واقعی محاسبه می‌شود.",
        blockedHelp: "تعداد درخواست‌هایی که Policy یا Risk Engine متوقف کرده است.",
        activeSessionsHelp: "نشست‌هایی که به access token موجود و منقضی‌نشده متصل‌اند.",
        costHelp: "جمع cost_minor ثبت‌شده توسط Provider Attempt؛ مقدار نامشخص جعل نمی‌شود.",
        riskRecent: "آخرین Risk Eventهای tenant با subject و IP redacted.",
        todayActions: "اقدام‌هایی که اپراتور بر اساس سلامت Provider، ریسک یا تنظیمات می‌تواند انجام دهد.",
        verificationLedger: "هر ردیف یک Verification Transaction با purpose، method، وضعیت و risk score است.",
        methodCard: "فعال‌بودن روش از Feature flag و Provider واقعی backend خوانده می‌شود.",
    },
};

const sectionPath: Record<IdentitySection, string | null> = {
    overview: "overview",
    verifications: "verifications",
    methods: "methods",
    policies: "policies",
    providers: "providers",
    delivery: "delivery",
    risk: "risk",
    credentials: null,
    sessions: null,
    "step-up": null,
    audit: "audit",
    analytics: "analytics",
    settings: "settings",
    "sms-settings": "sms/settings",
};

function toneFor(value: unknown): StatusTone {
    const text = String(value ?? "").toLowerCase();
    if (["healthy", "verified", "success", "delivered", "active", "allowed"].some((token) => text.includes(token)))
        return "success";
    if (["failed", "blocked", "critical", "unhealthy", "revoked", "danger"].some((token) => text.includes(token)))
        return "danger";
    if (["degraded", "warning", "unknown", "delivery_unknown", "pending"].some((token) => text.includes(token))) return "warning";
    if (["sent", "accepted", "info"].some((token) => text.includes(token))) return "info";
    return "neutral";
}

function InfoTitle({ title, help }: { title: string; help: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <span>{title}</span>
            <HelperTooltip>{help}</HelperTooltip>
        </div>
    );
}

function MetricCard({ label, value, help, suffix }: { label: string; value: ReactNode; help: string; suffix?: string }) {
    return (
        <Card title={<InfoTitle title={label} help={help} />} className="min-h-28 border-border/80 bg-card/95 shadow-sm">
            <div className="flex items-end gap-1.5">
                <strong className="font-semibold text-2xl tracking-tight tabular-nums">{value ?? "—"}</strong>
                {suffix ? <span className="pb-0.5 text-muted-foreground text-xs">{suffix}</span> : null}
            </div>
        </Card>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">{text}</div>;
}

function ErrorState({ message }: { message: string }) {
    return (
        <Card tone="danger" title="خطا در دریافت داده">
            <p className="text-sm">{message}</p>
        </Card>
    );
}

function SensitiveAction({
    label,
    description,
    disabled,
    loading,
    tone = "danger",
    onConfirm,
}: {
    label: string;
    description: string;
    disabled?: boolean;
    loading?: boolean;
    tone?: "danger" | "warning";
    onConfirm: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button type="button" variant="outline" tone={tone} disabled={disabled} onClick={() => setOpen(true)}>
                {label}
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={label}
                description={description}
                confirmLabel="تأیید و اجرا"
                cancelLabel="انصراف"
                tone={tone}
                isConfirming={loading}
                onConfirm={() => {
                    onConfirm();
                    setOpen(false);
                }}
            />
        </>
    );
}

export function IdentityWorkspace({ section }: { section: IdentitySection }) {
    const path = sectionPath[section];
    const query = useIdentityResource<AnyRecord | AnyRecord[]>(path ?? "overview", path !== null);
    const [reason, setReason] = useState("");

    return (
        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5 px-5 py-6 lg:px-7">
            <header className="flex flex-col gap-4 border-border/80 border-b pb-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-primary">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        <span className="font-medium text-xs">{COPY.eyebrow}</span>
                    </div>
                    <h1 className="font-semibold text-2xl tracking-tight">{COPY.sections[section][0]}</h1>
                    <p className="max-w-3xl text-muted-foreground text-sm leading-6">{COPY.sections[section][1]}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {section !== "step-up" ? (
                        <Button variant="outline" onClick={() => query.refetch()} disabled={!path || query.isFetching}>
                            <RefreshCw className="size-4" aria-hidden="true" />
                            {COPY.refresh}
                        </Button>
                    ) : null}
                    <Button asChild>
                        <Link href="/identity/step-up">
                            {" "}
                            <LockKeyhole className="size-4" aria-hidden="true" /> {COPY.stepUpAction}{" "}
                        </Link>
                    </Button>
                </div>
            </header>

            <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/8 px-4 py-3 text-sm">
                <Activity className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
                <div>
                    <div className="flex items-center gap-1 font-medium">
                        {COPY.evidenceTitle}
                        <HelperTooltip>{COPY.evidenceHelp}</HelperTooltip>
                    </div>
                    <p className="mt-0.5 text-muted-foreground text-xs leading-5">{COPY.evidenceBody}</p>
                </div>
            </div>

            {query.error ? <ErrorState message={query.error.message} /> : null}
            {section === "overview" && <Overview data={query.data as AnyRecord | undefined} loading={query.isLoading} />}
            {section === "verifications" && (
                <Verifications rows={query.data as AnyRecord[] | undefined} loading={query.isLoading} />
            )}
            {section === "methods" && <Methods rows={query.data as AnyRecord[] | undefined} loading={query.isLoading} />}
            {section === "policies" && (
                <Policies rows={query.data as AnyRecord[] | undefined} reason={reason} setReason={setReason} />
            )}
            {section === "providers" && (
                <Providers rows={query.data as AnyRecord[] | undefined} reason={reason} setReason={setReason} />
            )}
            {section === "delivery" && <Delivery rows={query.data as AnyRecord[] | undefined} />}
            {section === "risk" && <Risk rows={query.data as AnyRecord[] | undefined} />}
            {section === "credentials" && <UserCredentials reason={reason} setReason={setReason} />}
            {section === "sessions" && <UserSessions reason={reason} setReason={setReason} />}
            {section === "step-up" && <StepUp />}
            {section === "audit" && <Audit rows={query.data as AnyRecord[] | undefined} />}
            {section === "analytics" && <Analytics data={query.data as AnyRecord | undefined} />}
            {section === "settings" && (
                <Settings data={query.data as AnyRecord | undefined} reason={reason} setReason={setReason} />
            )}
            {section === "sms-settings" && (
                <SmsSettings data={query.data as AnyRecord | undefined} reason={reason} setReason={setReason} />
            )}
        </div>
    );
}

function Overview({ data, loading }: { data?: AnyRecord; loading?: boolean }) {
    const kpi = data?.kpis ?? {};
    const cards = [
        ["requested", kpi.requested, "requestedHelp"],
        ["verified", kpi.verified, "verifiedHelp"],
        ["successRate", kpi.success_rate, "successRateHelp", "%"],
        ["blocked", kpi.blocked, "blockedHelp"],
        ["activeSessions", kpi.active_sessions, "activeSessionsHelp"],
        ["cost", kpi.cost_minor, "costHelp", "ریال خرد"],
    ] as const;
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {cards.map(([key, value, help, suffix]) => (
                    <MetricCard
                        key={key}
                        label={COPY.metrics[key]}
                        value={loading ? "…" : (value ?? "—")}
                        help={COPY.help[help]}
                        suffix={suffix}
                    />
                ))}
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
                <Card title={<InfoTitle title={COPY.riskRecent} help={COPY.help.riskRecent} />}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>نوع رخداد</TableHead>
                                <TableHead>امتیاز</TableHead>
                                <TableHead>تصمیم</TableHead>
                                <TableHead>زمان</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(data?.recent_risk_events ?? []).map((row: AnyRecord) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.event_type}</TableCell>
                                    <TableCell className="tabular-nums">{row.score}</TableCell>
                                    <TableCell>
                                        <StatusBadge tone={toneFor(row.decision)}>{row.decision}</StatusBadge>
                                    </TableCell>
                                    <TableCell>{String(row.created_at ?? "—")}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {!data?.recent_risk_events?.length ? <Empty text={COPY.empty} /> : null}
                </Card>
                <Card title={<InfoTitle title={COPY.todayActions} help={COPY.help.todayActions} />}>
                    <div className="space-y-3 text-sm">
                        <ActionHint
                            icon={<ShieldAlert className="size-4" />}
                            title="ریسک‌های مسدودشده را بررسی کنید"
                            body="رخدادهای High Risk را قبل از ایجاد allowlist یا تغییر policy بررسی کنید."
                            href="/identity/risk"
                        />
                        <ActionHint
                            icon={<CircleGauge className="size-4" />}
                            title="سلامت Provider را کنترل کنید"
                            body="وضعیت سالم فقط از probe و delivery evidence واقعی محاسبه می‌شود."
                            href="/identity/delivery"
                        />
                        <ActionHint
                            icon={<History className="size-4" />}
                            title="ممیزی تغییرات حساس"
                            body="تغییرات Provider، Policy و دسترسی‌ها باید reason و actor داشته باشند."
                            href="/identity/audit"
                        />
                    </div>
                </Card>
            </div>
        </div>
    );
}

function ActionHint({ icon, title, body, href }: { icon: React.ReactNode; title: string; body: string; href: string }) {
    return (
        <Link href={href as never} className="flex gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50">
            <span className="mt-0.5 text-primary">{icon}</span>
            <span>
                <strong className="block font-medium">{title}</strong>
                <span className="mt-1 block text-muted-foreground text-xs leading-5">{body}</span>
            </span>
        </Link>
    );
}

function Verifications({ rows, loading }: { rows?: AnyRecord[]; loading?: boolean }) {
    return (
        <Card title={<InfoTitle title={COPY.verificationLedger} help={COPY.help.verificationLedger} />} isLoading={loading}>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>شناسه</TableHead>
                        <TableHead>هدف</TableHead>
                        <TableHead>روش</TableHead>
                        <TableHead>شناسه کاربر</TableHead>
                        <TableHead>وضعیت</TableHead>
                        <TableHead>ریسک</TableHead>
                        <TableHead>زمان</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(rows ?? []).map((row) => (
                        <TableRow key={row.public_id}>
                            <TableCell className="font-mono text-xs">{String(row.public_id).slice(0, 8)}…</TableCell>
                            <TableCell>{row.purpose}</TableCell>
                            <TableCell>{row.method}</TableCell>
                            <TableCell>{row.identifier ?? "—"}</TableCell>
                            <TableCell>
                                <StatusBadge tone={toneFor(row.status)}>{row.status}</StatusBadge>
                            </TableCell>
                            <TableCell>{row.risk_score}</TableCell>
                            <TableCell>{String(row.created_at ?? "—")}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {!rows?.length && !loading ? <Empty text={COPY.empty} /> : null}
        </Card>
    );
}

function Methods({ rows, loading }: { rows?: AnyRecord[]; loading?: boolean }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(rows ?? []).map((row) => (
                <Card
                    key={row.key}
                    isLoading={loading}
                    title={<InfoTitle title={row.label ?? row.key ?? "—"} help={COPY.help.methodCard} />}
                >
                    <div className="flex items-center justify-between">
                        <StatusBadge tone={row.enabled ? "success" : "neutral"}>{row.enabled ? "فعال" : "غیرفعال"}</StatusBadge>
                        <span className="text-muted-foreground text-xs">
                            {row.phishing_resistant ? "مقاوم در برابر Phishing" : "غیر Phishing-resistant"}
                        </span>
                    </div>
                    {row.providers !== undefined ? (
                        <p className="mt-4 text-muted-foreground text-xs">Providerهای ثبت‌شده: {row.providers}</p>
                    ) : null}
                </Card>
            ))}
        </div>
    );
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor="identity-reason" className="flex items-center font-medium text-sm">
                دلیل تغییر حساس
                <HelperTooltip>این دلیل در Security Audit ثبت می‌شود و برای پاسخ‌گویی عملیاتی لازم است.</HelperTooltip>
            </label>
            <Input
                id="identity-reason"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="مثلاً: تغییر Provider اصلی پس از افت تحویل"
            />
        </div>
    );
}

function Policies({ rows, reason, setReason }: { rows?: AnyRecord[]; reason: string; setReason: (v: string) => void }) {
    const mutation = useIdentityMutation<{ path: string; body?: unknown }>("POST");
    const [key, setKey] = useState("login-default");
    const [purpose, setPurpose] = useState("login");
    return (
        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card
                title={
                    <InfoTitle
                        title="نسخه‌های Policy"
                        help="هر تغییر Policy یک نسخهٔ immutable جدید می‌سازد؛ نسخه قبلی برای audit باقی می‌ماند."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>کلید</TableHead>
                            <TableHead>هدف</TableHead>
                            <TableHead>نسخه</TableHead>
                            <TableHead>روش‌ها</TableHead>
                            <TableHead>وضعیت</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(rows ?? []).map((row) => (
                            <TableRow key={`${row.id}`}>
                                <TableCell>{row.policy_key}</TableCell>
                                <TableCell>{row.purpose}</TableCell>
                                <TableCell>{row.version}</TableCell>
                                <TableCell>{(row.methods ?? []).join("، ")}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={row.enabled ? "success" : "neutral"}>
                                        {row.enabled ? "فعال" : "غیرفعال"}
                                    </StatusBadge>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
            <Card
                title={
                    <InfoTitle
                        title="ایجاد نسخهٔ جدید"
                        help="Policy فعال روش مجاز، TTL، تعداد تلاش و cooldown را در runtime تعیین می‌کند."
                    />
                }
            >
                <div className="space-y-3">
                    <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="policy key" />
                    <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="purpose" />
                    <ReasonField value={reason} onChange={setReason} />
                    <Button
                        disabled={reason.trim().length < 4 || mutation.isPending}
                        isLoading={mutation.isPending}
                        onClick={() =>
                            mutation.mutate({
                                path: "policies",
                                body: { policy_key: key, purpose, enabled: true, methods: ["sms_otp", "email_otp"], reason },
                            })
                        }
                    >
                        ایجاد نسخه Policy
                    </Button>
                    <p className="text-muted-foreground text-xs">
                        برای این عملیات Step-up با scope <code>identity.policy.manage</code> لازم است.
                    </p>
                </div>
            </Card>
        </div>
    );
}

function Providers({ rows, reason, setReason }: { rows?: AnyRecord[]; reason: string; setReason: (v: string) => void }) {
    const update = useIdentityMutation<{ path: string; body?: unknown }>("PUT");
    const test = useIdentityMutation<{ path: string; body?: unknown }>("POST");
    const [key, setKey] = useState("ippanel-primary");
    const [sender, setSender] = useState("");
    const [token, setToken] = useState("");
    return (
        <div className="space-y-5">
            <Card
                title={
                    <InfoTitle
                        title="Providerهای هویت"
                        help="سلامت فقط از probe یا delivery evidence واقعی به‌روزرسانی می‌شود؛ ثبت credential به‌تنهایی Healthy نیست."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Provider</TableHead>
                            <TableHead>کانال</TableHead>
                            <TableHead>Driver</TableHead>
                            <TableHead>Credential</TableHead>
                            <TableHead>سلامت</TableHead>
                            <TableHead>اولویت</TableHead>
                            <TableHead>عملیات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(rows ?? []).map((row) => (
                            <TableRow key={row.provider_key}>
                                <TableCell>{row.provider_key}</TableCell>
                                <TableCell>{row.channel}</TableCell>
                                <TableCell>{row.driver}</TableCell>
                                <TableCell>{row.credential_configured ? "تنظیم شده" : "تنظیم نشده"}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={toneFor(row.health_state)}>{row.health_state}</StatusBadge>
                                </TableCell>
                                <TableCell>{row.priority}</TableCell>
                                <TableCell>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => test.mutate({ path: `providers/${row.provider_key}/test` })}
                                        isLoading={test.isPending}
                                    >
                                        تست اتصال
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
            <Card
                title={
                    <InfoTitle
                        title="اتصال/ویرایش SMS Provider"
                        help="API Token write-only و با encryption در DB نگه‌داری می‌شود؛ مقدار فعلی هرگز به UI برنمی‌گردد."
                    />
                }
            >
                <div className="grid gap-3 lg:grid-cols-4">
                    <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Provider key" />
                    <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="شماره فرستنده" />
                    <Input
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        placeholder="API Token جدید"
                    />
                    <ReasonField value={reason} onChange={setReason} />
                </div>
                <div className="mt-4">
                    <Button
                        disabled={reason.trim().length < 4 || !key || update.isPending}
                        isLoading={update.isPending}
                        onClick={() =>
                            update.mutate({
                                path: "providers",
                                body: {
                                    provider_key: key,
                                    channel: "sms",
                                    driver: "ippanel",
                                    enabled: true,
                                    is_primary: true,
                                    priority: 10,
                                    sender_id: sender || null,
                                    base_url: "https://edge.ippanel.com",
                                    api_token: token || undefined,
                                    timeout_ms: 5000,
                                    reason,
                                },
                            })
                        }
                    >
                        ذخیره Provider اصلی
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function Delivery({ rows }: { rows?: AnyRecord[] }) {
    return (
        <Card
            title={
                <InfoTitle
                    title="سلامت و Evidence ارسال"
                    help="Delivered فقط زمانی نمایش داده می‌شود که Provider گزارش تحویل recipient را تأیید کرده باشد. Accepted معادل Delivered نیست."
                />
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>سلامت</TableHead>
                        <TableHead>تلاش ۲۴ساعت</TableHead>
                        <TableHead>تحویل</TableHead>
                        <TableHead>خطا</TableHead>
                        <TableHead>نرخ تحویل</TableHead>
                        <TableHead>Latency</TableHead>
                        <TableHead>هزینه</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(rows ?? []).map((row) => (
                        <TableRow key={row.provider_key}>
                            <TableCell>{row.provider_key}</TableCell>
                            <TableCell>
                                <StatusBadge tone={toneFor(row.health_state)}>{row.health_state}</StatusBadge>
                            </TableCell>
                            <TableCell>{row.attempts_24h}</TableCell>
                            <TableCell>{row.delivered_24h}</TableCell>
                            <TableCell>{row.failed_24h}</TableCell>
                            <TableCell>{row.delivery_rate === null ? "—" : `${row.delivery_rate}%`}</TableCell>
                            <TableCell>{row.average_latency_ms === null ? "—" : `${row.average_latency_ms} ms`}</TableCell>
                            <TableCell>{row.cost_minor_24h || "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}

function Risk({ rows }: { rows?: AnyRecord[] }) {
    return (
        <Card
            title={
                <InfoTitle
                    title="رخدادهای Risk و Abuse"
                    help="Risk eventها از velocity/budget/attempt controls ساخته می‌شوند. Subject به‌صورت tenant-bound HMAC ذخیره می‌شود و PII خام در این جدول وجود ندارد."
                />
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>نوع</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>امتیاز</TableHead>
                        <TableHead>تصمیم</TableHead>
                        <TableHead>دلایل</TableHead>
                        <TableHead>زمان</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(rows ?? []).map((row) => (
                        <TableRow key={row.id}>
                            <TableCell>{row.event_type}</TableCell>
                            <TableCell className="font-mono text-xs">{row.subject_hash ?? "—"}</TableCell>
                            <TableCell>{row.score}</TableCell>
                            <TableCell>
                                <StatusBadge tone={toneFor(row.decision)}>{row.decision}</StatusBadge>
                            </TableCell>
                            <TableCell>{(row.reasons ?? []).join("، ")}</TableCell>
                            <TableCell>{String(row.created_at ?? "—")}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}

function UserCredentials({ reason, setReason }: { reason: string; setReason: (v: string) => void }) {
    const [userId, setUserId] = useState("");
    const query = useIdentityResource<AnyRecord[]>(`users/${userId || "0"}/credentials`, Number(userId) > 0);
    const revoke = useIdentityMutation<{ path: string; body?: unknown }>("DELETE");
    return (
        <div className="space-y-5">
            <Card
                title={
                    <InfoTitle
                        title="انتخاب کاربر"
                        help="Credential secret هرگز در این صفحه برنمی‌گردد؛ فقط metadata و وضعیت قابل مشاهده است."
                    />
                }
            >
                <div className="flex max-w-xl gap-2">
                    <Input
                        value={userId}
                        onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="شناسه کاربر"
                    />
                    <Button variant="outline" onClick={() => query.refetch()} disabled={!userId}>
                        بارگذاری
                    </Button>
                </div>
            </Card>
            <ReasonField value={reason} onChange={setReason} />
            <Card
                title={
                    <InfoTitle
                        title="Passkey، TOTP و Recovery"
                        help="TOTP secret و Recovery Code خام هرگز بعد از enrollment قابل بازیابی نیستند."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>نوع</TableHead>
                            <TableHead>برچسب</TableHead>
                            <TableHead>آخرین استفاده</TableHead>
                            <TableHead>وضعیت</TableHead>
                            <TableHead>عملیات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(query.data ?? []).map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.type}</TableCell>
                                <TableCell>{row.label ?? "—"}</TableCell>
                                <TableCell>{String(row.last_used_at ?? "—")}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={row.revoked_at ? "danger" : "success"}>
                                        {row.revoked_at ? "لغوشده" : "فعال"}
                                    </StatusBadge>
                                </TableCell>
                                <TableCell>
                                    <SensitiveAction
                                        label="لغو Credential"
                                        description="این Credential بلافاصله برای احراز هویت غیرقابل استفاده می‌شود."
                                        disabled={reason.trim().length < 4 || Boolean(row.revoked_at)}
                                        loading={revoke.isPending}
                                        onConfirm={() =>
                                            revoke.mutate({ path: `users/${userId}/credentials/${row.id}`, body: { reason } })
                                        }
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}

function UserSessions({ reason, setReason }: { reason: string; setReason: (v: string) => void }) {
    const [userId, setUserId] = useState("");
    const query = useIdentityResource<AnyRecord[]>(`users/${userId || "0"}/sessions`, Number(userId) > 0);
    const revoke = useIdentityMutation<{ path: string; body?: unknown }>("DELETE");
    return (
        <div className="space-y-5">
            <Card
                title={
                    <InfoTitle
                        title="انتخاب کاربر"
                        help="Session row به access token واقعی متصل است؛ revoke در این صفحه token را نیز حذف می‌کند."
                    />
                }
            >
                <div className="flex max-w-xl gap-2">
                    <Input
                        value={userId}
                        onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="شناسه کاربر"
                    />
                    <Button variant="outline" onClick={() => query.refetch()} disabled={!userId}>
                        بارگذاری
                    </Button>
                </div>
            </Card>
            <ReasonField value={reason} onChange={setReason} />
            <Card
                title={
                    <InfoTitle
                        title="نشست‌ها و دستگاه‌ها"
                        help="IP به‌صورت masked است و Last Active از access token واقعی استفاده می‌کند؛ موقعیت جغرافیایی ساختگی نمایش داده نمی‌شود."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>دستگاه</TableHead>
                            <TableHead>IP</TableHead>
                            <TableHead>روش ورود</TableHead>
                            <TableHead>آخرین فعالیت</TableHead>
                            <TableHead>انقضا</TableHead>
                            <TableHead>وضعیت</TableHead>
                            <TableHead>عملیات</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(query.data ?? []).map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.device_label ?? row.user_agent ?? "ناشناخته"}</TableCell>
                                <TableCell>{row.ip_masked ?? "—"}</TableCell>
                                <TableCell>{row.auth_method}</TableCell>
                                <TableCell>{String(row.last_seen_at ?? "—")}</TableCell>
                                <TableCell>{String(row.expires_at ?? "—")}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={row.active ? "success" : "neutral"}>
                                        {row.active ? "فعال" : "پایان‌یافته"}
                                    </StatusBadge>
                                </TableCell>
                                <TableCell>
                                    <SensitiveAction
                                        label="خروج نشست"
                                        description="توکن دسترسی واقعی این نشست حذف و Security Event ثبت می‌شود."
                                        disabled={reason.trim().length < 4 || !row.active}
                                        loading={revoke.isPending}
                                        onConfirm={() =>
                                            revoke.mutate({ path: `users/${userId}/sessions/${row.id}`, body: { reason } })
                                        }
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}

function StepUp() {
    const mutation = useIdentityMutation<{ path: string; body?: unknown }, AnyRecord>("POST");
    const [method, setMethod] = useState("password");
    const [scope, setScope] = useState("identity.settings.manage");
    const [proof, setProof] = useState("");
    return (
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <Card
                title={
                    <InfoTitle
                        title="اثبات مجدد هویت مدیر"
                        help="Step-up یک verification proof با scope و زمان انقضا ثبت می‌کند؛ بدون proof تازه، mutationهای حساس 403 می‌شوند."
                    />
                }
            >
                <div className="space-y-3">
                    <label className="block text-sm">
                        روش
                        <select
                            className="mt-1.5 h-9 w-full rounded-md border bg-background px-3"
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                        >
                            <option value="password">رمز عبور</option>
                            <option value="totp">TOTP</option>
                            <option value="recovery_code">Recovery Code</option>
                        </select>
                    </label>
                    <label className="block text-sm">
                        Action Scope
                        <Input className="mt-1.5" value={scope} onChange={(e) => setScope(e.target.value)} />
                    </label>
                    <label className="block text-sm">
                        Proof
                        <Input
                            className="mt-1.5"
                            type={method === "password" ? "password" : "text"}
                            autoComplete="off"
                            value={proof}
                            onChange={(e) => setProof(e.target.value)}
                        />
                    </label>
                    <Button
                        disabled={proof.length < 4 || scope.length < 2}
                        isLoading={mutation.isPending}
                        onClick={() => mutation.mutate({ path: "step-up/verify", body: { method, proof, action_scope: scope } })}
                    >
                        ثبت Step-up
                    </Button>
                    {mutation.data?.data ? (
                        <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
                            <StatusBadge tone="success">تأیید شد</StatusBadge>
                            <p className="mt-2 text-muted-foreground text-xs">
                                اعتبار تا: {String((mutation.data.data as AnyRecord).expires_at)}
                            </p>
                        </div>
                    ) : null}
                </div>
            </Card>
            <Card
                title={
                    <InfoTitle
                        title="Scopeهای حساس"
                        help="هر mutation فقط proof مناسب همان action scope یا wildcard را قبول می‌کند."
                    />
                }
            >
                <ul className="space-y-2 text-sm">
                    <li>
                        <code>identity.provider.manage</code> — Provider و credential
                    </li>
                    <li>
                        <code>identity.policy.manage</code> — نسخه Policy
                    </li>
                    <li>
                        <code>identity.sms.manage</code> — کنترل‌های SMS
                    </li>
                    <li>
                        <code>identity.settings.manage</code> — Feature flags
                    </li>
                    <li>
                        <code>identity.access.manage</code> — دسترسی مدیران
                    </li>
                    <li>
                        <code>identity.credential.revoke</code> — لغو Credential
                    </li>
                </ul>
            </Card>
        </div>
    );
}

function Audit({ rows }: { rows?: AnyRecord[] }) {
    return (
        <Card
            title={
                <InfoTitle
                    title="Security Audit"
                    help="actor، outcome، severity، request id و IP masked برای اقدامات امنیتی ثبت می‌شوند؛ secret و OTP هرگز audit نمی‌شوند."
                />
            }
        >
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>زمان</TableHead>
                        <TableHead>رخداد</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>کاربر</TableHead>
                        <TableHead>نتیجه</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Request ID</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(rows ?? []).map((row) => (
                        <TableRow key={row.id}>
                            <TableCell>{String(row.created_at ?? "—")}</TableCell>
                            <TableCell>{row.event_type}</TableCell>
                            <TableCell>{row.actor_user_id ?? "سیستم"}</TableCell>
                            <TableCell>{row.user_id ?? "—"}</TableCell>
                            <TableCell>
                                <StatusBadge tone={toneFor(row.outcome)}>{row.outcome}</StatusBadge>
                            </TableCell>
                            <TableCell>
                                <StatusBadge tone={toneFor(row.severity)}>{row.severity}</StatusBadge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.request_id ?? "—"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Card>
    );
}

function Analytics({ data }: { data?: AnyRecord }) {
    const items = data?.verification_methods ?? [];
    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                    label="Provider Attempt"
                    value={data?.provider_attempts ?? "—"}
                    help="تعداد attemptهای ثبت‌شده در ledger طی ۳۰ روز."
                />
                <MetricCard
                    label="تحویل تأییدشده"
                    value={data?.delivery_confirmed ?? "—"}
                    help="فقط attemptهایی که evidence تحویل دارند."
                />
                <MetricCard
                    label="هزینه ثبت‌شده"
                    value={data?.provider_cost_minor ?? "—"}
                    help="جمع cost_minorهایی که Provider adapter واقعاً گزارش/ثبت کرده است؛ هزینه نامعلوم صفر فرض نمی‌شود."
                />
            </div>
            <Card
                title={
                    <InfoTitle
                        title="عملکرد روش‌های تأیید"
                        help="Success Rate از verification ledger محاسبه می‌شود و در نبود داده — نمایش داده می‌شود."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>روش</TableHead>
                            <TableHead>درخواست</TableHead>
                            <TableHead>تأیید</TableHead>
                            <TableHead>نرخ موفقیت</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map((row: AnyRecord) => (
                            <TableRow key={row.method}>
                                <TableCell>{row.method}</TableCell>
                                <TableCell>{row.requested}</TableCell>
                                <TableCell>{row.verified}</TableCell>
                                <TableCell>{row.success_rate === null ? "—" : `${row.success_rate}%`}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}

function Settings({ data, reason, setReason }: { data?: AnyRecord; reason: string; setReason: (v: string) => void }) {
    const update = useIdentityMutation<{ path: string; body?: unknown }>("PATCH");
    const access = useIdentityResource<AnyRecord[]>("access");
    const preset = useIdentityMutation<{ path: string; body?: unknown }>("POST");
    const [values, setValues] = useState<Record<string, boolean | number>>({});
    const current = { ...(data ?? {}), ...values };
    return (
        <div className="space-y-5">
            <Card
                title={
                    <InfoTitle
                        title="قابلیت‌های هویت"
                        help="این switchها در backend توسط requireIdentityFeature enforce می‌شوند؛ فقط ظاهر را تغییر نمی‌دهند."
                    />
                }
            >
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        ["passkeys", "Passkey / WebAuthn"],
                        ["totp_enrollment", "ثبت TOTP"],
                        ["recovery_codes_generation", "ساخت Recovery Code"],
                    ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between rounded-lg border p-4">
                            <span className="flex items-center">
                                {label}
                                <HelperTooltip>غیرفعال‌کردن، endpoint مرتبط را در backend نیز unavailable می‌کند.</HelperTooltip>
                            </span>
                            <Switch
                                checked={Boolean(current[key])}
                                onCheckedChange={(checked) => setValues((old) => ({ ...old, [key]: checked }))}
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <ReasonField value={reason} onChange={setReason} />
                    <Button
                        disabled={reason.trim().length < 4 || update.isPending}
                        isLoading={update.isPending}
                        onClick={() => update.mutate({ path: "settings", body: { ...values, reason } })}
                    >
                        ذخیره تنظیمات
                    </Button>
                </div>
            </Card>
            <Card
                title={
                    <InfoTitle
                        title="دسترسی‌های هویت"
                        help="Preset در جدول admin_permissions ذخیره و تمام endpointهای identity در backend آن را enforce می‌کنند. Admin بدون override برای backward compatibility دسترسی کامل دارد."
                    />
                }
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>مدیر</TableHead>
                            <TableHead>نمای کلی</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>ریسک</TableHead>
                            <TableHead>SMS</TableHead>
                            <TableHead>Preset</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(access.data ?? []).map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.identity}</TableCell>
                                <TableCell>{row.permissions?.["identity.view"] ? "✓" : "—"}</TableCell>
                                <TableCell>{row.permissions?.["identity.providers.manage"] ? "✓" : "—"}</TableCell>
                                <TableCell>{row.permissions?.["identity.risk.manage"] ? "✓" : "—"}</TableCell>
                                <TableCell>{row.permissions?.["identity.sms.manage"] ? "✓" : "—"}</TableCell>
                                <TableCell>
                                    <div className="flex gap-1">
                                        {["owner", "security", "support", "viewer"].map((name) => (
                                            <Button
                                                key={name}
                                                size="sm"
                                                variant="outline"
                                                disabled={reason.trim().length < 4}
                                                onClick={() =>
                                                    preset.mutate({
                                                        path: "access/preset",
                                                        body: { user_id: row.id, preset: name, reason },
                                                    })
                                                }
                                            >
                                                {name}
                                            </Button>
                                        ))}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <div className="mt-4">
                    <ReasonField value={reason} onChange={setReason} />
                </div>
            </Card>
        </div>
    );
}

function SmsSettings({ data, reason, setReason }: { data?: AnyRecord; reason: string; setReason: (v: string) => void }) {
    const update = useIdentityMutation<{ path: string; body?: unknown }>("PATCH");
    const [values, setValues] = useState<Record<string, boolean | number>>({});
    const current = { ...(data ?? {}), ...values };
    const numberFields = [
        ["daily_send_limit", "سقف ارسال ۲۴ساعت"],
        ["daily_spend_limit_minor", "سقف هزینه ۲۴ساعت"],
        ["per_identifier_10m_limit", "سقف شناسه در ۱۰ دقیقه"],
        ["per_ip_10m_limit", "سقف IP در ۱۰ دقیقه"],
        ["per_device_10m_limit", "سقف دستگاه در ۱۰ دقیقه"],
        ["resend_10m_limit", "سقف ارسال مجدد در ۱۰ دقیقه"],
        ["resend_cooldown_seconds", "Cooldown ارسال مجدد (ثانیه)"],
    ];
    return (
        <div className="space-y-5">
            <Card
                title={
                    <InfoTitle
                        title="وضعیت سرویس SMS"
                        help="خاموش‌کردن سرویس در backend قبل از ایجاد challenge بررسی می‌شود؛ در حالت خاموش هیچ SMS جدید dispatch نمی‌شود."
                    />
                }
            >
                <label className="flex max-w-xl items-center justify-between rounded-lg border p-4">
                    <span>
                        <strong className="block text-sm">SMS Verification</strong>
                        <span className="text-muted-foreground text-xs">کنترل سراسری tenant</span>
                    </span>
                    <Switch
                        checked={Boolean(current.sms_enabled)}
                        onCheckedChange={(checked) => setValues((old) => ({ ...old, sms_enabled: checked }))}
                    />
                </label>
            </Card>
            <Card
                title={
                    <InfoTitle
                        title="Budget و ضد SMS Pumping"
                        help="این مقادیر در request/resend path با شمارنده‌های tenant/IP/identifier/device و spend ledger enforce می‌شوند."
                    />
                }
            >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {numberFields.map(([key, label]) => (
                        <label key={key} className="space-y-1.5 text-sm">
                            <span className="flex items-center">
                                {label}
                                <HelperTooltip>
                                    تغییر این مقدار بلافاصله پس از cache invalidation در runtime اعمال می‌شود.
                                </HelperTooltip>
                            </span>
                            <Input
                                type="number"
                                min={0}
                                value={typeof current[key] === "number" ? current[key] : ""}
                                onChange={(e) => setValues((old) => ({ ...old, [key]: Number(e.target.value) }))}
                            />
                        </label>
                    ))}
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
                    <ReasonField value={reason} onChange={setReason} />
                    <Button
                        disabled={reason.trim().length < 4 || update.isPending}
                        isLoading={update.isPending}
                        onClick={() => update.mutate({ path: "sms/settings", body: { ...values, reason } })}
                    >
                        ذخیره تنظیمات SMS
                    </Button>
                </div>
            </Card>
            <Card
                tone="info"
                title={
                    <InfoTitle
                        title="Provider و عیب‌یابی"
                        help="Credential، sender، probe و delivery report از صفحه Provider مدیریت می‌شوند تا یک منبع حقیقت داشته باشیم."
                    />
                }
            >
                <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                        <Link href="/identity/providers">
                            <Send className="size-4" aria-hidden="true" />
                            مدیریت Provider
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/identity/delivery">
                            <CircleGauge className="size-4" aria-hidden="true" />
                            سلامت ارسال
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/identity/audit">
                            <History className="size-4" aria-hidden="true" />
                            ممیزی تغییرات
                        </Link>
                    </Button>
                </div>
            </Card>
        </div>
    );
}
