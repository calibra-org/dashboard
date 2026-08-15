import vine from "@vinejs/vine";

export const publicTicketCreateValidator = vine.compile(
    vine.object({
        requester_name: vine.string().trim().minLength(1).maxLength(180),
        requester_email: vine.string().trim().email().maxLength(254).optional().nullable(),
        requester_phone: vine.string().trim().maxLength(32).optional().nullable(),
        subject: vine.string().trim().minLength(2).maxLength(255),
        message: vine.string().trim().minLength(1).maxLength(20_000),
        category: vine.string().trim().maxLength(80).optional().nullable(),
    }),
);

export const publicTicketReplyValidator = vine.compile(
    vine.object({
        expected_version: vine.number().withoutDecimals().positive(),
        body: vine.string().trim().minLength(1).maxLength(20_000),
    }),
);

export const publicTicketCsatValidator = vine.compile(
    vine.object({
        score: vine.number().withoutDecimals().min(1).max(5),
        comment: vine.string().trim().maxLength(2000).optional().nullable(),
    }),
);
