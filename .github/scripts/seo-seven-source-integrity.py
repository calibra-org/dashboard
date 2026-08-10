from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


engine_path = Path("apps/api/app/services/seo/search_engines.ts")
engine = engine_path.read_text()
engine = replace_once(
    engine,
    '''    return (await currentTrx()
        .from("seo_keywords")
        .where("tenant_id", Number(currentTenantId()))
        .select("phrase", "locale", "device")
        .min("updated_at as oldest_updated_at")
        .groupBy("phrase", "locale", "device")
        .orderBy("oldest_updated_at", "asc")
        .limit(limit)) as DbRow[];''',
    '''    return (await currentTrx()
        .from("seo_keywords")
        .where("tenant_id", Number(currentTenantId()))
        .where((query) => query.where("source", "manual").orWhere("search_engine", "brave"))
        .select("phrase", "locale")
        .min("updated_at as oldest_updated_at")
        .groupBy("phrase", "locale")
        .orderBy("oldest_updated_at", "asc")
        .limit(limit)) as DbRow[];''',
    "Brave tracked-keyword seeds",
)
engine = replace_once(
    engine,
    '''    const country = (stringValue(configuration.country) ?? "US").slice(0, 2).toUpperCase();''',
    '''    const countryInput = (stringValue(configuration.country) ?? "ALL").toUpperCase();
    const country = countryInput === "ALL" ? "ALL" : countryInput.slice(0, 2);''',
    "Brave neutral market default",
)
engine = replace_once(
    engine,
    '''                country,
                device:
                    row.device === "mobile" || row.device === "tablet" || row.device === "desktop" || row.device === "all"
                        ? row.device
                        : "all",
                targetUrl: matchedUrl,''',
    '''                country,
                /** Brave Web Search API has no device dimension; never invent one from a source row. */
                device: "all",
                targetUrl: matchedUrl,''',
    "Brave device truthfulness",
)
engine_path.write_text(engine)

seo_service_path = Path("apps/api/app/services/seo/seo_service.ts")
seo_service = seo_service_path.read_text()
seo_service = replace_once(
    seo_service,
    '''        const currentPosition = nullableNumeric(row.current_position);
        const nextPosition = input.current_position === undefined ? currentPosition : input.current_position;
        const update: Record<string, unknown> = { updated_at: DateTime.utc().toSQL() };''',
    '''        const currentPosition = nullableNumeric(row.current_position);
        const nextPosition = input.current_position === undefined ? currentPosition : input.current_position;
        const providerOwnedRank = new Set(["google_search_console", "bing_webmaster", "yandex_webmaster", "brave_search"]).has(
            String(row.source),
        );
        if (providerOwnedRank && input.current_position !== undefined && input.source !== "manual") {
            throw new Exception("Provider-owned SEO positions are read-only; set source=manual for an explicit override", {
                status: 409,
                code: "E_SEO_PROVIDER_POSITION_READ_ONLY",
            });
        }
        const update: Record<string, unknown> = { updated_at: DateTime.utc().toSQL() };''',
    "provider rank write protection",
)
seo_service_path.write_text(seo_service)

ui_path = Path("apps/admin/src/features/seo/workspace.tsx")
ui = ui_path.read_text()
ui = replace_once(
    ui,
    '''}) {
    const delta = row.current_position && row.previous_position ? row.previous_position - row.current_position : 0;
    return (
        <TableRow>''',
    '''}) {
    const delta = row.current_position && row.previous_position ? row.previous_position - row.current_position : 0;
    const providerOwned = ["google_search_console", "bing_webmaster", "yandex_webmaster", "brave_search"].includes(row.source);
    return (
        <TableRow>''',
    "keyword provider ownership",
)
ui = replace_once(
    ui,
    '''                <p className="mt-1 text-muted-foreground text-xs">
                    {row.search_engine} · {row.device}
                </p>''',
    '''                <p className="mt-1 text-muted-foreground text-xs">
                    {row.search_engine} · {row.device} · {keywordPositionSourceLabel(row.source)}
                </p>''',
    "keyword source semantics",
)
ui = replace_once(
    ui,
    '''                    className="h-8 w-20"
                    defaultValue={row.current_position ?? ""}
                    onBlur={(event) => {''',
    '''                    className="h-8 w-20"
                    defaultValue={row.current_position ?? ""}
                    disabled={providerOwned}
                    title={providerOwned ? "این Position از Provider واقعی آمده و فقط با Sync بعدی تغییر می‌کند." : undefined}
                    onBlur={(event) => {''',
    "provider rank read-only UI",
)
ui = replace_once(
    ui,
    '''}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">اتصال‌ها</CardTitle>''',
    '''}) {
    const searchEngines = data.filter((item) => Boolean(item.capabilities));
    const utilities = data.filter((item) => !item.capabilities);
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">اتصال‌ها</CardTitle>''',
    "integration engine split",
)
ui = replace_once(
    ui,
    '''            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.map((item) => (
                    <IntegrationCard key={item.provider} item={item} onSave={onSave} saving={saving} />
                ))}
            </CardContent>''',
    '''            <CardContent className="space-y-5">
                <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">۷ موتور جستجو</p>
                        <Badge variant={searchEngines.length === 7 ? "secondary" : "destructive"}>{searchEngines.length} / 7</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {searchEngines.map((item) => (
                            <IntegrationCard key={item.provider} item={item} onSave={onSave} saving={saving} />
                        ))}
                    </div>
                </div>
                {utilities.length > 0 ? (
                    <div className="border-t pt-4">
                        <p className="mb-2 font-medium text-muted-foreground text-sm">ابزارهای مکمل — خارج از شمارش موتورهای جستجو</p>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {utilities.map((item) => (
                                <IntegrationCard key={item.provider} item={item} onSave={onSave} saving={saving} />
                            ))}
                        </div>
                    </div>
                ) : null}
            </CardContent>''',
    "integration visual separation",
)
ui = replace_once(
    ui,
    '''                <ConnectionBadge status={item.status} />''',
    '''                <ConnectionBadge status={item.status} verifiedEngine={Boolean(item.capabilities)} />''',
    "verified engine connection badge",
)
ui = replace_once(
    ui,
    '''function ConnectionBadge({ status }: { status: string }) {
    const connected = status === "connected";''',
    '''function ConnectionBadge({ status, verifiedEngine = false }: { status: string; verifiedEngine?: boolean }) {
    const connected = status === "connected";''',
    "ConnectionBadge verified flag",
)
ui = replace_once(
    ui,
    '''            {connected
                ? "متصل واقعی"''',
    '''            {connected
                ? verifiedEngine
                    ? "متصل واقعی"
                    : "وضعیت متصل ثبت‌شده"''',
    "utility connected wording",
)
marker = '''function formatSyncEvidence(evidence: Record<string, unknown>) {'''
if marker not in ui:
    raise SystemExit("formatSyncEvidence marker missing")
helper = '''function keywordPositionSourceLabel(source: string) {
    const labels: Record<string, string> = {
        google_search_console: "میانگین Search Console",
        bing_webmaster: "میانگین Bing Webmaster",
        yandex_webmaster: "میانگین Yandex Webmaster",
        brave_search: "مشاهده Brave API",
        manual: "ورودی دستی",
    };
    return labels[source] ?? source;
}

'''
ui = ui.replace(marker, helper + marker, 1)
ui_path.write_text(ui)

verifier_path = Path("scripts/verify-seo-search-engines.mjs")
verifier = verifier_path.read_text()
anchor = '''contains(serviceFile, "No rank is written", "Brave must explicitly avoid fabricated not-found ranks");'''
replacement = '''contains(serviceFile, "No rank is written", "Brave must explicitly avoid fabricated not-found ranks");
contains(serviceFile, '.where("source", "manual").orWhere("search_engine", "brave")', "Brave probes must use tracked/manual keyword seeds, not every imported provider query");
contains(serviceFile, 'device: "all"', "Brave observations must not invent a device dimension");'''
verifier = replace_once(verifier, anchor, replacement, "Brave source integrity checks")
anchor2 = '''contains(controllerFile, "seoSearchEngineService.configureAndSync", "Engine PATCH must execute the real provider runtime");'''
replacement2 = '''contains(controllerFile, "seoSearchEngineService.configureAndSync", "Engine PATCH must execute the real provider runtime");
contains("apps/api/app/services/seo/seo_service.ts", "E_SEO_PROVIDER_POSITION_READ_ONLY", "Provider-owned positions must be protected from silent manual edits");'''
verifier = replace_once(verifier, anchor2, replacement2, "provider rank protection check")
anchor3 = '''contains(workspaceFile, "خطای اتصال", "UI must surface failed provider connections");'''
replacement3 = '''contains(workspaceFile, "خطای اتصال", "UI must surface failed provider connections");
contains(workspaceFile, "۷ موتور جستجو", "UI must separate exactly seven search engines from utility integrations");
contains(workspaceFile, "keywordPositionSourceLabel", "Rank rows must expose their real provider/manual source semantics");'''
verifier = replace_once(verifier, anchor3, replacement3, "UI source integrity checks")
verifier_path.write_text(verifier)
