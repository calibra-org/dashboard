"use client";

/**
 * Browser fetch helpers for the same-origin admin proxy. Every call goes through `/api/admin/...`
 * so the bearer token stays on the server and CORS never enters the picture. Mutations include the
 * double-submit `X-CSRF-Token` header.
 */

class ProxyError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body?: unknown,
    ) {
        super(message);
        this.name = "ProxyError";
    }
}

/**
 * Reads the double-submit CSRF token from `document.cookie`. The cookie is set on login (server
 * action, name `admin_csrf`) and survives until logout / session expiry. Returns `undefined` only
 * in SSR contexts where `document` is not defined — every mutation hook must run in the browser.
 */
function getCsrfToken(): string | undefined {
    if (typeof document === "undefined") return undefined;
    const match = document.cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
}

type QueryValue = string | number | boolean | undefined | null | ReadonlyArray<string | number | boolean>;

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) {
        if (v === undefined || v === null) continue;
        if (Array.isArray(v)) {
            for (const item of v) search.append(k, String(item));
            continue;
        }
        search.set(k, String(v));
    }
    const qs = search.toString();
    const cleaned = path.replace(/^\/+/, "");
    return qs.length > 0 ? `/api/admin/${cleaned}?${qs}` : `/api/admin/${cleaned}`;
}

export interface ApiFetchOptions {
    locale: string;
    query?: Record<string, QueryValue>;
    signal?: AbortSignal;
}

/** GET against the admin proxy. Throws {@link ProxyError} on non-2xx responses. */
export async function apiGet<T>(path: string, options: ApiFetchOptions): Promise<T> {
    const res = await fetch(buildUrl(path, options.query), {
        method: "GET",
        headers: { "accept-language": options.locale, accept: "application/json" },
        signal: options.signal,
    });
    return readResponse<T>(res);
}

export interface ApiMutationOptions extends ApiFetchOptions {
    body?: unknown;
    /** Optional `If-Match` header value — forwarded to the api for optimistic concurrency checks. */
    ifMatch?: string;
    /**
     * Stable idempotency token for retry-safe financial/create operations. Callers may provide an
     * explicit token. Refunds receive an automatic payload-scoped token when one is omitted.
     */
    idempotencyKey?: string;
}

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

const automaticIdempotencyKeys = new Map<string, string>();

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
        .join(",")}}`;
}

function isAutomaticIdempotencyMutation(method: MutationMethod, path: string): boolean {
    return method === "POST" && /^orders\/\d+\/refunds\/?$/.test(path.replace(/^\/+/, ""));
}

function createIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function automaticIdempotencyKey(method: MutationMethod, path: string, body: unknown): { fingerprint: string; key: string } | null {
    if (!isAutomaticIdempotencyMutation(method, path)) return null;
    const fingerprint = `${method}:${path.replace(/^\/+/, "")}:${canonicalJson(body ?? null)}`;
    const existing = automaticIdempotencyKeys.get(fingerprint);
    if (existing) return { fingerprint, key: existing };
    const key = createIdempotencyKey();
    automaticIdempotencyKeys.set(fingerprint, key);
    while (automaticIdempotencyKeys.size > 64) {
        const oldest = automaticIdempotencyKeys.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        automaticIdempotencyKeys.delete(oldest);
    }
    return { fingerprint, key };
}

/**
 * Sends a mutation through the proxy. Stamps `X-CSRF-Token` from `document.cookie` and
 * serializes a JSON body when provided; passes `null`/`undefined` bodies through as empty.
 */
export async function apiMutate<T>(method: MutationMethod, path: string, options: ApiMutationOptions): Promise<T> {
    const csrf = getCsrfToken();
    if (csrf === undefined) {
        throw new ProxyError("missing csrf token cookie", 403);
    }
    const headers: Record<string, string> = {
        "accept-language": options.locale,
        accept: "application/json",
        "x-csrf-token": csrf,
    };
    if (typeof options.ifMatch === "string" && options.ifMatch.length > 0) {
        headers["if-match"] = options.ifMatch;
    }
    const automatic = automaticIdempotencyKey(method, path, options.body);
    const idempotencyKey = options.idempotencyKey?.trim() || automatic?.key;
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(options.body);
    }

    let res: Response;
    try {
        res = await fetch(buildUrl(path, options.query), {
            method,
            headers,
            body,
            signal: options.signal,
        });
    } catch (error) {
        // A transport failure is ambiguous: the API might have committed the mutation. Keep the
        // automatic key cached so an explicit user retry is safe and reaches the same server result.
        throw error;
    }

    const result = await readResponse<T>(res);
    if (automatic?.fingerprint) automaticIdempotencyKeys.delete(automatic.fingerprint);
    return result;
}

async function readResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let parsed: unknown;
        try {
            parsed = await res.json();
        } catch {
            parsed = await res.text();
        }
        throw new ProxyError(`admin proxy returned ${res.status}`, res.status, parsed);
    }
    /** 204 responses (e.g. successful DELETE) ship no body — return undefined for callers that expect a value. */
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export { ProxyError };
