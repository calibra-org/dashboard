import {
    AlertTriangle,
    BadgeCheck,
    FileText,
    History,
    Link2,
    PackageCheck,
    ShieldAlert,
    ShieldCheck,
    Wrench,
} from "lucide-react";
import { setRequestLocale } from "next-intl/server";

import { apiServer } from "#/lib/api";

type PublicEvidence = {
    public_id: string;
    evidence_type: string;
    issuer: string | null;
    summary: string | null;
    payload: Record<string, unknown> | string;
    occurred_at: string | null;
    verified_at: string | null;
};

type PublicEdge = {
    public_id: string;
    from_node_type: string;
    from_node_ref: string;
    relation_type: string;
    to_node_type: string;
    to_node_ref: string;
    metadata: Record<string, unknown> | string;
};

type PublicPassport = {
    resolver_key: string;
    status: "published" | "revoked";
    version: number;
    schema_version: string;
    published_at: string;
    authenticity: "verified" | "not_verified" | "revoked";
    public_snapshot:
        | {
              identity_level?: string;
              batch_code?: string | null;
              serial_number?: string | null;
              fields?: Record<string, unknown>;
          }
        | string;
    evidence: PublicEvidence[];
    graph: PublicEdge[];
    standards_posture: string;
};

interface PageProps {
    params: Promise<{ locale: string; resolverKey: string }>;
}

const parseObject = (value: Record<string, unknown> | string | null | undefined) => {
    if (!value) return {};
    if (typeof value !== "string") return value;
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
};

const displayValue = (value: unknown) => {
    if (value == null) return "—";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value, null, 2);
};

async function getPassport(resolverKey: string): Promise<PublicPassport | null> {
    try {
        const api = await apiServer();
        const payload = await api.http.get<{ data: PublicPassport }>(`product-passports/${encodeURIComponent(resolverKey)}`);
        return payload.data;
    } catch {
        return null;
    }
}

export default async function ProductPassportPublicPage({ params }: PageProps) {
    const { locale, resolverKey } = await params;
    setRequestLocale(locale);
    const fa = locale === "fa";
    const passport = await getPassport(resolverKey);

    if (!passport) {
        return (
            <main className="py-12">
                <section className="mx-auto max-w-2xl rounded-3xl border bg-card p-8 text-center shadow-sm">
                    <ShieldAlert className="mx-auto size-12 text-muted-foreground" aria-hidden="true" />
                    <h1 className="mt-4 font-bold text-2xl">
                        {fa ? "گذرنامه محصول در دسترس نیست" : "Product passport unavailable"}
                    </h1>
                    <p className="mt-3 text-muted-foreground">
                        {fa
                            ? "این کلید Resolver منتشر نشده، معتبر نیست یا برای این فروشگاه قابل مشاهده نیست."
                            : "This resolver key is unpublished, invalid, or unavailable for this store."}
                    </p>
                </section>
            </main>
        );
    }

    const snapshot = parseObject(passport.public_snapshot as Record<string, unknown> | string);
    const fields = parseObject(snapshot.fields as Record<string, unknown> | string | undefined);
    const authenticityLabel =
        passport.authenticity === "verified"
            ? fa
                ? "اصالت تأییدشده"
                : "Authenticity verified"
            : passport.authenticity === "revoked"
              ? fa
                  ? "گذرنامه باطل‌شده"
                  : "Passport revoked"
              : fa
                ? "اصالت هنوز تأیید نشده"
                : "Authenticity not yet verified";
    const evidenceByType = new Map<string, PublicEvidence[]>();
    for (const item of passport.evidence) {
        const rows = evidenceByType.get(item.evidence_type) ?? [];
        rows.push(item);
        evidenceByType.set(item.evidence_type, rows);
    }

    return (
        <main className="space-y-8 py-8 md:py-12">
            <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                <div className="border-b bg-muted/30 p-6 md:p-8">
                    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
                                {passport.authenticity === "verified" ? (
                                    <ShieldCheck className="size-6" />
                                ) : (
                                    <ShieldAlert className="size-6" />
                                )}
                            </div>
                            <div>
                                <p className="text-muted-foreground text-sm">
                                    {fa ? "گذرنامه دیجیتال محصول" : "Digital product passport"}
                                </p>
                                <h1 className="mt-1 font-bold text-3xl tracking-tight md:text-4xl">{authenticityLabel}</h1>
                                <p className="mt-2 font-mono text-muted-foreground text-xs" dir="ltr">
                                    {passport.resolver_key}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border bg-background px-3 py-1.5 font-medium text-xs">
                                v{passport.version}
                            </span>
                            <span className="rounded-full border bg-background px-3 py-1.5 text-xs">
                                {passport.schema_version}
                            </span>
                            <span className="rounded-full border bg-background px-3 py-1.5 text-xs">{passport.status}</span>
                        </div>
                    </div>
                </div>
                <div className="grid gap-4 p-6 sm:grid-cols-3 md:p-8">
                    <div className="rounded-2xl border p-4">
                        <p className="text-muted-foreground text-sm">{fa ? "سطح هویت" : "Identity level"}</p>
                        <p className="mt-2 font-semibold">{String(snapshot.identity_level ?? "product")}</p>
                    </div>
                    <div className="rounded-2xl border p-4">
                        <p className="text-muted-foreground text-sm">Batch / Lot</p>
                        <p className="mt-2 font-semibold" dir="ltr">
                            {String(snapshot.batch_code ?? "—")}
                        </p>
                    </div>
                    <div className="rounded-2xl border p-4">
                        <p className="text-muted-foreground text-sm">Serial</p>
                        <p className="mt-2 font-semibold" dir="ltr">
                            {String(snapshot.serial_number ?? "—")}
                        </p>
                    </div>
                </div>
            </section>

            {passport.status === "revoked" ? (
                <section className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <div>
                        <h2 className="font-semibold">{fa ? "هشدار ابطال" : "Revocation notice"}</h2>
                        <p className="mt-1 text-sm">
                            {fa
                                ? "این گذرنامه باطل شده است. برای تصمیم خرید یا سرویس به وضعیت فعلی محصول اتکا نکنید."
                                : "This passport has been revoked. Do not rely on it for a current purchase or service decision."}
                        </p>
                    </div>
                </section>
            ) : null}

            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-3xl border bg-card p-6 md:p-8">
                    <div className="flex items-center gap-3">
                        <PackageCheck className="size-5 text-accent" />
                        <h2 className="font-bold text-xl">{fa ? "اطلاعات عمومی محصول" : "Public product information"}</h2>
                    </div>
                    {Object.keys(fields).length === 0 ? (
                        <p className="mt-5 text-muted-foreground">
                            {fa
                                ? "فیلد عمومی دیگری برای این نسخه منتشر نشده است."
                                : "No additional public fields were published for this version."}
                        </p>
                    ) : (
                        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                            {Object.entries(fields).map(([key, value]) => (
                                <div key={key} className="rounded-2xl border bg-muted/20 p-4">
                                    <dt className="font-mono text-muted-foreground text-xs" dir="ltr">
                                        {key}
                                    </dt>
                                    <dd className="mt-2 whitespace-pre-wrap text-sm leading-6">{displayValue(value)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                <div className="rounded-3xl border bg-card p-6 md:p-8">
                    <div className="flex items-center gap-3">
                        <BadgeCheck className="size-5 text-accent" />
                        <h2 className="font-bold text-xl">{fa ? "شواهد تأییدشده" : "Verified evidence"}</h2>
                    </div>
                    <div className="mt-5 space-y-3">
                        {passport.evidence.length === 0 ? (
                            <p className="text-muted-foreground">
                                {fa ? "شاهد عمومی تأییدشده‌ای منتشر نشده است." : "No verified public evidence has been published."}
                            </p>
                        ) : (
                            Array.from(evidenceByType.entries()).map(([type, rows]) => (
                                <div key={type} className="rounded-2xl border p-4">
                                    <p className="font-semibold">{type}</p>
                                    {rows.map((item) => (
                                        <div key={item.public_id} className="mt-3 border-t pt-3 first:border-t-0 first:pt-0">
                                            <p className="text-sm">{item.summary || displayValue(parseObject(item.payload))}</p>
                                            <p className="mt-2 text-muted-foreground text-xs">
                                                {item.issuer || "verified source"}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border bg-card p-5">
                    <FileText className="size-5 text-accent" />
                    <h2 className="mt-3 font-semibold">{fa ? "راهنما و گواهی" : "Manuals & certificates"}</h2>
                    <p className="mt-2 text-muted-foreground text-sm">
                        {fa
                            ? "فقط اسناد عمومی که verification شده‌اند در بخش شواهد بالا دیده می‌شوند."
                            : "Only public, verified documents appear in the evidence ledger above."}
                    </p>
                </div>
                <div className="rounded-2xl border bg-card p-5">
                    <Wrench className="size-5 text-accent" />
                    <h2 className="mt-3 font-semibold">{fa ? "ضمانت و سرویس" : "Warranty & service"}</h2>
                    <p className="mt-2 text-muted-foreground text-sm">
                        {fa
                            ? "رویدادهای قابل انتشار بدون افشای اطلاعات خصوصی در Evidence نگهداری می‌شوند."
                            : "Publishable lifecycle events are exposed without leaking private service data."}
                    </p>
                </div>
                <div className="rounded-2xl border bg-card p-5">
                    <History className="size-5 text-accent" />
                    <h2 className="mt-3 font-semibold">{fa ? "زنجیره منشأ" : "Provenance chain"}</h2>
                    <p className="mt-2 text-muted-foreground text-sm">
                        {fa
                            ? `${passport.graph.length.toLocaleString("fa-IR")} ارتباط عمومی در این نسخه قابل مشاهده است.`
                            : `${passport.graph.length.toLocaleString("en-US")} public provenance links are visible.`}
                    </p>
                </div>
            </section>

            {passport.graph.length > 0 ? (
                <section className="rounded-3xl border bg-card p-6 md:p-8">
                    <div className="flex items-center gap-3">
                        <Link2 className="size-5 text-accent" />
                        <h2 className="font-bold text-xl">{fa ? "ارتباطات عمومی منشأ" : "Public provenance links"}</h2>
                    </div>
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground text-xs">
                                    <th className="p-3 text-start">{fa ? "از" : "From"}</th>
                                    <th className="p-3 text-start">{fa ? "رابطه" : "Relation"}</th>
                                    <th className="p-3 text-start">{fa ? "به" : "To"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {passport.graph.map((edge) => (
                                    <tr key={edge.public_id} className="border-b last:border-0">
                                        <td className="p-3 font-mono text-xs" dir="ltr">
                                            {edge.from_node_type}:{edge.from_node_ref}
                                        </td>
                                        <td className="p-3">{edge.relation_type}</td>
                                        <td className="p-3 font-mono text-xs" dir="ltr">
                                            {edge.to_node_type}:{edge.to_node_ref}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ) : null}

            <section className="rounded-2xl border bg-muted/20 p-5 text-muted-foreground text-xs leading-6">
                {fa
                    ? "این صفحه یک Resolver عمومی Calibra است. ساختار برای استانداردهای صنعت آماده شده، اما عبارت standards-ready به معنی تأیید رسمی GS1 یا انطباق حقوقی با مقررات یک حوزه قضایی نیست."
                    : "This is a public Calibra resolver view. The structure is standards-ready, but that does not mean GS1 certification or legal conformance with a specific jurisdiction."}
            </section>
        </main>
    );
}
