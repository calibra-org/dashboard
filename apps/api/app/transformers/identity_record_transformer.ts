import { BaseTransformer } from "@adonisjs/core/transformers";

/**
 * Transformer boundary for Phase 7 service DTOs. Identity services return intentionally redacted
 * plain records; this transformer keeps controller responses on the same explicit API edge used by
 * the rest of Calibra and prevents controllers from reaching back into raw database rows.
 */
export default class IdentityRecordTransformer extends BaseTransformer<Record<string, unknown>> {
    toObject() {
        return { ...this.resource };
    }
}
