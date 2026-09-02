"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import {
    type Snippet,
    type SnippetDeployment,
    type SnippetExecution,
    type SnippetRevision,
    type SnippetSettings,
    type SnippetsOverview,
    type SnippetTemplate,
    useSnippetsMutation,
    useSnippetsResource,
} from "#/lib/queries/snippets";
import { cn } from "#/lib/utils";

type Tab = "overview" | "snippets" | "editor" | "library" | "revisions" | "health" | "settings";

const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "نمای کلی" },
    { key: "snippets", label: "همه Snippetها" },
    { key: "editor", label: "ویرایشگر" },
    { key: "library", label: "کتابخانه" },
    { key: "revisions", label: "نسخه‌ها و انتشار" },
    { key: "health", label: "سلامت و لاگ" },
    { key: "settings", label: "تنظیمات" },
];

const fa = (value: number | null | undefined) => new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
const dateTime = (value: string | null | undefined) =>
    value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "danger" | "warn" }) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
                tone === "good" && "border-primary/30 bg-primary/10 text-primary",
                tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
                tone === "warn" && "border-accent bg-accent/40 text-accent-foreground",
                tone === "neutral" && "bg-muted/40 text-muted-foreground",
            )}
        >
            {children}
        </span>
    );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <Card className="border-border/70 p-5 shadow-sm">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="mt-2 font-semibold text-2xl tracking-tight">{value}</div>
            <div className="mt-2 text-muted-foreground text-xs leading-5">{hint}</div>
        </Card>
    );
}

function ErrorBox({ message }: { message: string }) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">{message}</div>;
}

function SuccessBox({ message }: { message: string }) {
    return <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">{message}</div>;
}

export function SnippetsWorkspace() {
    const [tab, setTab] = useState<Tab>("overview");
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const overview = useSnippetsResource<SnippetsOverview>("overview");
    const list = useSnippetsResource<Snippet[]>("", { limit: 300, q: query || undefined });
    const library = useSnippetsResource<SnippetTemplate[]>("library");
    const settings = useSnippetsResource<SnippetSettings>("settings");
    const executions = useSnippetsResource<SnippetExecution[]>("executions", { limit: 300 });
    const selected = useMemo(
        () => (list.data ?? []).find((item) => item.public_id === selectedId) ?? null,
        [list.data, selectedId],
    );

    useEffect(() => {
        if (selectedId === null && (list.data?.length ?? 0) > 0) setSelectedId(list.data?.[0]?.public_id ?? null);
    }, [list.data, selectedId]);

    return (
        <div className="space-y-6" dir="rtl">
            <PageHeader
                title="Snippets"
                subtitle="مدیریت امن source artifact، شرط اجرا، اعتبارسنجی، revision، انتشار، rollback، Safe Mode و سلامت trusted consumerها."
            />

            <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-background to-muted/30 shadow-sm">
                <div className="grid gap-5 p-6 lg:grid-cols-[1.35fr_.65fr]">
                    <div>
                        <div className="flex flex-wrap gap-2">
                            <Pill tone="good">Phase 33</Pill>
                            <Pill>TypeScript-first</Pill>
                            <Pill>No eval</Pill>
                            <Pill>Tenant RLS</Pill>
                        </div>
                        <h2 className="mt-4 font-semibold text-2xl">کد کوچک؛ کنترل production در سطح سیستم بزرگ</h2>
                        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-7">
                            source در Snippets به‌عنوان artifact نسخه‌دار مدیریت می‌شود. API هیچ JavaScript/TypeScript دلخواهی را در
                            request path اجرا نمی‌کند؛ انتشار فقط revision تأییدشده را برای consumerهای مورداعتماد در دسترس قرار
                            می‌دهد.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {["Safe Mode", "Validation Gate", "Immutable Revision", "Auto Quarantine"].map((item) => (
                            <div key={item} className="rounded-2xl border bg-background/70 p-3 font-medium">
                                {item}
                            </div>
                        ))}
                    </div>
                </div>
                {overview.data?.settings.safe_mode ? (
                    <div className="border-destructive/30 border-t bg-destructive/10 px-6 py-3 text-destructive text-sm">
                        Safe Mode فعال است؛ publish و resume متوقف‌اند ولی ویرایش، validation و rollback history در دسترس می‌ماند.
                    </div>
                ) : null}
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
                <Button
                    type="button"
                    variant="outline"
                    className="me-auto rounded-xl"
                    onClick={() => {
                        setSelectedId(null);
                        setTab("editor");
                    }}
                >
                    Snippet جدید
                </Button>
            </div>

            {tab === "overview" ? <OverviewPanel value={overview.data} loading={overview.isLoading} /> : null}
            {tab === "snippets" ? (
                <InventoryPanel
                    snippets={list.data ?? []}
                    loading={list.isLoading}
                    query={query}
                    setQuery={setQuery}
                    selectedId={selectedId}
                    onSelect={(id) => {
                        setSelectedId(id);
                        setTab("editor");
                    }}
                />
            ) : null}
            {tab === "editor" ? (
                <EditorPanel
                    key={selected?.public_id ?? "new"}
                    snippet={selected}
                    onCreated={(id) => {
                        setSelectedId(id);
                        setTab("editor");
                    }}
                />
            ) : null}
            {tab === "library" ? (
                <LibraryPanel
                    templates={library.data ?? []}
                    onUse={(template) => {
                        sessionStorage.setItem("snippets.template", JSON.stringify(template));
                        setSelectedId(null);
                        setTab("editor");
                    }}
                />
            ) : null}
            {tab === "revisions" ? <RevisionPanel snippet={selected} /> : null}
            {tab === "health" ? <HealthPanel overview={overview.data} executions={executions.data ?? []} /> : null}
            {tab === "settings" ? <SettingsPanel settings={settings.data} /> : null}
        </div>
    );
}

function OverviewPanel({ value, loading }: { value?: SnippetsOverview; loading: boolean }) {
    if (loading && !value) return <Card className="p-6 text-muted-foreground text-sm">در حال بارگذاری نمای کلی…</Card>;
    const counts = value?.counts;
    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <Metric label="کل" value={fa(counts?.total)} hint="تمام Snippetهای tenant جاری" />
                <Metric label="منتشرشده" value={fa(counts?.published)} hint="دارای active revision" />
                <Metric label="Draft" value={fa(counts?.drafts)} hint="هنوز وارد rollout نشده" />
                <Metric label="Quarantine" value={fa(counts?.quarantined)} hint="به‌دلیل failure evidence متوقف" />
                <Metric
                    label="Success rate"
                    value={
                        value?.health.success_rate === null || value?.health.success_rate === undefined
                            ? "—"
                            : `${fa(value.health.success_rate)}٪`
                    }
                    hint={`${fa(value?.health.samples_30d)} observation واقعی در ۳۰ روز`}
                />
                <Metric
                    label="p95"
                    value={
                        value?.health.p95_duration_ms === null || value?.health.p95_duration_ms === undefined
                            ? "—"
                            : `${fa(value.health.p95_duration_ms)} ms`
                    }
                    hint="از execution observationهای ثبت‌شده"
                />
            </div>
            <div className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
                <Card className="p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">Runtime matrix</h3>
                        <Pill>{value?.boundary ?? "managed_artifact_no_eval"}</Pill>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {Object.entries(value?.runtimes ?? {}).map(([runtime, count]) => (
                            <div key={runtime} className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-muted-foreground text-xs">{runtime}</div>
                                <div className="mt-1 font-semibold text-lg">{fa(count)}</div>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="overflow-hidden">
                    <div className="border-b p-4 font-semibold">آخرین انتشارها</div>
                    <div className="divide-y">
                        {(value?.recent_deployments ?? []).map((item) => (
                            <div
                                key={item.public_id}
                                className="grid gap-2 p-4 md:grid-cols-[1fr_auto_auto_auto] md:items-center"
                            >
                                <div>
                                    <div className="font-medium text-sm">{item.snippet_name ?? item.snippet_public_id}</div>
                                    <div className="mt-1 text-muted-foreground text-xs">{dateTime(item.created_at)}</div>
                                </div>
                                <Pill>{item.environment}</Pill>
                                <Pill>{item.action}</Pill>
                                <div className="text-muted-foreground text-xs">rollout {fa(item.rollout_percent)}٪</div>
                            </div>
                        ))}
                        {(value?.recent_deployments?.length ?? 0) === 0 ? (
                            <div className="p-5 text-muted-foreground text-sm">هنوز deployment ثبت نشده است.</div>
                        ) : null}
                    </div>
                </Card>
            </div>
        </div>
    );
}

function InventoryPanel({
    snippets,
    loading,
    query,
    setQuery,
    selectedId,
    onSelect,
}: {
    snippets: Snippet[];
    loading: boolean;
    query: string;
    setQuery: (value: string) => void;
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    return (
        <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="جست‌وجو در نام یا key…"
                    className="max-w-sm"
                />
                <Pill>{fa(snippets.length)} نتیجه</Pill>
                {loading ? <span className="text-muted-foreground text-xs">در حال همگام‌سازی…</span> : null}
            </div>
            <div className="divide-y">
                {snippets.map((item) => (
                    <button
                        type="button"
                        key={item.public_id}
                        className={cn(
                            "grid w-full gap-3 p-4 text-start transition-colors hover:bg-muted/30 lg:grid-cols-[1.4fr_.55fr_.55fr_.55fr_.55fr_auto] lg:items-center",
                            selectedId === item.public_id && "bg-primary/5",
                        )}
                        onClick={() => onSelect(item.public_id)}
                    >
                        <div>
                            <div className="font-medium">{item.name}</div>
                            <div className="mt-1 font-mono text-muted-foreground text-xs" dir="ltr">
                                {item.snippet_key}
                            </div>
                        </div>
                        <Pill tone={item.status === "published" ? "good" : item.status === "quarantined" ? "danger" : "neutral"}>
                            {item.status}
                        </Pill>
                        <Pill>{item.language}</Pill>
                        <Pill>{item.runtime}</Pill>
                        <Pill tone={item.risk_level === "high" || item.risk_level === "critical" ? "danger" : "neutral"}>
                            {item.risk_level}
                        </Pill>
                        <div className="text-muted-foreground text-xs">v{fa(item.version)}</div>
                    </button>
                ))}
                {snippets.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Snippet پیدا نشد.</div>
                ) : null}
            </div>
        </Card>
    );
}

type EditorForm = {
    snippet_key: string;
    name: string;
    description: string;
    language: Snippet["language"];
    runtime: Snippet["runtime"];
    placement: string;
    risk_level: Snippet["risk_level"];
    source: string;
    conditionsText: string;
    capabilitiesText: string;
    reason: string;
};

const blankForm: EditorForm = {
    snippet_key: "",
    name: "",
    description: "",
    language: "typescript",
    runtime: "build",
    placement: "global",
    risk_level: "medium",
    source: "",
    conditionsText: JSON.stringify({ operator: "and", rules: [] }, null, 2),
    capabilitiesText: "",
    reason: "ایجاد Snippet جدید",
};

function formFromSnippet(snippet: Snippet): EditorForm {
    return {
        snippet_key: snippet.snippet_key,
        name: snippet.name,
        description: snippet.description,
        language: snippet.language,
        runtime: snippet.runtime,
        placement: snippet.placement,
        risk_level: snippet.risk_level,
        source: snippet.source,
        conditionsText: JSON.stringify(snippet.conditions, null, 2),
        capabilitiesText: snippet.capabilities.join(", "),
        reason: "به‌روزرسانی Snippet",
    };
}

function EditorPanel({ snippet, onCreated }: { snippet: Snippet | null; onCreated: (id: string) => void }) {
    const [form, setForm] = useState<EditorForm>(() => (snippet ? formFromSnippet(snippet) : loadTemplateForm()));
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const create = useSnippetsMutation<Snippet, Record<string, unknown>>("POST");
    const update = useSnippetsMutation<Snippet, Record<string, unknown>>("PATCH");
    const action = useSnippetsMutation<Record<string, unknown>, Record<string, unknown>>("POST");

    useEffect(() => {
        setForm(snippet ? formFromSnippet(snippet) : loadTemplateForm());
    }, [snippet]);

    const parseConditions = () => {
        const parsed = JSON.parse(form.conditionsText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("conditions باید JSON object باشد.");
        return parsed as Record<string, unknown>;
    };
    const capabilities = () =>
        form.capabilitiesText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

    const start = () => {
        setMessage("");
        setError("");
    };
    const fail = (requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "عملیات ناموفق بود.");

    const save = () => {
        start();
        let conditions: Record<string, unknown>;
        try {
            conditions = parseConditions();
        } catch (parseError) {
            fail(parseError);
            return;
        }
        const body = {
            name: form.name,
            description: form.description,
            language: form.language,
            runtime: form.runtime,
            placement: form.placement,
            risk_level: form.risk_level,
            source: form.source,
            conditions,
            capabilities: capabilities(),
            reason: form.reason,
        };
        if (snippet) {
            update.mutate(
                { path: snippet.public_id, body },
                { onSuccess: () => setMessage("Revision جدید ذخیره شد و artifact دوباره اعتبارسنجی شد."), onError: fail },
            );
            return;
        }
        create.mutate(
            { path: "", body: { ...body, snippet_key: form.snippet_key } },
            {
                onSuccess: (created) => {
                    setMessage("Snippet ساخته شد.");
                    onCreated(created.public_id);
                },
                onError: fail,
            },
        );
    };

    const runAction = (path: string, body: Record<string, unknown>, success: string) => {
        start();
        action.mutate({ path, body }, { onSuccess: () => setMessage(success), onError: fail });
    };

    const validation = snippet?.last_validation && "checksum" in snippet.last_validation ? snippet.last_validation : null;
    const pending = create.isPending || update.isPending || action.isPending;

    return (
        <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
            <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-semibold">{snippet ? snippet.name : "Snippet جدید"}</h3>
                        <div className="mt-1 text-muted-foreground text-xs">
                            {snippet ? `revision head v${fa(snippet.version)}` : "Draft از صفر یا template کتابخانه"}
                        </div>
                    </div>
                    {snippet ? (
                        <Pill
                            tone={
                                snippet.status === "published" ? "good" : snippet.status === "quarantined" ? "danger" : "neutral"
                            }
                        >
                            {snippet.status}
                        </Pill>
                    ) : null}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="Key">
                        <Input
                            dir="ltr"
                            value={form.snippet_key}
                            disabled={Boolean(snippet)}
                            onChange={(event) => setForm((current) => ({ ...current, snippet_key: event.target.value }))}
                            placeholder="catalog.product.badge"
                        />
                    </Field>
                    <Field label="نام">
                        <Input
                            value={form.name}
                            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        />
                    </Field>
                    <Field label="Language">
                        <Select
                            value={form.language}
                            onValueChange={(value) =>
                                setForm((current) => ({ ...current, language: value as Snippet["language"] }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["typescript", "javascript", "css", "html", "json"] as const).map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Runtime">
                        <Select
                            value={form.runtime}
                            onValueChange={(value) =>
                                setForm((current) => ({ ...current, runtime: value as Snippet["runtime"] }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["build", "storefront", "admin", "server", "worker"] as const).map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Placement">
                        <Input
                            dir="ltr"
                            value={form.placement}
                            onChange={(event) => setForm((current) => ({ ...current, placement: event.target.value }))}
                        />
                    </Field>
                    <Field label="Risk">
                        <Select
                            value={form.risk_level}
                            onValueChange={(value) =>
                                setForm((current) => ({ ...current, risk_level: value as Snippet["risk_level"] }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(["low", "medium", "high", "critical"] as const).map((item) => (
                                    <SelectItem key={item} value={item}>
                                        {item}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <Field label="توضیحات" className="mt-4">
                    <Textarea
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        rows={3}
                    />
                </Field>
                <Field label="Source" className="mt-4">
                    <Textarea
                        dir="ltr"
                        spellCheck={false}
                        value={form.source}
                        onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
                        className="min-h-80 font-mono text-xs leading-6"
                    />
                </Field>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <Field label="Conditions JSON">
                        <Textarea
                            dir="ltr"
                            spellCheck={false}
                            value={form.conditionsText}
                            onChange={(event) => setForm((current) => ({ ...current, conditionsText: event.target.value }))}
                            className="min-h-52 font-mono text-xs leading-5"
                        />
                    </Field>
                    <div className="space-y-4">
                        <Field label="Capabilities">
                            <Input
                                dir="ltr"
                                value={form.capabilitiesText}
                                onChange={(event) => setForm((current) => ({ ...current, capabilitiesText: event.target.value }))}
                                placeholder="analytics_event, trusted_registry"
                            />
                        </Field>
                        <Field label="Reason">
                            <Textarea
                                value={form.reason}
                                onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                                rows={4}
                            />
                        </Field>
                    </div>
                </div>
                {message ? (
                    <div className="mt-4">
                        <SuccessBox message={message} />
                    </div>
                ) : null}
                {error ? (
                    <div className="mt-4">
                        <ErrorBox message={error} />
                    </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                    <Button type="button" disabled={pending} onClick={save}>
                        {snippet ? "ذخیره Revision" : "ایجاد Draft"}
                    </Button>
                    {snippet ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={pending}
                                onClick={() => runAction(`${snippet.public_id}/validate`, {}, "اعتبارسنجی تکمیل شد.")}
                            >
                                Validate
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={pending}
                                onClick={() =>
                                    runAction(
                                        `${snippet.public_id}/publish`,
                                        {
                                            environment: "staging",
                                            rollout_percent: 100,
                                            idempotency_key: operationKey(),
                                            reason: form.reason,
                                        },
                                        "Revision روی staging منتشر شد.",
                                    )
                                }
                            >
                                Publish staging
                            </Button>
                            <Button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                    runAction(
                                        `${snippet.public_id}/publish`,
                                        {
                                            environment: "production",
                                            rollout_percent: 100,
                                            idempotency_key: operationKey(),
                                            reason: form.reason,
                                        },
                                        "Revision برای production ثبت شد.",
                                    )
                                }
                            >
                                Publish production
                            </Button>
                            {snippet.status === "paused" || snippet.status === "quarantined" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() =>
                                        runAction(`${snippet.public_id}/resume`, { reason: form.reason }, "Snippet resume شد.")
                                    }
                                >
                                    Resume
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={pending}
                                    onClick={() =>
                                        runAction(`${snippet.public_id}/pause`, { reason: form.reason }, "Snippet pause شد.")
                                    }
                                >
                                    Pause
                                </Button>
                            )}
                        </>
                    ) : null}
                </div>
            </Card>

            <div className="space-y-5">
                <Card className="p-5">
                    <h3 className="font-semibold">Validation gate</h3>
                    {validation ? (
                        <div className="mt-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Pill tone={validation.publishable ? "good" : "danger"}>
                                    {validation.publishable ? "publishable" : "blocked"}
                                </Pill>
                                <Pill>{validation.boundary}</Pill>
                            </div>
                            <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-muted-foreground text-xs">SHA-256</div>
                                <div className="mt-1 break-all font-mono text-xs" dir="ltr">
                                    {validation.checksum}
                                </div>
                            </div>
                            {validation.errors.map((item) => (
                                <ErrorBox key={item.code} message={`${item.code}: ${item.message}`} />
                            ))}
                            {validation.warnings.map((item) => (
                                <div key={item.code} className="rounded-xl border bg-muted/20 p-3 text-sm">
                                    <div className="font-medium">{item.code}</div>
                                    <div className="mt-1 text-muted-foreground text-xs leading-5">{item.message}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 text-muted-foreground text-sm">
                            بعد از ایجاد یا ذخیره، validation evidence اینجا نمایش داده می‌شود.
                        </div>
                    )}
                </Card>
                <Card className="p-5">
                    <h3 className="font-semibold">مرز امنیتی</h3>
                    <div className="mt-3 space-y-2 text-muted-foreground text-sm leading-6">
                        <div>• API از eval، Function constructor، VM و shell استفاده نمی‌کند.</div>
                        <div>• Simulation فقط conditionها را ارزیابی می‌کند و source اجرا نمی‌شود.</div>
                        <div>• server/worker TS/JS فقط با trusted registry و build gate قابل انتشار است.</div>
                        <div>• production حساس با identity step-up محافظت می‌شود.</div>
                    </div>
                </Card>
            </div>
        </div>
    );
}

function loadTemplateForm(): EditorForm {
    if (typeof window === "undefined") return { ...blankForm };
    const raw = sessionStorage.getItem("snippets.template");
    if (!raw) return { ...blankForm };
    sessionStorage.removeItem("snippets.template");
    try {
        const template = JSON.parse(raw) as SnippetTemplate;
        return {
            ...blankForm,
            snippet_key: template.key,
            name: template.title,
            language: template.language,
            runtime: template.runtime,
            placement: template.placement,
            risk_level: template.risk_level,
            source: template.source,
            conditionsText: JSON.stringify(template.conditions, null, 2),
            capabilitiesText: template.capabilities.join(", "),
            reason: "ایجاد Draft از کتابخانه",
        };
    } catch {
        return { ...blankForm };
    }
}

function operationKey() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function LibraryPanel({ templates, onUse }: { templates: SnippetTemplate[]; onUse: (template: SnippetTemplate) => void }) {
    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
                <Card key={template.key} className="flex flex-col p-5">
                    <div className="flex flex-wrap gap-2">
                        <Pill>{template.language}</Pill>
                        <Pill>{template.runtime}</Pill>
                        <Pill>{template.risk_level}</Pill>
                    </div>
                    <h3 className="mt-4 font-semibold">{template.title}</h3>
                    <div className="mt-1 font-mono text-muted-foreground text-xs" dir="ltr">
                        {template.key}
                    </div>
                    <pre className="mt-4 max-h-40 overflow-auto rounded-xl border bg-muted/20 p-3 text-start text-xs" dir="ltr">
                        {template.source}
                    </pre>
                    <Button type="button" className="mt-4" variant="outline" onClick={() => onUse(template)}>
                        ساخت Draft از این Template
                    </Button>
                </Card>
            ))}
        </div>
    );
}

function RevisionPanel({ snippet }: { snippet: Snippet | null }) {
    if (!snippet) return <Card className="p-6 text-muted-foreground text-sm">ابتدا یک Snippet را انتخاب کنید.</Card>;
    return <RevisionContent snippet={snippet} />;
}

function RevisionContent({ snippet }: { snippet: Snippet }) {
    const revisions = useSnippetsResource<SnippetRevision[]>(`${snippet.public_id}/revisions`);
    const deployments = useSnippetsResource<SnippetDeployment[]>(`${snippet.public_id}/deployments`);
    const rollback = useSnippetsMutation<Record<string, unknown>, Record<string, unknown>>("POST");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    return (
        <div className="grid gap-5 xl:grid-cols-2">
            <Card className="overflow-hidden">
                <div className="border-b p-4 font-semibold">Revision history · {snippet.name}</div>
                <div className="divide-y">
                    {(revisions.data ?? []).map((revision) => (
                        <div key={revision.id} className="p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <span className="font-semibold">v{fa(revision.revision)}</span>
                                    <span className="me-2 text-muted-foreground text-xs">{dateTime(revision.created_at)}</span>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={rollback.isPending}
                                    onClick={() => {
                                        setMessage("");
                                        setError("");
                                        rollback.mutate(
                                            {
                                                path: `${snippet.public_id}/rollback`,
                                                body: {
                                                    revision: revision.revision,
                                                    environment: "production",
                                                    rollout_percent: 100,
                                                    idempotency_key: operationKey(),
                                                    reason: `rollback to revision ${revision.revision}`,
                                                },
                                            },
                                            {
                                                onSuccess: () => setMessage(`Rollback به v${revision.revision} ثبت شد.`),
                                                onError: (e) => setError(e.message),
                                            },
                                        );
                                    }}
                                >
                                    Rollback
                                </Button>
                            </div>
                            <div className="mt-2 break-all font-mono text-muted-foreground text-xs" dir="ltr">
                                {revision.source_sha256}
                            </div>
                            <div className="mt-2 text-muted-foreground text-xs">{revision.reason}</div>
                        </div>
                    ))}
                </div>
            </Card>
            <Card className="overflow-hidden">
                <div className="border-b p-4 font-semibold">Deployment history</div>
                {message ? (
                    <div className="p-4">
                        <SuccessBox message={message} />
                    </div>
                ) : null}
                {error ? (
                    <div className="p-4">
                        <ErrorBox message={error} />
                    </div>
                ) : null}
                <div className="divide-y">
                    {(deployments.data ?? []).map((deployment) => (
                        <div key={deployment.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                            <div>
                                <div className="font-medium text-sm">{deployment.action}</div>
                                <div className="mt-1 text-muted-foreground text-xs">{dateTime(deployment.created_at)}</div>
                            </div>
                            <Pill>{deployment.environment}</Pill>
                            <Pill>{deployment.status}</Pill>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function HealthPanel({ overview, executions }: { overview?: SnippetsOverview; executions: SnippetExecution[] }) {
    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
                <Metric
                    label="Observation ۳۰ روز"
                    value={fa(overview?.health.samples_30d)}
                    hint="فقط داده ثبت‌شده توسط trusted consumer"
                />
                <Metric
                    label="Success rate"
                    value={overview?.health.success_rate == null ? "—" : `${fa(overview.health.success_rate)}٪`}
                    hint="در نبود sample مقدار ساختگی نشان داده نمی‌شود"
                />
                <Metric
                    label="p95 latency"
                    value={overview?.health.p95_duration_ms == null ? "—" : `${fa(overview.health.p95_duration_ms)} ms`}
                    hint="از duration observationها"
                />
            </div>
            <Card className="overflow-hidden">
                <div className="border-b p-4 font-semibold">Execution observations</div>
                <div className="divide-y">
                    {executions.map((item) => (
                        <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1.2fr_.7fr_.45fr_.45fr_.7fr] lg:items-center">
                            <div>
                                <div className="font-medium text-sm">{item.snippet_name}</div>
                                <div className="mt-1 text-muted-foreground text-xs">{dateTime(item.observed_at)}</div>
                            </div>
                            <div className="font-mono text-xs" dir="ltr">
                                {item.consumer_key}
                            </div>
                            <Pill tone={item.outcome === "success" ? "good" : item.outcome === "failure" ? "danger" : "neutral"}>
                                {item.outcome}
                            </Pill>
                            <div className="text-muted-foreground text-xs">
                                {item.duration_ms == null ? "—" : `${fa(item.duration_ms)} ms`}
                            </div>
                            <div className="truncate font-mono text-muted-foreground text-xs" dir="ltr">
                                {item.request_id ?? "—"}
                            </div>
                        </div>
                    ))}
                    {executions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">هنوز execution evidence ثبت نشده است.</div>
                    ) : null}
                </div>
            </Card>
        </div>
    );
}

function SettingsPanel({ settings }: { settings?: SnippetSettings }) {
    const update = useSnippetsMutation<SnippetSettings, Record<string, unknown>>("PATCH");
    const safeMode = useSnippetsMutation<SnippetSettings, Record<string, unknown>>("POST");
    const [form, setForm] = useState(() => ({
        production_publish_requires_step_up: settings?.production_publish_requires_step_up ?? true,
        auto_quarantine_threshold: settings?.auto_quarantine_threshold ?? 3,
        default_environment: settings?.default_environment ?? "staging",
        max_rollout_percent: settings?.max_rollout_percent ?? 100,
    }));
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!settings) return;
        setForm({
            production_publish_requires_step_up: settings.production_publish_requires_step_up,
            auto_quarantine_threshold: settings.auto_quarantine_threshold,
            default_environment: settings.default_environment,
            max_rollout_percent: settings.max_rollout_percent,
        });
    }, [settings]);

    const save = () => {
        setMessage("");
        setError("");
        update.mutate(
            { path: "settings", body: { ...form, reason: "Snippets settings update" } },
            { onSuccess: () => setMessage("تنظیمات ذخیره شد."), onError: (e) => setError(e.message) },
        );
    };
    const toggleSafeMode = () => {
        if (!settings) return;
        setMessage("");
        setError("");
        const next = !settings.safe_mode;
        safeMode.mutate(
            {
                path: `safe-mode/${next ? "enable" : "disable"}`,
                body: { reason: next ? "operator emergency safe mode" : "operator safe mode recovery complete" },
            },
            {
                onSuccess: () => setMessage(next ? "Safe Mode فعال شد." : "Safe Mode غیرفعال شد."),
                onError: (e) => setError(e.message),
            },
        );
    };

    return (
        <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
            <Card className={cn("p-5", settings?.safe_mode && "border-destructive/30 bg-destructive/5")}>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="font-semibold">Safe Mode</h3>
                        <p className="mt-2 text-muted-foreground text-sm leading-6">
                            Kill switch tenant-local؛ فعال‌سازی یا خروج از آن نیازمند identity step-up است.
                        </p>
                    </div>
                    <Switch
                        checked={Boolean(settings?.safe_mode)}
                        onCheckedChange={toggleSafeMode}
                        disabled={!settings || safeMode.isPending}
                    />
                </div>
                <div className="mt-4 rounded-xl border bg-background/70 p-3 text-muted-foreground text-xs leading-6">
                    در Safe Mode هیچ artifact فعالی resolve نمی‌شود، اما draft، revision و validation قابل مدیریت باقی می‌مانند.
                </div>
            </Card>
            <Card className="p-5">
                <h3 className="font-semibold">Policy تنظیمات</h3>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-xl border p-3 sm:col-span-2">
                        <div>
                            <div className="font-medium text-sm">Step-up برای Production</div>
                            <div className="mt-1 text-muted-foreground text-xs">
                                انتشار production نیازمند احراز هویت اخیر باشد.
                            </div>
                        </div>
                        <Switch
                            checked={form.production_publish_requires_step_up}
                            onCheckedChange={(value) =>
                                setForm((current) => ({ ...current, production_publish_requires_step_up: value }))
                            }
                        />
                    </div>
                    <Field label="Auto quarantine threshold">
                        <Input
                            type="number"
                            min={1}
                            max={20}
                            value={form.auto_quarantine_threshold}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, auto_quarantine_threshold: Number(event.target.value) }))
                            }
                        />
                    </Field>
                    <Field label="Rollout ceiling">
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            value={form.max_rollout_percent}
                            onChange={(event) =>
                                setForm((current) => ({ ...current, max_rollout_percent: Number(event.target.value) }))
                            }
                        />
                    </Field>
                    <Field label="Default environment">
                        <Select
                            value={form.default_environment}
                            onValueChange={(value) =>
                                setForm((current) => ({
                                    ...current,
                                    default_environment: value as SnippetSettings["default_environment"],
                                }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="preview">preview</SelectItem>
                                <SelectItem value="staging">staging</SelectItem>
                                <SelectItem value="production">production</SelectItem>
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                {message ? (
                    <div className="mt-4">
                        <SuccessBox message={message} />
                    </div>
                ) : null}
                {error ? (
                    <div className="mt-4">
                        <ErrorBox message={error} />
                    </div>
                ) : null}
                <Button type="button" className="mt-5" disabled={update.isPending} onClick={save}>
                    ذخیره تنظیمات
                </Button>
            </Card>
        </div>
    );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={className}>
            <Label className="mb-2 block text-muted-foreground text-xs">{label}</Label>
            {children}
        </div>
    );
}
