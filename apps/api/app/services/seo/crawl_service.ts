import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import { Exception } from "@adonisjs/core/exceptions";

import { isPrivateContentSourceAddress, normalizeContentSourceHostname } from "#services/content/source_ingest_service";
import { currentTrx } from "#services/tenant_context";

export interface PreparedSeoCrawlTarget {
    targetId: number;
    runId: number;
    url: string;
    baseUrl: string;
}

export interface SeoCrawlFetchResult {
    url: string;
    statusCode: number;
    contentType: string | null;
    canonicalUrl: string | null;
    robotsMeta: string | null;
    indexable: boolean | null;
    durationMs: number;
    bytesReceived: number;
}

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalFromHtml(html: string, base: URL): string | null {
    const match =
        /<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*\bhref=["']([^"']+)["'][^>]*>|<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i.exec(
            html,
        );
    const value = match?.[1] ?? match?.[2];
    if (!value) return null;
    try {
        const resolved = new URL(value, base);
        return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
    } catch {
        return null;
    }
}

function robotsFromHtml(html: string): string | null {
    const values: string[] = [];
    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
        const tag = match[0];
        const name = /\bname=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
        if (name !== "robots" && name !== "googlebot") continue;
        const content = /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1]?.trim();
        if (content) values.push(content);
    }
    return values.length > 0 ? [...new Set(values)].join(", ") : null;
}

async function resolvePublicTarget(value: string, baseUrl: string) {
    let url: URL;
    let base: URL;
    try {
        url = new URL(value);
        base = new URL(baseUrl);
    } catch {
        throw new Exception("Crawl URL is invalid", { status: 422, code: "E_SEO_CRAWL_URL" });
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Exception("Crawl only allows credential-free HTTP(S) URLs", {
            status: 422,
            code: "E_SEO_CRAWL_URL",
        });
    }
    if (normalizeContentSourceHostname(url.hostname) !== normalizeContentSourceHostname(base.hostname)) {
        throw new Exception("Crawl URL must use the configured SEO site hostname", {
            status: 422,
            code: "E_SEO_CRAWL_SCOPE",
        });
    }

    const hostname = normalizeContentSourceHostname(url.hostname);
    if (
        ["localhost", "localhost.localdomain"].includes(hostname) ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
    ) {
        throw new Exception("Private crawl targets are blocked", {
            status: 422,
            code: "E_SEO_CRAWL_PRIVATE",
        });
    }

    const directFamily = isIP(hostname);
    let addresses: Array<{ address: string; family: number }>;
    try {
        addresses = directFamily
            ? [{ address: hostname, family: directFamily }]
            : await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new Exception("Crawl hostname could not be resolved", {
            status: 422,
            code: "E_SEO_CRAWL_DNS",
        });
    }
    if (addresses.length === 0 || addresses.some((entry) => isPrivateContentSourceAddress(entry.address))) {
        throw new Exception("Private crawl targets are blocked", {
            status: 422,
            code: "E_SEO_CRAWL_PRIVATE",
        });
    }
    const selected = addresses[0];
    if (!selected) {
        throw new Exception("Crawl hostname could not be resolved", {
            status: 422,
            code: "E_SEO_CRAWL_DNS",
        });
    }
    return { url, address: selected.address, family: selected.family };
}

async function requestDocument(value: string, baseUrl: string, maxBytes = 2_000_000): Promise<SeoCrawlFetchResult> {
    const target = await resolvePublicTarget(value, baseUrl);
    const started = Date.now();

    return new Promise<SeoCrawlFetchResult>((resolve, reject) => {
        const pinnedLookup = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
            if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
            else callback(null, target.address, target.family);
        }) as LookupFunction;
        const transport = target.url.protocol === "https:" ? httpsRequest : httpRequest;
        const request = transport(
            target.url,
            {
                method: "GET",
                lookup: pinnedLookup,
                headers: {
                    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
                    "user-agent": "CalibraSeoCrawler/1.0 (+tenant-scoped-audit)",
                },
            },
            (response) => {
                const statusCode = response.statusCode ?? 0;
                if (statusCode >= 300 && statusCode < 400) {
                    response.resume();
                    reject(new Error("crawl redirects are not followed; enqueue the canonical target explicitly"));
                    return;
                }
                const contentType = response.headers["content-type"]
                    ? String(response.headers["content-type"]).slice(0, 255)
                    : null;
                const contentLength = Number(response.headers["content-length"] ?? 0);
                if (contentLength > maxBytes) {
                    response.resume();
                    reject(new Error("crawl response exceeds 2 MB"));
                    return;
                }

                const chunks: Uint8Array[] = [];
                let total = 0;
                response.on("data", (chunk: Uint8Array) => {
                    total += chunk.byteLength;
                    if (total > maxBytes) {
                        request.destroy(new Error("crawl response exceeds 2 MB"));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.on("end", () => {
                    const body = Buffer.concat(chunks).toString("utf8");
                    const isHtml = Boolean(contentType?.toLowerCase().includes("html"));
                    const canonicalUrl = isHtml ? canonicalFromHtml(body, target.url) : null;
                    const robotsMeta = isHtml ? robotsFromHtml(body) : null;
                    const directives = robotsMeta?.toLowerCase() ?? "";
                    resolve({
                        url: target.url.toString(),
                        statusCode,
                        contentType,
                        canonicalUrl,
                        robotsMeta,
                        indexable: isHtml
                            ? statusCode >= 200 && statusCode < 300 && !/(^|[,\s])noindex([,\s]|$)/.test(directives)
                            : null,
                        durationMs: Math.max(0, Date.now() - started),
                        bytesReceived: total,
                    });
                });
                response.on("error", reject);
            },
        );
        request.setTimeout(12_000, () => request.destroy(new Error("crawl request timed out")));
        request.on("error", reject);
        request.end();
    });
}

export async function prepareSeoCrawlTarget(targetId: number): Promise<PreparedSeoCrawlTarget | null> {
    const trx = currentTrx();
    const target = await trx.from("seo_crawl_targets").where("id", targetId).forUpdate().first();
    if (!target) return null;
    if (!["queued", "failed"].includes(String(target.status)) || numberValue(target.attempts) >= 3) return null;
    const run = await trx.from("seo_crawl_runs").where("id", target.crawl_run_id).first();
    if (!run) return null;

    await trx
        .from("seo_crawl_targets")
        .where("id", targetId)
        .update({
            status: "processing",
            attempts: numberValue(target.attempts) + 1,
            claimed_at: new Date(),
            updated_at: new Date(),
        });
    await trx
        .from("seo_crawl_runs")
        .where("id", run.id)
        .update({
            status: "running",
            started_at: run.started_at ?? new Date(),
            updated_at: new Date(),
        });
    return {
        targetId,
        runId: numberValue(run.id),
        url: String(target.url),
        baseUrl: String(run.base_url),
    };
}

export async function requestSeoCrawlTarget(prepared: PreparedSeoCrawlTarget): Promise<SeoCrawlFetchResult> {
    return requestDocument(prepared.url, prepared.baseUrl);
}

async function finalizeRun(runId: number) {
    const trx = currentTrx();
    const counts = await trx
        .from("seo_crawl_targets")
        .where("crawl_run_id", runId)
        .select("status")
        .count("id as total")
        .groupBy("status");
    const map = new Map(counts.map((row) => [String(row.status), numberValue(row.total)]));
    const pending = (map.get("queued") ?? 0) + (map.get("processing") ?? 0);
    const completed = map.get("completed") ?? 0;
    const failed = map.get("failed") ?? 0;
    const status = pending > 0 ? "running" : failed > 0 && completed > 0 ? "partial" : failed > 0 ? "failed" : "completed";

    await trx
        .from("seo_crawl_runs")
        .where("id", runId)
        .update({
            status,
            completed_count: completed,
            failed_count: failed,
            finished_at: pending === 0 ? new Date() : null,
            updated_at: new Date(),
        });
}

export async function completeSeoCrawlTarget(prepared: PreparedSeoCrawlTarget, fetched: SeoCrawlFetchResult) {
    const trx = currentTrx();
    const success = fetched.statusCode >= 200 && fetched.statusCode < 300;
    await trx
        .table("seo_crawl_observations")
        .insert({
            crawl_run_id: prepared.runId,
            url: fetched.url,
            status_code: fetched.statusCode || null,
            content_type: fetched.contentType,
            canonical_url: fetched.canonicalUrl,
            robots_meta: fetched.robotsMeta,
            indexable: fetched.indexable,
            duration_ms: fetched.durationMs,
            bytes_received: fetched.bytesReceived,
            fetch_status: success ? "success" : "http_error",
            error_evidence: success ? null : `HTTP ${fetched.statusCode}`,
            fetched_at: new Date(),
        })
        .onConflict(["tenant_id", "crawl_run_id", "url"])
        .merge();
    await trx.from("seo_crawl_targets").where("id", prepared.targetId).update({
        status: "completed",
        last_error: null,
        finished_at: new Date(),
        updated_at: new Date(),
    });
    await finalizeRun(prepared.runId);
}

export async function failSeoCrawlTarget(prepared: PreparedSeoCrawlTarget, error: unknown) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000);
    const trx = currentTrx();
    await trx
        .table("seo_crawl_observations")
        .insert({
            crawl_run_id: prepared.runId,
            url: prepared.url,
            fetch_status: /private|scope|blocked/i.test(message) ? "blocked" : "network_error",
            error_evidence: message,
            fetched_at: new Date(),
        })
        .onConflict(["tenant_id", "crawl_run_id", "url"])
        .merge();
    await trx.from("seo_crawl_targets").where("id", prepared.targetId).update({
        status: "failed",
        last_error: message,
        finished_at: new Date(),
        updated_at: new Date(),
    });
    await finalizeRun(prepared.runId);
}
