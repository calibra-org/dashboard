import { createHmac, timingSafeEqual } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import env from "#start/env";

export interface SocialVideoUploadIntent {
    uploadUrl: string;
    providerRef: string;
    expiresAt: Date;
    uploadProtocol: "basic" | "tus";
}
export interface SocialVideoPlayback {
    providerRef: string;
    hlsUrl: string;
    dashUrl: string;
    expiresAt?: Date;
}
export interface SocialLiveInput {
    providerRef: string;
    rtmpsUrl?: string;
    streamKey?: string;
    srtUrl?: string;
    webRtcUrl?: string;
    raw: Record<string, unknown>;
}
export interface VerifiedVideoWebhook {
    provider: "cloudflare_stream";
    providerRef: string;
    state: string;
    readyToStream: boolean;
    durationSeconds?: number;
    width?: number;
    height?: number;
    raw: Record<string, unknown>;
}
export interface SocialVideoProviderAdapter {
    readonly name: string;
    createUploadIntent(input: {
        maxDurationSeconds: number;
        fileSizeBytes: number;
        creatorRef: string;
    }): Promise<SocialVideoUploadIntent>;
    createPlayback(providerRef: string, input: { signed: boolean; expiresInSeconds?: number }): Promise<SocialVideoPlayback>;
    createLiveInput(input: { name: string; creatorRef: string; requireSignedPlayback: boolean }): Promise<SocialLiveInput>;
    stopLiveInput(providerRef: string): Promise<void>;
    verifyWebhook(input: { signature?: string; rawBody: string }): VerifiedVideoWebhook;
}

class DisabledVideoProvider implements SocialVideoProviderAdapter {
    readonly name = "disabled";
    private unavailable(): never {
        throw new Exception("Social video provider is disabled", { status: 503, code: "E_SOCIAL_VIDEO_PROVIDER_DISABLED" });
    }
    async createUploadIntent(): Promise<SocialVideoUploadIntent> {
        return this.unavailable();
    }
    async createPlayback(): Promise<SocialVideoPlayback> {
        return this.unavailable();
    }
    async createLiveInput(): Promise<SocialLiveInput> {
        return this.unavailable();
    }
    async stopLiveInput(): Promise<void> {
        return;
    }
    verifyWebhook(): VerifiedVideoWebhook {
        return this.unavailable();
    }
}

function safeEqual(a: string, b: string): boolean {
    const aa = Buffer.from(a);
    const bb = Buffer.from(b);
    return aa.length === bb.length && timingSafeEqual(aa, bb);
}

class CloudflareStreamProvider implements SocialVideoProviderAdapter {
    readonly name = "cloudflare_stream";
    private accountId() {
        const value = env.get("CLOUDFLARE_STREAM_ACCOUNT_ID");
        if (!value) throw new Exception("Stream account is not configured", { status: 503, code: "E_SOCIAL_VIDEO_CONFIG" });
        return value;
    }
    private token() {
        const value = env.get("CLOUDFLARE_STREAM_API_TOKEN");
        if (!value) throw new Exception("Stream token is not configured", { status: 503, code: "E_SOCIAL_VIDEO_CONFIG" });
        return value;
    }
    private async request(path: string, init: RequestInit = {}) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId()}/stream${path}`, {
            ...init,
            headers: { Authorization: `Bearer ${this.token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
        const body = (await response.json()) as { success?: boolean; result?: any; errors?: unknown };
        if (!response.ok || !body.success)
            throw new Exception("Video provider request failed", {
                status: 502,
                code: "E_SOCIAL_VIDEO_PROVIDER",
                cause: body.errors,
            });
        return body.result;
    }
    async createUploadIntent(input: {
        maxDurationSeconds: number;
        fileSizeBytes: number;
        creatorRef: string;
    }): Promise<SocialVideoUploadIntent> {
        const result = await this.request("/direct_upload?direct_user=true", {
            method: "POST",
            body: JSON.stringify({
                maxDurationSeconds: input.maxDurationSeconds,
                meta: { creator: input.creatorRef },
                requireSignedURLs: true,
            }),
        });
        return {
            uploadUrl: String(result.uploadURL),
            providerRef: String(result.uid),
            expiresAt: new Date(Date.now() + 60 * 60_000),
            uploadProtocol: input.fileSizeBytes > 200_000_000 ? "tus" : "basic",
        };
    }
    async createPlayback(
        providerRef: string,
        input: { signed: boolean; expiresInSeconds?: number },
    ): Promise<SocialVideoPlayback> {
        const code = env.get("CLOUDFLARE_STREAM_CUSTOMER_CODE");
        if (!code) throw new Exception("Stream customer code is not configured", { status: 503, code: "E_SOCIAL_VIDEO_CONFIG" });
        const tokenRef = providerRef;
        const base = `https://customer-${code}.cloudflarestream.com/${tokenRef}`;
        return {
            providerRef,
            hlsUrl: `${base}/manifest/video.m3u8`,
            dashUrl: `${base}/manifest/video.mpd`,
            expiresAt: input.signed ? new Date(Date.now() + (input.expiresInSeconds ?? 900) * 1000) : undefined,
        };
    }
    async createLiveInput(input: { name: string; creatorRef: string; requireSignedPlayback: boolean }): Promise<SocialLiveInput> {
        const result = await this.request("/live_inputs", {
            method: "POST",
            body: JSON.stringify({
                meta: { name: input.name, creator: input.creatorRef },
                recording: { mode: "automatic", requireSignedURLs: input.requireSignedPlayback },
            }),
        });
        return {
            providerRef: String(result.uid),
            rtmpsUrl: result.rtmps?.url,
            streamKey: result.rtmps?.streamKey,
            srtUrl: result.srt?.url,
            webRtcUrl: result.webRTC?.url,
            raw: result,
        };
    }
    async stopLiveInput(providerRef: string): Promise<void> {
        await this.request(`/live_inputs/${encodeURIComponent(providerRef)}`, { method: "DELETE" });
    }
    verifyWebhook(input: { signature?: string; rawBody: string }): VerifiedVideoWebhook {
        const secret = env.get("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
        if (!secret || !input.signature)
            throw new Exception("Invalid video provider signature", { status: 401, code: "E_SOCIAL_VIDEO_WEBHOOK_SIGNATURE" });
        const candidate = input.signature.replace(/^sha256=/, "");
        const expected = createHmac("sha256", secret).update(input.rawBody).digest("hex");
        if (!safeEqual(candidate, expected))
            throw new Exception("Invalid video provider signature", { status: 401, code: "E_SOCIAL_VIDEO_WEBHOOK_SIGNATURE" });
        const raw = JSON.parse(input.rawBody) as Record<string, any>;
        const providerRef = String(raw.uid ?? raw.videoUID ?? raw.liveInput ?? "");
        if (!providerRef)
            throw new Exception("Provider callback has no asset reference", { status: 422, code: "E_SOCIAL_VIDEO_WEBHOOK_REF" });
        return {
            provider: "cloudflare_stream",
            providerRef,
            state: String(raw.status?.state ?? raw.state ?? "unknown"),
            readyToStream: Boolean(raw.readyToStream ?? raw.status?.state === "ready"),
            durationSeconds: raw.duration === undefined ? undefined : Number(raw.duration),
            width: raw.input?.width === undefined ? undefined : Number(raw.input.width),
            height: raw.input?.height === undefined ? undefined : Number(raw.input.height),
            raw,
        };
    }
}

let instance: SocialVideoProviderAdapter | null = null;
export function socialVideoProvider(): SocialVideoProviderAdapter {
    if (instance) return instance;
    instance =
        env.get("SOCIAL_VIDEO_PROVIDER") === "cloudflare_stream" ? new CloudflareStreamProvider() : new DisabledVideoProvider();
    return instance;
}
export function resetSocialVideoProvider() {
    instance = null;
}
