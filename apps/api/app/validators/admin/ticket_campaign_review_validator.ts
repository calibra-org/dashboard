import vine from "@vinejs/vine";

export const ticketCampaignTemplateReviewValidator = vine.compile(
    vine.object({
        expected_version: vine.number().withoutDecimals().positive(),
        decision: vine.enum(["approved", "rejected"] as const),
        note: vine.string().trim().maxLength(2000).nullable().optional(),
    }),
);
