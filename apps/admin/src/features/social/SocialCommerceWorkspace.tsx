"use client";

import { useLocale } from "next-intl";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCard } from "#/components/StatCard";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { Activity, ChartNoAxesCombined, MessageSquare, ShieldCheck, ShoppingBag, Sparkles, Users, FileVideo } from "#/icons";
import {
    useConvertSocialThreadToTicket,
    useCreateSocialContent,
    useModerateSocialCase,
    useSocialAnalytics,
    useSocialContents,
    useSocialContract,
    useSocialModeration,
    useSocialSummary,
    useSocialThreads,
    useTransitionSocialContent,
} from "#/lib/queries/social";

type View = "overview" | "studio" | "community" | "moderation" | "analytics";
type R = Record<string, unknown>;
const rec = (v: unknown): R => (v && typeof v === "object" && !Array.isArray(v) ? (v as R) : {});
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const Empty = ({ fa }: { fa: boolean }) => (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {fa ? "هنوز داده‌ای برای نمایش وجود ندارد." : "No data to display yet."}
    </div>
);
const Failed = ({ fa, retry }: { fa: boolean; retry: () => void }) => (
    <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10">
            <ShieldCheck className="size-6 text-danger" />
            <p>{fa ? "داده‌های Social Commerce بارگذاری نشد." : "Social Commerce data failed to load."}</p>
            <Button variant="outline" onClick={retry}>
                {fa ? "تلاش دوباره" : "Retry"}
            </Button>
        </CardContent>
    </Card>
);

export function SocialCommerceWorkspace({ view }: { view: View }) {
    const fa = useLocale() === "fa";
    return (
        <div className="space-y-6">
            <header className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge>
                        <Sparkles className="me-1 size-3" />
                        Phase 8
                    </Badge>
                    <Badge variant="outline">Social + Commerce + Community</Badge>
                </div>
                <h1 className="mt-3 font-semibold text-2xl">Social Commerce OS</h1>
                <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
                    {fa
                        ? "استوری، ویدئو، Live Shopping، Community، Moderation و Attribution روی Product، Inventory، Order و Ticket اصلی اجرا می‌شوند؛ بدون دامنه موازی."
                        : "Stories, video, Live Shopping, Community, Moderation and Attribution stay on canonical Product, Inventory, Order and Ticket authorities."}
                </p>
            </header>
            {view === "overview" ? (
                <Overview fa={fa} />
            ) : view === "studio" ? (
                <Studio fa={fa} />
            ) : view === "community" ? (
                <Community fa={fa} />
            ) : view === "moderation" ? (
                <Moderation fa={fa} />
            ) : (
                <Analytics fa={fa} />
            )}
        </div>
    );
}
function Overview({ fa }: { fa: boolean }) {
    const q = useSocialSummary(),
        c = useSocialContract();
    if (q.isError || c.isError)
        return (
            <Failed
                fa={fa}
                retry={() => {
                    void q.refetch();
                    void c.refetch();
                }}
            />
        );
    const d = rec(q.data),
        content = rec(d.content),
        mod = rec(d.moderation),
        conversations = rec(d.conversations);
    const rows = Object.entries(content).map(([name, value]) => ({ name, value: num(value) }));
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label={fa ? "محتوای Social" : "Social content"}
                    value={Object.values(content)
                        .reduce<number>((s, x) => s + num(x), 0)
                        .toLocaleString()}
                    icon={FileVideo}
                    tone="info"
                />
                <StatCard
                    label={fa ? "تعامل ۳۰ روزه" : "30d interactions"}
                    value={num(d.interactions_30d).toLocaleString()}
                    icon={Activity}
                    tone="success"
                />
                <StatCard
                    label={fa ? "گفت‌وگوها" : "Conversations"}
                    value={Object.values(conversations)
                        .reduce<number>((s, x) => s + num(x), 0)
                        .toLocaleString()}
                    icon={MessageSquare}
                />
                <StatCard
                    label="Moderation"
                    value={(num(mod.pending_review) + num(mod.appealed)).toLocaleString()}
                    icon={ShieldCheck}
                    tone="warning"
                />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Capability health</CardTitle>
                        <CardDescription>Draft → Review → Published lifecycle</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {rows.length ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={rows}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="value" fill="hsl(var(--chart-1))" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <Empty fa={fa} />
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Attribution integrity</CardTitle>
                        <CardDescription>{fa ? "مرزهای معماری قابل ممیزی" : "Auditable architecture boundaries"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="rounded-lg bg-muted p-3 text-sm">Product/Inventory: canonical live read</p>
                        <p className="rounded-lg bg-muted p-3 text-sm">Order/Payment: canonical commerce path</p>
                        <p className="rounded-lg bg-muted p-3 text-sm">Support: Convert to Ticket</p>
                        <pre className="overflow-auto rounded-lg border p-3 text-xs">{JSON.stringify(c.data ?? {}, null, 2)}</pre>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
function Studio({ fa }: { fa: boolean }) {
    const q = useSocialContents(),
        create = useCreateSocialContent(),
        transition = useTransitionSocialContent();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [kind, setKind] = useState<"story" | "video" | "live" | "post" | "question">("story");
    if (q.isError) return <Failed fa={fa} retry={() => void q.refetch()} />;
    const items = q.data?.data ?? [];
    return (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <Card>
                <CardHeader>
                    <CardTitle>Creator Studio</CardTitle>
                    <CardDescription>Draft → Review → Publish</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <select
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as typeof kind)}
                    >
                        {["story", "video", "live", "post", "question"].map((x) => (
                            <option key={x}>{x}</option>
                        ))}
                    </select>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={fa ? "عنوان" : "Title"} />
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={fa ? "توضیحات" : "Description"}
                    />
                    <Button
                        className="w-full"
                        disabled={!title.trim() || create.isPending}
                        onClick={async () => {
                            await create.mutateAsync({ kind, title: title.trim(), description: description.trim() || undefined });
                            setTitle("");
                            setDescription("");
                        }}
                    >
                        {fa ? "ساخت Draft" : "Create draft"}
                    </Button>
                    <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                        <strong>Media Governance</strong>
                        <p className="mt-1 text-muted-foreground">
                            Transcript / Caption Evidence, rights, security scan and publishable gate are enforced by the API.
                        </p>
                    </div>
                </CardContent>
            </Card>
            <div className="space-y-3">
                {items.map((item) => (
                    <Card key={item.id}>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                            <div>
                                <div className="flex gap-2">
                                    <strong>{item.title}</strong>
                                    <Badge variant="outline">{item.kind}</Badge>
                                    <Badge>{item.status}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    #{item.id} · v{item.version} · {item.moderation_state}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {item.status === "draft" ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            transition.mutate({ id: item.id, expected_version: item.version, status: "review" })
                                        }
                                    >
                                        {fa ? "ارسال بررسی" : "Review"}
                                    </Button>
                                ) : null}
                                {item.status === "review" && item.moderation_state === "approved" ? (
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            transition.mutate({
                                                id: item.id,
                                                expected_version: item.version,
                                                status: "published",
                                            })
                                        }
                                    >
                                        {fa ? "انتشار" : "Publish"}
                                    </Button>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {!items.length ? <Empty fa={fa} /> : null}
            </div>
        </div>
    );
}
function Community({ fa }: { fa: boolean }) {
    const q = useSocialThreads(),
        convert = useConvertSocialThreadToTicket();
    if (q.isError) return <Failed fa={fa} retry={() => void q.refetch()} />;
    const items = q.data?.data ?? [];
    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Open" value={items.filter((x) => x.status === "open").length.toString()} icon={MessageSquare} />
                <StatCard label="Private" value={items.filter((x) => x.kind === "private").length.toString()} icon={Users} />
                <StatCard
                    label="Convert to Ticket"
                    value={items.filter((x) => x.converted_ticket_id).length.toString()}
                    icon={ShoppingBag}
                    tone="success"
                />
            </div>
            {items.map((x) => (
                <Card key={x.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                        <div>
                            <strong>{x.subject}</strong>
                            <p className="text-xs text-muted-foreground">
                                #{x.id} · {x.kind} · {x.status}
                            </p>
                        </div>
                        {!x.converted_ticket_id ? (
                            <Button size="sm" onClick={() => convert.mutate(x.id)}>
                                Convert to Ticket
                            </Button>
                        ) : (
                            <Badge variant="outline">Ticket #{x.converted_ticket_id}</Badge>
                        )}
                    </CardContent>
                </Card>
            ))}
            {!items.length ? <Empty fa={fa} /> : null}
        </div>
    );
}
function Moderation({ fa }: { fa: boolean }) {
    const q = useSocialModeration(),
        act = useModerateSocialCase();
    if (q.isError) return <Failed fa={fa} retry={() => void q.refetch()} />;
    const items = q.data?.data ?? [];
    return (
        <div className="space-y-3">
            {items.map((x) => (
                <Card key={x.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                            <strong>Moderation #{x.id}</strong>
                            <p className="text-xs text-muted-foreground">
                                {x.target_type}:{x.target_id} · {x.category} · {x.status}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act.mutate({ id: x.id, expected_version: x.version, action: "restore" })}
                            >
                                Restore
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => act.mutate({ id: x.id, expected_version: x.version, action: "remove" })}
                            >
                                Remove
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}
            {!items.length ? <Empty fa={fa} /> : null}
        </div>
    );
}
function Analytics({ fa }: { fa: boolean }) {
    const q = useSocialAnalytics();
    if (q.isError) return <Failed fa={fa} retry={() => void q.refetch()} />;
    const d = rec(q.data),
        events = rec(d.events);
    const rows = useMemo(() => Object.entries(events).map(([name, value]) => ({ name, value: num(value) })), [events]);
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                    label="Interactions"
                    value={rows.reduce((s, x) => s + x.value, 0).toLocaleString()}
                    icon={Activity}
                    tone="info"
                />
                <StatCard
                    label="Attributed orders"
                    value={num(d.attributed_orders_30d).toLocaleString()}
                    icon={ShoppingBag}
                    tone="success"
                />
                <StatCard label="Phase 8" value="Baseline" icon={ChartNoAxesCombined} />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Attribution integrity</CardTitle>
                    <CardDescription>First-party event stream</CardDescription>
                </CardHeader>
                <CardContent>
                    {rows.length ? (
                        <ResponsiveContainer width="100%" height={320}>
                            <AreaChart data={rows}>
                                <CartesianGrid />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Area
                                    dataKey="value"
                                    stroke="hsl(var(--chart-1))"
                                    fill="hsl(var(--chart-1))"
                                    fillOpacity={0.15}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <Empty fa={fa} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
