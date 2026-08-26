import { BaseSchema } from "@adonisjs/lucid/schema";

/** Phase 31 split-shipment quotes may span multiple canonical source nodes/profiles. */
export default class extends BaseSchema {
    async up() {
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN node_id DROP NOT NULL");
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN capacity_window_id DROP NOT NULL");
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN service_profile_id DROP NOT NULL");
        this.schema.raw(
            "ALTER TABLE fulfillment_promise_quotes ADD CONSTRAINT fulfillment_promise_anchor_check CHECK ((strategy = 'single_location' AND node_id IS NOT NULL AND capacity_window_id IS NOT NULL AND service_profile_id IS NOT NULL) OR strategy <> 'single_location')",
        );
    }

    async down() {
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes DROP CONSTRAINT IF EXISTS fulfillment_promise_anchor_check");
        this.schema.raw(
            "DELETE FROM fulfillment_promise_quotes WHERE node_id IS NULL OR capacity_window_id IS NULL OR service_profile_id IS NULL",
        );
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN service_profile_id SET NOT NULL");
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN capacity_window_id SET NOT NULL");
        this.schema.raw("ALTER TABLE fulfillment_promise_quotes ALTER COLUMN node_id SET NOT NULL");
    }
}
