"use client";

import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/PageHeader";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { FileText, Link2, Package, Settings2, ShieldCheck, Sparkles } from "#/icons";
import { useProductsList } from "#/lib/products/queries";
import {
    type PassportEvidence,
    type PassportIdentityLevel,
    type ProductPassport,
    type ProductPassportAccessRow,
    type ProductPassportDetail,
    type ProductPassportOverview,
    type RegulatoryMapping,
    useProductPassportMutation,
    useProductPassportResource,
    useProductPassportVariations,
} from "#/lib/queries/product-passport";
import { cn } from "#/lib/utils";

type Tab = "passports" | "evidence" | "regulatory" | "access";

const parse = <T,>(value: T | string | null | undefined, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

function parseJsonObject(value: string, label: string) {
    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
        return parsed as Record<string, unknown>;
    } catch {
        throw new Error(`${label} باید JSON object معتبر باشد.`);
    }
}

function pretty(value: Record<string, unknown> | string | null | undefined) {
    return JSON.stringify(parse<Record<string, unknown>>(value, {}), null, 2);
}

function date(value: string | null | undefined) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MetricCard({ title, value, hint }: { title: string; value: number | string; hint: string }) {
    return (
        <Card className="relative overflow-hidden border-border/70 p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
            <p className="text-muted-foreground text-xs">{title}</p>
            <p className="mt-2 font-semibold text-2xl tracking-tight">{new Intl.NumberFormat("fa-IR").format(Number(value))}</p>
            <p className="mt-2 text-muted-foreground text-xs">{hint}</p>
        </Card>
    );
}

function StatusPill({ status }: { status: string }) {
    const label: Record<string, string> = {
        draft: "پیش‌نویس",
        published: "منتشرشده",
        revoked: "باطل‌شده",
        verified: "تأییدشده",
        unverified: "تأییدنشده",
        rejected: "ردشده",
        expired: "منقضی",
        active: "فعال",
        retired: "بازنشسته",
        public: "عمومی",
        private: "خصوصی",
    };
    return (
        <span className="inline-flex rounded-full border bg-muted/40 px-2.5 py-1 font-medium text-[11px]">
            {label[status] ?? status}
        </span>
    );
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
            <Package className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-muted-foreground text-sm">{body}</p>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive text-sm">{message}</div>;
}

export function ProductPassportWorkspace() {
    const locale = useLocale();
    const fa = locale === "fa";
    const overview = useProductPassportResource<ProductPassportOverview>("overview");
    const passports = useProductPassportResource<ProductPassport[]>("passports");
    const [tab, setTab] = useState<Tab>("passports");
    const regulatory = useProductPassportResource<RegulatoryMapping[]>("regulatory-mappings", tab === "regulatory");
    const access = useProductPassportResource<ProductPassportAccessRow[]>("access", tab === "access");
    const products = useProductsList({ query: { page: 1, limit: 100, filter: [], filterOr: [], sort: [] } });

    const [selectedPassportId, setSelectedPassportId] = useState("");
    const selectedPassport = passports.data?.find((item) => item.public_id === selectedPassportId) ?? passports.data?.[0];
    useEffect(() => {
        if (!selectedPassportId && passports.data?.[0]) setSelectedPassportId(passports.data[0].public_id);
    }, [selectedPassportId, passports.data]);
    const detail = useProductPassportResource<ProductPassportDetail>(
        `passports/${selectedPassport?.public_id ?? "missing"}`,
        Boolean(selectedPassport),
    );

    const createMutation = useProductPassportMutation<ProductPassportDetail>();
    const patchMutation = useProductPassportMutation<ProductPassportDetail>("PATCH");
    const commandMutation = useProductPassportMutation<Record<string, unknown>>();

    const [productId, setProductId] = useState("");
    const selectedProduct = products.data?.data.find((item) => String(item.id) === productId) ?? null;
    const variations = useProductPassportVariations(productId ? Number(productId) : null);
    const [variationId, setVariationId] = useState("");
    const [identityLevel, setIdentityLevel] = useState<PassportIdentityLevel>("product");
    const [batchCode, setBatchCode] = useState("");
    const [serialNumber, setSerialNumber] = useState("");
    const [resolverKey, setResolverKey] = useState("");
    const [identifiersJson, setIdentifiersJson] = useState("{}");
    const [publicJson, setPublicJson] = useState("{}");
    const [privateJson, setPrivateJson] = useState("{}");
    const [reason, setReason] = useState("");
    const [formError, setFormError] = useState("");

    const [draftIdentifiers, setDraftIdentifiers] = useState("{}");
    const [draftPublic, setDraftPublic] = useState("{}");
    const [draftPrivate, setDraftPrivate] = useState("{}");
    const [editReason, setEditReason] = useState("");
    useEffect(() => {
        if (!detail.data?.passport) return;
        setDraftIdentifiers(pretty(detail.data.passport.identifiers));
        setDraftPublic(pretty(detail.data.passport.public_fields));
        setDraftPrivate(pretty(detail.data.passport.private_fields));
    }, [detail.data?.passport]);

    const [evidenceType, setEvidenceType] = useState("authenticity");
    const [evidenceVisibility, setEvidenceVisibility] = useState<"public" | "private">("private");
    const [sourceKind, setSourceKind] = useState("document");
    const [sourceRef, setSourceRef] = useState("");
    const [issuer, setIssuer] = useState("");
    const [evidenceSummary, setEvidenceSummary] = useState("");
    const [evidenceJson, setEvidenceJson] = useState("{}");
    const [evidenceReason, setEvidenceReason] = useState("");

    const [jurisdiction, setJurisdiction] = useState("IR");
    const [framework, setFramework] = useState("");
    const [frameworkVersion, setFrameworkVersion] = useState("");
    const [mappingVersion, setMappingVersion] = useState("1");
    const [fieldMappingJson, setFieldMappingJson] = useState("{}");
    const [conformanceNote, setConformanceNote] = useState("");
    const [regulatoryReason, setRegulatoryReason] = useState("");

    const selectedProductName = selectedProduct?.name[fa ? "fa" : "en"] ?? "";
    const publicResolverPath = selectedPassport ? `/api/v1/product-passports/${selectedPassport.resolver_key}` : "";
    const verifiedEvidence = detail.data?.evidence.filter((item) => item.verification_status === "verified").length ?? 0;
    const publicVerifiedEvidence =
        detail.data?.evidence.filter((item) => item.visibility === "public" && item.verification_status === "verified").length ?? 0;

    const identityLabel = useMemo<Record<PassportIdentityLevel, string>>(
        () => ({ product: "محصول", model: "مدل/واریانت", batch: "بچ/لات", item: "آیتم سریال‌دار" }),
        [],
    );

    const createPassport = () => {
        setFormError("");
        try {
            if (!productId) throw new Error("محصول را انتخاب کنید.");
            if (!resolverKey.trim()) throw new Error("کلید Resolver را وارد کنید.");
            const identifiers = parseJsonObject(identifiersJson, "شناسه‌ها");
            const publicFields = parseJsonObject(publicJson, "داده عمومی");
            const privateFields = parseJsonObject(privateJson, "داده خصوصی");
            createMutation.mutate(
                {
                    path: "passports",
                    body: {
                        product_id: Number(productId),
                        ...(variationId ? { variation_id: Number(variationId) } : {}),
                        identity_level: identityLevel,
                        ...(batchCode ? { batch_code: batchCode } : {}),
                        ...(serialNumber ? { serial_number: serialNumber } : {}),
                        resolver_key: resolverKey.trim(),
                        identifiers: {
                            ...(selectedProduct?.sku ? { sku: selectedProduct.sku } : {}),
                            ...(selectedProduct?.gtin ? { gtin: selectedProduct.gtin } : {}),
                            ...identifiers,
                        },
                        public_fields: publicFields,
                        private_fields: privateFields,
                        resolver_config: { strategy: "stable_key", qr_ready: true },
                        reason,
                    },
                },
                {
                    onSuccess: (data) => {
                        setSelectedPassportId(data.passport.public_id);
                        setResolverKey("");
                        setBatchCode("");
                        setSerialNumber("");
                        setReason("");
                    },
                },
            );
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "ورودی نامعتبر است.");
        }
    };

    const saveDraft = () => {
        if (!selectedPassport) return;
        setFormError("");
        try {
            patchMutation.mutate({
                path: `passports/${selectedPassport.public_id}`,
                body: {
                    identifiers: parseJsonObject(draftIdentifiers, "شناسه‌ها"),
                    public_fields: parseJsonObject(draftPublic, "داده عمومی"),
                    private_fields: parseJsonObject(draftPrivate, "داده خصوصی"),
                    reason: editReason,
                },
            });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "ورودی نامعتبر است.");
        }
    };

    const addEvidence = () => {
        if (!selectedPassport) return;
        setFormError("");
        try {
            commandMutation.mutate({
                path: `passports/${selectedPassport.public_id}/evidence`,
                body: {
                    evidence_type: evidenceType,
                    visibility: evidenceVisibility,
                    source_kind: sourceKind,
                    ...(sourceRef ? { source_ref: sourceRef } : {}),
                    ...(issuer ? { issuer } : {}),
                    ...(evidenceSummary ? { summary: evidenceSummary } : {}),
                    payload: parseJsonObject(evidenceJson, "Payload شواهد"),
                    reason: evidenceReason,
                },
            });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "ورودی نامعتبر است.");
        }
    };

    const createRegulatory = () => {
        setFormError("");
        try {
            commandMutation.mutate({
                path: "regulatory-mappings",
                body: {
                    jurisdiction,
                    framework,
                    framework_version: frameworkVersion,
                    mapping_version: Number(mappingVersion),
                    field_mapping: parseJsonObject(fieldMappingJson, "Field mapping"),
                    conformance_note: conformanceNote,
                    reason: regulatoryReason,
                },
            });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "ورودی نامعتبر است.");
        }
    };

    const tabs: Array<{ id: Tab; label: string; icon: typeof Package }> = [
        { id: "passports", label: "پاسپورت‌ها", icon: Package },
        { id: "evidence", label: "شواهد و زنجیره", icon: Link2 },
        { id: "regulatory", label: "مقررات", icon: ShieldCheck },
        { id: "access", label: "دسترسی", icon: Settings2 },
    ];
    const busy = createMutation.isPending || patchMutation.isPending || commandMutation.isPending;
    const apiError = overview.error ?? passports.error ?? detail.error ?? regulatory.error ?? access.error;

    return (
        <div className="space-y-6" dir={fa ? "rtl" : "ltr"}>
            <PageHeader
                title={fa ? "گذرنامه دیجیتال و اصالت محصول" : "Product Provenance & Digital Product Passport"}
                subtitle={
                    fa
                        ? "هویت محصول، بچ و سریال را به شواهد قابل‌ردیابی، نسخه منتشرشده و Resolver پایدار وصل کنید؛ داده خصوصی هرگز وارد خروجی عمومی نمی‌شود."
                        : "Connect product, batch and serial identity to traceable evidence, immutable published versions and a stable resolver without leaking private data."
                }
            />

            <Card className="border-primary/20 bg-primary/[0.03] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <ShieldCheck className="size-5" />
                        </div>
                        <div>
                            <p className="font-semibold">مرز استاندارد و انطباق</p>
                            <p className="mt-1 max-w-4xl text-muted-foreground text-sm">
                                Resolver برای QR و Digital Link آماده است، اما این پنل بدون review رسمی، ادعای GS1 یا انطباق حقوقی حوزه قضایی نمی‌کند. Mappingهای مقررات نسخه‌دار هستند.
                            </p>
                        </div>
                    </div>
                    <StatusPill status="standards-ready" />
                </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                <MetricCard title="کل پاسپورت‌ها" value={overview.data?.kpis.passports ?? 0} hint="همه سطوح هویت" />
                <MetricCard title="منتشرشده" value={overview.data?.kpis.published ?? 0} hint="دارای snapshot عمومی" />
                <MetricCard title="باطل‌شده" value={overview.data?.kpis.revoked ?? 0} hint="Resolver وضعیت ابطال را نشان می‌دهد" />
                <MetricCard title="کل شواهد" value={overview.data?.kpis.evidence ?? 0} hint="عمومی و خصوصی" />
                <MetricCard title="شواهد تأییدشده" value={overview.data?.kpis.verified_evidence ?? 0} hint="پس از verification" />
                <MetricCard
                    title="Mapping فعال"
                    value={overview.data?.kpis.active_regulatory_mappings ?? 0}
                    hint="حوزه قضایی و نسخه مشخص"
                />
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-sm">
                {tabs.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Button
                            key={item.id}
                            variant={tab === item.id ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setTab(item.id)}
                        >
                            <Icon className="me-2 size-4" />
                            {item.label}
                        </Button>
                    );
                })}
            </div>

            {apiError ? <ErrorState message={apiError.message} /> : null}
            {formError ? <ErrorState message={formError} /> : null}
            {commandMutation.error ? <ErrorState message={commandMutation.error.message} /> : null}
            {createMutation.error ? <ErrorState message={createMutation.error.message} /> : null}
            {patchMutation.error ? <ErrorState message={patchMutation.error.message} /> : null}

            {tab === "passports" ? (
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
                    <div className="space-y-6">
                        <Card className="p-5">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                                    <Sparkles className="size-4" />
                                </div>
                                <div>
                                    <h2 className="font-semibold">ساخت پاسپورت جدید</h2>
                                    <p className="text-muted-foreground text-xs">Product Master موجود reuse می‌شود؛ رکورد موازی ساخته نمی‌شود.</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>محصول</Label>
                                    <Select
                                        value={productId}
                                        onValueChange={(value) => {
                                            setProductId(String(value ?? ""));
                                            setVariationId("");
                                        }}
                                    >
                                        <SelectTrigger><SelectValue placeholder="انتخاب محصول واقعی" /></SelectTrigger>
                                        <SelectContent>
                                            {(products.data?.data ?? []).map((product) => (
                                                <SelectItem key={product.id} value={String(product.id)}>
                                                    {product.name[fa ? "fa" : "en"]} · {product.sku || `#${product.id}`}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {products.isLoading ? <p className="text-muted-foreground text-xs">در حال بارگذاری محصولات…</p> : null}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label>سطح هویت</Label>
                                        <Select
                                            value={identityLevel}
                                            onValueChange={(value) => setIdentityLevel(String(value ?? "product") as PassportIdentityLevel)}
                                        >
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {(Object.keys(identityLabel) as PassportIdentityLevel[]).map((level) => (
                                                    <SelectItem key={level} value={level}>{identityLabel[level]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>مدل / واریانت</Label>
                                        <Select value={variationId} onValueChange={(value) => setVariationId(String(value ?? ""))}>
                                            <SelectTrigger><SelectValue placeholder="اختیاری" /></SelectTrigger>
                                            <SelectContent>
                                                {(variations.data ?? []).map((variation) => (
                                                    <SelectItem key={variation.id} value={String(variation.id)}>
                                                        {variation.sku || `#${variation.id}`}{variation.gtin ? ` · ${variation.gtin}` : ""}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {identityLevel === "batch" || identityLevel === "item" ? (
                                    <div className="space-y-2">
                                        <Label>کد Batch / Lot</Label>
                                        <Input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder="LOT-2026-..." />
                                    </div>
                                ) : null}
                                {identityLevel === "item" ? (
                                    <div className="space-y-2">
                                        <Label>Serial Number</Label>
                                        <Input value={serialNumber} onChange={(event) => setSerialNumber(event.target.value)} placeholder="SN-..." />
                                    </div>
                                ) : null}

                                <div className="space-y-2">
                                    <Label>کلید Resolver پایدار</Label>
                                    <Input value={resolverKey} onChange={(event) => setResolverKey(event.target.value)} placeholder="product-123-batch-a" dir="ltr" />
                                    <p className="text-muted-foreground text-xs">فقط کلید پایدار ذخیره می‌شود؛ QR می‌تواند به URL Resolver اشاره کند.</p>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label>شناسه‌ها JSON</Label>
                                        <Textarea value={identifiersJson} onChange={(event) => setIdentifiersJson(event.target.value)} className="min-h-32 font-mono text-xs" dir="ltr" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>داده عمومی JSON</Label>
                                        <Textarea value={publicJson} onChange={(event) => setPublicJson(event.target.value)} className="min-h-32 font-mono text-xs" dir="ltr" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>داده خصوصی JSON</Label>
                                        <Textarea value={privateJson} onChange={(event) => setPrivateJson(event.target.value)} className="min-h-32 font-mono text-xs" dir="ltr" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>دلیل ایجاد</Label>
                                    <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="چرا این پاسپورت ایجاد می‌شود؟" />
                                </div>
                                <Button disabled={busy || !productId || !reason.trim()} onClick={createPassport} className="w-full">
                                    ایجاد پاسپورت {selectedProductName ? `برای ${selectedProductName}` : ""}
                                </Button>
                            </div>
                        </Card>

                        <Card className="p-5">
                            <h2 className="font-semibold">فهرست پاسپورت‌ها</h2>
                            <p className="mb-4 text-muted-foreground text-xs">برای مدیریت، یک رکورد را انتخاب کنید.</p>
                            {passports.isLoading ? <p className="text-muted-foreground text-sm">در حال بارگذاری…</p> : null}
                            {!passports.isLoading && !passports.data?.length ? (
                                <EmptyState title="هنوز پاسپورتی نیست" body="اولین پاسپورت را از فرم بالا بسازید." />
                            ) : (
                                <div className="space-y-2">
                                    {(passports.data ?? []).map((passport) => (
                                        <button
                                            type="button"
                                            key={passport.public_id}
                                            onClick={() => setSelectedPassportId(passport.public_id)}
                                            className={cn(
                                                "w-full rounded-xl border p-3 text-start transition hover:bg-muted/40",
                                                selectedPassport?.public_id === passport.public_id && "border-primary/50 bg-primary/[0.04]",
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-sm">{identityLabel[passport.identity_level]} · #{passport.product_id}</p>
                                                    <p className="mt-1 font-mono text-muted-foreground text-xs" dir="ltr">{passport.resolver_key}</p>
                                                </div>
                                                <StatusPill status={passport.status} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    <div className="space-y-6">
                        {!selectedPassport ? (
                            <EmptyState title="یک پاسپورت انتخاب کنید" body="جزئیات، نسخه‌ها و مرز عمومی/خصوصی اینجا نمایش داده می‌شود." />
                        ) : detail.isLoading ? (
                            <Card className="p-8 text-muted-foreground">در حال بارگذاری جزئیات پاسپورت…</Card>
                        ) : detail.data ? (
                            <>
                                <Card className="p-5">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="font-semibold text-lg">{identityLabel[detail.data.passport.identity_level]}</h2>
                                                <StatusPill status={detail.data.passport.status} />
                                                <span className="rounded-full border px-2.5 py-1 text-[11px]">v{detail.data.passport.current_version}</span>
                                            </div>
                                            <p className="mt-2 font-mono text-muted-foreground text-xs" dir="ltr">{detail.data.passport.public_id}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy || detail.data.passport.status === "revoked" || !editReason.trim()}
                                                onClick={() =>
                                                    commandMutation.mutate({
                                                        path: `passports/${detail.data.passport.public_id}/publish`,
                                                        body: { reason: editReason },
                                                    })
                                                }
                                            >
                                                انتشار Snapshot
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={busy || detail.data.passport.status === "revoked" || !editReason.trim()}
                                                onClick={() =>
                                                    commandMutation.mutate({
                                                        path: `passports/${detail.data.passport.public_id}/revoke`,
                                                        body: { reason: editReason },
                                                    })
                                                }
                                            >
                                                ابطال پاسپورت
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        <div className="rounded-xl border bg-muted/20 p-3"><p className="text-muted-foreground text-xs">Product ID</p><p className="mt-1 font-medium">#{detail.data.passport.product_id}</p></div>
                                        <div className="rounded-xl border bg-muted/20 p-3"><p className="text-muted-foreground text-xs">Variation</p><p className="mt-1 font-medium">{detail.data.passport.variation_id ? `#${detail.data.passport.variation_id}` : "—"}</p></div>
                                        <div className="rounded-xl border bg-muted/20 p-3"><p className="text-muted-foreground text-xs">Batch</p><p className="mt-1 font-medium">{detail.data.passport.batch_code ?? "—"}</p></div>
                                        <div className="rounded-xl border bg-muted/20 p-3"><p className="text-muted-foreground text-xs">Serial</p><p className="mt-1 font-medium">{detail.data.passport.serial_number ?? "—"}</p></div>
                                    </div>
                                </Card>

                                <Card className="p-5">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="font-semibold">نسخه کاری و مرز داده</h2>
                                            <p className="text-muted-foreground text-xs">ویرایش این بخش تا زمان Publish وارد Resolver عمومی نمی‌شود.</p>
                                        </div>
                                        <ShieldCheck className="size-5 text-primary" />
                                    </div>
                                    <div className="grid gap-4 lg:grid-cols-3">
                                        <div className="space-y-2"><Label>شناسه‌ها</Label><Textarea value={draftIdentifiers} onChange={(event) => setDraftIdentifiers(event.target.value)} className="min-h-52 font-mono text-xs" dir="ltr" /></div>
                                        <div className="space-y-2"><Label>فیلدهای عمومی</Label><Textarea value={draftPublic} onChange={(event) => setDraftPublic(event.target.value)} className="min-h-52 font-mono text-xs" dir="ltr" /></div>
                                        <div className="space-y-2"><Label>فیلدهای خصوصی</Label><Textarea value={draftPrivate} onChange={(event) => setDraftPrivate(event.target.value)} className="min-h-52 font-mono text-xs" dir="ltr" /></div>
                                    </div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                                        <Input value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="دلیل تغییر / انتشار / ابطال" />
                                        <Button disabled={busy || !editReason.trim() || detail.data.passport.status === "revoked"} onClick={saveDraft}>ذخیره نسخه کاری</Button>
                                    </div>
                                </Card>

                                <Card className="p-5">
                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="font-semibold">Resolver عمومی و نسخه منتشرشده</h2>
                                            <p className="text-muted-foreground text-xs">فقط snapshot منتشرشده + شواهد عمومیِ verified قابل مشاهده است.</p>
                                        </div>
                                        <StatusPill status={detail.data.passport.status} />
                                    </div>
                                    <div className="rounded-xl border bg-muted/20 p-4 font-mono text-xs" dir="ltr">{publicResolverPath}</div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-xl border p-3"><p className="text-muted-foreground text-xs">نسخه‌ها</p><p className="mt-1 font-semibold">{detail.data.versions.length}</p></div>
                                        <div className="rounded-xl border p-3"><p className="text-muted-foreground text-xs">شواهد verified</p><p className="mt-1 font-semibold">{verifiedEvidence}</p></div>
                                        <div className="rounded-xl border p-3"><p className="text-muted-foreground text-xs">عمومی verified</p><p className="mt-1 font-semibold">{publicVerifiedEvidence}</p></div>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {detail.data.versions.slice(0, 5).map((version) => (
                                            <div key={version.public_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                                                <div><p className="font-medium text-sm">نسخه {version.version} · {version.schema_version}</p><p className="text-muted-foreground text-xs">{date(version.published_at)}</p></div>
                                                <code className="text-[10px]" dir="ltr">{version.content_hash.slice(0, 16)}…</code>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {tab === "evidence" ? (
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
                    <Card className="p-5">
                        <h2 className="font-semibold">ثبت Evidence</h2>
                        <p className="mb-5 text-muted-foreground text-xs">Evidence عمومی تا زمان verification در Resolver نمایش داده نمی‌شود.</p>
                        {!selectedPassport ? <EmptyState title="پاسپورتی انتخاب نشده" body="از تب پاسپورت‌ها یک رکورد انتخاب کنید." /> : (
                            <div className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2"><Label>نوع</Label><Input value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} placeholder="authenticity / warranty / manual" /></div>
                                    <div className="space-y-2"><Label>Visibility</Label><Select value={evidenceVisibility} onValueChange={(value) => setEvidenceVisibility(String(value ?? "private") as "public" | "private")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">خصوصی</SelectItem><SelectItem value="public">عمومی</SelectItem></SelectContent></Select></div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2"><Label>Source kind</Label><Input value={sourceKind} onChange={(event) => setSourceKind(event.target.value)} /></div>
                                    <div className="space-y-2"><Label>Source ref</Label><Input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} /></div>
                                </div>
                                <div className="space-y-2"><Label>Issuer</Label><Input value={issuer} onChange={(event) => setIssuer(event.target.value)} /></div>
                                <div className="space-y-2"><Label>خلاصه</Label><Textarea value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} /></div>
                                <div className="space-y-2"><Label>Payload JSON</Label><Textarea value={evidenceJson} onChange={(event) => setEvidenceJson(event.target.value)} className="min-h-40 font-mono text-xs" dir="ltr" /></div>
                                <div className="space-y-2"><Label>دلیل ثبت</Label><Input value={evidenceReason} onChange={(event) => setEvidenceReason(event.target.value)} /></div>
                                <Button className="w-full" disabled={busy || !evidenceReason.trim()} onClick={addEvidence}>ثبت Evidence</Button>
                            </div>
                        )}
                    </Card>

                    <div className="space-y-6">
                        <Card className="p-5">
                            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Evidence ledger</h2><p className="text-muted-foreground text-xs">Issuer، source، hash، visibility و verification state قابل ردیابی است.</p></div><FileText className="size-5 text-primary" /></div>
                            {!detail.data?.evidence.length ? <EmptyState title="Evidence ثبت نشده" body="شواهد اصالت، راهنما، ضمانت، سرویس یا ایمنی را اضافه کنید." /> : (
                                <div className="space-y-3">
                                    {detail.data.evidence.map((item: PassportEvidence) => (
                                        <div key={item.public_id} className="rounded-xl border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div><p className="font-medium">{item.evidence_type}</p><p className="mt-1 text-muted-foreground text-xs">{item.issuer || item.source_kind} · {date(item.occurred_at ?? item.created_at)}</p></div>
                                                <div className="flex gap-2"><StatusPill status={item.visibility} /><StatusPill status={item.verification_status} /></div>
                                            </div>
                                            {item.summary ? <p className="mt-3 text-sm">{item.summary}</p> : null}
                                            <code className="mt-3 block text-muted-foreground text-[10px]" dir="ltr">sha256:{item.content_hash}</code>
                                            {item.verification_status === "unverified" ? (
                                                <div className="mt-3 flex gap-2">
                                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => commandMutation.mutate({ path: `passports/${selectedPassport?.public_id}/evidence/${item.public_id}/status`, body: { verification_status: "verified", reason: "Evidence reviewed in product passport workspace" } })}>تأیید</Button>
                                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => commandMutation.mutate({ path: `passports/${selectedPassport?.public_id}/evidence/${item.public_id}/status`, body: { verification_status: "rejected", reason: "Evidence rejected in product passport workspace" } })}>رد</Button>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card className="p-5">
                            <h2 className="font-semibold">Provenance graph</h2>
                            <p className="mb-4 text-muted-foreground text-xs">اتصال خودکار receipt lineهای Phase 14 و edgeهای provenance در یک زنجیره.</p>
                            {!detail.data?.edges.length ? <EmptyState title="Edge ثبت نشده" body="برای Batch/Serial موجود، اتصال دریافت تأمین‌کننده به‌صورت خودکار ساخته می‌شود." /> : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-muted-foreground text-xs"><th className="p-3 text-start">از</th><th className="p-3 text-start">رابطه</th><th className="p-3 text-start">به</th><th className="p-3 text-start">دید</th></tr></thead><tbody>{detail.data.edges.map((edge) => <tr key={edge.public_id} className="border-b last:border-0"><td className="p-3 font-mono text-xs" dir="ltr">{edge.from_node_type}:{edge.from_node_ref}</td><td className="p-3">{edge.relation_type}</td><td className="p-3 font-mono text-xs" dir="ltr">{edge.to_node_type}:{edge.to_node_ref}</td><td className="p-3"><StatusPill status={edge.visibility} /></td></tr>)}</tbody></table>
                                </div>
                            )}
                        </Card>

                        <Card className="p-5">
                            <h2 className="font-semibold">سیگنال‌های کیفیت مرتبط</h2>
                            <p className="mb-4 text-muted-foreground text-xs">Quality Caseهای Phase 19 بر اساس Product/Variation reuse می‌شوند.</p>
                            {!detail.data?.quality_cases.length ? <EmptyState title="Quality Case مرتبط نیست" body="در حال حاضر سیگنال کیفیت متصل به این هویت وجود ندارد." /> : (
                                <div className="space-y-2">{detail.data.quality_cases.map((item, index) => <div key={String(item.id ?? index)} className="rounded-xl border p-3 text-sm"><p className="font-medium">{String(item.title ?? item.reference ?? `Case ${index + 1}`)}</p><p className="mt-1 text-muted-foreground text-xs">{String(item.status ?? "open")} · {String(item.severity ?? "—")}</p></div>)}</div>
                            )}
                        </Card>
                    </div>
                </div>
            ) : null}

            {tab === "regulatory" ? (
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
                    <Card className="p-5">
                        <h2 className="font-semibold">Regulatory mapping نسخه‌دار</h2>
                        <p className="mb-5 text-muted-foreground text-xs">Mapping داده است، نه حقیقت hard-coded؛ note انطباق اجباری است.</p>
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Jurisdiction</Label><Input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} dir="ltr" /></div><div className="space-y-2"><Label>Framework</Label><Input value={framework} onChange={(event) => setFramework(event.target.value)} placeholder="مثلاً DPP profile / national rule set" /></div></div>
                            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Framework version</Label><Input value={frameworkVersion} onChange={(event) => setFrameworkVersion(event.target.value)} dir="ltr" /></div><div className="space-y-2"><Label>Mapping version</Label><Input type="number" min="1" value={mappingVersion} onChange={(event) => setMappingVersion(event.target.value)} dir="ltr" /></div></div>
                            <div className="space-y-2"><Label>Field mapping JSON</Label><Textarea value={fieldMappingJson} onChange={(event) => setFieldMappingJson(event.target.value)} className="min-h-44 font-mono text-xs" dir="ltr" /></div>
                            <div className="space-y-2"><Label>Conformance note</Label><Textarea value={conformanceNote} onChange={(event) => setConformanceNote(event.target.value)} placeholder="حدود اعتبار، منبع و مواردی که هنوز نیاز به sign-off دارد." /></div>
                            <div className="space-y-2"><Label>دلیل</Label><Input value={regulatoryReason} onChange={(event) => setRegulatoryReason(event.target.value)} /></div>
                            <Button className="w-full" disabled={busy || !framework || !frameworkVersion || !conformanceNote || !regulatoryReason} onClick={createRegulatory}>ایجاد Mapping</Button>
                        </div>
                    </Card>
                    <Card className="p-5">
                        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Mapping registry</h2><p className="text-muted-foreground text-xs">فقط یک mapping فعال برای هر framework/jurisdiction نگه داشته می‌شود.</p></div><ShieldCheck className="size-5 text-primary" /></div>
                        {regulatory.isLoading ? <p className="text-muted-foreground text-sm">در حال بارگذاری…</p> : null}
                        {!regulatory.isLoading && !regulatory.data?.length ? <EmptyState title="Mapping وجود ندارد" body="نسخه و حوزه قضایی را ثبت کنید؛ بدون sign-off ادعای انطباق نکنید." /> : (
                            <div className="space-y-3">{(regulatory.data ?? []).map((mapping) => <div key={mapping.public_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{mapping.jurisdiction} · {mapping.framework}</p><p className="mt-1 text-muted-foreground text-xs">framework {mapping.framework_version} · mapping v{mapping.mapping_version}</p></div><StatusPill status={mapping.status} /></div><p className="mt-3 text-sm">{mapping.conformance_note}</p><div className="mt-3 flex gap-2">{mapping.status === "draft" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => commandMutation.mutate({ path: `regulatory-mappings/${mapping.public_id}/status`, body: { status: "active", reason: "Regulatory mapping reviewed and activated" } })}>فعال‌سازی</Button> : null}{mapping.status === "active" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => commandMutation.mutate({ path: `regulatory-mappings/${mapping.public_id}/status`, body: { status: "retired", reason: "Regulatory mapping superseded" } })}>بازنشسته‌کردن</Button> : null}</div></div>)}</div>
                        )}
                    </Card>
                </div>
            ) : null}

            {tab === "access" ? (
                <Card className="p-5">
                    <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="font-semibold">دسترسی و تفکیک وظایف</h2><p className="text-muted-foreground text-xs">Publish، revoke، verification و regulatory mutation علاوه بر permission به step-up نیاز دارند.</p></div><Settings2 className="size-5 text-primary" /></div>
                    {access.isLoading ? <p className="text-muted-foreground text-sm">در حال بارگذاری…</p> : null}
                    {!access.isLoading && !access.data?.length ? <EmptyState title="ادمینی برای نمایش نیست" body="دسترسی‌ها tenant-scoped و fail-closed هستند." /> : (
                        <div className="space-y-3">{(access.data ?? []).map((row) => <div key={row.id} className="rounded-xl border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-medium">{row.identity}</p><p className="mt-1 text-muted-foreground text-xs">{Object.values(row.permissions).filter(Boolean).length} از {Object.keys(row.permissions).length} permission فعال</p></div><div className="flex flex-wrap gap-2">{["owner", "compliance", "operator", "viewer"].map((preset) => <Button key={preset} size="sm" variant="outline" disabled={busy} onClick={() => commandMutation.mutate({ path: "access/preset", body: { user_id: row.id, preset, reason: `Apply ${preset} product passport access preset` } })}>{preset}</Button>)}</div></div></div>)}</div>
                    )}
                </Card>
            ) : null}
        </div>
    );
}
