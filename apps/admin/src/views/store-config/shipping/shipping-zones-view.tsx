"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { SubTabs } from "#/components/SubTabs";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import {
    useAddShippingZoneMethod,
    useCreateShippingZone,
    useDeleteShippingZone,
    useDeleteShippingZoneMethod,
    useReplaceShippingZoneLocations,
    useShippingMethodDefinitions,
    useShippingZones,
    useUpdateShippingZone,
    useUpdateShippingZoneMethod,
} from "#/features/operations/queries";
import type { ShippingZone } from "#/features/operations/types";

const LOCATION_TYPES = ["country", "state", "postcode", "continent"] as const;
type EditableLocation = { clientKey: string; type: (typeof LOCATION_TYPES)[number]; code: string };

function MutationMessage({ failed }: { failed: boolean }) {
    const t = useTranslations("StoreOperations");
    return failed ? <p className="text-destructive text-xs">{t("loadError")}</p> : null;
}

function ZoneEditor({ zone }: { zone: ShippingZone }) {
    const t = useTranslations("StoreOperations");
    const shipping = useTranslations("StoreOperations.shipping");
    const definitions = useShippingMethodDefinitions();
    const update = useUpdateShippingZone(zone.id);
    const replaceLocations = useReplaceShippingZoneLocations(zone.id);
    const addMethod = useAddShippingZoneMethod(zone.id);
    const [name, setName] = useState(zone.name);
    const [locations, setLocations] = useState<EditableLocation[]>(() =>
        zone.locations.map((item) => ({
            clientKey: crypto.randomUUID(),
            type: item.type as EditableLocation["type"],
            code: item.code,
        })),
    );
    const [methodId, setMethodId] = useState<number | null>(null);

    const availableDefinitions = useMemo(
        () => (definitions.data ?? []).filter((definition) => !zone.methods.some((item) => item.method_id === definition.id)),
        [definitions.data, zone.methods],
    );

    return (
        <div className="grid gap-4 rounded-xl border bg-card p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <label className="grid gap-1.5 font-medium text-xs">
                    <span>{shipping("zoneName")}</span>
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="flex h-9 items-center gap-2 text-sm">
                    <Switch
                        checked={zone.is_fallback}
                        disabled={update.isPending}
                        onCheckedChange={(checked) => update.mutate({ is_fallback: checked === true })}
                    />
                    {shipping("fallback")}
                </label>
                <Button
                    type="button"
                    disabled={!name.trim() || update.isPending}
                    onClick={() => update.mutate({ name: name.trim() })}
                >
                    {update.isPending ? t("saving") : t("save")}
                </Button>
            </div>

            <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-sm">{shipping("locations")}</h3>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                            setLocations((current) => [...current, { clientKey: crypto.randomUUID(), type: "country", code: "" }])
                        }
                    >
                        {t("add")}
                    </Button>
                </div>
                {locations.map((location, index) => (
                    <div key={location.clientKey} className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                        <select
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                            value={location.type}
                            onChange={(event) =>
                                setLocations((current) =>
                                    current.map((item, itemIndex) =>
                                        itemIndex === index
                                            ? { ...item, type: event.target.value as (typeof LOCATION_TYPES)[number] }
                                            : item,
                                    ),
                                )
                            }
                        >
                            {LOCATION_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {shipping(type)}
                                </option>
                            ))}
                        </select>
                        <Input
                            value={location.code}
                            onChange={(event) =>
                                setLocations((current) =>
                                    current.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, code: event.target.value } : item,
                                    ),
                                )
                            }
                            placeholder={shipping("locationCode")}
                            dir="ltr"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setLocations((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        >
                            {t("delete")}
                        </Button>
                    </div>
                ))}
                {locations.length === 0 ? <p className="text-muted-foreground text-xs">{shipping("noLocations")}</p> : null}
                <div className="flex justify-end">
                    <Button
                        type="button"
                        size="sm"
                        disabled={replaceLocations.isPending || locations.some((item) => !item.code.trim())}
                        onClick={() =>
                            replaceLocations.mutate(locations.map((item) => ({ type: item.type, code: item.code.trim() })))
                        }
                    >
                        {replaceLocations.isPending ? t("saving") : t("save")}
                    </Button>
                </div>
            </div>

            <div className="grid gap-2">
                <h3 className="font-medium text-sm">{shipping("methods")}</h3>
                {zone.methods.map((method) => (
                    <ZoneMethodEditor key={method.id} zoneId={zone.id} method={method} />
                ))}
                {zone.methods.length === 0 ? <p className="text-muted-foreground text-xs">{shipping("noMethods")}</p> : null}
                {availableDefinitions.length > 0 ? (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
                        <label className="grid min-w-56 flex-1 gap-1 font-medium text-xs">
                            <span>{shipping("addMethod")}</span>
                            <select
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                value={methodId ?? ""}
                                onChange={(event) => setMethodId(event.target.value ? Number(event.target.value) : null)}
                            >
                                <option value="">—</option>
                                {availableDefinitions.map((definition) => (
                                    <option key={definition.id} value={definition.id}>
                                        {definition.title_default}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button
                            type="button"
                            disabled={!methodId || addMethod.isPending}
                            onClick={() =>
                                methodId && addMethod.mutate({ method_id: methodId }, { onSuccess: () => setMethodId(null) })
                            }
                        >
                            {t("add")}
                        </Button>
                    </div>
                ) : null}
            </div>
            <MutationMessage failed={update.isError || replaceLocations.isError || addMethod.isError} />
        </div>
    );
}

function ZoneMethodEditor({ zoneId, method }: { zoneId: number; method: ShippingZone["methods"][number] }) {
    const t = useTranslations("StoreOperations");
    const shipping = useTranslations("StoreOperations.shipping");
    const update = useUpdateShippingZoneMethod(zoneId, method.id);
    const remove = useDeleteShippingZoneMethod(zoneId);
    const [title, setTitle] = useState(method.title_override ?? "");
    const [ordering, setOrdering] = useState(String(method.ordering));
    const numericSettingKeys = Object.entries(method.settings_schema ?? {})
        .filter(([, rule]) => rule.type === "number")
        .map(([key]) => key);
    const [settings, setSettings] = useState<Record<string, string>>(() =>
        Object.fromEntries(numericSettingKeys.map((key) => [key, String(method.settings[key] ?? "")])),
    );

    const save = () => {
        const mapped = Object.fromEntries(
            Object.entries(settings)
                .filter(([, value]) => value !== "")
                .map(([key, value]) => [key, Number(value)]),
        );
        update.mutate({ title_override: title.trim() || null, ordering: Math.max(0, Number(ordering) || 0), settings: mapped });
    };

    return (
        <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end">
            <label className="grid gap-1 text-xs">
                <span>{method.method_title_default ?? method.method_code}</span>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={shipping("titleOverride")} />
            </label>
            <label className="grid gap-1 text-xs">
                <span>{shipping("ordering")}</span>
                <Input value={ordering} onChange={(event) => setOrdering(event.target.value)} inputMode="numeric" />
            </label>
            <label className="flex h-9 items-center gap-2 text-xs">
                <Switch checked={method.enabled} onCheckedChange={(checked) => update.mutate({ enabled: checked === true })} />
                {method.enabled ? t("enabled") : t("disabled")}
            </label>
            {numericSettingKeys.map((key) => (
                <label key={key} className="grid gap-1 text-xs">
                    <span>{key === "cost" ? shipping("cost") : key === "min_amount" ? shipping("minAmount") : key}</span>
                    <Input
                        value={settings[key] ?? ""}
                        onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))}
                        inputMode="numeric"
                    />
                </label>
            ))}
            <div className="flex justify-end gap-2 md:col-span-3">
                <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(method.id)}
                >
                    {t("delete")}
                </Button>
                <Button type="button" size="sm" disabled={update.isPending} onClick={save}>
                    {update.isPending ? t("saving") : t("save")}
                </Button>
            </div>
            <MutationMessage failed={update.isError || remove.isError} />
        </div>
    );
}

export function ShippingZonesView() {
    const t = useTranslations("StoreOperations");
    const shipping = useTranslations("StoreOperations.shipping");
    const zones = useShippingZones();
    const create = useCreateShippingZone();
    const remove = useDeleteShippingZone();
    const [newName, setNewName] = useState("");

    return (
        <div className="grid gap-5">
            <SubTabs
                namespace="Shipping.tabs"
                tabs={[
                    { href: "/shipping/zones", labelKey: "zones" },
                    { href: "/shipping/methods", labelKey: "methods" },
                ]}
            />
            <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
                <label className="grid min-w-64 flex-1 gap-1.5 font-medium text-xs">
                    <span>{shipping("newZone")}</span>
                    <Input
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder={shipping("zoneName")}
                    />
                </label>
                <Button
                    type="button"
                    disabled={!newName.trim() || create.isPending}
                    onClick={() => create.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") })}
                >
                    {create.isPending ? t("saving") : t("add")}
                </Button>
            </div>
            {zones.isPending ? <p className="text-muted-foreground text-sm">{t("loading")}</p> : null}
            {zones.isError ? (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{t("loadError")}</span>
                    <Button size="sm" variant="outline" onClick={() => void zones.refetch()}>
                        {t("retry")}
                    </Button>
                </div>
            ) : null}
            {(zones.data ?? []).map((zone) => (
                <div key={zone.id} className="grid gap-2">
                    <ZoneEditor zone={zone} />
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={zone.is_fallback || remove.isPending}
                            onClick={() => remove.mutate(zone.id)}
                        >
                            {t("delete")}
                        </Button>
                    </div>
                </div>
            ))}
            {zones.data?.length === 0 ? (
                <p className="rounded-lg border p-8 text-center text-muted-foreground text-sm">{shipping("noZones")}</p>
            ) : null}
        </div>
    );
}
