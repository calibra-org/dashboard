import { test } from "@japa/runner";

import { simulateConditions, validateSource } from "#services/snippets/snippets_service";

const base = {
    language: "typescript" as const,
    runtime: "build" as const,
    conditions: { operator: "and", rules: [] },
    capabilities: [] as string[],
};

function errorCodes(source: string, overrides: Partial<Parameters<typeof validateSource>[0]> = {}) {
    return validateSource({ ...base, source, ...overrides }).errors.map((finding) => finding.code);
}

test.group("Snippets managed-artifact safety boundary", () => {
    test("rejects dynamic evaluation", ({ assert }) => {
        assert.include(errorCodes('eval("2 + 2")'), "source.dynamic_eval");
        assert.include(errorCodes('const fn = new Function("return 2")'), "source.dynamic_eval");
        assert.include(errorCodes('vm.runInNewContext("2 + 2")'), "source.dynamic_eval");
    });

    test("rejects process spawning and filesystem mutation", ({ assert }) => {
        assert.include(errorCodes('import { exec } from "child_process"; exec("whoami")'), "source.process_spawn");
        assert.include(errorCodes('writeFile("/tmp/value", "unsafe")'), "source.filesystem_mutation");
        assert.include(errorCodes('unlink("/tmp/value")'), "source.filesystem_mutation");
    });

    test("rejects browser secret access", ({ assert }) => {
        const validation = validateSource({
            ...base,
            runtime: "storefront",
            source: "const secret = process.env.SECRET_TOKEN",
        });
        assert.include(validation.errors.map((finding) => finding.code), "source.browser_secret_access");
    });

    test("requires trusted registry for dynamic server TypeScript artifacts", ({ assert }) => {
        const blocked = validateSource({ ...base, runtime: "server", source: "export const value = 1" });
        assert.include(blocked.errors.map((finding) => finding.code), "source.registry_required");

        const trusted = validateSource({
            ...base,
            runtime: "server",
            source: "export const value = 1",
            capabilities: ["trusted_registry"],
        });
        assert.notInclude(trusted.errors.map((finding) => finding.code), "source.registry_required");
        assert.isTrue(trusted.publishable);
    });

    test("rejects malformed JSON and accepts valid JSON", ({ assert }) => {
        const invalid = validateSource({
            ...base,
            language: "json",
            source: '{"enabled":',
        });
        assert.include(invalid.errors.map((finding) => finding.code), "source.invalid_json");

        const valid = validateSource({
            ...base,
            language: "json",
            source: '{"enabled":true}',
        });
        assert.isTrue(valid.publishable);
        assert.match(valid.checksum, /^[0-9a-f]{64}$/);
        assert.equal(valid.boundary, "managed_artifact_no_eval");
    });
});

test.group("Snippets declarative targeting", () => {
    test("matches an AND group only when every rule passes", ({ assert }) => {
        const conditions = {
            operator: "and",
            rules: [
                { field: "surface", op: "eq", value: "product" },
                { field: "locale", op: "in", value: ["fa", "en"] },
                { field: "path", op: "starts_with", value: "/products" },
            ],
        };

        const matched = simulateConditions(conditions, { surface: "product", locale: "fa", path: "/products/42" });
        assert.isTrue(matched.matched);
        assert.isEmpty(matched.errors);
        assert.isTrue(matched.checks.every((check) => check.matched));

        const missed = simulateConditions(conditions, { surface: "product", locale: "de", path: "/products/42" });
        assert.isFalse(missed.matched);
    });

    test("rejects unknown fields and operators instead of evaluating expressions", ({ assert }) => {
        const result = simulateConditions(
            {
                operator: "and",
                rules: [{ field: "arbitrary_expression", op: "execute", value: "process.exit()" }],
            },
            {},
        );
        assert.isFalse(result.matched);
        assert.isNotEmpty(result.errors);
        assert.includeMembers(
            result.errors.map((finding) => finding.code),
            ["conditions.field.0", "conditions.op.0"],
        );
    });

    test("supports OR and negative membership deterministically", ({ assert }) => {
        const result = simulateConditions(
            {
                operator: "or",
                rules: [
                    { field: "user_role", op: "eq", value: "admin" },
                    { field: "locale", op: "not_in", value: ["en", "de"] },
                ],
            },
            { user_role: "customer", locale: "fa" },
        );
        assert.isTrue(result.matched);
    });
});
