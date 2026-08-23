import { test } from "@japa/runner";

import {
    assertMerchantMemoryPrivacyBoundary,
    type CreateMemoryInput,
    type MemorySensitivity,
} from "#services/phase26_merchant_memory_service";

function input(overrides: Partial<CreateMemoryInput> = {}, sourceSensitivity: MemorySensitivity = "aggregate"): CreateMemoryInput {
    return {
        memory_class: "campaign_lesson",
        title: "درس کمپین",
        context: "زمینه تصمیم",
        lesson: "درس قابل استفاده مجدد",
        confidence: 0.8,
        strength: 0.7,
        sensitivity: "aggregate",
        allowed_consumers: ["human"],
        relevant_from: "2026-08-01T00:00:00.000Z",
        sources: [
            {
                source_phase: "manual_reviewed",
                source_kind: "review",
                source_id: "review-1",
                label: "بازبینی انسانی",
                observed_at: "2026-08-01T00:00:00.000Z",
                sensitivity: sourceSensitivity,
            },
        ],
        ...overrides,
    };
}

function codeOf(fn: () => void) {
    try {
        fn();
    } catch (error) {
        return (error as { code?: string }).code;
    }
    return null;
}

test.group("Phase 26 merchant-memory privacy", () => {
    test("customer-sensitive evidence cannot be downgraded", ({ assert }) => {
        const code = codeOf(() => assertMerchantMemoryPrivacyBoundary(input({}, "customer_level_sensitive")));
        assert.equal(code, "E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE");
    });

    test("internal evidence cannot be downgraded to aggregate", ({ assert }) => {
        const code = codeOf(() => assertMerchantMemoryPrivacyBoundary(input({}, "internal")));
        assert.equal(code, "E_MERCHANT_MEMORY_SOURCE_SENSITIVITY_DOWNGRADE");
    });

    test("customer-sensitive memory is never agent-readable", ({ assert }) => {
        const code = codeOf(() =>
            assertMerchantMemoryPrivacyBoundary(
                input(
                    {
                        sensitivity: "customer_level_sensitive",
                        allowed_consumers: ["human", "agent"],
                        retention_class: "short",
                        expires_at: "2026-08-20T00:00:00.000Z",
                    },
                    "customer_level_sensitive",
                ),
            ),
        );
        assert.equal(code, "E_MERCHANT_MEMORY_AGENT_SENSITIVE_FORBIDDEN");
    });

    test("customer-sensitive memory requires short retention within 30 days", ({ assert }) => {
        const code = codeOf(() =>
            assertMerchantMemoryPrivacyBoundary(
                input(
                    {
                        sensitivity: "customer_level_sensitive",
                        allowed_consumers: ["human"],
                        retention_class: "standard",
                        expires_at: "2026-10-01T00:00:00.000Z",
                    },
                    "customer_level_sensitive",
                ),
            ),
        );
        assert.equal(code, "E_MERCHANT_MEMORY_SENSITIVE_RETENTION_REQUIRED");
    });
});
