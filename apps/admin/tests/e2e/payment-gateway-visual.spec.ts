import { expect, test } from "@playwright/test";

const EMAIL = process.env.ADMIN_LOGIN_EMAIL;
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD;

if (!EMAIL || !PASSWORD) throw new Error("ADMIN_LOGIN_EMAIL and ADMIN_LOGIN_PASSWORD are required for the visual capture");

test("captures the real payment gateway control center and Mellat configuration", async ({ page }) => {
    await page.goto("/fa/login");
    await page.getByLabel(/ایمیل|email/i).fill(EMAIL);
    await page.getByLabel(/رمز|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard/);

    await page.goto("/fa/payments");
    await expect(page.getByRole("heading", { name: "درگاه پرداخت" })).toBeVisible();
    await expect(page.getByText("به‌پرداخت ملت").first()).toBeVisible();
    await expect(page.getByText("سداد بانک ملی").first()).toBeVisible();
    await expect(page.getByText("تجارت الکترونیک پارسیان").first()).toBeVisible();
    await page.screenshot({ path: "test-results/payment-gateways.png", fullPage: true });

    await page.goto("/fa/payments/mellat");
    await expect(page.getByLabel(/شماره ترمینال/)).toBeVisible();
    await expect(page.getByLabel(/نام کاربری/)).toBeVisible();
    await expect(page.getByLabel(/رمز عبور/)).toBeVisible();
    await page.screenshot({ path: "test-results/payment-gateway-mellat.png", fullPage: true });
});
