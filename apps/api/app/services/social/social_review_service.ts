import { Exception } from "@adonisjs/core/exceptions";
import { currentTrx } from "#services/tenant_context";
async function customerForUser(userId: number) {
    const customer = await currentTrx().from("customers").where("user_id", userId).whereNull("deleted_at").first();
    if (!customer) throw new Exception("Customer profile required", { status: 403, code: "E_SOCIAL_CUSTOMER_REQUIRED" });
    return customer;
}
export class SocialReviewService {
    async verifiedPurchase(customerId: number, productId: number) {
        const row = await currentTrx()
            .from("orders as o")
            .innerJoin("order_line_items as li", "li.order_id", "o.id")
            .where("o.customer_id", customerId)
            .where("li.product_id", productId)
            .whereNull("o.deleted_at")
            .whereIn("o.status", ["processing", "completed"])
            .whereNotNull("o.date_paid_at")
            .orderBy("o.date_paid_at", "desc")
            .select("o.id as order_id", "li.id as line_item_id", "o.date_paid_at")
            .first();
        return row
            ? {
                  verified: true,
                  orderId: Number(row.order_id),
                  lineItemId: Number(row.line_item_id),
                  policyVersion: "phase8-paid-order-v1",
              }
            : { verified: false, orderId: null, lineItemId: null, policyVersion: "phase8-paid-order-v1" };
    }
    async verificationForUser(userId: number, productId: number) {
        const customer = await customerForUser(userId);
        return { customer, ...(await this.verifiedPurchase(Number(customer.id), productId)) };
    }
    async attachMedia(userId: number, reviewId: number, mediaId: number, sequence = 0) {
        const customer = await customerForUser(userId);
        const review = await currentTrx().from("product_reviews").where("id", reviewId).first();
        if (!review) throw new Exception("Review not found", { status: 404, code: "E_SOCIAL_REVIEW_NOT_FOUND" });
        if (Number(review.customer_id) !== Number(customer.id))
            throw new Exception("Review ownership required", { status: 403, code: "E_SOCIAL_REVIEW_OWNER" });
        const media = await currentTrx()
            .from("social_media_assets as asset")
            .innerJoin("media", "media.id", "asset.media_id")
            .where("asset.media_id", mediaId)
            .where("asset.purpose", "review")
            .where("media.processing_state", "publishable")
            .first();
        if (!media) throw new Exception("Review media must be publishable", { status: 422, code: "E_SOCIAL_REVIEW_MEDIA" });
        const [row] = await currentTrx()
            .table("product_review_media")
            .insert({ review_id: reviewId, media_id: mediaId, sequence })
            .onConflict(["tenant_id", "review_id", "media_id"])
            .merge({ sequence, updated_at: new Date() })
            .returning("*");
        return { data: row };
    }
    async helpful(userId: number, reviewId: number, helpful: boolean) {
        const customer = await customerForUser(userId);
        const review = await currentTrx().from("product_reviews").where("id", reviewId).first();
        if (!review) throw new Exception("Review not found", { status: 404, code: "E_SOCIAL_REVIEW_NOT_FOUND" });
        if (Number(review.customer_id) === Number(customer.id))
            throw new Exception("Self-votes are not allowed", { status: 422, code: "E_SOCIAL_REVIEW_SELF_VOTE" });
        const [row] = await currentTrx()
            .table("product_review_helpful_votes")
            .insert({ review_id: reviewId, customer_id: customer.id, helpful })
            .onConflict(["tenant_id", "review_id", "customer_id"])
            .merge({ helpful, updated_at: new Date() })
            .returning("*");
        return { data: row };
    }
    async report(userId: number, reviewId: number, input: { reasonCode: string; details?: string | null }) {
        const customer = await customerForUser(userId);
        const review = await currentTrx().from("product_reviews").where("id", reviewId).first();
        if (!review) throw new Exception("Review not found", { status: 404, code: "E_SOCIAL_REVIEW_NOT_FOUND" });
        if (Number(review.customer_id) === Number(customer.id))
            throw new Exception("Self-reports are not allowed", { status: 422, code: "E_SOCIAL_REVIEW_SELF_REPORT" });
        const [row] = await currentTrx()
            .table("product_review_reports")
            .insert({
                review_id: reviewId,
                customer_id: customer.id,
                reason_code: input.reasonCode,
                details: input.details ?? null,
            })
            .onConflict(["tenant_id", "review_id", "customer_id"])
            .ignore()
            .returning("*");
        return { data: row ?? null, replayed: !row };
    }
    async sellerResponse(actorUserId: number, reviewId: number, body: string) {
        const review = await currentTrx().from("product_reviews").where("id", reviewId).first();
        if (!review) throw new Exception("Review not found", { status: 404, code: "E_SOCIAL_REVIEW_NOT_FOUND" });
        const [row] = await currentTrx()
            .table("product_review_responses")
            .insert({ review_id: reviewId, user_id: actorUserId, body })
            .returning("*");
        return { data: row };
    }
    async detail(reviewId: number) {
        const review = await currentTrx().from("product_reviews").where("id", reviewId).first();
        if (!review) throw new Exception("Review not found", { status: 404, code: "E_SOCIAL_REVIEW_NOT_FOUND" });
        const [media, votes, responses] = await Promise.all([
            currentTrx().from("product_review_media").where("review_id", reviewId).orderBy("sequence"),
            currentTrx().from("product_review_helpful_votes").where("review_id", reviewId),
            currentTrx().from("product_review_responses").where("review_id", reviewId).orderBy("created_at"),
        ]);
        return {
            data: {
                ...review,
                media,
                helpful: votes.filter((x) => x.helpful).length,
                not_helpful: votes.filter((x) => !x.helpful).length,
                responses,
            },
        };
    }
}
export const socialReviewService = new SocialReviewService();
