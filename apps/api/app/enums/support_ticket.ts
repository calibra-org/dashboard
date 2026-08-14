export const TICKET_STATUSES = ["open", "pending", "waiting_customer", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TICKET_CHANNELS = ["admin", "web", "email", "phone", "api"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketChannel = (typeof TICKET_CHANNELS)[number];
