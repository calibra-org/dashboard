import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";

import { isPrivateContentSourceAddress, normalizeContentSourceHostname } from "#services/content/source_ingest_service";
import { supportChannelCredentialsService } from "#services/support/support_channel_credentials_service";
import { currentTrx } from "#services/tenant_context";

function parseEvents(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }
    return [];
}

async function resolvePublicHttps(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Webhook destination must be credential-free HTTPS");
    const hostname = normalizeContentSourceHostname(url.hostname);
    if (
        !hostname ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal")
    ) {
        throw new Error("Private webhook destinations are blocked");
    }
    const directFamily = isIP(hostname);
    const addresses = directFamily
        ? [{ address: hostname, family: directFamily }]
        : await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((item) => isPrivateContentSourceAddress(item.address))) {
        throw new Error("Private webhook destinations are blocked");
    }
    return { url, selected: addresses[0]! };
}

async function postPinned(urlValue: string, body: string, headers: Record<string, string>) {
    const target = await resolvePublicHttps(urlValue);
    const pinnedLookup = ((_: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options?.all) callback(null, [{ address: target.selected.address, family: target.selected.family }]);
        else callback(null, target.selected.address, target.selected.family);
    }) as LookupFunction;

    return await new Promise<number>((resolve, reject) => {
        const request = httpsRequest(
            target.url,
            {
                method: "POST",
                lookup: pinnedLookup,
                headers: {
                    ...headers,
                    "content-type": "application/json",
                    "content-length": String(Buffer.byteLength(body)),
                    "user-agent": "CalibraSupportWebhook/1.0",
                },
                timeout: 10_000,
            },
            (response) => {
                const status = response.statusCode ?? 0;
                response.resume();
                if (status >= 300 && status < 400) {
                    reject(new Error("Webhook redirects are not allowed"));
                    return;
                }
                resolve(status);
            },
        );
        request.on("timeout", () => request.destroy(new Error("Webhook request timed out")));
        request.on("error", reject);
        request.end(body);
    });
}

export class SupportApiWebhookDispatcher {
    async emit(event: string, data: Record<string, unknown>) {
        const subscriptions = await currentTrx()
            .from("support_api_webhook_subscriptions")
            .where("active", true)
            .orderBy("id", "asc");
        const selected = subscriptions.filter((row) => {
            const events = parseEvents(row.events);
            return events.includes(event) || events.includes("*");
        });
        const results: Array<{ id: number; delivered: boolean; status: number | null }> = [];

        for (const row of selected) {
            const id = Number(row.id);
            const deliveryId = randomUUID();
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const payload = JSON.stringify({ id: deliveryId, type: event, created_at: new Date().toISOString(), data });
            let status: number | null = null;
            try {
                const secret = supportChannelCredentialsService.decryptApiWebhookSecret(
                    String(row.signing_secret_ciphertext),
                    id,
                );
                if (!secret) throw new Error("Webhook signing secret is unavailable");
                const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
                status = await postPinned(String(row.url), payload, {
                    "x-calibra-event": event,
                    "x-calibra-delivery": deliveryId,
                    "x-calibra-timestamp": timestamp,
                    "x-calibra-signature": `v1=${signature}`,
                });
                if (status < 200 || status >= 300) throw new Error(`Webhook returned HTTP ${status}`);
                await currentTrx()
                    .from("support_api_webhook_subscriptions")
                    .where("id", id)
                    .update({ last_delivery_at: new Date(), last_error: null, updated_at: new Date() });
                results.push({ id, delivered: true, status });
            } catch (error) {
                await currentTrx()
                    .from("support_api_webhook_subscriptions")
                    .where("id", id)
                    .update({
                        last_error: error instanceof Error ? error.message.slice(0, 1000) : "Webhook delivery failed",
                        updated_at: new Date(),
                    });
                results.push({ id, delivered: false, status });
            }
        }
        return results;
    }
}

export const supportApiWebhookDispatcher = new SupportApiWebhookDispatcher();
