"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { useCreateTaxRate, useDeleteTaxRate, useTaxClasses, useTaxRates, useUpdateTaxRate } from "#/features/operations/queries";
import type { TaxRate } from "#/features/operations/types";

function splitList(value: string): string[] {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function TaxRateRow({ item }: { item: TaxRate }) {
    const t = useTranslations("StoreOperations");
    const tax = useTranslations("StoreOperations.tax");
    const update = useUpdateTaxRate(item.id);
    const remove = useDeleteTaxRate();
    const [label, setLabel] = useState(item.label);
    const [rate, setRate] = useState(String(item.rate));
    const [country, setCountry] = useState(item.country ?? "");
    const [priority, setPriority] = useState(String(item.priority));
    const [ordering, setOrdering] = useState(String(item.ordering));
    const [postcodes, setPostcodes] = useState(item.postcodes.join(", "));
    const [cities, setCities] = useState(item.cities.join(", "));

    return (
        <article className="grid gap-3 rounded-xl border bg-card p-4">
            <div className="grid gap-2 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium"><span>{tax("label")}</span><Input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("rate")}</span><Input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" dir="ltr" /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("country")}</span><Input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} maxLength={2} dir="ltr" /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("priority")}</span><Input value={priority} onChange={(event) => setPriority(event.target.value)} inputMode="numeric" /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("ordering")}</span><Input value={ordering} onChange={(event) => setOrdering(event.target.value)} inputMode="numeric" /></label>
                <div className="grid gap-1 text-xs"><span>{tax("class")}</span><div className="flex h-9 items-center rounded-md border bg-muted/20 px-3">{item.tax_class_name}</div></div>
                <label className="grid gap-1 text-xs font-medium md:col-span-2"><span>{tax("postcodes")}</span><Input value={postcodes} onChange={(event) => setPostcodes(event.target.value)} dir="ltr" /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("cities")}</span><Input value={cities} onChange={(event) => setCities(event.target.value)} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-sm">
                <label className="flex items-center gap-2"><Switch checked={item.compound} onCheckedChange={(checked) => update.mutate({ compound: checked === true })} />{tax("compound")}</label>
                <label className="flex items-center gap-2"><Switch checked={item.applies_to_shipping} onCheckedChange={(checked) => update.mutate({ applies_to_shipping: checked === true })} />{tax("shipping")}</label>
                <div className="ms-auto flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        disabled={!label.trim() || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100 || update.isPending}
                        onClick={() => update.mutate({
                            label: label.trim(),
                            rate: Number(rate),
                            country: country.trim() || null,
                            priority: Math.max(0, Number(priority) || 0),
                            ordering: Math.max(0, Number(ordering) || 0),
                            postcodes: splitList(postcodes),
                            cities: splitList(cities),
                        })}
                    >
                        {update.isPending ? t("saving") : t("save")}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>{t("delete")}</Button>
                </div>
            </div>
            {update.isError || remove.isError ? <p className="text-destructive text-xs">{t("loadError")}</p> : null}
        </article>
    );
}

export function TaxRatesView() {
    const t = useTranslations("StoreOperations");
    const tax = useTranslations("StoreOperations.tax");
    const rates = useTaxRates();
    const classes = useTaxClasses();
    const create = useCreateTaxRate();
    const [classId, setClassId] = useState<number | null>(null);
    const [label, setLabel] = useState("");
    const [rate, setRate] = useState("");
    const [country, setCountry] = useState("");

    return (
        <div className="grid gap-5">
            <SubTabs namespace="Tax.tabs" tabs={[{ href: "/tax/classes", labelKey: "classes" }, { href: "/tax/rates", labelKey: "rates" }]} />
            <div>
                <h2 className="font-semibold text-lg">{tax("ratesTitle")}</h2>
                <p className="mt-1 text-muted-foreground text-sm">{tax("ratesSubtitle")}</p>
            </div>
            <div className="grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_100px_auto] md:items-end">
                <label className="grid gap-1 text-xs font-medium"><span>{tax("class")}</span><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={classId ?? ""} onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : null)}><option value="">—</option>{(classes.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("label")}</span><Input value={label} onChange={(event) => setLabel(event.target.value)} /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("rate")}</span><Input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" dir="ltr" /></label>
                <label className="grid gap-1 text-xs font-medium"><span>{tax("country")}</span><Input value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())} maxLength={2} dir="ltr" /></label>
                <Button
                    type="button"
                    disabled={!classId || !label.trim() || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100 || create.isPending}
                    onClick={() => classId && create.mutate({ tax_class_id: classId, label: label.trim(), rate: Number(rate), country: country.trim() || null }, { onSuccess: () => { setLabel(""); setRate(""); setCountry(""); } })}
                >
                    {create.isPending ? t("saving") : tax("newRate")}
                </Button>
            </div>
            {rates.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            {rates.isError ? <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{t("loadError")}</span><Button size="sm" variant="outline" onClick={() => void rates.refetch()}>{t("retry")}</Button></div> : null}
            <div className="grid gap-3">{(rates.data ?? []).map((item) => <TaxRateRow key={item.id} item={item} />)}</div>
            {rates.data?.length === 0 ? <p className="rounded-lg border p-8 text-center text-muted-foreground text-sm">{tax("noRates")}</p> : null}
        </div>
    );
}
