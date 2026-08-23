import { expect, test } from "@playwright/test";

test.describe("Phase 25 growth portfolio", () => {
    test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

    test("renders the governed portfolio operator surface", async ({ page }) => {
        await page.goto("/fa/analytics/growth-portfolio");
        await expect(page.getByRole("heading", { name: "موتور سبد رشد" })).toBeVisible();
        await expect(page.getByText("PORTFOLIO FIRST")).toBeVisible();
        await expect(page.getByText("Candidate management")).toBeVisible();
        await expect(page.getByText("Dynamic Rebalance")).toBeVisible();
        await expect(page.getByText("Rebalance & Approval Ledger")).toBeVisible();
    });
});
