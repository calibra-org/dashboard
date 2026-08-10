import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

/**
 * Seven concrete search engines. Generic IndexNow, Merchant feeds, crawler policy and
 * manual imports are utilities and intentionally do not count as search engines.
 * Capability flags describe what this connector actually implements, not everything
 * the upstream provider might offer.
 */
export const SEO_SEARCH_ENGINES = [
    {
        engine: "google",
        provider: "google_search_console",
        label: "Google",
        nativeRank: true,
        analytics: true,
        submission: false,
        credentialKind: "oauth_access_token",
    },
    {
        engine: "bing",
        provider: "bing_webmaster",
        label: "Microsoft Bing",
        nativeRank: true,
        analytics: true,
        submission: false,
        credentialKind: "api_key",
    },
    {
        engine: "yandex",
        provider: "yandex_webmaster",
        label: "Yandex",
        nativeRank: true,
        analytics: true,
        submission: false,
        credentialKind: "oauth_access_token",
    },
    {
        engine: "baidu",
        provider: "baidu_search_resource",
        label: "Baidu",
        nativeRank: false,
        analytics: false,
        submission: true,
        credentialKind: "submission_token",
    },
    {
        engine: "brave",
        provider: "brave_search",
        label: "Brave Search",
        nativeRank: true,
        analytics: false,
        submission: false,
        credentialKind: "subscription_token",
    },
    {
        engine: "naver",
        provider: "naver_search_advisor",
        label: "Naver",
        nativeRank: false,
        analytics: false,
        submission: true,
        credentialKind: "indexnow_key",
    },
    {
        engine: "seznam",
        provider: "seznam_indexnow",
        label: "Seznam.cz",
        nativeRank: false,
        analytics: false,
        submission: true,
        credentialKind: "indexnow_key",
    },
] as const;

export type SeoSearchEngine = (typeof SEO_SEARCH_ENGINES)[number]["engine"];
export type SeoSearchEngineProvider = (typeof SEO_SEARCH_ENGINES)[number]["provider"];
export type SeoIntegrationStatus = "disconnected" | "configured" | "connected" | "error" | "disabled";

export interface SeoSearchEngineIntegrationInput {
    provider: SeoSearchEngineProvider;
    status?: SeoIntegrationStatus;
    configuration?: Record<string, unknown>;
    credential_env_ref?: string | null;
}

type DbRow = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

const providerSet = new Set<string>(SEO_SEARCH_ENGINES.map((item) => item.provider));
const settings = new SettingsService();

export function isSeoSearchEngineProvider(provider: string): provider is SeoSearchEngineProvider {
    return providerSet.has(provider);
}

function definitionFor(provider: SeoSearchEngineProvider) {
    const definition = SEO_SEARCH_ENGINES.find((item) => item.provider === provider);
    if (!definition) throw new Error(`Unknown SEO search engine provider: ${provider}`);
    return definition;
}

function asJson(value: unknown): JsonObject {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            return JSON.parse(value) as JsonObject;
        } catch {
            return {};
        }
    }
    return typeof value === "object" ? (value as JsonObject) : {};
}

function stringValue(value: unknown): string | null {
    const normalized = String(value ?? "").trim();
    return normalized || null;
}

function numberValue(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function integerSetting(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Math.trunc(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function iso(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = DateTime.fromISO(String(value), { setZone: true });
    return parsed.isValid ? parsed.toUTC().toISO() : String(value);
}

function escapeSiteUrl(value: string): string {
    return encodeURIComponent(value);
}

function hostname(value: string): string {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        throw new Exception("SEO integration requires a valid site URL", {
            status: 422,
            code: "E_SEO_SEARCH_ENGINE_SITE_URL",
        });
    }
}

function normalizedHostname(value: string): string {
    return hostname(value).replace(/^www\./, "");
}

function hostsMatch(left: string, right: string): boolean {
    try {
        return normalizedHostname(left) === normalizedHostname(right);
    } catch {
        return false;
    }
}

function normalizedUrlPrefix(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
    return url.toString();
}

async function jsonRequest(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const text = await response.text();
        let payload: unknown = null;
        if (text) {
            try {
                payload = JSON.parse(text) as unknown;
            } catch {
                payload = text;
            }
        }
        if (!response.ok) {
            const serialized = typeof payload === "string" ? payload : (JSON.stringify(payload) ?? String(payload));
            throw new Error(`HTTP ${response.status}${serialized ? `: ${serialized.slice(0, 500)}` : ""}`);
        }
        return payload;
    } finally {
        clearTimeout(timer);
    }
}

async function textRequest(
    url: string,
    init: RequestInit = {},
    timeoutMs = 12_000,
): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const body = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`);
        return { status: response.status, body };
    } finally {
        clearTimeout(timer);
    }
}

function serializeIntegration(row: DbRow | null, provider: SeoSearchEngineProvider) {
    const definition = definitionFor(provider);
    const envRef = row ? stringValue(row.credential_env_ref) : null;
    return {
        id: row ? Number(row.id) : null,
        provider,
        engine: definition.engine,
        label: definition.label,
        status: row ? String(row.status ?? "disconnected") : "disconnected",
        configuration: row ? asJson(row.configuration) : {},
        credential_env_ref: envRef,
        credential_configured: Boolean(envRef && process.env[envRef]),
        last_synced_at: row ? iso(row.last_synced_at) : null,
        last_error: row?.last_error ? String(row.last_error) : null,
        capabilities: {
            native_rank_tracking: definition.nativeRank,
            webmaster_analytics: definition.analytics,
            url_submission: definition.submission,
            credential_kind: definition.credentialKind,
        },
    };
}

async function resolveSiteUrl(configuration: JsonObject): Promise<string> {
    const explicit = stringValue(configuration.site_url);
    if (explicit) return explicit.replace(/\/+$/, "");
    const seoSettings = await settings.all("seo");
    const configured = stringValue(seoSettings.base_url);
    if (!configured) {
        throw new Exception("Set SEO base_url or integration configuration.site_url before syncing", {
            status: 422,
            code: "E_SEO_SEARCH_ENGINE_SITE_URL",
        });
    }
    return configured.replace(/\/+$/, "");
}

async function observeKeyword(input: {
    phrase: string;
    engine: SeoSearchEngine;
    source: string;
    position: number;
    locale?: "fa" | "en";
    country?: string | null;
    device?: "desktop" | "mobile" | "tablet";
    targetUrl?: string | null;
}) {
    const phrase = input.phrase.trim();
    if (!phrase || !Number.isFinite(input.position) || input.position < 1) return;

    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const locale = input.locale === "en" ? "en" : "fa";
    const device = input.device ?? "desktop";
    const country = input.country?.trim().slice(0, 3).toLowerCase() || null;
    const now = DateTime.utc().toSQL();

    let query = trx
        .from("seo_keywords")
        .where("tenant_id", tenantId)
        .where("phrase", phrase)
        .where("locale", locale)
        .where("search_engine", input.engine)
        .where("device", device);
    query = country ? query.where("country", country) : query.whereNull("country");
    const existing = (await query.orderBy("id", "asc").first()) as DbRow | undefined;

    if (existing) {
        const previous = numberValue(existing.current_position);
        const best = numberValue(existing.best_position);
        await trx
            .from("seo_keywords")
            .where("id", Number(existing.id))
            .update({
                previous_position: previous,
                current_position: input.position,
                best_position: best === null ? input.position : Math.min(best, input.position),
                target_url: input.targetUrl ?? existing.target_url ?? null,
                source: input.source,
                last_checked_at: now,
                updated_at: now,
            });
        return;
    }

    await trx.table("seo_keywords").insert({
        tenant_id: tenantId,
        phrase,
        locale,
        target_entity_kind: null,
        target_entity_id: null,
        target_url: input.targetUrl ?? null,
        search_engine: input.engine,
        country,
        city: null,
        device,
        current_position: input.position,
        previous_position: null,
        best_position: input.position,
        search_volume: null,
        difficulty: null,
        source: input.source,
        last_checked_at: now,
        created_by_user_id: null,
        created_at: now,
        updated_at: now,
    });
}

async function resolveGoogleProperty(configuration: JsonObject, token: string): Promise<string> {
    const explicit = stringValue(configuration.property);
    if (explicit) return explicit;

    const baseUrl = await resolveSiteUrl(configuration);
    const baseHost = normalizedHostname(baseUrl);
    const payload = (await jsonRequest("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })) as { siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }> };
    const entries = (payload.siteEntry ?? []).filter(
        (entry) => entry.siteUrl && entry.permissionLevel !== "siteUnverifiedUser",
    );
    const normalizedBase = normalizedUrlPrefix(baseUrl);
    const exact = entries.find((entry) => {
        if (!entry.siteUrl || entry.siteUrl.startsWith("sc-domain:")) return false;
        try {
            return normalizedUrlPrefix(entry.siteUrl) === normalizedBase;
        } catch {
            return false;
        }
    });
    if (exact?.siteUrl) return exact.siteUrl;

    const domain = entries.find((entry) => entry.siteUrl === `sc-domain:${baseHost}`);
    if (domain?.siteUrl) return domain.siteUrl;

    const sameHost = entries.find((entry) =>
        Boolean(entry.siteUrl && !entry.siteUrl.startsWith("sc-domain:") && hostsMatch(entry.siteUrl, baseUrl)),
    );
    if (sameHost?.siteUrl) return sameHost.siteUrl;

    throw new Exception("No verified Search Console property matches the configured SEO base URL", {
        status: 422,
        code: "E_SEO_GOOGLE_PROPERTY_NOT_FOUND",
    });
}

async function syncGoogle(configuration: JsonObject, token: string) {
    const siteUrl = await resolveGoogleProperty(configuration, token);
    const days = integerSetting(configuration.days, 7, 1, 30);
    const rowLimit = integerSetting(configuration.sync_limit, 1_000, 1, 25_000);
    const end = DateTime.utc().minus({ days: 1 }).toISODate()!;
    const start = DateTime.fromISO(end)
        .minus({ days: days - 1 })
        .toISODate()!;
    const payload = (await jsonRequest(
        `https://www.googleapis.com/webmasters/v3/sites/${escapeSiteUrl(siteUrl)}/searchAnalytics/query`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                startDate: start,
                endDate: end,
                dimensions: ["query"],
                rowLimit,
                dataState: "final",
            }),
        },
    )) as { rows?: Array<{ keys?: string[]; position?: number }> };

    let imported = 0;
    for (const row of payload.rows ?? []) {
        const phrase = row.keys?.[0]?.trim();
        const position = numberValue(row.position);
        if (!phrase || position === null || position < 1) continue;
        await observeKeyword({ phrase, engine: "google", source: "google_search_console", position });
        imported += 1;
    }
    return {
        mode: "webmaster_analytics",
        imported,
        property: siteUrl,
        period: { start, end },
        position_kind: "average",
    };
}

function bingDateValue(value: unknown): number {
    const text = String(value ?? "");
    const dotNet = /\/Date\((\d+)/.exec(text);
    if (dotNet) return Number(dotNet[1]);
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function syncBing(configuration: JsonObject, apiKey: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const url = new URL("https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats");
    url.searchParams.set("siteUrl", siteUrl);
    url.searchParams.set("apikey", apiKey);
    const payload = (await jsonRequest(url.toString())) as {
        d?: Array<{ Query?: string; AvgImpressionPosition?: number; Date?: string }>;
    };

    const latest = new Map<string, { position: number; date: number }>();
    for (const row of payload.d ?? []) {
        const phrase = row.Query?.trim();
        const position = numberValue(row.AvgImpressionPosition);
        if (!phrase || position === null || position < 1) continue;
        const date = bingDateValue(row.Date);
        const previous = latest.get(phrase);
        if (!previous || date >= previous.date) latest.set(phrase, { position, date });
    }

    for (const [phrase, row] of latest) {
        await observeKeyword({ phrase, engine: "bing", source: "bing_webmaster", position: row.position });
    }
    return {
        mode: "webmaster_analytics",
        imported: latest.size,
        site_url: siteUrl,
        position_kind: "average_impression",
    };
}

async function discoverYandexHost(configuration: JsonObject, token: string) {
    const headers = { Authorization: `OAuth ${token}`, Accept: "application/json" };
    const configuredUserId = stringValue(configuration.user_id);
    const userId =
        configuredUserId ??
        stringValue(
            ((await jsonRequest("https://api.webmaster.yandex.net/v4/user", { headers })) as {
                user_id?: number | string;
            }).user_id,
        );
    if (!userId) {
        throw new Exception("Yandex Webmaster did not return a user_id", {
            status: 422,
            code: "E_SEO_YANDEX_USER",
        });
    }

    const configuredHostId = stringValue(configuration.host_id);
    if (configuredHostId) return { userId, hostId: configuredHostId };

    const baseUrl = await resolveSiteUrl(configuration);
    const hosts = (await jsonRequest(`https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(userId)}/hosts`, {
        headers,
    })) as {
        hosts?: Array<{ host_id?: string; ascii_host_url?: string; unicode_host_url?: string; verified?: boolean }>;
    };
    const match = (hosts.hosts ?? []).find(
        (host) =>
            host.verified !== false &&
            Boolean(
                (host.ascii_host_url && hostsMatch(host.ascii_host_url, baseUrl)) ||
                    (host.unicode_host_url && hostsMatch(host.unicode_host_url, baseUrl)),
            ),
    );
    if (!match?.host_id) {
        throw new Exception("No verified Yandex Webmaster host matches the configured SEO base URL", {
            status: 422,
            code: "E_SEO_YANDEX_HOST_NOT_FOUND",
        });
    }
    return { userId, hostId: match.host_id };
}

async function syncYandex(configuration: JsonObject, token: string) {
    const { userId, hostId } = await discoverYandexHost(configuration, token);
    const limit = integerSetting(configuration.sync_limit, 250, 1, 500);
    const url = new URL(
        `https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}/search-queries/popular`,
    );
    url.searchParams.set("order_by", "TOTAL_SHOWS");
    url.searchParams.append("query_indicator", "TOTAL_SHOWS");
    url.searchParams.append("query_indicator", "TOTAL_CLICKS");
    url.searchParams.append("query_indicator", "AVG_SHOW_POSITION");
    url.searchParams.set("device_type_indicator", "ALL");
    url.searchParams.set("limit", String(limit));

    const payload = (await jsonRequest(url.toString(), {
        headers: { Authorization: `OAuth ${token}`, Accept: "application/json" },
    })) as { queries?: Array<{ query_text?: string; indicators?: Record<string, number> }> };

    let imported = 0;
    for (const row of payload.queries ?? []) {
        const phrase = row.query_text?.trim();
        const position = numberValue(row.indicators?.AVG_SHOW_POSITION);
        if (!phrase || position === null || position < 1) continue;
        await observeKeyword({ phrase, engine: "yandex", source: "yandex_webmaster", position });
        imported += 1;
    }
    return {
        mode: "webmaster_analytics",
        imported,
        user_id: userId,
        host_id: hostId,
        position_kind: "average_show",
    };
}

function resultHostMatches(resultUrl: string, targetHost: string): boolean {
    try {
        const host = normalizedHostname(resultUrl);
        return host === targetHost || host.endsWith(`.${targetHost}`);
    } catch {
        return false;
    }
}

async function braveKeywordSeeds(limit: number): Promise<DbRow[]> {
    return (await currentTrx()
        .from("seo_keywords")
        .where("tenant_id", Number(currentTenantId()))
        .select("phrase", "locale", "device")
        .min("updated_at as oldest_updated_at")
        .groupBy("phrase", "locale", "device")
        .orderBy("oldest_updated_at", "asc")
        .limit(limit)) as DbRow[];
}

async function syncBrave(configuration: JsonObject, apiKey: string) {
    const baseUrl = await resolveSiteUrl(configuration);
    const targetHost = normalizedHostname(baseUrl);
    const keywordLimit = integerSetting(configuration.sync_limit, 10, 1, 50);
    const maxPages = integerSetting(configuration.max_pages, 2, 1, 5);
    const country = (stringValue(configuration.country) ?? "US").slice(0, 2).toUpperCase();
    const searchLang = (stringValue(configuration.search_lang) ?? "fa").toLowerCase();
    const rows = await braveKeywordSeeds(keywordLimit);

    let checked = 0;
    let found = 0;
    for (const row of rows) {
        const phrase = String(row.phrase ?? "").trim();
        if (!phrase) continue;
        checked += 1;

        let position: number | null = null;
        let matchedUrl: string | null = null;
        for (let page = 0; page < maxPages && position === null; page += 1) {
            const url = new URL("https://api.search.brave.com/res/v1/web/search");
            url.searchParams.set("q", phrase);
            url.searchParams.set("count", "20");
            url.searchParams.set("offset", String(page));
            url.searchParams.set("country", country);
            url.searchParams.set("search_lang", searchLang);
            const payload = (await jsonRequest(url.toString(), {
                headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
            })) as { web?: { results?: Array<{ url?: string }> }; query?: { more_results_available?: boolean } };
            const results = payload.web?.results ?? [];
            const index = results.findIndex((result) => Boolean(result.url && resultHostMatches(result.url, targetHost)));
            if (index >= 0) {
                position = page * 20 + index + 1;
                matchedUrl = results[index]?.url ?? null;
                break;
            }
            if (!payload.query?.more_results_available) break;
        }

        if (position !== null) {
            found += 1;
            await observeKeyword({
                phrase,
                engine: "brave",
                source: "brave_search",
                position,
                locale: row.locale === "en" ? "en" : "fa",
                country,
                device: row.device === "mobile" || row.device === "tablet" ? row.device : "desktop",
                targetUrl: matchedUrl,
            });
        }
    }

    return {
        mode: "serp_probe",
        checked,
        found,
        max_results_per_query: maxPages * 20,
        target_host: targetHost,
        note: "No rank is written when the target host is absent from the inspected result window.",
    };
}

async function submitBaidu(configuration: JsonObject, token: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const url = new URL("http://data.zz.baidu.com/urls");
    url.searchParams.set("site", siteHostname);
    url.searchParams.set("token", token);
    const result = await textRequest(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: `${siteUrl}/`,
    });
    return { mode: "url_submission", submitted: 1, status_code: result.status, target: "baidu" };
}

async function submitIndexNowTarget(configuration: JsonObject, key: string, endpoint: string, target: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;
    const payload = {
        host: siteHostname,
        key,
        keyLocation,
        urlList: [`${siteUrl}/`],
    };
    const response = await textRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
    });
    return { mode: "indexnow_submission", submitted: 1, status_code: response.status, target };
}

async function runSync(provider: SeoSearchEngineProvider, configuration: JsonObject, secret: string) {
    switch (provider) {
        case "google_search_console":
            return syncGoogle(configuration, secret);
        case "bing_webmaster":
            return syncBing(configuration, secret);
        case "yandex_webmaster":
            return syncYandex(configuration, secret);
        case "brave_search":
            return syncBrave(configuration, secret);
        case "baidu_search_resource":
            return submitBaidu(configuration, secret);
        case "naver_search_advisor":
            return submitIndexNowTarget(configuration, secret, "https://searchadvisor.naver.com/indexnow", "naver");
        case "seznam_indexnow":
            return submitIndexNowTarget(configuration, secret, "https://search.seznam.cz/indexnow", "seznam");
    }
}

async function findIntegration(provider: SeoSearchEngineProvider): Promise<DbRow | null> {
    const row = await currentTrx()
        .from("seo_integrations")
        .where("tenant_id", Number(currentTenantId()))
        .where("provider", provider)
        .first();
    return (row as DbRow | undefined) ?? null;
}

async function persistIntegration(input: {
    provider: SeoSearchEngineProvider;
    status: SeoIntegrationStatus;
    configuration: JsonObject;
    credentialEnvRef: string | null;
    lastSyncedAt?: string | null;
    lastError?: string | null;
}) {
    const now = DateTime.utc().toSQL();
    await currentTrx()
        .table("seo_integrations")
        .insert({
            tenant_id: Number(currentTenantId()),
            provider: input.provider,
            status: input.status,
            configuration: JSON.stringify(input.configuration),
            credential_env_ref: input.credentialEnvRef,
            last_synced_at: input.lastSyncedAt ?? null,
            last_error: input.lastError ?? null,
            created_at: now,
            updated_at: now,
        })
        .onConflict(["tenant_id", "provider"])
        .merge(["status", "configuration", "credential_env_ref", "last_synced_at", "last_error", "updated_at"]);
}

class SeoSearchEngineService {
    async integrations() {
        const rows = (await currentTrx()
            .from("seo_integrations")
            .where("tenant_id", Number(currentTenantId()))
            .whereIn(
                "provider",
                SEO_SEARCH_ENGINES.map((item) => item.provider),
            )) as DbRow[];
        const byProvider = new Map(rows.map((row) => [String(row.provider), row]));
        return SEO_SEARCH_ENGINES.map((definition) =>
            serializeIntegration(byProvider.get(definition.provider) ?? null, definition.provider),
        );
    }

    /**
     * Client-supplied `connected` is never trusted. A connector becomes connected only
     * after its official provider endpoint answers successfully during this request.
     */
    async configureAndSync(input: SeoSearchEngineIntegrationInput) {
        const current = await findIntegration(input.provider);
        const configuration = input.configuration ?? (current ? asJson(current.configuration) : {});
        const credentialEnvRef =
            input.credential_env_ref === undefined
                ? stringValue(current?.credential_env_ref)
                : stringValue(input.credential_env_ref);

        if (input.status === "disabled") {
            await persistIntegration({
                provider: input.provider,
                status: "disabled",
                configuration,
                credentialEnvRef,
                lastSyncedAt: current ? iso(current.last_synced_at) : null,
                lastError: null,
            });
            return serializeIntegration(await findIntegration(input.provider), input.provider);
        }

        const secret = credentialEnvRef ? process.env[credentialEnvRef] : undefined;
        if (!credentialEnvRef || !secret) {
            await persistIntegration({
                provider: input.provider,
                status: credentialEnvRef ? "configured" : "disconnected",
                configuration,
                credentialEnvRef,
                lastSyncedAt: current ? iso(current.last_synced_at) : null,
                lastError: credentialEnvRef ? `Environment variable ${credentialEnvRef} is not available at runtime` : null,
            });
            return serializeIntegration(await findIntegration(input.provider), input.provider);
        }

        try {
            const evidence = await runSync(input.provider, configuration, secret);
            const syncedAt = DateTime.utc().toISO();
            await persistIntegration({
                provider: input.provider,
                status: "connected",
                configuration: { ...configuration, last_sync_evidence: evidence },
                credentialEnvRef,
                lastSyncedAt: syncedAt,
                lastError: null,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await persistIntegration({
                provider: input.provider,
                status: "error",
                configuration,
                credentialEnvRef,
                lastSyncedAt: current ? iso(current.last_synced_at) : null,
                lastError: message.slice(0, 2_000),
            });
        }

        /**
         * Tenant middleware rolls back all writes for 4xx/5xx responses. Returning the
         * persisted `error` state with HTTP 200 keeps last_error truthful and visible.
         */
        return serializeIntegration(await findIntegration(input.provider), input.provider);
    }
}

export const seoSearchEngineService = new SeoSearchEngineService();
