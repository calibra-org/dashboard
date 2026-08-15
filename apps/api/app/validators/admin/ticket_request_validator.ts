import vine from "@vinejs/vine";

import { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "#enums/support_ticket";
import { adminTicketsView } from "#table_views/admin/tickets";

export { TICKET_CHANNELS, TICKET_PRIORITIES, TICKET_STATUSES } from "#enums/support_ticket";

const positiveId = () => vine.number().withoutDecimals().positive();
const expectedVersion = () => vine.number().withoutDecimals().positive();
const nullableText = (maxLength: number) => vine.string().trim().maxLength(maxLength).optional().nullable();

export const adminTicketListValidator = adminTicketsView.compileStrict({
    extras: {
        q: vine.string().trim().maxLength(120).optional(),
        sla: vine.enum(["all", "healthy", "breached"] as const).optional(),
    },
    defaultLimit: 25,
    maxLimit: 100,
});

export const adminTicketCreateValidator = vine.compile(
    vine.object({
        customer_id: positiveId().optional().nullable(),
        requester_name: vine.string().trim().minLength(1).maxLength(180),
        requester_email: vine.string().trim().email().maxLength(254).optional().nullable(),
        requester_phone: nullableText(32),
        subject: vine.string().trim().minLength(2).maxLength(255),
        message: vine.string().trim().minLength(1).maxLength(20_000),
        priority: vine.enum(TICKET_PRIORITIES).optional(),
        channel: vine.enum(TICKET_CHANNELS).optional(),
        category: nullableText(80),
        tags: vine.array(vine.string().trim().minLength(1).maxLength(40)).maxLength(20).optional(),
        assigned_user_id: positiveId().optional().nullable(),
    }),
);

export const adminTicketUpdateValidator = vine.compile(
    vine.object({
        expected_version: expectedVersion(),
        subject: vine.string().trim().minLength(2).maxLength(255).optional(),
        priority: vine.enum(TICKET_PRIORITIES).optional(),
        category: nullableText(80),
        tags: vine.array(vine.string().trim().minLength(1).maxLength(40)).maxLength(20).optional(),
        assigned_user_id: positiveId().optional().nullable(),
    }),
);

export const adminTicketTransitionValidator = vine.compile(
    vine.object({
        status: vine.enum(TICKET_STATUSES),
        expected_version: expectedVersion(),
        reason: nullableText(1000),
    }),
);

export const adminTicketMessageValidator = vine.compile(
    vine.object({
        kind: vine.enum(["reply", "internal_note"] as const),
        body: vine.string().trim().minLength(1).maxLength(20_000),
        expected_version: expectedVersion(),
    }),
);

export const adminTicketSettingsValidator = vine.compile(
    vine.object({
        reference_prefix: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(12)
            .regex(/^[A-Za-z0-9-]+$/)
            .optional(),
        first_response_minutes: vine.number().withoutDecimals().min(1).max(10_080).optional(),
        resolution_minutes: vine.number().withoutDecimals().min(1).max(43_200).optional(),
        default_priority: vine.enum(TICKET_PRIORITIES).optional(),
        default_assignee_user_id: positiveId().optional().nullable(),
    }),
);

export const adminTicketResourceValidator = vine.compile(
    vine.object({
        kind: vine.enum(["customers", "assignees"] as const),
        q: vine.string().trim().maxLength(120).optional(),
        limit: vine.number().withoutDecimals().min(1).max(50).optional(),
    }),
);
