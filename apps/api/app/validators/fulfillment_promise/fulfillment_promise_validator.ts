import vine from "@vinejs/vine";

const reason = vine.string().trim().minLength(3).maxLength(2000);
const publicId = vine.string().trim().uuid();
const isoDate = vine.string().trim().minLength(10).maxLength(64);
const time = vine
    .string()
    .trim()
    .minLength(5)
    .maxLength(12)
    .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const jsonRecord = vine.record(vine.any());

export const fulfillmentPromiseSelectValidator = vine.compile(
    vine.object({
        promise_public_id: publicId,
    }),
);

export const fulfillmentPromiseNodeCreateValidator = vine.compile(
    vine.object({
        node_code: vine
            .string()
            .trim()
            .minLength(2)
            .maxLength(96)
            .regex(/^[A-Za-z0-9][A-Za-z0-9._~-]+$/),
        name: vine.string().trim().minLength(2).maxLength(190),
        node_type: vine.enum(["warehouse", "store", "hub", "cross_dock"] as const),
        timezone: vine.string().trim().minLength(3).maxLength(64),
        country: vine
            .string()
            .trim()
            .fixedLength(2)
            .regex(/^[A-Za-z]{2}$/),
        region_id: vine.number().positive().withoutDecimals().optional(),
        city: vine.string().trim().minLength(1).maxLength(120).optional(),
        postcode_prefix: vine.string().trim().minLength(1).maxLength(32).optional(),
        cutoff_local_time: time.optional(),
        handling_minutes: vine.number().min(0).max(10080).withoutDecimals(),
        inventory_stale_after_minutes: vine.number().min(1).max(1440).withoutDecimals(),
        operating_hours: jsonRecord,
        metadata: jsonRecord,
        reason,
    }),
);

export const fulfillmentPromiseInventorySourceValidator = vine.compile(
    vine.object({
        inventory_item_id: vine.number().positive().withoutDecimals(),
        reason,
    }),
);

export const fulfillmentPromiseCapacityValidator = vine.compile(
    vine.object({
        service_date: vine
            .string()
            .trim()
            .fixedLength(10)
            .regex(/^\d{4}-\d{2}-\d{2}$/),
        window_start_local: time,
        window_end_local: time,
        capacity_units: vine.number().min(0).max(100000000).withoutDecimals(),
        status: vine.enum(["open", "closed", "paused"] as const),
        reason,
    }),
);

export const fulfillmentPromiseServiceProfileValidator = vine.compile(
    vine.object({
        shipping_zone_method_id: vine.number().positive().withoutDecimals(),
        status: vine.enum(["active", "paused", "archived"] as const),
        transit_minutes_p50: vine.number().min(0).max(100800).withoutDecimals(),
        transit_minutes_p90: vine.number().min(0).max(100800).withoutDecimals(),
        calibration_sample_count: vine.number().min(0).max(100000000).withoutDecimals(),
        minimum_sample_count: vine.number().min(1).max(1000000).withoutDecimals(),
        confidence_bps: vine.number().min(0).max(10000).withoutDecimals(),
        max_calibration_age_hours: vine.number().min(1).max(8760).withoutDecimals(),
        last_calibrated_at: isoDate.optional(),
        service_weekdays: vine.array(vine.number().min(1).max(7).withoutDecimals()).minLength(1).maxLength(7),
        metadata: jsonRecord,
        reason,
    }),
);

export const fulfillmentPromiseTransferLaneValidator = vine.compile(
    vine.object({
        from_node_public_id: publicId,
        to_node_public_id: publicId,
        status: vine.enum(["active", "paused", "archived"] as const),
        transfer_minutes_p90: vine.number().min(0).max(100800).withoutDecimals(),
        cost_minor: vine.number().min(0).withoutDecimals(),
        confidence_bps: vine.number().min(0).max(10000).withoutDecimals(),
        calibration_sample_count: vine.number().min(0).max(100000000).withoutDecimals(),
        last_calibrated_at: isoDate.optional(),
        reason,
    }),
);

export const fulfillmentPromiseAccessPresetValidator = vine.compile(
    vine.object({
        user_id: vine.number().positive().withoutDecimals(),
        preset: vine.enum(["owner", "operations", "warehouse", "logistics", "analyst", "viewer"] as const),
        reason,
    }),
);
