from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


service_path = Path("apps/api/app/services/seo/search_engines.ts")
service = service_path.read_text()

service = service.replace('        nativeRank: true,\n        analytics: true,\n        submission: false,\n        credentialKind: "oauth_access_token",', '        nativeRank: true,\n        rankKind: "webmaster_average",\n        analytics: true,\n        submission: false,\n        credentialKind: "oauth_access_token",', 1)
service = service.replace('        nativeRank: true,\n        analytics: true,\n        submission: false,\n        credentialKind: "api_key",', '        nativeRank: true,\n        rankKind: "webmaster_average",\n        analytics: true,\n        submission: false,\n        credentialKind: "api_key",', 1)
service = service.replace('        nativeRank: true,\n        analytics: true,\n        submission: false,\n        credentialKind: "oauth_access_token",', '        nativeRank: true,\n        rankKind: "webmaster_average",\n        analytics: true,\n        submission: false,\n        credentialKind: "oauth_access_token",', 1)
service = service.replace('        nativeRank: false,\n        analytics: false,\n        submission: true,\n        credentialKind: "submission_token",', '        nativeRank: false,\n        rankKind: "none",\n        analytics: false,\n        submission: true,\n        credentialKind: "submission_token",', 1)
service = service.replace('        nativeRank: true,\n        analytics: false,\n        submission: false,\n        credentialKind: "subscription_token",', '        nativeRank: true,\n        rankKind: "api_serp_observation",\n        analytics: false,\n        submission: false,\n        credentialKind: "subscription_token",', 1)
service = service.replace('        nativeRank: false,\n        analytics: false,\n        submission: true,\n        credentialKind: "indexnow_key",', '        nativeRank: false,\n        rankKind: "none",\n        analytics: false,\n        submission: true,\n        credentialKind: "indexnow_key",', 2)

service = replace_once(
    service,
    'type JsonObject = Record<string, unknown>;\n',
    'type JsonObject = Record<string, unknown>;\ntype SeoDevice = "all" | "desktop" | "mobile" | "tablet";\n',
    "seo device type",
)
service = replace_once(
    service,
    '''function numberValue(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
''',
    '''function numberValue(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function inferredLocale(phrase: string): "fa" | "en" {
    /** Search webmaster APIs do not expose a content-language dimension. */
    return /[\\u0600-\\u06FF]/u.test(phrase) ? "fa" : "en";
}
''',
    "locale inference helper",
)
service = replace_once(
    service,
    '''            native_rank_tracking: definition.nativeRank,
            webmaster_analytics: definition.analytics,''',
    '''            native_rank_tracking: definition.nativeRank,
            rank_kind: definition.rankKind,
            webmaster_analytics: definition.analytics,''',
    "rank kind serialization",
)
service = replace_once(
    service,
    '''    locale?: "fa" | "en";
    country?: string | null;
    device?: "desktop" | "mobile" | "tablet";''',
    '''    locale?: "fa" | "en";
    country?: string | null;
    device?: SeoDevice;''',
    "keyword device input",
)
service = replace_once(
    service,
    '''    const locale = input.locale === "en" ? "en" : "fa";
    const device = input.device ?? "desktop";''',
    '''    const locale = input.locale ?? inferredLocale(phrase);
    const device = input.device ?? "all";''',
    "honest aggregate defaults",
)
service = replace_once(
    service,
    '                dimensions: ["query"],',
    '                dimensions: ["query", "device", "country"],',
    "google dimensions",
)
service = replace_once(
    service,
    '''    for (const row of payload.rows ?? []) {
        const phrase = row.keys?.[0]?.trim();
        const position = numberValue(row.position);
        if (!phrase || position === null || position < 1) continue;
        await observeKeyword({ phrase, engine: "google", source: "google_search_console", position });
        imported += 1;
    }''',
    '''    for (const row of payload.rows ?? []) {
        const phrase = row.keys?.[0]?.trim();
        const deviceValue = row.keys?.[1]?.trim().toLowerCase();
        const country = row.keys?.[2]?.trim().toLowerCase() || null;
        const position = numberValue(row.position);
        if (!phrase || position === null || position < 1) continue;
        const device: SeoDevice =
            deviceValue === "mobile" || deviceValue === "tablet" || deviceValue === "desktop" ? deviceValue : "all";
        await observeKeyword({
            phrase,
            engine: "google",
            source: "google_search_console",
            position,
            locale: inferredLocale(phrase),
            country,
            device,
        });
        imported += 1;
    }''',
    "google dimensions import",
)
service = replace_once(
    service,
    '        await observeKeyword({ phrase, engine: "bing", source: "bing_webmaster", position: row.position });',
    '        await observeKeyword({ phrase, engine: "bing", source: "bing_webmaster", position: row.position, locale: inferredLocale(phrase), device: "all" });',
    "bing aggregate metadata",
)
service = replace_once(
    service,
    '        await observeKeyword({ phrase, engine: "yandex", source: "yandex_webmaster", position });',
    '        await observeKeyword({ phrase, engine: "yandex", source: "yandex_webmaster", position, locale: inferredLocale(phrase), device: "all" });',
    "yandex aggregate metadata",
)
service = replace_once(
    service,
    '''                device: row.device === "mobile" || row.device === "tablet" ? row.device : "desktop",''',
    '''                device:
                    row.device === "mobile" || row.device === "tablet" || row.device === "desktop" || row.device === "all"
                        ? row.device
                        : "all",''',
    "brave device preservation",
)
service = replace_once(
    service,
    '''async function submitIndexNowTarget(configuration: JsonObject, key: string, endpoint: string, target: string) {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
        throw new Error("IndexNow key must be 8-128 letters, digits, or hyphens");
    }''',
    '''async function submitIndexNowTarget(configuration: JsonObject, key: string, endpoint: string, target: string) {
    const keyPattern = target === "naver" ? /^[A-Fa-f0-9-]{8,128}$/ : /^[A-Za-z0-9-]{8,128}$/;
    if (!keyPattern.test(key)) {
        throw new Error(
            target === "naver"
                ? "Naver IndexNow key must be 8-128 hexadecimal characters or hyphens"
                : "IndexNow key must be 8-128 letters, digits, or hyphens",
        );
    }''',
    "provider specific IndexNow key rules",
)
service_path.write_text(service)

validator_path = Path("apps/api/app/validators/admin/seo_validator.ts")
validator = validator_path.read_text()
validator = validator.replace('vine.enum(["desktop", "mobile", "tablet"] as const)', 'vine.enum(["all", "desktop", "mobile", "tablet"] as const)')
validator_path.write_text(validator)

types_path = Path("apps/admin/src/features/seo/types.ts")
types = types_path.read_text()
types = replace_once(
    types,
    '''    device: "desktop" | "mobile" | "tablet";''',
    '''    device: "all" | "desktop" | "mobile" | "tablet";''',
    "admin aggregate device",
)
types = replace_once(
    types,
    '''export interface SeoSearchEngineCapabilities {
    native_rank_tracking: boolean;
    webmaster_analytics: boolean;''',
    '''export interface SeoSearchEngineCapabilities {
    native_rank_tracking: boolean;
    rank_kind: "webmaster_average" | "api_serp_observation" | "none";
    webmaster_analytics: boolean;''',
    "admin rank kind",
)
types_path.write_text(types)

ui_path = Path("apps/admin/src/features/seo/workspace.tsx")
ui = ui_path.read_text()
ui = replace_once(
    ui,
    '''                    {item.capabilities.native_rank_tracking ? <Badge variant="secondary">رتبه واقعی</Badge> : null}
                    {item.capabilities.webmaster_analytics ? <Badge variant="secondary">داده وبمستر</Badge> : null}''',
    '''                    {item.capabilities.rank_kind === "webmaster_average" ? (
                        <Badge variant="secondary">میانگین رتبه وبمستر</Badge>
                    ) : null}
                    {item.capabilities.rank_kind === "api_serp_observation" ? (
                        <Badge variant="secondary">رتبه مشاهده‌شده API</Badge>
                    ) : null}
                    {item.capabilities.webmaster_analytics ? <Badge variant="secondary">داده وبمستر</Badge> : null}''',
    "precise rank badges",
)
ui_path.write_text(ui)
