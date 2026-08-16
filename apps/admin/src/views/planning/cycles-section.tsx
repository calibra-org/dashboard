"use client";
import type { Locale } from "@calibra/shared/i18n";
import { useState } from "react";
import { StatusBadge } from "#/components/StatusBadge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { CalendarClock, ShieldCheck } from "#/icons";
import { formatDateTime, formatNumber } from "#/lib/format";
import { type PlanningCycle, useCreatePlanningCycle, usePlanningCycles, useTransitionPlanningCycle } from "#/lib/queries/planning";
import { AsyncState, InfoLabel, statusFa, statusTone } from "./planning-shared";

export function CyclesSection({ locale }: { locale: Locale }) {
    const query = usePlanningCycles();
    const create = useCreatePlanningCycle();
    const [title, setTitle] = useState("برنامه فروش و موجودی دوره جدید");
    if (query.isPending || query.isError) return <AsyncState pending={query.isPending} error={query.isError} onRetry={() => void query.refetch()} />;
    return (
        <div className="flex flex-col gap-4">
            <Card><CardHeader><CardTitle className="text-base"><InfoLabel help="Cycle ظرف حاکمیتی Forecast و بازبینی است. Approval/Publication timestamp، actor و Audit ثبت می‌شود.">چرخه جدید</InfoLabel></CardTitle></CardHeader><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="grid flex-1 gap-1.5 text-xs"><span>عنوان چرخه</span><Input value={title} onChange={(event) => setTitle(event.target.value)} /></label><Button type="button" isLoading={create.isPending} onClick={() => create.mutate({ title })}><CalendarClock className="size-4" aria-hidden="true" />ساخت چرخه</Button></CardContent></Card>
            <div className="grid gap-3 xl:grid-cols-2">{query.data.data.map((cycle) => <CycleCard key={cycle.id} cycle={cycle} locale={locale} />)}</div>
            {query.data.data.length === 0 ? <AsyncState pending={false} error={false} empty /> : null}
        </div>
    );
}
function CycleCard({ cycle, locale }: { cycle: PlanningCycle; locale: Locale }) {
    const transition = useTransitionPlanningCycle(cycle.id);
    const next: Record<string, string | undefined> = { draft: "data_ready", data_ready: "forecasted", forecasted: "under_review", under_review: "approved", approved: "published", published: "superseded" };
    const nextStatus = next[cycle.status];
    return <Card><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-sm">{cycle.title}</CardTitle><div className="mt-1 text-muted-foreground text-xs">v{formatNumber(cycle.version, locale)} · {formatDateTime(cycle.updated_at, locale)}</div></div><StatusBadge tone={statusTone(cycle.status)}>{statusFa(cycle.status)}</StatusBadge></div></CardHeader><CardContent className="flex items-center justify-between gap-3"><div className="text-muted-foreground text-xs"><InfoLabel help="Transitionهای Cycle ترتیبی و optimistic-versioned هستند؛ request با نسخه قدیمی 409 می‌گیرد.">Forecast Run: {cycle.forecast_run_id ? `#${formatNumber(cycle.forecast_run_id, locale)}` : "متصل نشده"}</InfoLabel></div>{nextStatus ? <Button type="button" size="sm" variant={nextStatus === "approved" || nextStatus === "published" ? "default" : "outline"} isLoading={transition.isPending} onClick={() => transition.mutate({ status: nextStatus, expected_version: cycle.version })}><ShieldCheck className="size-3.5" aria-hidden="true" />{statusFa(nextStatus)}</Button> : null}</CardContent></Card>;
}
