import vine from "@vinejs/vine";
const id = () => vine.number().withoutDecimals().positive();
const version = () => vine.number().withoutDecimals().min(1);
const optionalText = (max: number) => vine.string().trim().maxLength(max).optional().nullable();
const jsonObject = () => vine.record(vine.any());
export const adminSocialContentListValidator = vine.compile(
    vine.object({
        status: vine.string().trim().maxLength(24).optional(),
        kind: vine.string().trim().maxLength(24).optional(),
        q: vine.string().trim().maxLength(200).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    }),
);
export const adminSocialContentCreateValidator = vine.compile(
    vine.object({
        kind: vine.enum(["story", "video", "live", "post", "question"] as const),
        title: vine.string().trim().minLength(1).maxLength(300),
        description: optionalText(20000),
        locale: vine.string().trim().maxLength(8).optional(),
        market: optionalText(32),
        cover_media_id: id().optional().nullable(),
        primary_media_id: id().optional().nullable(),
        aspect_ratio: vine
            .enum(["9:16", "1:1", "16:9"] as const)
            .optional()
            .nullable(),
        duration_seconds: vine.number().withoutDecimals().min(1).max(14400).optional().nullable(),
        publish_at: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
        expires_at: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
        audience: jsonObject().optional(),
        rights_metadata: jsonObject().optional(),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialContentUpdateValidator = vine.compile(
    vine.object({
        expected_version: version(),
        title: vine.string().trim().minLength(1).maxLength(300).optional(),
        description: optionalText(20000),
        locale: vine.string().trim().maxLength(8).optional(),
        market: optionalText(32),
        cover_media_id: id().optional().nullable(),
        primary_media_id: id().optional().nullable(),
        aspect_ratio: vine
            .enum(["9:16", "1:1", "16:9"] as const)
            .optional()
            .nullable(),
        duration_seconds: vine.number().withoutDecimals().min(1).max(14400).optional().nullable(),
        publish_at: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
        expires_at: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
        audience: jsonObject().optional(),
        rights_metadata: jsonObject().optional(),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialTransitionValidator = vine.compile(
    vine.object({
        expected_version: version(),
        status: vine.enum(["draft", "review", "scheduled", "published", "expired", "archived", "highlight"] as const),
    }),
);
export const adminSocialFrameValidator = vine.compile(
    vine.object({
        sequence: vine.number().withoutDecimals().min(0).max(500),
        frame_type: vine.enum(["image", "video", "text", "poll", "product"] as const),
        media_id: id().optional().nullable(),
        product_id: id().optional().nullable(),
        duration_ms: vine.number().withoutDecimals().min(1_000).max(60_000).optional(),
        cta_label: optionalText(120),
        cta_url: vine
            .string()
            .trim()
            .maxLength(1_024)
            .regex(/^(?:https?:\/\/|\/(?!\/))/i)
            .optional()
            .nullable(),
        payload: jsonObject().optional(),
    }),
);
export const adminSocialMarkerValidator = vine.compile(
    vine.object({
        product_id: id(),
        timestamp_ms: vine.number().withoutDecimals().min(0).max(86_400_000).optional(),
        label: optionalText(160),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialAttributionValidator = vine.compile(
    vine.object({
        order_id: id(),
        customer_id: id().optional().nullable(),
        content_id: id().optional().nullable(),
        marker_id: id().optional().nullable(),
        interaction_event_id: id().optional().nullable(),
        source_surface: vine.string().trim().minLength(1).maxLength(80),
        position_ms: vine.number().withoutDecimals().min(0).optional().nullable(),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialChannelValidator = vine.compile(
    vine.object({
        kind: vine.enum(["discussion", "support", "expert", "creator", "brand"] as const).optional(),
        name: vine.string().trim().minLength(1).maxLength(200),
        slug: vine.string().trim().minLength(1).maxLength(120),
        visibility: vine.enum(["public", "members", "private"] as const).optional(),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialChannelMembershipValidator = vine.compile(
    vine.object({
        customer_id: id().optional().nullable(),
        user_id: id().optional().nullable(),
        role: vine.enum(["owner", "admin", "moderator", "verified_expert", "creator", "member"] as const),
        status: vine.enum(["active", "muted", "banned", "left"] as const).optional(),
    }),
);
export const adminSocialThreadListValidator = vine.compile(
    vine.object({
        kind: vine.enum(["public_qa", "community", "private"] as const).optional(),
        status: vine.enum(["open", "closed", "converted_to_ticket"] as const).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    }),
);
export const adminSocialMessageValidator = vine.compile(
    vine.object({
        body: vine.string().trim().minLength(1).maxLength(20000),
        media_ids: vine.array(id()).maxLength(8).optional(),
    }),
);
export const adminSocialModerationListValidator = vine.compile(
    vine.object({
        status: vine.enum(["pending_review", "limited", "removed", "appealed", "restored", "final"] as const).optional(),
        category: vine.string().trim().maxLength(80).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
    }),
);
export const adminSocialModerationActionValidator = vine.compile(
    vine.object({
        expected_version: version(),
        action: vine.enum(["limit", "remove", "restore", "finalize", "escalate", "note"] as const),
        reason: optionalText(4000),
        evidence: jsonObject().optional(),
    }),
);
export const adminSocialLiveCreateValidator = vine.compile(
    vine.object({
        scheduled_at: vine.date({ formats: { utc: true } }),
        slow_mode_seconds: vine.number().withoutDecimals().min(0).max(300).optional(),
        metadata: jsonObject().optional(),
    }),
);
export const adminSocialLiveUpdateValidator = vine.compile(
    vine.object({
        expected_version: version(),
        status: vine
            .enum([
                "ready",
                "starting",
                "live",
                "ending",
                "ended",
                "processing_replay",
                "replay_ready",
                "archived",
                "start_failed",
                "interrupted",
                "replay_failed",
                "removed",
                "cancelled",
            ] as const)
            .optional(),
        pinned_marker_id: id().optional().nullable(),
        slow_mode_seconds: vine.number().withoutDecimals().min(0).max(300).optional(),
    }),
);
export const adminSocialLiveParticipantControlValidator = vine.compile(
    vine.object({
        customer_id: id().optional().nullable(),
        anonymous_id: optionalText(96),
        control: vine.enum(["mute", "ban"] as const),
        active: vine.boolean(),
        reason: optionalText(2000),
        expires_at: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
    }),
);
export const adminSocialLiveReplayValidator = vine.compile(vine.object({ media_id: id(), expected_version: version() }));
export const adminSocialLiveEmergencyStopValidator = vine.compile(
    vine.object({ expected_version: version(), reason: vine.string().trim().minLength(3).maxLength(2000) }),
);
export const adminSocialLiveChatFreezeValidator = vine.compile(
    vine.object({ expected_version: version(), frozen: vine.boolean(), reason: optionalText(2000) }),
);
export const adminSocialMediaUploadIntentValidator = vine.compile(
    vine.object({
        filename: vine.string().trim().minLength(1).maxLength(512),
        mime: vine
            .string()
            .trim()
            .regex(/^video\/[a-z0-9.+-]+$/i),
        size_bytes: vine.number().withoutDecimals().positive(),
        purpose: vine.enum(["story", "video", "live_replay", "review", "message"] as const),
        access_policy: vine.enum(["public", "signed", "members", "private"] as const).optional(),
    }),
);
export const adminSocialMediaTrackValidator = vine.compile(
    vine.object({
        kind: vine.enum(["caption", "transcript", "chapter", "audio_description"] as const),
        locale: vine.string().trim().minLength(2).maxLength(16).optional().nullable(),
        text_content: vine.string().maxLength(500_000).optional().nullable(),
        provider_ref: optionalText(200),
        storage_key: optionalText(1024),
        evidence: jsonObject().optional(),
    }),
);
export const adminSocialMediaTrackReviewValidator = vine.compile(
    vine.object({ decision: vine.enum(["approved", "rejected"] as const) }),
);
export const adminSocialMediaRightsValidator = vine.compile(
    vine.object({
        rights_basis: vine.enum(["owned", "licensed", "creator_consent", "customer_consent", "public_domain", "other"] as const),
        holder_ref: optionalText(200),
        consent_confirmed: vine.boolean(),
        valid_until: vine
            .date({ formats: { utc: true } })
            .optional()
            .nullable(),
        evidence: jsonObject().optional(),
    }),
);
export const adminSocialMediaSecurityScanValidator = vine.compile(
    vine.object({
        scanner: vine.string().trim().minLength(1).maxLength(64),
        scanner_ref: optionalText(200),
        verdict: vine.enum(["clean", "suspicious", "malicious", "error"] as const),
        content_hash: vine
            .string()
            .trim()
            .regex(/^[a-f0-9]{64}$/i)
            .optional()
            .nullable(),
        evidence: jsonObject().optional(),
    }),
);
export const adminSocialReviewResponseValidator = vine.compile(
    vine.object({ body: vine.string().trim().minLength(1).maxLength(20000) }),
);
export const adminSocialSearchValidator = vine.compile(
    vine.object({
        q: vine.string().trim().maxLength(200).optional(),
        kind: vine.string().trim().maxLength(24).optional(),
        locale: vine.string().trim().maxLength(8).optional(),
        page: vine.number().withoutDecimals().min(1).optional(),
        limit: vine.number().withoutDecimals().min(1).max(100).optional(),
        visibility: vine.string().trim().maxLength(24).optional(),
    }),
);
