"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { toast } from "#/components/ui/toast";
import { Activity, BadgePercent, Pause, Play, Plus, ShieldCheck, Sparkles, Store, Target, WandSparkles } from "#/icons";
import { useProductsList } from "#/lib/products/queries";
import {
    type Campaign,
    type CampaignWrite,
    useCampaignAction,
    useCampaigns,
    useCreateCampaign,
    usePersonalizationOverview,
    usePhase9Consents,
    usePhase9Events,
    usePhase9Health,
    usePlacements,
    useRuntimeSettings,
    useSimulation,
    useUpdatePlacement,
    useUpdateRuntimeSettings,
} from "#/lib/queries/personalization";

const TABS = ["overview", "campaigns", "homepage", "personalization", "simulator", "privacy"] as const;
type Tab = (typeof TABS)[number];

export function PersonalizationWorkspace() {
    const t = useTranslations("Personalization");
    const [tab, setTab] = useState<Tab>("overview");
    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                            <BadgePercent className="size-5" aria-hidden="true" />
                        </span>
                        <Badge variant="secondary">Phase 9</Badge>
                    </div>
                    <h1 className="font-semibold text-2xl tracking-tight">{t("title")}</h1>
                    <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{t("subtitle")}</p>
                </div>
                <SystemState />
            </div>
            <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/20 p-1">
                {TABS.map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => setTab(k)}
                        className={`whitespace-nowrap rounded-lg px-3 py-2 font-medium text-sm transition-colors ${tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        {t(`tabs.${k}`)}
                    </button>
                ))}
            </div>
            {tab === "overview" && <Overview />}
            {tab === "campaigns" && <Campaigns />}
            {tab === "homepage" && <HomepageSettings />}
            {tab === "personalization" && <Placements />}
            {tab === "simulator" && <Simulator />}
            {tab === "privacy" && <PrivacyHealth />}
        </section>
    );
}
function Info({ text }: { text: string }) {
    return <HelperTooltip>{text}</HelperTooltip>;
}
function SystemState() {
    const t = useTranslations("Personalization");
    const q = useRuntimeSettings();
    const healthy = q.data?.enabled && !q.data?.kill_switch;
    return (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
            <span className={`size-2 rounded-full ${healthy ? "bg-success" : "bg-warning"}`} />
            <span>{q.isPending ? t("common.loading") : healthy ? t("state.active") : t("state.safeMode")}</span>
            <Info text={t("help.systemState")} />
        </div>
    );
}
function Overview() {
    const t = useTranslations("Personalization");
    const q = usePersonalizationOverview();
    const d = q.data?.data ?? {};
    const cards = [
        { k: "events", v: Number(d.event_count ?? 0), i: Activity },
        { k: "exposures", v: Number(d.exposure_count ?? 0), i: Target },
        { k: "activeCampaigns", v: Number((d.campaigns as Record<string, number> | undefined)?.active ?? 0), i: BadgePercent },
        { k: "attribution", v: t("overview.descriptiveOnly"), i: Sparkles },
    ];
    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {cards.map((c) => (
                    <Card key={c.k}>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <c.i className="size-4" aria-hidden="true" />
                                {t(`overview.${c.k}`)}
                                <Info text={t(`help.${c.k}`)} />
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="font-semibold text-2xl">{c.v}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t("overview.guardrails")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                    <Guard icon={ShieldCheck} title={t("overview.canonicalPricing")} body={t("overview.canonicalPricingBody")} />
                    <Guard icon={Sparkles} title={t("overview.noFakeLift")} body={t("overview.noFakeLiftBody")} />
                    <Guard icon={Target} title={t("overview.consentAware")} body={t("overview.consentAwareBody")} />
                </CardContent>
            </Card>
        </div>
    );
}
function Guard({ icon: Icon, title, body }: { icon: typeof ShieldCheck; title: string; body: string }) {
    return (
        <div className="rounded-xl border bg-muted/20 p-4">
            <Icon className="mb-3 size-5 text-primary" />
            <div className="font-medium text-sm">{title}</div>
            <p className="mt-1 text-muted-foreground text-xs leading-5">{body}</p>
        </div>
    );
}
function Campaigns() {
    const t = useTranslations("Personalization");
    const list = useCampaigns();
    const [open, setOpen] = useState(false);
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="font-semibold text-lg">{t("campaigns.title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("campaigns.subtitle")}</p>
                </div>
                <Button onClick={() => setOpen(!open)}>
                    <Plus className="me-2 size-4" />
                    {t("campaigns.new")}
                </Button>
            </div>
            {open && <CampaignForm onDone={() => setOpen(false)} />}
            <div className="grid gap-3">
                {list.isPending ? (
                    <State text={t("common.loading")} />
                ) : list.isError ? (
                    <State text={t("common.error")} />
                ) : list.data?.length ? (
                    list.data.map((c) => <CampaignRow key={c.id} c={c} />)
                ) : (
                    <State text={t("campaigns.empty")} />
                )}
            </div>
        </div>
    );
}
function CampaignRow({ c }: { c: Campaign }) {
    const t = useTranslations("Personalization");
    const publish = useCampaignAction("publish"),
        pause = useCampaignAction("pause");
    const act = async (kind: "publish" | "pause") => {
        try {
            await (kind === "publish" ? publish : pause).mutateAsync({ id: c.id, expected_version: c.version });
            toast.add({ description: t("common.saved"), data: { tone: "success" } });
        } catch {
            toast.add({ description: t("common.error"), data: { tone: "error" } });
        }
    };
    return (
        <Card>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant={c.status === "active" ? "default" : "secondary"}>{t(`status.${c.status}`)}</Badge>
                        <Badge variant="outline">{t(`modes.${c.selection_mode}`)}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
                        <span>{t("campaigns.discount", { value: c.min_discount_percent })}</span>
                        <span>{t("campaigns.items", { value: c.max_items })}</span>
                        <span>v{c.version}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {c.status === "active" ? (
                        <Button variant="outline" onClick={() => act("pause")} disabled={pause.isPending}>
                            <Pause className="me-2 size-4" />
                            {t("campaigns.pause")}
                        </Button>
                    ) : (
                        <Button onClick={() => act("publish")} disabled={publish.isPending}>
                            <Play className="me-2 size-4" />
                            {t("campaigns.publish")}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
function CampaignForm({ onDone }: { onDone: () => void }) {
    const t = useTranslations("Personalization");
    const create = useCreateCampaign();
    const products = useProductsList({
        status: "publish",
        on_sale: true,
        query: { page: 1, limit: 50, filter: [], filterOr: [], sort: [] },
    });
    const [name, setName] = useState("");
    const [mode, setMode] = useState<CampaignWrite["selection_mode"]>("smart");
    const [discount, setDiscount] = useState(15);
    const [max, setMax] = useState(8);
    const [selected, setSelected] = useState<number[]>([]);
    const save = async () => {
        try {
            await create.mutateAsync({
                name,
                selection_mode: mode,
                min_discount_percent: discount,
                max_items: max,
                rotation_minutes: 60,
                product_ids: selected,
                pinned_product_ids: mode === "hybrid" ? selected : [],
            });
            toast.add({ description: t("common.saved"), data: { tone: "success" } });
            onDone();
        } catch {
            toast.add({ description: t("common.error"), data: { tone: "error" } });
        }
    };
    return (
        <Card className="border-primary/20">
            <CardHeader>
                <CardTitle className="text-base">{t("builder.title")}</CardTitle>
                <CardDescription>{t("builder.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field label={t("builder.name")} help={t("help.campaignName")}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                    <Field label={t("builder.mode")} help={t("help.selectionMode")}>
                        <Select value={mode} onValueChange={(v) => setMode(v as CampaignWrite["selection_mode"])}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {["smart", "manual", "controlled_random", "hybrid"].map((v) => (
                                    <SelectItem key={v} value={v}>
                                        {t(`modes.${v}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t("builder.minDiscount")} help={t("help.minDiscount")}>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            value={discount}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                        />
                    </Field>
                    <Field label={t("builder.maxItems")} help={t("help.maxItems")}>
                        <Input type="number" min={1} max={48} value={max} onChange={(e) => setMax(Number(e.target.value))} />
                    </Field>
                </div>
                {(mode === "manual" || mode === "hybrid") && (
                    <div>
                        <div className="mb-2 flex items-center gap-2 font-medium text-sm">
                            {t("builder.products")}
                            <Info text={t("help.realProducts")} />
                        </div>
                        <div className="grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
                            {products.data?.data.map((p) => (
                                <button
                                    type="button"
                                    key={p.id}
                                    onClick={() =>
                                        setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))
                                    }
                                    className={`flex items-center gap-3 rounded-lg border p-2 text-start ${selected.includes(p.id) ? "border-primary bg-primary/5" : ""}`}
                                >
                                    <div className="size-10 overflow-hidden rounded-md bg-muted">
                                        {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : null}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-sm">{p.name.fa || p.name.en}</div>
                                        <div className="text-muted-foreground text-xs">
                                            #{p.id} · {p.stockStatus}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onDone}>
                        {t("common.cancel")}
                    </Button>
                    <Button onClick={save} disabled={create.isPending || name.trim().length < 2}>
                        {create.isPending ? t("common.saving") : t("common.save")}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
function HomepageSettings() {
    const t = useTranslations("Personalization");
    const settings = useRuntimeSettings(),
        campaigns = useCampaigns(),
        update = useUpdateRuntimeSettings();
    const [draft, setDraft] = useState<null | {
        homepage_enabled: boolean;
        homepage_campaign_id: number | null;
        default_limit: number;
    }>(null);
    const value =
        draft ??
        (settings.data
            ? {
                  homepage_enabled: settings.data.homepage_enabled,
                  homepage_campaign_id: settings.data.homepage_campaign_id,
                  default_limit: settings.data.default_limit,
              }
            : null);
    if (!value) return <State text={t("common.loading")} />;
    const save = async () => {
        await update.mutateAsync(value);
        setDraft(null);
        toast.add({ description: t("common.saved"), data: { tone: "success" } });
    };
    return (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Store className="size-4" />
                        {t("homepage.title")}
                        <Info text={t("help.homepage")} />
                    </CardTitle>
                    <CardDescription>{t("homepage.subtitle")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Toggle
                        label={t("homepage.enabled")}
                        help={t("help.homepageEnabled")}
                        checked={value.homepage_enabled}
                        onChange={(v) => setDraft({ ...value, homepage_enabled: v })}
                    />
                    <Field label={t("homepage.campaign")} help={t("help.homepageCampaign")}>
                        <Select
                            value={String(value.homepage_campaign_id ?? "auto")}
                            onValueChange={(v) => setDraft({ ...value, homepage_campaign_id: v === "auto" ? null : Number(v) })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">{t("homepage.auto")}</SelectItem>
                                {campaigns.data?.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label={t("homepage.limit")} help={t("help.homepageLimit")}>
                        <Input
                            type="number"
                            min={1}
                            max={24}
                            value={value.default_limit}
                            onChange={(e) => setDraft({ ...value, default_limit: Number(e.target.value) })}
                        />
                    </Field>
                    <Button onClick={save} disabled={update.isPending}>
                        {t("common.save")}
                    </Button>
                </CardContent>
            </Card>
            <PreviewCard />
        </div>
    );
}
function PreviewCard() {
    const t = useTranslations("Personalization");
    return (
        <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary/15 via-background to-muted p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold">{t("homepage.previewTitle")}</div>
                        <div className="text-muted-foreground text-xs">{t("homepage.previewSubtitle")}</div>
                    </div>
                    <Sparkles className="size-5 text-primary" />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                    {[38, 31, 27, 22].map((x) => (
                        <div key={x} className="rounded-lg border bg-background/90 p-2">
                            <div className="aspect-square rounded-md bg-muted" />
                            <div className="mt-2 h-2 rounded bg-muted" />
                            <Badge className="mt-2">٪{x}-</Badge>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}
function Placements() {
    const t = useTranslations("Personalization");
    const q = usePlacements();
    const update = useUpdatePlacement();
    return (
        <div className="space-y-4">
            <div>
                <h2 className="font-semibold text-lg">{t("placement.title")}</h2>
                <p className="text-muted-foreground text-sm">{t("placement.subtitle")}</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
                {q.data?.map((p) => (
                    <Card key={p.placement}>
                        <CardContent className="space-y-4 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-medium">
                                    <Target className="size-4" />
                                    {t(`placement.${p.placement}`)}
                                    <Info text={t("help.placement")} />
                                </div>
                                <Switch
                                    aria-label={`${t("placement.enabled")} - ${t(`placement.${p.placement}`)}`}
                                    checked={p.enabled}
                                    onCheckedChange={(enabled) =>
                                        update.mutate({ placement: p.placement, expected_version: p.version, enabled })
                                    }
                                />
                            </div>
                            <div className="flex gap-2 text-muted-foreground text-xs">
                                <Badge variant="outline">{p.strategy}</Badge>
                                <span>{t("placement.max", { value: p.max_items })}</span>
                                <span>{t("placement.explore", { value: p.exploration_percent })}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
function Simulator() {
    const t = useTranslations("Personalization");
    const sim = useSimulation();
    const [placement, setPlacement] = useState("home");
    const run = () => sim.mutate({ placement, limit: 8 });
    return (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <WandSparkles className="size-4" />
                        {t("simulator.title")}
                        <Info text={t("help.simulator")} />
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Field label={t("simulator.placement")} help={t("help.simulatorPlacement")}>
                        <Select value={placement} onValueChange={(value) => setPlacement(String(value ?? ""))}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {["home", "product", "cart", "search", "account"].map((v) => (
                                    <SelectItem key={v} value={v}>
                                        {t(`placement.${v}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Button className="w-full" onClick={run} disabled={sim.isPending}>
                        {sim.isPending ? t("simulator.running") : t("simulator.run")}
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t("simulator.trace")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {sim.data ? (
                        <pre className="max-h-[520px] overflow-auto rounded-lg bg-muted p-4 text-xs" dir="ltr">
                            {JSON.stringify(sim.data.data, null, 2)}
                        </pre>
                    ) : (
                        <State text={t("simulator.empty")} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
function PrivacyHealth() {
    const t = useTranslations("Personalization");
    const health = usePhase9Health(),
        events = usePhase9Events(),
        consents = usePhase9Consents(),
        settings = useRuntimeSettings(),
        update = useUpdateRuntimeSettings();
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
                <Metric title={t("privacy.health")} value={String(health.data?.status ?? "—")} help={t("help.health")} />
                <Metric title={t("privacy.events")} value={String(events.data?.length ?? 0)} help={t("help.events")} />
                <Metric title={t("privacy.consents")} value={String(consents.data?.length ?? 0)} help={t("help.consents")} />
            </div>
            <Card className={settings.data?.kill_switch ? "border-destructive/40" : ""}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="size-4" />
                        {t("privacy.controls")}
                        <Info text={t("help.privacy")} />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Toggle
                        label={t("privacy.killSwitch")}
                        help={t("help.killSwitch")}
                        checked={settings.data?.kill_switch ?? false}
                        danger
                        onChange={(kill_switch) => update.mutate({ kill_switch })}
                    />
                </CardContent>
            </Card>
            <div className="grid gap-4 xl:grid-cols-2">
                <RecordList title={t("privacy.recentEvents")} rows={events.data ?? []} />
                <RecordList title={t("privacy.recentConsents")} rows={consents.data ?? []} />
            </div>
        </div>
    );
}
function Metric({ title, value, help }: { title: string; value: string; help: string }) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    {title}
                    <Info text={help} />
                </div>
                <div className="mt-2 font-semibold text-xl">{value}</div>
            </CardContent>
        </Card>
    );
}
function RecordList({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
                {rows.slice(0, 12).map((r, i) => (
                    <div key={String(r.id ?? i)} className="rounded-lg border p-3 text-xs">
                        <div className="grid gap-1">
                            {Object.entries(r)
                                .slice(0, 7)
                                .map(([k, v]) => (
                                    <div key={k} className="flex gap-2">
                                        <span className="min-w-28 text-muted-foreground">{k}</span>
                                        <span
                                            className="break-all"
                                            dir={
                                                typeof v === "string" && [...v].every((char) => char.charCodeAt(0) <= 0x7f)
                                                    ? "ltr"
                                                    : undefined
                                            }
                                        >
                                            {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
                {!rows.length ? <State text="—" /> : null}
            </CardContent>
        </Card>
    );
}
function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-2">
                {label}
                <Info text={help} />
            </Label>
            {children}
        </div>
    );
}
function Toggle({
    label,
    help,
    checked,
    onChange,
    danger = false,
}: {
    label: string;
    help: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    danger?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between gap-4 rounded-xl border p-4 ${danger && checked ? "border-destructive/40 bg-destructive/5" : ""}`}
        >
            <div>
                <div className="flex items-center gap-2 font-medium text-sm">
                    {label}
                    <Info text={help} />
                </div>
            </div>
            <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}
function State({ text }: { text: string }) {
    return <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">{text}</div>;
}
