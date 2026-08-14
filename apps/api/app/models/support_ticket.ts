import { BaseModel, column } from "@adonisjs/lucid/orm";
import type { DateTime } from "luxon";

/**
 * Read/write model for the support-ticket aggregate. The migration introduces this table after the
 * generated schema snapshot on main, so the model declares only the columns the ticket domain
 * consumes. Regenerating `database/schema.ts` will allow this class to move onto the generated
 * schema base without changing its public surface.
 */
export default class SupportTicket extends BaseModel {
    static table = "support_tickets";

    @column({ isPrimary: true })
    declare id: bigint;

    @column()
    declare tenantId: bigint;

    @column()
    declare ticketNumber: bigint;

    @column()
    declare reference: string;

    @column()
    declare customerId: bigint | null;

    @column()
    declare requesterName: string;

    @column()
    declare requesterEmail: string | null;

    @column()
    declare requesterPhone: string | null;

    @column()
    declare subject: string;

    @column()
    declare status: string;

    @column()
    declare priority: string;

    @column()
    declare channel: string;

    @column()
    declare category: string | null;

    @column()
    declare tags: string[];

    @column()
    declare assignedUserId: bigint | null;

    @column()
    declare createdByUserId: bigint | null;

    @column()
    declare version: number;

    @column.dateTime()
    declare firstResponseDueAt: DateTime | null;

    @column.dateTime()
    declare resolutionDueAt: DateTime | null;

    @column.dateTime()
    declare firstResponseAt: DateTime | null;

    @column.dateTime()
    declare resolvedAt: DateTime | null;

    @column.dateTime()
    declare closedAt: DateTime | null;

    @column.dateTime()
    declare lastMessageAt: DateTime;

    @column.dateTime({ autoCreate: true })
    declare createdAt: DateTime;

    @column.dateTime({ autoCreate: true, autoUpdate: true })
    declare updatedAt: DateTime;
}
