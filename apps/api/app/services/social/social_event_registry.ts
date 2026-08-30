export const SOCIAL_EVENT_SCHEMA_VERSION = 1 as const;

export const SOCIAL_EVENT_REGISTRY = {
    impression: { name: "social.content.impression", aggregate: "social_content", privacy: "personal" },
    view: { name: "social.content.viewed", aggregate: "social_content", privacy: "personal" },
    watch: { name: "social.video.progress", aggregate: "social_content", privacy: "personal" },
    progress: { name: "social.video.progress", aggregate: "social_content", privacy: "personal" },
    completion: { name: "social.video.completed", aggregate: "social_content", privacy: "personal" },
    replay: { name: "social.video.replayed", aggregate: "social_content", privacy: "personal" },
    like: { name: "social.reaction.created", aggregate: "social_content", privacy: "personal" },
    reaction: { name: "social.reaction.created", aggregate: "social_content", privacy: "personal" },
    save: { name: "social.video.saved", aggregate: "social_content", privacy: "personal" },
    share: { name: "social.content.share_intent", aggregate: "social_content", privacy: "personal" },
    comment: { name: "social.comment.created", aggregate: "social_content", privacy: "personal" },
    reply: { name: "social.reply.created", aggregate: "social_content", privacy: "personal" },
    mention: { name: "social.mention.created", aggregate: "social_content", privacy: "personal" },
    poll_vote: { name: "social.poll.voted", aggregate: "social_content", privacy: "personal" },
    question: { name: "social.live.question_submitted", aggregate: "social_content", privacy: "personal" },
    report: { name: "social.report.created", aggregate: "social_content", privacy: "sensitive" },
    product_tap: { name: "social.commerce.product_viewed", aggregate: "product", privacy: "personal" },
    cart: { name: "social.commerce.add_to_cart", aggregate: "product", privacy: "personal" },
    purchase: { name: "social.commerce.order_attributed", aggregate: "product", privacy: "sensitive" },
} as const;

export type SocialRegisteredEventType = keyof typeof SOCIAL_EVENT_REGISTRY;

export function socialEventDefinition(eventType: string) {
    const definition = SOCIAL_EVENT_REGISTRY[eventType as SocialRegisteredEventType];
    if (!definition) return null;
    return { ...definition, schemaVersion: SOCIAL_EVENT_SCHEMA_VERSION };
}
