import { expect, test } from "@playwright/test";

test.describe("Phase 24 synthetic commerce lab", () => {
    test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

    test("renders the isolated pre-production control plane", async ({ page }) => {
        await page.goto("/fa/analytics/pre-production-lab");
        await expect(page.getByRole("heading", { name: "آزمایشگاه پیش‌انتشار" })).toBeVisible();
        await expect(page.getByText("SYNTHETIC ONLY")).toBeVisible();
        await expect(page.getByText("Provider Stubbed")).toBeVisible();
        await expect(page.getByText("Analytics Isolated")).toBeVisible();
    });
});
