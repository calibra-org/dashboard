import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { hasLocale } from "next-intl";

import { CSRF_COOKIE, getSession, SESSION_COOKIE } from "#/lib/auth";
import { routing } from "#/lib/i18n/routing";
import { TENANT_HEADER } from "#/lib/tenant/constants";
import { resolveHost, tenantRefFor } from "#/lib/tenant/resolve-host";

interface RouteContext {
    params: Promise<{ path: string[] }>;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Same-origin proxy for `@adonisjs/transmit`'s SSE handshake routes. Transmit registers
 * `/__transmit/events` (GET — opens the EventSource) and `/__transmit/{subscribe,unsubscribe}`
 * (POST — channel management). The browser only ever sees `/__transmit/...`; this handler reads
 * the httpOnly `admin_session` cookie server-side and forwards the bearer token to the AdonisJS
 * origin, so the token never reaches client JS — same posture as the `/api/admin/*` proxy.
 *
 * The events GET response is `text/event-stream`; returning `upstream.body` (a `ReadableStream`)
 * directly lets Next.js stream it through without buffering. We must NOT set
 * `cache-control: no-store` here because we mirror the upstream's `cache-control: no-transform`
 * which is what keeps intermediate proxies from compressing the SSE wire — gzipped SSE breaks
 * streaming (see the `@adonisjs/transmit` production-considerations note).
 */
async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
    const session = await getSession();
    if (session === null) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const method = request.method;
    if (MUTATION_METHODS.has(method)) {
        const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
        const headerToken = request.headers.get("x-csrf-token");
        if (
            typeof cookieToken !== "string" ||
            cookieToken.length === 0 ||
            typeof headerToken !== "string" ||
            headerToken !== cookieToken
        ) {
            return Response.json({ error: "csrf_invalid" }, { status: 403 });
        }
    }

    const { path } = await context.params;
    const upstreamBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (typeof upstreamBase !== "string" || upstreamBase.length === 0) {
        return Response.json({ error: "api_base_url_missing" }, { status: 500 });
    }

    const search = request.nextUrl.search;
    const upstreamUrl = `${upstreamBase.replace(/\/+$/, "")}/__transmit/${path.join("/")}${search}`;
    const locale = resolveLocale(request.headers.get("accept-language"));
    /**
     * `/api` is outside the locale/tenant middleware matcher, so mirror the canonical Admin BFF:
     * resolve the shop from the browser-facing Host and forward it explicitly. The API's tenant
     * context wraps Transmit too; without this header the access-token lookup runs fail-closed under
     * RLS and a perfectly valid operator session is rejected as 401.
     */
    const tenant = tenantRefFor(resolveHost(request.headers.get("host")));

    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers: buildUpstreamHeaders(session.token, locale, tenant, request.headers.get("content-type"), method),
    };

    if (MUTATION_METHODS.has(method)) {
        const body = await request.arrayBuffer();
        if (body.byteLength > 0) {
            init.body = body;
            init.duplex = "half";
        }
    }

    const upstream = await fetch(upstreamUrl, init);

    /**
     * Only an upstream 401 means the bearer itself is no longer accepted. A 403 can be a normal
     * per-channel authorization denial and must not tear down the operator's entire Admin session.
     */
    if (upstream.status === 401) {
        const store = await cookies();
        store.delete(SESSION_COOKIE);
        store.delete(CSRF_COOKIE);
    }

    const responseHeaders = new Headers();
    for (const key of ["content-type", "cache-control", "connection", "x-accel-buffering"]) {
        const value = upstream.headers.get(key);
        if (value !== null) responseHeaders.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function buildUpstreamHeaders(
    token: string,
    locale: string,
    tenant: string | null,
    contentType: string | null,
    method: string,
): Record<string, string> {
    const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        "accept-language": locale,
        /** SSE handshake uses `accept: text/event-stream`; subscribe uses JSON. Default safely. */
        accept: "text/event-stream, application/json",
    };
    if (tenant !== null) {
        headers[TENANT_HEADER] = tenant;
    }
    if (MUTATION_METHODS.has(method) && typeof contentType === "string" && contentType.length > 0) {
        headers["content-type"] = contentType;
    }
    return headers;
}

function resolveLocale(header: string | null): string {
    if (header === null) return routing.defaultLocale;
    const primary = header.split(",")[0]?.split(";")[0]?.trim() ?? "";
    return hasLocale(routing.locales, primary) ? primary : routing.defaultLocale;
}

export { proxy as GET, proxy as POST };
