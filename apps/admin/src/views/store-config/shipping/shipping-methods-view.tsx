"use client";

import { useTranslations } from "next-intl";

import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { useShippingMethodDefinitions } from "#/features/operations/queries";

export function ShippingMethodsView() {
    const t = useTranslations("StoreOperations");
    const shipping = useTranslations("StoreOperations.shipping");
    const methods = useShippingMethodDefinitions();

    return (
        <div className="grid gap-5">
            <SubTabs namespace="Shipping.tabs" tabs={[{ href: "/shipping/zones", labelKey: "zones" }, { href: "/shipping/methods", labelKey: "methods" }]} />
            <div>
                <h2 className="font-semibold text-lg">{shipping("methodCatalog")}</h2>
                <p className="mt-1 text-muted-foreground text-sm">{shipping("methodCatalogSubtitle")}</p>
            </div>
            {methods.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            {methods.isError ? <div className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{t("loadError")}</span><Button size="sm" variant="outline" onClick={() => void methods.refetch()}>{t("retry")}</Button></div> : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(methods.data ?? []).map((method) => (
                    <article key={method.id} className="grid gap-2 rounded-xl border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="font-medium">{method.title_default}</h3>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{method.code}</code>
                        </div>
                        <p className="text-muted-foreground text-sm">{method.description_default || "—"}</p>
                        {Object.keys(method.settings_schema).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {Object.keys(method.settings_schema).map((key) => <span key={key} className="rounded-md border px-2 py-1 font-mono text-xs text-muted-foreground">{key}</span>)}
                            </div>
                        ) : null}
                    </article>
                ))}
            </div>
            {methods.data?.length === 0 ? <p className="rounded-lg border p-8 text-center text-muted-foreground text-sm">{shipping("noMethods")}</p> : null}
        </div>
    );
}
