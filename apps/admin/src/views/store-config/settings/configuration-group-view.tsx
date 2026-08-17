"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { CheckCircle2, ExternalLink, ShieldAlert } from "#/icons";
import { Link } from "#/lib/i18n/navigation";
import {
    type ConfigurationChangeInput,
    type ConfigurationGroup,
    useConfigurationGroup,
    usePreviewConfiguration,
    useTestConfiguration,
    useUpdateConfiguration,
} from "#/lib/queries/configuration";

export function ConfigurationGroupView({ group }: { group: ConfigurationGroup }) {
    const locale = useLocale();
    const fa = locale === "fa";
    const query = useConfigurationGroup(group);

    if (query.isPending) {
        return (
            <div className="rounded-xl border p-8 text-sm text-muted-foreground">
                {fa ? "در حال بارگذاری تنظیمات…" : "Loading configuration…"}
            </div>
        );
    }
    if (query.isError || !query.data) {
        return (
            <div className="rounded-xl border border-destructive/30 p-8 text-sm text-destructive">
                {fa ? "بارگذاری تنظیمات ناموفق بود." : "Configuration could not be loaded."}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                {fa
                    ? "هر تغییر نسخه‌دار و قابل بازگردانی است. تنظیمات پرریسک پیش از ذخیره به پیش‌نمایش اثر نیاز دارند و رازها فقط با مرجع متغیر محیطی ثبت می‌شوند."
                    : "Every change is versioned and reversible. High-risk settings require an impact preview, and secrets are stored only as environment references."}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                {query.data.definitions.map((item) => (
                    <SettingCard key={item.definition.key} group={group} item={item} fa={fa} />
                ))}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">{fa ? "اثر انگشت وضعیت" : "Declared-state fingerprint"}</CardTitle>
                    <CardDescription>
                        {fa
                            ? "برای مقایسه blueprint و تشخیص drift در وضعیت ثبت‌شده استفاده می‌شود."
                            : "Use this fingerprint to compare blueprints and detect declared-state drift."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <code className="break-all text-xs" dir="ltr">
                        {query.data.fingerprint}
                    </code>
                </CardContent>
            </Card>
        </div>
    );
}

type Item = NonNullable<ReturnType<typeof useConfigurationGroup>["data"]>["definitions"][number];

function SettingCard({ group, item, fa }: { group: ConfigurationGroup; item: Item; fa: boolean }) {
    const preview = usePreviewConfiguration(group);
    const testConfig = useTestConfiguration(group);
    const update = useUpdateConfiguration(group);
    const [raw, setRaw] = useState(() => stringifyValue(item.value));
    const [reason, setReason] = useState("");
    const [approval, setApproval] = useState("");
    const [previewHash, setPreviewHash] = useState<string | null>(null);
    const parsed = useMemo(() => parseValue(item.definition.type, raw), [item.definition.type, raw]);
    const label = fa ? item.definition.label_fa : item.definition.label_en;
    const description = fa ? item.definition.description_fa : item.definition.description_en;
    const highRisk = item.definition.risk_level === "high" || item.definition.risk_level === "critical";

    const change = (): ConfigurationChangeInput => ({
        key: item.definition.key,
        scope_type: "tenant",
        value: parsed.value,
        unset: false,
        reason,
        expected_version: item.origin.scope_type === "tenant" ? item.origin.version : 0,
        rollout_percent: 100,
        ...(previewHash ? { preview_hash: previewHash } : {}),
        ...(approval ? { approval_reference: approval } : {}),
    });

    const doPreview = async () => {
        if (!parsed.ok) return;
        const result = await preview.mutateAsync(change());
        setPreviewHash(result.data.preview_hash);
    };

    const doTest = async () => {
        if (!parsed.ok) return;
        await testConfig.mutateAsync(change());
    };

    const doSave = async () => {
        if (!parsed.ok) return;
        await update.mutateAsync(change());
        setPreviewHash(null);
        setReason("");
    };

    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle className="text-sm">{label}</CardTitle>
                        <CardDescription className="mt-1">{description}</CardDescription>
                    </div>
                    <RiskBadge risk={item.definition.risk_level} fa={fa} />
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline">{item.definition.key}</Badge>
                    <Badge variant="secondary">
                        {fa ? `مبدأ: ${item.origin.scope_type}` : `Origin: ${item.origin.scope_type}`}
                    </Badge>
                    <Badge variant="secondary">v{item.origin.version}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {!item.mutable ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                        <div className="text-sm">
                            {fa ? "این مقدار در دامنه اصلی خودش مدیریت می‌شود." : "This value is managed by its canonical domain."}
                        </div>
                        {item.definition.linked_href ? (
                            <Button asChild size="sm" variant="outline">
                                <Link href={item.definition.linked_href as never}>
                                    <ExternalLink className="size-4" />
                                    {fa ? "باز کردن" : "Open"}
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label>{fa ? "مقدار" : "Value"}</Label>
                            {item.definition.type === "boolean" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-between"
                                    onClick={() => setRaw(raw === "true" ? "false" : "true")}
                                >
                                    <span>{raw === "true" ? (fa ? "فعال" : "Enabled") : fa ? "غیرفعال" : "Disabled"}</span>
                                    <span dir="ltr">{raw}</span>
                                </Button>
                            ) : item.definition.type === "json" ? (
                                <Textarea value={raw} onChange={(event) => setRaw(event.target.value)} rows={4} dir="ltr" />
                            ) : (
                                <Input
                                    value={raw}
                                    onChange={(event) => setRaw(event.target.value)}
                                    type={item.definition.type === "number" ? "number" : "text"}
                                    dir={item.definition.type === "string" ? "auto" : "ltr"}
                                />
                            )}
                            {!parsed.ok ? (
                                <p className="text-xs text-destructive">
                                    {fa ? "فرمت مقدار معتبر نیست." : "Value format is invalid."}
                                </p>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <Label>{fa ? "دلیل تغییر" : "Change reason"}</Label>
                            <Input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder={fa ? "حداقل ۳ کاراکتر" : "At least 3 characters"}
                            />
                        </div>
                        {item.definition.approval_policy === "governance_required" ? (
                            <div className="space-y-2">
                                <Label>{fa ? "مرجع تأیید" : "Approval reference"}</Label>
                                <Input value={approval} onChange={(event) => setApproval(event.target.value)} dir="ltr" />
                            </div>
                        ) : null}
                        {preview.data ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                                <div className="flex items-center gap-2 font-medium">
                                    <ShieldAlert className="size-4" />
                                    {fa ? "پیش‌نمایش اثر" : "Impact preview"}
                                </div>
                                <div className="mt-2 text-muted-foreground">
                                    {fa
                                        ? `ریسک: ${preview.data.data.impact.risk_level} · وابستگی: ${preview.data.data.impact.dependencies.join("، ") || "—"}`
                                        : `Risk: ${preview.data.data.impact.risk_level} · Dependencies: ${preview.data.data.impact.dependencies.join(", ") || "—"}`}
                                </div>
                            </div>
                        ) : null}
                        {testConfig.data?.data.passed ? (
                            <div className="flex items-center gap-2 text-xs text-emerald-700">
                                <CheckCircle2 className="size-4" />
                                {fa ? "تست بدون اثر جانبی پاس شد." : "Side-effect-free test passed."}
                            </div>
                        ) : null}
                        {update.isSuccess ? (
                            <div className="flex items-center gap-2 text-xs text-emerald-700">
                                <CheckCircle2 className="size-4" />
                                {fa ? "ذخیره شد و نسخه جدید ثبت شد." : "Saved and a new revision was recorded."}
                            </div>
                        ) : null}
                        {preview.isError || testConfig.isError || update.isError ? (
                            <div className="text-xs text-destructive">
                                {fa
                                    ? "عملیات انجام نشد؛ مقدار فعال بدون تغییر ماند."
                                    : "Operation failed; active configuration was unchanged."}
                            </div>
                        ) : null}
                        <div className="flex flex-wrap justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!parsed.ok || reason.trim().length < 3 || testConfig.isPending}
                                onClick={doTest}
                            >
                                {testConfig.isPending ? (fa ? "تست…" : "Testing…") : fa ? "تست" : "Test"}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!parsed.ok || reason.trim().length < 3 || preview.isPending}
                                onClick={doPreview}
                            >
                                {preview.isPending ? (fa ? "بررسی…" : "Checking…") : fa ? "پیش‌نمایش" : "Preview"}
                            </Button>
                            <Button
                                type="button"
                                disabled={
                                    !parsed.ok || reason.trim().length < 3 || (highRisk && !previewHash) || update.isPending
                                }
                                onClick={doSave}
                            >
                                {update.isPending ? (fa ? "ذخیره…" : "Saving…") : fa ? "ذخیره نسخه‌دار" : "Save version"}
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

function RiskBadge({ risk, fa }: { risk: string; fa: boolean }) {
    const variant = risk === "critical" || risk === "high" ? "destructive" : risk === "medium" ? "secondary" : "outline";
    const faLabels: Record<string, string> = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
    return <Badge variant={variant}>{fa ? (faLabels[risk] ?? risk) : risk}</Badge>;
}

function stringifyValue(value: unknown) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value ?? null, null, 2);
}

function parseValue(type: string, raw: string): { ok: boolean; value: unknown } {
    try {
        if (type === "number") {
            const value = Number(raw);
            return { ok: Number.isFinite(value), value };
        }
        if (type === "boolean") return { ok: raw === "true" || raw === "false", value: raw === "true" };
        if (type === "json") return { ok: true, value: JSON.parse(raw) };
        return { ok: true, value: raw };
    } catch {
        return { ok: false, value: raw };
    }
}
