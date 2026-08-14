import { afterEach, describe, expect, it, vi } from "vitest";

import { apiMutate } from "./api-client";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("apiMutate financial idempotency", () => {
    it("reuses the refund key after an ambiguous transport failure", async () => {
        vi.stubGlobal("document", { cookie: "admin_csrf=test-csrf" });
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(new TypeError("network disconnected"))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ data: { id: 1 } }), {
                    status: 201,
                    headers: { "content-type": "application/json" },
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const options = { locale: "fa", body: { amount_minor: 500_000, reason: "operator adjustment" } };
        await expect(apiMutate("POST", "orders/42/refunds", options)).rejects.toThrow("network disconnected");
        await expect(apiMutate("POST", "orders/42/refunds", options)).resolves.toEqual({ data: { id: 1 } });

        const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
        const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
        expect(firstHeaders["idempotency-key"]).toBeTruthy();
        expect(secondHeaders["idempotency-key"]).toBe(firstHeaders["idempotency-key"]);
    });

    it("rotates the automatic key when the logical refund payload changes", async () => {
        vi.stubGlobal("document", { cookie: "admin_csrf=test-csrf" });
        const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network disconnected"));
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            apiMutate("POST", "orders/77/refunds", { locale: "fa", body: { amount_minor: 100_000, reason: "first" } }),
        ).rejects.toThrow();
        await expect(
            apiMutate("POST", "orders/77/refunds", { locale: "fa", body: { amount_minor: 200_000, reason: "second" } }),
        ).rejects.toThrow();

        const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
        const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
        expect(firstHeaders["idempotency-key"]).toBeTruthy();
        expect(secondHeaders["idempotency-key"]).toBeTruthy();
        expect(secondHeaders["idempotency-key"]).not.toBe(firstHeaders["idempotency-key"]);
    });
});
