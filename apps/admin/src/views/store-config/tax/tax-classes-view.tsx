"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useCreateTaxClass, useDeleteTaxClass, useTaxClasses, useUpdateTaxClass } from "#/features/operations/queries";
import type { TaxClass } from "#/features/operations/types";

function TaxClassRow({ item }: { item: TaxClass }) {
    const t = useTranslations("StoreOperations");
    const tax = useTranslations("StoreOperations.tax");
    const update = useUpdateTaxClass(item.id);
    const remove = useDeleteTaxClass();
    const [name, setName] = useState(item.name);
    const [slug, setSlug] = useState(item.slug);

    return (
        <div className="grid gap-2 rounded-lg border bg-card p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="grid gap-1 font-medium text-xs">
                <span>{tax("name")}</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="grid gap-1 font-medium text-xs">
                <span>{tax("slug")}</span>
                <Input value={slug} onChange={(event) => setSlug(event.target.value)} dir="ltr" />
            </label>
            <div className="flex gap-2">
                <Button
                    type="button"
                    size="sm"
                    disabled={!name.trim() || !slug.trim() || update.isPending}
                    onClick={() => update.mutate({ name: name.trim(), slug: slug.trim() })}
                >
                    {update.isPending ? t("saving") : t("save")}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(item.id)}
                >
                    {t("delete")}
                </Button>
            </div>
            {update.isError || remove.isError ? <p className="text-destructive text-xs md:col-span-3">{t("loadError")}</p> : null}
        </div>
    );
}

export function TaxClassesView() {
    const t = useTranslations("StoreOperations");
    const tax = useTranslations("StoreOperations.tax");
    const classes = useTaxClasses();
    const create = useCreateTaxClass();
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");

    return (
        <div className="grid gap-5">
            <SubTabs
                namespace="Tax.tabs"
                tabs={[
                    { href: "/tax/classes", labelKey: "classes" },
                    { href: "/tax/rates", labelKey: "rates" },
                ]}
            />
            <div>
                <h2 className="font-semibold text-lg">{tax("classesTitle")}</h2>
                <p className="mt-1 text-muted-foreground text-sm">{tax("classesSubtitle")}</p>
            </div>
            <div className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1 font-medium text-xs">
                    <span>{tax("name")}</span>
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="grid gap-1 font-medium text-xs">
                    <span>{tax("slug")}</span>
                    <Input value={slug} onChange={(event) => setSlug(event.target.value)} dir="ltr" />
                </label>
                <Button
                    type="button"
                    disabled={!name.trim() || !slug.trim() || create.isPending}
                    onClick={() =>
                        create.mutate(
                            { name: name.trim(), slug: slug.trim() },
                            {
                                onSuccess: () => {
                                    setName("");
                                    setSlug("");
                                },
                            },
                        )
                    }
                >
                    {create.isPending ? t("saving") : t("newClass")}
                </Button>
            </div>
            {classes.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            {classes.isError ? (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{t("loadError")}</span>
                    <Button size="sm" variant="outline" onClick={() => void classes.refetch()}>
                        {t("retry")}
                    </Button>
                </div>
            ) : null}
            <div className="grid gap-2">
                {(classes.data ?? []).map((item) => (
                    <TaxClassRow key={item.id} item={item} />
                ))}
            </div>
            {classes.data?.length === 0 ? (
                <p className="rounded-lg border p-8 text-center text-muted-foreground text-sm">{tax("noClasses")}</p>
            ) : null}
        </div>
    );
}
