import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import SettingsService from "#services/settings_service";
import { currentTenantId, currentTrx } from "#services/tenant_context";

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
        submission: true,
        credentialKind: "api_key",
    },
    {
        engine: "yandex",
        provider: "yandex_webmaster",
        label: "Yandex",
        nativeRank: true,
        analytics: true,
        submission: true,
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

function siteHost(value: string): string {
    try {
        return new URL(value).hostname;
    } catch {
        throw new Exception("SEO integration requires a valid site URL", {
            status: 422,
            code: "E_SEO_SEARCH_ENGINE_SITE_URL",
        });
    }
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
            const detail = typeof payload === "string" ? payload.slice(0, 500) : JSON.stringify(payload).slice(0, 500);
            throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
        }
        return payload;
    } finally {
        clearTimeout(timer);
    }
}

async function textRequest(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<{ status: number; body: string }> {
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
    const tenantId = currentTenantId();
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
            .where("id", existing.id)
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

async function syncGoogle(configuration: JsonObject, token: string) {
    const siteUrl = stringValue(configuration.property) ?? (await resolveSiteUrl(configuration));
    const days = integerSetting(configuration.days, 7, 1, 30);
    const rowLimit = integerSetting(configuration.sync_limit, 250, 1, 5_000);
    const end = DateTime.utc().minus({ days: 1 }).toISODate()!;
    const start = DateTime.fromISO(end).minus({ days: days - 1 }).toISODate()!;
    const payload = (await jsonRequest(
        `https://www.googleapis.com/webmasters/v3/sites/${escapeSiteUrl(siteUrl)}/searchAnalytics/query`,
        {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit }),
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
    return { mode: "webmaster_analytics", imported, site_url: siteUrl, period: { start, end } };
}

async function syncBing(configuration: JsonObject, apiKey: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const url = new URL("https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats");
    url.searchParams.set("siteUrl", siteUrl);
    url.searchParams.set("apikey", apiKey);
    const payload = (await jsonRequest(url.toString())) as {
        d?: Array<{ Query?: string; AvgImpressionPosition?: number; Date?: string }>;
    };
    const latest = new Map<string, { position: number; date: string }>();
    for (const row of payload.d ?? []) {
        const phrase = row.Query?.trim();
        const position = numberValue(row.AvgImpressionPosition);
        if (!phrase || position === null || position < 1) continue;
        const date = String(row.Date ?? "");
        const previous = latest.get(phrase);
        if (!previous || date >= previous.date) latest.set(phrase, { position, date });
    }
    for (const [phrase, row] of latest) {
        await observeKeyword({ phrase, engine: "bing", source: "bing_webmaster", position: row.position });
    }
    return { mode: "webmaster_analytics", imported: latest.size, site_url: siteUrl };
}

async function syncYandex(configuration: JsonObject, token: string) {
    const userId = stringValue(configuration.user_id);
    const hostId = stringValue(configuration.host_id);
    if (!userId || !hostId) {
        throw new Exception("Yandex requires configuration.user_id and configuration.host_id", {
            status: 422,
            code: "E_SEO_YANDEX_CONFIGURATION",
        });
    }
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
    return { mode: "webmaster_analytics", imported, host_id: hostId };
}

function resultHostMatches(resultUrl: string, targetHost: string): boolean {
    try {
        const host = new URL(resultUrl).hostname.replace(/^www\./, "").toLowerCase();
        const expected = targetHost.replace(/^www\./, "").toLowerCase();
        return host === expected || host.endsWith(`.${expected}`);
    } catch {
        return false;
    }
}

async function syncBrave(configuration: JsonObject, apiKey: string) {
    const baseUrl = await resolveSiteUrl(configuration);
    const targetHost = siteHost(baseUrl);
    const keywordLimit = integerSetting(configuration.sync_limit, 10, 1, 50);
    const maxPages = integerSetting(configuration.max_pages, 2, 1, 5);
    const country = (stringValue(configuration.country) ?? "US").slice(0, 2).toUpperCase();
    const searchLang = (stringValue(configuration.search_lang) ?? "fa").toLowerCase();
    const rows = (await currentTrx()
        .from("seo_keywords")
        .where("tenant_id", currentTenantId())
        .where("search_engine", "brave")
        .orderBy("updated_at", "asc")
        .limit(keywordLimit)) as DbRow[];

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
        } else {
            await currentTrx()
                .from("seo_keywords")
                .where("id", row.id)
                .update({ last_checked_at: DateTime.utc().toSQL(), source: "brave_search" });
        }
    }
    return { mode: "serp_probe", checked, found, max_results: maxPages * 20, target_host: targetHost };
}

async function submitBaidu(configuration: JsonObject, token: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const host = siteHost(siteUrl);
    const url = new URL("http://data.zz.baidu.com/urls");
    url.searchParams.set("site", host);
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
    const host = siteHost(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;
    const payload = {
        host,
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
        .where("tenant_id", currentTenantId())
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
            tenant_id: currentTenantId(),
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
            .where("tenant_id", currentTenantId())
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
     * Saves configuration and performs a real provider request when a runtime secret exists.
     * Client-supplied `connected` is deliberately ignored: only a successful provider response
     * can transition an engine to connected. This prevents decorative/fake connection states.
     */
    async configureAndSync(input: SeoSearchEngineIntegrationInput) {
        const current = await findIntegration(input.provider);
        const configuration = input.configuration ?? (current ? asJson(current.configuration) : {});
        const credentialEnvRef =
            input.credential_env_ref === undefined ? stringValue(current?.credential_env_ref) : stringValue(input.credential_env_ref);

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
            return serializeIntegration(await findIntegration(input.provider), input.provider);
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
            throw new Exception(`Search engine sync failed for ${input.provider}: ${message}`, {
                status: 502,
                code: "E_SEO_SEARCH_ENGINE_SYNC",
            });
        }
    }
}

export const seoSearchEngineService = new SeoSearchEngineService();
