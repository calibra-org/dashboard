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
     * Stable idempotency token for retry-safe financial/create operations. Callers must keep this
     * value stable while retrying the same logical request and rotate it when the payload changes.
     */
    idempotencyKey?: string;
}

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

interface PendingAutomaticKey {
    key: string;
    createdAt: number;
}

const pendingAutomaticKeys = new Map<string, PendingAutomaticKey>();
const AUTOMATIC_KEY_TTL_MS = 10 * 60_000;
const MAX_AUTOMATIC_KEYS = 128;

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function randomOperationKey(): string {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    return `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function automaticKeySignature(method: MutationMethod, path: string, body: unknown): string | null {
    if (method !== "POST") return null;
    const cleaned = path.replace(/^\/+|\/+$/g, "");
    const supported = [
        /^orders\/\d+\/refunds$/,
        /^quality\/cases$/,
        /^order-returns\/\d+\/items\/\d+\/inspection$/,
        /^quality\/cases\/\d+\/findings$/,
        /^quality\/voc\/classifications$/,
        /^quality\/actions$/,
        /^quality\/outcomes$/,
    ].some((pattern) => pattern.test(cleaned));
    if (!supported) return null;
    return `${method}:${cleaned}:${stableJson(body ?? null)}`;
}

function pruneAutomaticKeys(now: number): void {
    for (const [signature, entry] of pendingAutomaticKeys) {
        if (now - entry.createdAt > AUTOMATIC_KEY_TTL_MS) pendingAutomaticKeys.delete(signature);
    }
    while (pendingAutomaticKeys.size >= MAX_AUTOMATIC_KEYS) {
        const oldest = pendingAutomaticKeys.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        pendingAutomaticKeys.delete(oldest);
    }
}

function resolveAutomaticIdempotencyKey(
    method: MutationMethod,
    path: string,
    body: unknown,
): {
    signature: string | null;
    key: string | undefined;
} {
    const signature = automaticKeySignature(method, path, body);
    if (signature === null) return { signature: null, key: undefined };
    const now = Date.now();
    pruneAutomaticKeys(now);
    const existing = pendingAutomaticKeys.get(signature);
    if (existing) return { signature, key: existing.key };
    const key = randomOperationKey();
    pendingAutomaticKeys.set(signature, { key, createdAt: now });
    return { signature, key };
}

/**
 * Sends a mutation through the proxy. Stamps `X-CSRF-Token` from `document.cookie` and
 * serializes a JSON body when provided; passes `null`/`undefined` bodies through as empty.
 *
 * Refund creation also receives a short-lived automatic idempotency key when a caller did not
 * provide one. The key is retained across ambiguous transport failures and reused for the exact
 * same logical payload, then cleared after a successful response. This prevents browser/network
 * retries from creating duplicate financial operations while still allowing a later identical
 * operator action to be a new refund.
 */
export async function apiMutate<T>(method: MutationMethod, path: string, options: ApiMutationOptions): Promise<T> {
    const csrf = getCsrfToken();
    if (csrf === undefined) {
        throw new ProxyError("missing csrf token cookie", 403);
    }
    const automatic =
        typeof options.idempotencyKey === "string" && options.idempotencyKey.length > 0
            ? { signature: null, key: undefined }
            : resolveAutomaticIdempotencyKey(method, path, options.body);
    const idempotencyKey = options.idempotencyKey || automatic.key;
    const headers: Record<string, string> = {
        "accept-language": options.locale,
        accept: "application/json",
        "x-csrf-token": csrf,
    };
    if (typeof options.ifMatch === "string" && options.ifMatch.length > 0) {
        headers["if-match"] = options.ifMatch;
    }
    if (typeof idempotencyKey === "string" && idempotencyKey.length > 0) {
        headers["idempotency-key"] = idempotencyKey;
    }
    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(options.body);
    }
    const res = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body,
        signal: options.signal,
    });
    const result = await readResponse<T>(res);
    if (res.ok && automatic.signature !== null) pendingAutomaticKeys.delete(automatic.signature);
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
