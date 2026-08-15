import { BaseSchema } from "@adonisjs/lucid/schema";

const EXTENDED_CHANNELS = "'admin','web','email','phone','api','whatsapp','telegram','instagram','rubika','bale','eitaa','sms'";
const LEGACY_CHANNELS = "'admin','web','email','phone','api'";

export default class extends BaseSchema {
    async up() {
        this.schema.raw("ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check");
        this.schema.raw(
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_channel_check CHECK (channel IN (${EXTENDED_CHANNELS}))`,
        );
    }

    async down() {
        this.schema.raw(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM support_tickets WHERE channel NOT IN (${LEGACY_CHANNELS})) THEN
                    RAISE EXCEPTION 'Cannot roll back support ticket channel expansion while extended channel data exists';
                END IF;
            END $$
        `);
        this.schema.raw("ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check");
        this.schema.raw(
            `ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_channel_check CHECK (channel IN (${LEGACY_CHANNELS}))`,
        );
    }
}
