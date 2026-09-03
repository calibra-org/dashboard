import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import db from "@adonisjs/lucid/services/db";
import { resolveTenantConnection } from "#config/database";
import ConfigurationEngineService from "#services/configuration_engine_service";
import { currentTenantId, currentTrx, runWithTenant } from "#services/tenant_context";
import { resolveTenantByRef } from "#services/tenant_resolver";
import { socialVideoProvider } from "#services/social/social_video_provider";

function int(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
function json(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            const v = JSON.parse(value) as unknown;
            return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }
    return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function configValue(group: any, key: string, fallback: unknown) {
    return group.definitions?.find((x: any) => x.definition?.key === key)?.value ?? fallback;
}
async function mediaPolicy() {
    const group = await new ConfigurationEngineService().group("media");
    return {
        uploadsEnabled: Boolean(configValue(group, "media.social_uploads_enabled", false)),
        safetyRequired: Boolean(configValue(group, "media.social_safety_required", true)),
        maxVideoSeconds: int(configValue(group, "media.social_max_video_seconds", 900)),
        maxUploadMb: int(configValue(group, "media.max_upload_mb", 20)),
    };
}

export class SocialMediaPipelineService {
    async createUploadIntent(input: {
        filename: string;
        mime: string;
        sizeBytes: number;
        purpose: "story" | "video" | "live_replay" | "review" | "message";
        ownerActorType: "customer" | "user" | "creator" | "brand" | "system";
        ownerActorRef: string;
        accessPolicy?: "public" | "signed" | "members" | "private";
    }) {
        const policy = await mediaPolicy();
        if (!policy.uploadsEnabled)
            throw new Exception("Social media uploads are disabled", { status: 409, code: "E_SOCIAL_MEDIA_UPLOAD_DISABLED" });
        const maxSize = Math.max(1, policy.maxUploadMb) * 1024 * 1024;
        if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maxSize)
            throw new Exception("Social media file size exceeds policy", { status: 422, code: "E_SOCIAL_MEDIA_SIZE" });
        if (!/^video\//.test(input.mime))
            throw new Exception("Unsupported social media MIME type", { status: 422, code: "E_SOCIAL_MEDIA_MIME" });
        const provider = socialVideoProvider();
        const handle = await provider.createUploadIntent({
            maxDurationSeconds: policy.maxVideoSeconds,
            fileSizeBytes: input.sizeBytes,
            creatorRef: `${currentTenantId()}:${input.ownerActorType}:${input.ownerActorRef}`,
        });
        const mediaKind = "video";
        const [media] = await currentTrx()
            .table("media")
            .insert({
                kind: mediaKind,
                url: `provider://${provider.name}/${handle.providerRef}`,
                mime: input.mime,
                size_bytes: input.sizeBytes,
                filename: input.filename,
                processing_state: "initiated",
                provider: provider.name,
                provider_ref: handle.providerRef,
                access_policy: input.accessPolicy ?? "signed",
                attributes: JSON.stringify({ social: true, purpose: input.purpose }),
            })
            .returning("*");
        const [asset] = await currentTrx()
            .table("social_media_assets")
            .insert({
                media_id: media.id,
                purpose: input.purpose,
                owner_actor_type: input.ownerActorType,
                owner_actor_ref: input.ownerActorRef,
                upload_state: "initiated",
                provider: provider.name,
                provider_ref: handle.providerRef,
                original_filename: input.filename,
                declared_mime: input.mime,
                declared_size_bytes: input.sizeBytes,
                max_duration_seconds: policy.maxVideoSeconds,
                upload_expires_at: handle.expiresAt,
                metadata: JSON.stringify({ upload_protocol: handle.uploadProtocol }),
            })
            .returning("*");
        return {
            data: {
                media_id: Number(media.id),
                asset_id: Number(asset.id),
                provider: provider.name,
                provider_ref: handle.providerRef,
                upload_url: handle.uploadUrl,
                upload_protocol: handle.uploadProtocol,
                expires_at: handle.expiresAt.toISOString(),
                max_duration_seconds: policy.maxVideoSeconds,
                max_size_bytes: maxSize,
            },
        };
    }

    async acknowledgeUpload(mediaId: number) {
        const asset = await currentTrx().from("social_media_assets").where("media_id", mediaId).forUpdate().first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        await currentTrx()
            .from("social_media_assets")
            .where("id", asset.id)
            .update({ upload_state: "processing", updated_at: new Date() });
        await currentTrx().from("media").where("id", mediaId).update({ processing_state: "processing", updated_at: new Date() });
        return this.inspect(mediaId);
    }

    async consumeProviderWebhook(input: { signature?: string; rawBody: string }) {
        const provider = socialVideoProvider();
        const event = provider.verifyWebhook(input); // signature verification happens before tenant lookup
        const admin = db.connection("postgres_admin");
        const mapping = await admin
            .from("social_media_assets")
            .where("provider", event.provider)
            .where("provider_ref", event.providerRef)
            .select("tenant_id", "media_id")
            .first();
        if (!mapping)
            throw new Exception("Unknown provider asset reference", { status: 404, code: "E_SOCIAL_PROVIDER_REF_UNKNOWN" });
        const tenant = await resolveTenantByRef(String(mapping.tenant_id));
        if (!tenant)
            throw new Exception("Provider asset tenant is unavailable", { status: 404, code: "E_SOCIAL_PROVIDER_TENANT" });
        const connection = resolveTenantConnection(tenant);
        return db.connection(connection).transaction(async (trx) => {
            const tenantId = BigInt(tenant.id);
            await trx.rawQuery("SELECT set_config('app.current_tenant', ?, true)", [String(tenantId)]);
            return runWithTenant(tenantId, trx, async () => {
                const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
                const existing = await currentTrx()
                    .from("social_provider_events")
                    .where({
                        provider: event.provider,
                        provider_ref: event.providerRef,
                        event_kind: event.state,
                        payload_hash: payloadHash,
                    })
                    .first();
                if (existing) return { data: existing, replayed: true };
                const mediaId = Number(mapping.media_id);
                const state = event.readyToStream
                    ? "scanning"
                    : ["error", "failed"].includes(event.state)
                      ? "processing_failed"
                      : "processing";
                const [row] = await currentTrx()
                    .table("social_provider_events")
                    .insert({
                        provider: event.provider,
                        provider_ref: event.providerRef,
                        event_kind: event.state,
                        payload_hash: payloadHash,
                        outcome: state,
                    })
                    .returning("*");
                await currentTrx()
                    .from("social_media_assets")
                    .where("media_id", mediaId)
                    .update({
                        upload_state: state,
                        safety_state: event.readyToStream ? "scanning" : "pending",
                        updated_at: new Date(),
                    });
                await currentTrx()
                    .from("media")
                    .where("id", mediaId)
                    .update({
                        processing_state: state,
                        duration_ms: event.durationSeconds === undefined ? undefined : Math.round(event.durationSeconds * 1000),
                        width: event.width ?? undefined,
                        height: event.height ?? undefined,
                        updated_at: new Date(),
                    });
                return { data: row, replayed: false, media_id: mediaId, state };
            });
        });
    }

    async inspect(mediaId: number) {
        const asset = await currentTrx()
            .from("social_media_assets as asset")
            .innerJoin("media as media", "media.id", "asset.media_id")
            .where("asset.media_id", mediaId)
            .select(
                "asset.*",
                "media.processing_state",
                "media.access_policy",
                "media.mime",
                "media.size_bytes",
                "media.duration_ms",
                "media.width",
                "media.height",
            )
            .first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        const [tracks, rights, variants, scans] = await Promise.all([
            currentTrx().from("media_tracks").where("media_id", mediaId).orderBy("id"),
            currentTrx().from("media_rights").where("media_id", mediaId).orderBy("id"),
            currentTrx().from("media_variants").where("media_id", mediaId).orderBy("id"),
            currentTrx().from("media_security_scans").where("media_id", mediaId).orderBy("scanned_at", "desc"),
        ]);
        return {
            data: {
                media_id: mediaId,
                asset: { ...asset, id: Number(asset.media_id) },
                tracks,
                rights,
                variants,
                security_scans: scans,
            },
        };
    }

    async addTrack(
        mediaId: number,
        input: {
            kind: "caption" | "transcript" | "chapter" | "audio_description";
            locale?: string | null;
            textContent?: string | null;
            providerRef?: string | null;
            storageKey?: string | null;
            evidence?: Record<string, unknown>;
        },
    ) {
        const asset = await currentTrx().from("social_media_assets").where("media_id", mediaId).first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        const [track] = await currentTrx()
            .table("media_tracks")
            .insert({
                media_id: mediaId,
                kind: input.kind,
                locale: input.locale ?? null,
                status: "in_review",
                provider_ref: input.providerRef ?? null,
                storage_key: input.storageKey ?? null,
                text_content: input.textContent ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
            })
            .returning("*");
        return { data: track };
    }

    async reviewTrack(trackId: number, actorUserId: number, decision: "approved" | "rejected") {
        const [row] = await currentTrx()
            .from("media_tracks")
            .where("id", trackId)
            .update({ status: decision, reviewed_by_user_id: actorUserId, reviewed_at: new Date(), updated_at: new Date() })
            .returning("*");
        if (!row) throw new Exception("Media track not found", { status: 404, code: "E_SOCIAL_MEDIA_TRACK" });
        return { data: row };
    }
    async recordRights(
        mediaId: number,
        actorUserId: number,
        input: {
            rightsBasis: string;
            holderRef?: string | null;
            consentConfirmed: boolean;
            validUntil?: Date | null;
            evidence?: Record<string, unknown>;
        },
    ) {
        await this.inspect(mediaId);
        const [row] = await currentTrx()
            .table("media_rights")
            .insert({
                media_id: mediaId,
                rights_basis: input.rightsBasis,
                holder_ref: input.holderRef ?? null,
                consent_confirmed: input.consentConfirmed,
                valid_until: input.validUntil ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
                recorded_by_user_id: actorUserId,
            })
            .returning("*");
        return { data: row };
    }

    async recordSecurityScan(
        mediaId: number,
        actorUserId: number,
        input: {
            scanner: string;
            scannerRef?: string | null;
            verdict: "clean" | "suspicious" | "malicious" | "error";
            contentHash?: string | null;
            evidence?: Record<string, unknown>;
        },
    ) {
        const asset = await currentTrx().from("social_media_assets").where("media_id", mediaId).forUpdate().first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        const media = await currentTrx().from("media").where("id", mediaId).forUpdate().first();
        if (!media || !["scanning", "ready", "quarantined", "validation_failed"].includes(String(media.processing_state))) {
            throw new Exception("Media is not awaiting a security verdict", { status: 409, code: "E_SOCIAL_MEDIA_SCAN_STATE" });
        }
        const normalizedScanner = input.scanner.trim().toLowerCase();
        if (!normalizedScanner)
            throw new Exception("Scanner identity is required", { status: 422, code: "E_SOCIAL_MEDIA_SCANNER_REQUIRED" });
        const scannerRef = input.scannerRef?.trim() || "manual";
        const [scan] = await currentTrx()
            .table("media_security_scans")
            .insert({
                media_id: mediaId,
                scanner: normalizedScanner,
                scanner_ref: scannerRef,
                verdict: input.verdict,
                content_hash: input.contentHash ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
                recorded_by_user_id: actorUserId,
                scanned_at: new Date(),
            })
            .onConflict(["tenant_id", "media_id", "scanner", "scanner_ref"])
            .merge({
                verdict: input.verdict,
                content_hash: input.contentHash ?? null,
                evidence: JSON.stringify(input.evidence ?? {}),
                recorded_by_user_id: actorUserId,
                scanned_at: new Date(),
                updated_at: new Date(),
            })
            .returning("*");
        const nextState = input.verdict === "clean" ? "ready" : input.verdict === "error" ? "validation_failed" : "quarantined";
        const safetyState = input.verdict === "clean" ? "clean" : input.verdict === "error" ? "error" : "quarantined";
        await currentTrx()
            .from("media")
            .where("id", mediaId)
            .update({
                processing_state: nextState,
                checksum_sha256: input.contentHash ?? media.checksum_sha256,
                updated_at: new Date(),
            });
        await currentTrx()
            .from("social_media_assets")
            .where("id", asset.id)
            .update({
                upload_state: nextState,
                safety_state: safetyState,
                safety_provider: normalizedScanner,
                safety_evidence: JSON.stringify(input.evidence ?? {}),
                safety_checked_at: new Date(),
                retry_count: input.verdict === "error" ? Number(asset.retry_count ?? 0) + 1 : Number(asset.retry_count ?? 0),
                next_retry_at: input.verdict === "error" ? new Date(Date.now() + 5 * 60_000) : null,
                updated_at: new Date(),
            });
        return {
            data: {
                media_id: mediaId,
                state: nextState,
                safety_state: safetyState,
                scan: { ...scan, evidence: json(scan.evidence) },
            },
        };
    }

    async retryFailed(mediaId: number, actorUserId: number) {
        const asset = await currentTrx().from("social_media_assets").where("media_id", mediaId).forUpdate().first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        const media = await currentTrx().from("media").where("id", mediaId).forUpdate().first();
        if (!media || !["validation_failed", "processing_failed"].includes(String(media.processing_state))) {
            throw new Exception("Media is not in a retryable state", { status: 409, code: "E_SOCIAL_MEDIA_RETRY_STATE" });
        }
        const retries = Number(asset.retry_count ?? 0);
        if (retries >= 5)
            throw new Exception("Media retry budget exhausted", { status: 429, code: "E_SOCIAL_MEDIA_RETRY_EXHAUSTED" });
        const nextState = String(media.processing_state) === "validation_failed" ? "scanning" : "processing";
        await currentTrx().from("media").where("id", mediaId).update({ processing_state: nextState, updated_at: new Date() });
        await currentTrx()
            .from("social_media_assets")
            .where("id", asset.id)
            .update({
                upload_state: nextState,
                safety_state: nextState === "scanning" ? "scanning" : asset.safety_state,
                retry_count: retries + 1,
                next_retry_at: null,
                metadata: JSON.stringify({
                    ...json(asset.metadata),
                    recovery: {
                        retry_count: retries + 1,
                        requested_by_user_id: actorUserId,
                        requested_at: new Date().toISOString(),
                    },
                }),
                updated_at: new Date(),
            });
        return { data: { media_id: mediaId, state: nextState, retry_count: retries + 1 } };
    }

    async markPublishable(mediaId: number, actorUserId: number) {
        const policy = await mediaPolicy();
        const asset = await currentTrx().from("social_media_assets").where("media_id", mediaId).forUpdate().first();
        if (!asset) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        const media = await currentTrx().from("media").where("id", mediaId).forUpdate().first();
        if (!media || !["ready", "moderation_pending", "publishable"].includes(String(media.processing_state))) {
            throw new Exception("Media is not ready for publication", { status: 409, code: "E_SOCIAL_MEDIA_NOT_READY" });
        }
        if (int(media.duration_ms) > 0 && int(media.duration_ms) > policy.maxVideoSeconds * 1000) {
            throw new Exception("Media duration exceeds Configuration OS policy", {
                status: 422,
                code: "E_SOCIAL_VIDEO_DURATION",
            });
        }
        const cleanScan = await currentTrx()
            .from("media_security_scans")
            .where("media_id", mediaId)
            .where("verdict", "clean")
            .orderBy("scanned_at", "desc")
            .first();
        if (!cleanScan)
            throw new Exception("A clean media security scan is required", { status: 409, code: "E_SOCIAL_MEDIA_SCAN_REQUIRED" });
        if (String(asset.safety_state ?? "pending") !== "clean") {
            throw new Exception("Media must pass the safety scan before publication", {
                status: 409,
                code: "E_SOCIAL_MEDIA_SAFETY_REQUIRED",
            });
        }
        const rights = await currentTrx()
            .from("media_rights")
            .where("media_id", mediaId)
            .where("consent_confirmed", true)
            .where((query) => query.whereNull("valid_until").orWhere("valid_until", ">", new Date()))
            .orderBy("id", "desc")
            .first();
        if (!rights)
            throw new Exception("Valid media rights or consent evidence is required", {
                status: 409,
                code: "E_SOCIAL_MEDIA_RIGHTS_REQUIRED",
            });
        await currentTrx().from("media").where("id", mediaId).update({ processing_state: "publishable", updated_at: new Date() });
        await currentTrx()
            .from("social_media_assets")
            .where("id", asset.id)
            .update({ upload_state: "publishable", updated_at: new Date() });
        return { data: { media_id: mediaId, state: "publishable", approved_by_user_id: actorUserId } };
    }

    async playback(mediaId: number, authenticated: boolean) {
        const row = await currentTrx()
            .from("social_media_assets as asset")
            .innerJoin("media as media", "media.id", "asset.media_id")
            .where("asset.media_id", mediaId)
            .select("asset.provider", "asset.provider_ref", "asset.upload_state", "media.access_policy", "media.processing_state")
            .first();
        if (!row) throw new Exception("Social media asset not found", { status: 404, code: "E_SOCIAL_MEDIA_NOT_FOUND" });
        if (!["ready", "publishable"].includes(String(row.processing_state)))
            throw new Exception("Media is not ready for playback", { status: 409, code: "E_SOCIAL_MEDIA_NOT_READY" });
        const policy = String(row.access_policy);
        if (policy !== "public" && !authenticated)
            throw new Exception("Authentication required for this media", { status: 401, code: "E_SOCIAL_MEDIA_AUTH_REQUIRED" });
        const providerRef = String(row.provider_ref ?? "").trim();
        if (!providerRef)
            throw new Exception("Media provider reference missing", { status: 503, code: "E_SOCIAL_MEDIA_PROVIDER_REF" });
        const result = await socialVideoProvider().createPlayback(providerRef, {
            signed: policy !== "public",
            expiresInSeconds: 900,
        });
        return {
            data: {
                media_id: mediaId,
                access_policy: policy,
                provider_ref: result.providerRef,
                hls_url: result.hlsUrl,
                dash_url: result.dashUrl,
                expires_at: result.expiresAt?.toISOString() ?? null,
            },
        };
    }

    async askVideo(contentId: number, question: string, locale = "fa") {
        const content = await currentTrx()
            .from("social_contents")
            .where("id", contentId)
            .whereIn("status", ["published", "highlight"])
            .first();
        if (!content || String(content.kind) !== "video")
            throw new Exception("Published video not found", { status: 404, code: "E_SOCIAL_VIDEO_NOT_FOUND" });
        const mediaId = int(content.primary_media_id);
        if (!mediaId) return { data: { answer_state: "insufficient_evidence", answer: null, evidence: [] } };
        const tracks = await currentTrx()
            .from("media_tracks")
            .where("media_id", mediaId)
            .whereIn("kind", ["transcript", "chapter", "caption"])
            .whereIn("status", ["approved", "ready"])
            .where((query) => query.whereNull("locale").orWhere("locale", locale))
            .select("id", "kind", "locale", "text_content", "evidence");
        const tokens = question
            .toLocaleLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((token) => token.length >= 3)
            .slice(0, 12);
        const excerpts = tracks
            .flatMap((track) =>
                String(track.text_content ?? "")
                    .split(/\n+/)
                    .map((line) => ({ track, line: line.trim() }))
                    .filter(({ line }) => line.length >= 12),
            )
            .map(({ track, line }) => ({
                track,
                line,
                score: tokens.reduce((score, token) => score + (line.toLocaleLowerCase().includes(token) ? 1 : 0), 0),
            }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);
        const markerRows = await currentTrx()
            .from("social_product_markers")
            .where("content_id", contentId)
            .select("product_id", "timestamp_ms", "label");
        const productIds = [...new Set(markerRows.map((row) => int(row.product_id)).filter(Boolean))];
        const products = productIds.length
            ? await currentTrx()
                  .from("products as p")
                  .leftJoin("product_translations as pt", (join) =>
                      join.on("pt.product_id", "=", "p.id").andOnVal("pt.locale", "=", locale),
                  )
                  .whereIn("p.id", productIds)
                  .whereNull("p.deleted_at")
                  .select("p.id", "p.status", "p.regular_price", "p.sale_price", "pt.name", "pt.slug")
            : [];
        if (excerpts.length === 0 && products.length === 0)
            return { data: { answer_state: "insufficient_evidence", answer: null, evidence: [] } };
        return {
            data: {
                answer_state: excerpts.length ? "evidence_found" : "catalog_context_only",
                answer: excerpts.length ? excerpts.map((item) => item.line).join("\n") : null,
                evidence: excerpts.map((item) => ({
                    track_id: Number(item.track.id),
                    kind: item.track.kind,
                    locale: item.track.locale ?? null,
                    excerpt: item.line,
                    score: item.score,
                })),
                products: products.map((product) => ({
                    ...product,
                    marker: markerRows.find((marker) => int(marker.product_id) === int(product.id)) ?? null,
                })),
                generated_claims: false,
            },
        };
    }
}
export const socialMediaPipelineService = new SocialMediaPipelineService();
