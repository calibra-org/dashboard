import { randomUUID } from "node:crypto";

import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import ProductReview from "#models/product_review";
import User from "#models/user";
import { createProduct } from "../catalog/helpers.js";
import { TEST_TENANT_ID } from "#tests/helpers/tenant";

const ADMIN = "/api/v1/admin/social";
const ACCOUNT = "/api/v1/account/social";
const STOREFRONT = "/api/v1/storefront/social";

async function createUser(role: "admin" | "customer") {
    const token = randomUUID();
    const user = await User.create({
        email: `phase8-${role}-${token}@calibra.dev`,
        passwordHash: "Passw0rd1!",
        role,
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: role === "admin" ? "مدیر" : "مشتری",
        lastName: "اجتماعی",
        countryDefault: "IR",
        status: "active",
    });
    return { user, customer };
}

async function resetPhase8() {
    const admin = db.connection("postgres_admin");
    await admin.rawQuery(`TRUNCATE TABLE
        social_message_media,
        social_live_participant_controls,
        media_security_scans,
        social_moderation_appeals,
        product_review_reports,
        product_review_responses,
        product_review_helpful_votes,
        product_review_media,
        social_provider_events,
        media_rights,
        media_tracks,
        media_variants,
        social_media_assets,
        social_reputation_signals,
        social_commerce_attributions,
        social_live_sessions,
        social_moderation_actions,
        social_moderation_cases,
        social_messages,
        social_threads,
        social_channel_memberships,
        social_channels,
        social_interaction_events,
        social_follow_edges,
        social_product_markers,
        social_story_frames,
        social_contents
        RESTART IDENTITY CASCADE`);
}

async function createMedia(input: { state?: string; safety?: string; purpose?: string; ownerRef?: string } = {}) {
    const admin = db.connection("postgres_admin");
    const state = input.state ?? "ready";
    const providerRef = `phase8-${randomUUID()}`;
    const [media] = await admin
        .table("media")
        .insert({
            kind: "video",
            url: `stream://cloudflare_stream/${providerRef}`,
            mime: "video/mp4",
            size_bytes: 2_048,
            processing_state: state,
            access_policy: "signed",
            provider: "cloudflare_stream",
            provider_ref: providerRef,
        })
        .returning("*");
    await admin.table("social_media_assets").insert({
        tenant_id: TEST_TENANT_ID,
        media_id: media.id,
        purpose: input.purpose ?? "video",
        owner_actor_type: "user",
        owner_actor_ref: input.ownerRef ?? "phase8-test",
        upload_state: state,
        safety_state: input.safety ?? "pending",
        provider: "cloudflare_stream",
        provider_ref: providerRef,
        declared_mime: "video/mp4",
        declared_size_bytes: 2_048,
    });
    return media;
}

test.group("Phase 8 Social Commerce OS", (group) => {
    group.each.setup(resetPhase8);

    test("Draft → Review → Published uses moderation approval and optimistic versions", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client
            .post(`${ADMIN}/contents`)
            .withGuard("api")
            .loginAs(user)
            .json({ kind: "post", title: "Phase 8 editorial workflow" });
        created.assertStatus(201);
        const contentId = Number(created.body().data.id);
        assert.equal(created.body().data.status, "draft");
        assert.equal(created.body().data.moderation_state, "pending_review");

        const review = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 1, status: "review" });
        review.assertStatus(200);
        assert.equal(review.body().data.status, "review");

        const moderationCase = await db
            .connection("postgres_admin")
            .from("social_moderation_cases")
            .where("tenant_id", TEST_TENANT_ID)
            .where("target_type", "content")
            .where("target_id", contentId)
            .firstOrFail();
        const approved = await client
            .post(`${ADMIN}/moderation/${moderationCase.id}/actions`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 1, action: "finalize", reason: "editorial approval" });
        approved.assertStatus(200);

        const published = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 2, status: "published" });
        published.assertStatus(200);
        assert.equal(published.body().data.status, "published");
    });

    test("convert-to-ticket reuses canonical Ticket Operations and is idempotent", async ({ client, assert }) => {
        const { user: customerUser } = await createUser("customer");
        const { user: adminUser } = await createUser("admin");
        const created = await client
            .post(`${ACCOUNT}/threads`)
            .withGuard("api")
            .loginAs(customerUser)
            .json({
                kind: "private",
                subject: "Help with a social product question",
                message: "Please help with this product discussion.",
            });
        created.assertStatus(201);
        const threadId = Number(created.body().data.id);

        const first = await client.post(`${ADMIN}/threads/${threadId}/convert-to-ticket`).withGuard("api").loginAs(adminUser);
        first.assertStatus(200);
        assert.isTrue(first.body().data.changed);
        assert.isAbove(Number(first.body().data.ticket_id), 0);

        const replay = await client.post(`${ADMIN}/threads/${threadId}/convert-to-ticket`).withGuard("api").loginAs(adminUser);
        replay.assertStatus(200);
        assert.isFalse(replay.body().data.changed);
        assert.equal(Number(replay.body().data.ticket_id), Number(first.body().data.ticket_id));
    });

    test("records first-party anonymous interaction events and exposes analytics", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const interaction = await client.post(`${STOREFRONT}/interactions`).json({
            anonymous_id: `anon-${randomUUID()}`,
            event_type: "impression",
            source_surface: "home_story_rail",
            watch_ms: 1200,
        });
        interaction.assertStatus(201);
        assert.isAbove(Number(interaction.body().data.id), 0);

        const analytics = await client.get(`${ADMIN}/analytics`).withGuard("api").loginAs(user);
        analytics.assertStatus(200);
        assert.equal(Number(analytics.body().data.events.impression), 1);
    });

    test("duration beyond Configuration OS policy is rejected before persistence", async ({ client }) => {
        const { user } = await createUser("admin");
        const response = await client
            .post(`${ADMIN}/contents`)
            .withGuard("api")
            .loginAs(user)
            .json({ kind: "video", title: "Oversized social video", duration_seconds: 14_400 });
        response.assertStatus(422);
    });

    test("blocks video publication until canonical media is publishable", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client
            .post(`${ADMIN}/contents`)
            .withGuard("api")
            .loginAs(user)
            .json({ kind: "video", title: "Media gated video", aspect_ratio: "9:16", duration_seconds: 30 });
        created.assertStatus(201);
        const contentId = Number(created.body().data.id);

        const queue = await client.get(`${ADMIN}/moderation`).withGuard("api").loginAs(user);
        const reviewCase = queue
            .body()
            .data.find(
                (item: { target_type: string; target_id: number }) =>
                    item.target_type === "content" && Number(item.target_id) === contentId,
            );
        assert.exists(reviewCase);
        const approved = await client
            .post(`${ADMIN}/moderation/${reviewCase.id}/actions`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: reviewCase.version, action: "restore" });
        approved.assertStatus(200);

        const review = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 1, status: "review" });
        review.assertStatus(200);

        const missingMedia = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 2, status: "published" });
        missingMedia.assertStatus(422);

        const adminDb = db.connection("postgres_admin");
        const [media] = await adminDb
            .table("media")
            .insert({
                kind: "video",
                url: "stream://cloudflare_stream/test-media",
                mime: "video/mp4",
                size_bytes: 1_024,
                processing_state: "ready",
                access_policy: "signed",
                provider: "cloudflare_stream",
                provider_ref: `phase8-test-${randomUUID()}`,
            })
            .returning("*");
        await adminDb.table("social_media_assets").insert({
            tenant_id: TEST_TENANT_ID,
            media_id: media.id,
            purpose: "video",
            owner_actor_type: "user",
            owner_actor_ref: String(user.id),
            upload_state: "ready",
            provider: "cloudflare_stream",
            provider_ref: media.provider_ref,
            declared_mime: "video/mp4",
            declared_size_bytes: 1_024,
        });

        const attached = await client
            .patch(`${ADMIN}/contents/${contentId}`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 2, primary_media_id: Number(media.id) });
        attached.assertStatus(200);

        const notPublishable = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 3, status: "published" });
        notPublishable.assertStatus(422);

        await adminDb.from("media").where("id", media.id).update({ processing_state: "publishable" });
        await adminDb.from("social_media_assets").where("media_id", media.id).update({ upload_state: "publishable" });
        const published = await client
            .post(`${ADMIN}/contents/${contentId}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ expected_version: 3, status: "published" });
        published.assertStatus(200);
        assert.equal(published.body().data.status, "published");
    });

    test("rejects helpful self-votes so reputation evidence cannot be self-inflated", async ({ client }) => {
        const { user, customer } = await createUser("customer");
        const product = await createProduct({
            fa: { name: "محصول اعتبار", slug: `reputation-fa-${randomUUID()}` },
            en: { name: "Reputation product", slug: `reputation-en-${randomUUID()}` },
        });
        const review = await ProductReview.create({
            productId: product.id,
            customerId: customer.id,
            reviewerName: "Reviewer",
            reviewerEmail: user.email,
            body: "A verified review that must not be self-upvoted.",
            rating: 5,
            status: "approved",
            verified: true,
        });
        const response = await client
            .put(`${ACCOUNT}/reviews/${review.id}/helpful`)
            .withGuard("api")
            .loginAs(user)
            .json({ helpful: true });
        response.assertStatus(422);
    });

    test("requires a clean security verdict and rights evidence before media becomes publishable", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const media = await createMedia({ state: "scanning", safety: "scanning", ownerRef: String(user.id) });

        const blocked = await client.post(`${ADMIN}/media/${media.id}/publishable`).withGuard("api").loginAs(user);
        blocked.assertStatus(409);

        const scan = await client
            .post(`${ADMIN}/media/${media.id}/security-scan`)
            .withGuard("api")
            .loginAs(user)
            .json({
                scanner: "test-attestation",
                scanner_ref: `scan-ref-${randomUUID()}`,
                verdict: "clean",
                content_hash: "a".repeat(64),
                evidence: { fixture: true },
            });
        scan.assertStatus(200);
        assert.equal(scan.body().data.state, "ready");

        const stillBlocked = await client.post(`${ADMIN}/media/${media.id}/publishable`).withGuard("api").loginAs(user);
        stillBlocked.assertStatus(409);

        const rights = await client
            .post(`${ADMIN}/media/${media.id}/rights`)
            .withGuard("api")
            .loginAs(user)
            .json({
                rights_basis: "owned",
                consent_confirmed: true,
                evidence: { fixture: true },
            });
        rights.assertStatus(201);
        const publishable = await client.post(`${ADMIN}/media/${media.id}/publishable`).withGuard("api").loginAs(user);
        publishable.assertStatus(200);
        assert.equal(publishable.body().data.state, "publishable");
    });

    test("persists live mute/ban controls without leaking provider stream secrets", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const [content] = await db
            .connection("postgres_admin")
            .table("social_contents")
            .insert({
                tenant_id: TEST_TENANT_ID,
                kind: "live",
                status: "review",
                title: "Moderated live session",
                locale: "fa",
                moderation_state: "approved",
                audience: JSON.stringify({ visibility: "public" }),
                rights_metadata: JSON.stringify({}),
                metadata: JSON.stringify({}),
                created_by_user_id: user.id,
            })
            .returning("*");
        await db
            .connection("postgres_admin")
            .table("social_live_sessions")
            .insert({
                tenant_id: TEST_TENANT_ID,
                content_id: content.id,
                status: "ready",
                scheduled_at: new Date(),
                provider: "cloudflare_stream",
                provider_ref: `live-${randomUUID()}`,
                metadata: JSON.stringify({}),
            });
        const anonymousId = `viewer-${randomUUID()}`;
        const mute = await client
            .post(`${ADMIN}/contents/${content.id}/live/participants/control`)
            .withGuard("api")
            .loginAs(user)
            .json({ anonymous_id: anonymousId, control: "mute", active: true, reason: "abuse control" });
        mute.assertStatus(200);
        const ban = await client
            .post(`${ADMIN}/contents/${content.id}/live/participants/control`)
            .withGuard("api")
            .loginAs(user)
            .json({ anonymous_id: anonymousId, control: "ban", active: true, reason: "repeat abuse" });
        ban.assertStatus(200);
        const controls = await db
            .connection("postgres_admin")
            .from("social_live_participant_controls")
            .where("tenant_id", TEST_TENANT_ID)
            .where("anonymous_id", anonymousId)
            .orderBy("control");
        assert.lengthOf(controls, 2);
        assert.deepEqual(controls.map((row) => row.control).sort(), ["ban", "mute"]);
        assert.notInclude(JSON.stringify(mute.body()), "stream_key");
        assert.notInclude(JSON.stringify(ban.body()), "stream_key");
    });
});
