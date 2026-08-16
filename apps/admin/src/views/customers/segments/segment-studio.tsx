"use client";

import { HelperTooltip } from "@calibra/panel-kit/helper-tooltip";
import type { Locale } from "@calibra/shared/i18n";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Plus, RefreshCw, Save, Sparkles, Trash2, Users } from "#/icons";
import { formatDateTime, formatNumber } from "#/lib/format";
import {
    type SegmentCondition,
    type SegmentDefinition,
    type SegmentFeature,
    type SegmentOperator,
    useCustomerSegmentMembers,
    useEvaluateCustomerSegment,
    usePreviewCustomerSegment,
    useSaveSegmentIntelligenceDefinition,
    useSegmentIntelligenceDefinition,
} from "#/lib/queries/customer-intelligence";
import { useCreateCustomerSegment, useCustomerSegments } from "#/lib/queries/customers";

import { CustomerWorkspaceNav } from "../customer-workspace-nav";

const FEATURES: SegmentFeature[] = [
    "lifecycle.state",
    "risk.band",
    "value.band",
    "rfm.score",
    "rfm.recency_days",
    "rfm.frequency_365d",
    "rfm.monetary_365d_minor",
    "economics.historical_revenue_ltv_minor",
    "consent.email",
    "consent.sms",
];
const OPERATORS: Exclude<SegmentOperator, "in">[] = ["eq", "neq", "gt", "gte", "lt", "lte"];
const ENUM_FEATURES: Partial<Record<SegmentFeature, string[]>> = {
    "lifecycle.state": ["never_purchased", "first_purchase", "active_repeat", "at_risk", "lapsed", "reactivated"],
    "risk.band": ["unknown", "low", "medium", "high"],
    "value.band": ["unknown", "developing", "core", "high_value"],
    "consent.email": ["true", "false"],
    "consent.sms": ["true", "false"],
};

function featureLabel(t: ReturnType<typeof useTranslations>, feature: SegmentFeature) {
    const map: Record<SegmentFeature, string> = {
        "lifecycle.state": "featureLifecycle",
        "risk.band": "featureRisk",
        "value.band": "featureValue",
        "rfm.score": "featureRfm",
        "rfm.recency_days": "featureRecency",
        "rfm.frequency_365d": "featureFrequency",
        "rfm.monetary_365d_minor": "featureMonetary",
        "economics.historical_revenue_ltv_minor": "featureLtv",
        "consent.email": "featureEmailConsent",
        "consent.sms": "featureSmsConsent",
    };
    return t(`segments.${map[feature]}` as never);
}

function operatorLabel(t: ReturnType<typeof useTranslations>, operator: Exclude<SegmentOperator, "in">) {
    const map = { eq: "operatorEq", neq: "operatorNeq", gt: "operatorGt", gte: "operatorGte", lt: "operatorLt", lte: "operatorLte" } as const;
    return t(`segments.${map[operator]}` as never);
}

function defaultValue(feature: SegmentFeature): string | number | boolean {
    if (feature.startsWith("consent.")) return true;
    if (feature === "lifecycle.state") return "active_repeat";
    if (feature === "risk.band") return "low";
    if (feature === "value.band") return "core";
    return 0;
}

function isNumericFeature(feature: SegmentFeature) {
    return feature.startsWith("rfm.") || feature.startsWith("economics.");
}

export function SegmentStudio() {
    const t = useTranslations("CustomerIntelligence");
    const locale = useLocale() as Locale;
    const segments = useCustomerSegments();
    const createSegment = useCreateCustomerSegment();
    const [newName, setNewName] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selected = useMemo(() => segments.data?.find((segment) => segment.id === selectedId) ?? null, [segments.data, selectedId]);
    const definitionQuery = useSegmentIntelligenceDefinition(selectedId);
    const [kind, setKind] = useState<"rule_based" | "rfm" | "cohort" | "lifecycle">("rule_based");
    const [refreshPolicy, setRefreshPolicy] = useState<"manual" | "event_driven">("manual");
    const [logic, setLogic] = useState<"and" | "or">("and");
    const [conditions, setConditions] = useState<SegmentCondition[]>([
        { feature: "lifecycle.state", operator: "eq", value: "active_repeat" },
    ]);
    const saveDefinition = useSaveSegmentIntelligenceDefinition(selectedId ?? 0);
    const preview = usePreviewCustomerSegment(selectedId ?? 0);
    const evaluate = useEvaluateCustomerSegment(selectedId ?? 0);
    const members = useCustomerSegmentMembers(selectedId, 1, 25);

    useEffect(() => {
        if (selectedId === null && segments.data && segments.data.length > 0) setSelectedId(segments.data[0]!.id);
    }, [segments.data, selectedId]);

    useEffect(() => {
        const data = definitionQuery.data;
        if (!data || !data.definition) return;
        if (["rule_based", "rfm", "cohort", "lifecycle"].includes(data.kind)) setKind(data.kind as typeof kind);
        setRefreshPolicy(data.refresh_policy);
        setLogic(data.definition.op);
        setConditions(data.definition.conditions.length > 0 ? data.definition.conditions : [{ feature: "lifecycle.state", operator: "eq", value: "active_repeat" }]);
    }, [definitionQuery.data]);

    const create = async () => {
        const name = newName.trim();
        if (!name) return;
        const result = await createSegment.mutateAsync({ name, filters: {}, is_pinned: false });
        setNewName("");
        setSelectedId(Number(result.data.id));
    };

    const updateCondition = (index: number, patch: Partial<SegmentCondition>) => {
        setConditions((current) => current.map((condition, itemIndex) => {
            if (itemIndex !== index) return condition;
            if (patch.feature && patch.feature !== condition.feature) {
                return { feature: patch.feature, operator: "eq", value: defaultValue(patch.feature) };
            }
            return { ...condition, ...patch };
        }));
    };

    const persistDefinition = () => {
        if (selectedId === null) return;
        const definition: SegmentDefinition = { version: 1, op: logic, conditions };
        saveDefinition.mutate({ kind, definition, refresh_policy: refreshPolicy });
    };

    return (
        <div className="flex flex-col gap-5">
            <CustomerWorkspaceNav />
            <header className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2">
                    <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Sparkles className="size-5" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="font-semibold text-2xl tracking-tight">{t("segments.title")}</h1>
                        <p className="mt-1 text-muted-foreground text-sm">{t("segments.subtitle")}</p>
                    </div>
                </div>
            </header>

            <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
                <Card className="h-fit">
                    <CardHeader className="pb-3"><CardTitle className="text-base">{t("segments.select")}</CardTitle></CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex gap-2">
                            <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("segments.namePlaceholder")} />
                            <Button aria-label={t("segments.create")} onClick={create} disabled={!newName.trim() || createSegment.isPending}>
                                <Plus className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                        {segments.isPending ? <Skeleton className="h-24" /> : null}
                        {segments.data?.length === 0 ? <p className="text-muted-foreground text-sm">{t("segments.empty")}</p> : null}
                        <div className="flex flex-col gap-1">
                            {segments.data?.map((segment) => (
                                <button
                                    type="button"
                                    key={segment.id}
                                    onClick={() => setSelectedId(segment.id)}
                                    className={selectedId === segment.id ? "rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-start text-sm" : "rounded-lg border border-transparent px-3 py-2 text-start text-sm hover:bg-muted"}
                                >
                                    <span className="block font-medium">{segment.name}</span>
                                    <span className="mt-0.5 block text-muted-foreground text-xs">#{formatNumber(segment.id, locale)}</span>
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="flex min-w-0 flex-col gap-4">
                    {!selected ? (
                        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">{t("segments.empty")}</CardContent></Card>
                    ) : (
                        <>
                            <Card>
                                <CardHeader className="pb-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-base">
                                                {selected.name}
                                                <HelperTooltip>{t("segments.definitionHelp")}</HelperTooltip>
                                            </CardTitle>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <Badge variant="outline">{definitionQuery.data?.kind === "saved_view" ? t("segments.savedView") : t("segments.dynamic")}</Badge>
                                                {definitionQuery.data?.member_count !== null && definitionQuery.data?.member_count !== undefined ? (
                                                    <Badge variant="secondary">{formatNumber(definitionQuery.data.member_count, locale)} {t("common.customers")}</Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button variant="outline" onClick={() => preview.mutate()} disabled={!definitionQuery.data?.definition || preview.isPending}>
                                                <RefreshCw className={preview.isPending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                                                {t("common.preview")}
                                            </Button>
                                            <Button variant="outline" onClick={() => evaluate.mutate()} disabled={!definitionQuery.data?.definition || evaluate.isPending}>
                                                <Users className="size-4" aria-hidden="true" />
                                                {t("common.evaluate")}
                                            </Button>
                                            <Button onClick={persistDefinition} disabled={saveDefinition.isPending || conditions.length === 0}>
                                                <Save className="size-4" aria-hidden="true" />
                                                {t("common.save")}
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <div className="grid gap-3 md:grid-cols-3">
                                        <Field label={t("segments.kind")} help={t("segments.kindHelp")}>
                                            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
                                                <SelectTrigger><SelectValue>{(value) => String(value ?? "")}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="rule_based">Rule-based</SelectItem>
                                                    <SelectItem value="rfm">RFM</SelectItem>
                                                    <SelectItem value="lifecycle">Lifecycle</SelectItem>
                                                    <SelectItem value="cohort">Cohort</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                        <Field label={t("segments.refreshPolicy")} help={t("segments.refreshPolicyHelp")}>
                                            <Select value={refreshPolicy} onValueChange={(value) => setRefreshPolicy(value as typeof refreshPolicy)}>
                                                <SelectTrigger><SelectValue>{(value) => value === "event_driven" ? t("common.eventDriven") : t("common.manual")}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="manual">{t("common.manual")}</SelectItem>
                                                    <SelectItem value="event_driven">{t("common.eventDriven")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                        <Field label={t("segments.definition")} help={t("segments.definitionHelp")}>
                                            <Select value={logic} onValueChange={(value) => setLogic(value as typeof logic)}>
                                                <SelectTrigger><SelectValue>{(value) => value === "or" ? t("segments.logicOr") : t("segments.logicAnd")}</SelectValue></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="and">{t("segments.logicAnd")}</SelectItem>
                                                    <SelectItem value="or">{t("segments.logicOr")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        {conditions.map((condition, index) => (
                                            <div key={`${index}-${condition.feature}`} className="grid gap-2 rounded-lg border bg-muted/20 p-3 md:grid-cols-[1.4fr_1fr_1.2fr_auto]">
                                                <Select value={condition.feature} onValueChange={(value) => updateCondition(index, { feature: value as SegmentFeature })}>
                                                    <SelectTrigger><SelectValue>{(value) => featureLabel(t, value as SegmentFeature)}</SelectValue></SelectTrigger>
                                                    <SelectContent>{FEATURES.map((feature) => <SelectItem key={feature} value={feature}>{featureLabel(t, feature)}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Select value={condition.operator} onValueChange={(value) => updateCondition(index, { operator: value as SegmentOperator })}>
                                                    <SelectTrigger><SelectValue>{(value) => operatorLabel(t, value as Exclude<SegmentOperator, "in">)}</SelectValue></SelectTrigger>
                                                    <SelectContent>{OPERATORS.map((operator) => <SelectItem key={operator} value={operator}>{operatorLabel(t, operator)}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <ConditionValueEditor condition={condition} t={t} onChange={(value) => updateCondition(index, { value })} />
                                                <Button variant="ghost" size="icon" aria-label={t("segments.removeCondition")} onClick={() => setConditions((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={conditions.length === 1}>
                                                    <Trash2 className="size-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        ))}
                                        <Button variant="outline" className="self-start" onClick={() => setConditions((current) => [...current, { feature: "lifecycle.state", operator: "eq", value: "active_repeat" }])}>
                                            <Plus className="size-4" aria-hidden="true" />
                                            {t("segments.addCondition")}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <Card>
                                    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">{t("segments.previewResult")}<HelperTooltip>{t("segments.previewHelp")}</HelperTooltip></CardTitle></CardHeader>
                                    <CardContent>
                                        {preview.data ? (
                                            <div className="space-y-3">
                                                <p className="font-semibold text-3xl tabular-nums">{formatNumber(preview.data.data.count, locale)}</p>
                                                <div className="flex flex-wrap gap-1.5">{preview.data.data.sample_customer_ids.map((id) => <Badge key={id} variant="outline">#{formatNumber(id, locale)}</Badge>)}</div>
                                            </div>
                                        ) : <p className="text-muted-foreground text-sm">{t("segments.previewHelp")}</p>}
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-3"><CardTitle className="text-base">{t("common.members")}</CardTitle></CardHeader>
                                    <CardContent className="space-y-2">
                                        {definitionQuery.data?.last_evaluated_at ? <p className="text-muted-foreground text-xs">{t("segments.evaluatedAt")}: {formatDateTime(definitionQuery.data.last_evaluated_at, locale)}</p> : null}
                                        {members.data?.data.slice(0, 8).map((member) => (
                                            <div key={member.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                                <span>{[member.first_name, member.last_name].filter(Boolean).join(" ") || `#${formatNumber(member.id, locale)}`}</span>
                                                <span className="text-muted-foreground text-xs">#{formatNumber(member.id, locale)}</span>
                                            </div>
                                        ))}
                                        {members.data && members.data.data.length === 0 ? <p className="text-muted-foreground text-sm">{t("common.noData")}</p> : null}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium">{label}<HelperTooltip>{help}</HelperTooltip></span>
            {children}
        </label>
    );
}

function ConditionValueEditor({ condition, t, onChange }: { condition: SegmentCondition; t: ReturnType<typeof useTranslations>; onChange: (value: string | number | boolean) => void }) {
    const options = ENUM_FEATURES[condition.feature];
    if (options) {
        const serialized = String(condition.value);
        return (
            <Select value={serialized} onValueChange={(value) => {
                if (condition.feature.startsWith("consent.")) onChange(value === "true");
                else onChange(value);
            }}>
                <SelectTrigger><SelectValue>{(value) => {
                    if (condition.feature === "lifecycle.state") return t(`lifecycleStates.${String(value)}` as never);
                    if (condition.feature === "risk.band") return t(`riskBands.${String(value)}` as never);
                    if (condition.feature === "value.band") return t(`valueBands.${String(value)}` as never);
                    return String(value) === "true" ? "بله / Yes" : "خیر / No";
                }}</SelectValue></SelectTrigger>
                <SelectContent>{options.map((option) => (
                    <SelectItem key={option} value={option}>
                        {condition.feature === "lifecycle.state" ? t(`lifecycleStates.${option}` as never) : condition.feature === "risk.band" ? t(`riskBands.${option}` as never) : condition.feature === "value.band" ? t(`valueBands.${option}` as never) : option === "true" ? "بله / Yes" : "خیر / No"}
                    </SelectItem>
                ))}</SelectContent>
            </Select>
        );
    }
    return (
        <Input
            type={isNumericFeature(condition.feature) ? "number" : "text"}
            value={String(condition.value)}
            onChange={(event) => onChange(isNumericFeature(condition.feature) ? Number(event.target.value || 0) : event.target.value)}
        />
    );
}
