import vine from "@vinejs/vine";

export const customerSegmentDefinitionValidator = vine.compile(
    vine.object({
        kind: vine.enum(["rule_based", "rfm", "cohort", "lifecycle", "predictive"] as const),
        definition: vine.any(),
        refresh_policy: vine.enum(["manual", "event_driven"] as const),
    }),
);
