import { expect, type Page, type Response, test } from "@playwright/test";

function requiredEnv(name: "ADMIN_LOGIN_EMAIL" | "ADMIN_LOGIN_PASSWORD"): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for the authenticated Admin UI audit`);
    return value;
}

const VIEWPORTS = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
] as const;

const MAX_SCREENSHOTS = 20;

async function login(page: Page, path = "/login") {
    await page.goto(path);
    if (!page.url().includes("/login")) return;

    await page.getByLabel(/ایمیل|email/i).fill(requiredEnv("ADMIN_LOGIN_EMAIL"));
    await page.getByLabel(/رمز|password/i).fill(requiredEnv("ADMIN_LOGIN_PASSWORD"));
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard\/?$/);
}

async function discoverAdminRoutes(page: Page): Promise<string[]> {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    await page.goto("/dashboard");

    const collapsed = page.locator('aside nav button[aria-expanded="false"]');
    while ((await collapsed.count()) > 0) {
        await collapsed.first().click();
    }

    const hrefs = await page.locator("aside nav a[href]").evaluateAll((links) =>
        links
            .map((link) => link.getAttribute("href"))
            .filter((href): href is string => Boolean(href))
            .map((href) => new URL(href, window.location.origin).pathname),
    );

    return [...new Set(hrefs)].sort();
}

function isRelevantApiFailure(response: Response): boolean {
    if (response.status() < 400) return false;
    const url = new URL(response.url());
    return url.pathname.startsWith("/api/admin/");
}

function safeAttachmentName(value: string): string {
    return value.replace(/^\/+/, "").replace(/[^a-zA-Z0-9._-]+/g, "-") || "root";
}

test("authenticated admin routes survive desktop and mobile UI audit", async ({ page }, testInfo) => {
    test.setTimeout(20 * 60_000);

    const routes = await discoverAdminRoutes(page);
    expect(routes.length, "Sidebar route discovery should find the admin navigation").toBeGreaterThan(20);

    const findings: string[] = [];
    let screenshotCount = 0;

    for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        for (const path of routes) {
            await test.step(`${viewport.name} ${path}`, async () => {
                const routeFindings: string[] = [];
                const consoleErrors: string[] = [];
                const pageErrors: string[] = [];
                const apiFailures: string[] = [];

                const onConsole = (message: { type(): string; text(): string }) => {
                    if (message.type() === "error") consoleErrors.push(message.text());
                };
                const onPageError = (error: Error) => pageErrors.push(error.message);
                const onResponse = (response: Response) => {
                    if (isRelevantApiFailure(response)) {
                        apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
                    }
                };

                page.on("console", onConsole);
                page.on("pageerror", onPageError);
                page.on("response", onResponse);

                try {
                    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
                    if (!response) routeFindings.push("navigation returned no document response");
                    else if (response.status() >= 400) routeFindings.push(`document HTTP ${response.status()}`);

                    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => undefined);
                    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });

                    if (page.url().includes("/login")) routeFindings.push("unexpected redirect to /login");
                    if ((await page.locator("body").innerText()).trim().length === 0) routeFindings.push("empty body");

                    const lang = await page.locator("html").getAttribute("lang");
                    const dir = await page.locator("html").getAttribute("dir");
                    if (lang !== "fa") routeFindings.push(`html lang=${lang ?? "missing"}; expected fa`);
                    if (dir !== "rtl") routeFindings.push(`html dir=${dir ?? "missing"}; expected rtl`);

                    const overflow = await page.evaluate(() => ({
                        documentWidth: document.documentElement.scrollWidth,
                        viewportWidth: document.documentElement.clientWidth,
                    }));
                    if (overflow.documentWidth > overflow.viewportWidth + 2) {
                        routeFindings.push(`horizontal overflow ${overflow.documentWidth}px > ${overflow.viewportWidth}px`);
                    }

                    if (pageErrors.length > 0) routeFindings.push(`page errors: ${pageErrors.join(" | ")}`);
                    if (consoleErrors.length > 0) routeFindings.push(`console errors: ${consoleErrors.join(" | ")}`);
                    if (apiFailures.length > 0) routeFindings.push(`admin API failures: ${apiFailures.join(" | ")}`);

                    if (routeFindings.length > 0 && screenshotCount < MAX_SCREENSHOTS) {
                        screenshotCount += 1;
                        await testInfo.attach(`${viewport.name}-${safeAttachmentName(path)}.png`, {
                            body: await page.screenshot({ fullPage: true }),
                            contentType: "image/png",
                        });
                    }
                } catch (error) {
                    routeFindings.push(`audit exception: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    page.off("console", onConsole);
                    page.off("pageerror", onPageError);
                    page.off("response", onResponse);
                }

                for (const finding of routeFindings) {
                    findings.push(`[${viewport.name}] ${path}: ${finding}`);
                }
            });
        }
    }

    await testInfo.attach("ui-audit-findings.txt", {
        body: Buffer.from(findings.length > 0 ? findings.join("\n") : "No findings\n", "utf8"),
        contentType: "text/plain",
    });

    expect(findings, `UI audit found ${findings.length} issue(s):\n${findings.join("\n")}`).toEqual([]);
});

test("mobile shell exposes an operable navigation path", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/dashboard");

    const menuTrigger = page.getByRole("button", { name: /menu|navigation|منو|ناوبری/i });
    const sidebar = page.locator("#admin-primary-navigation");

    await expect(menuTrigger).toBeVisible();
    await expect(menuTrigger).toHaveAttribute("aria-expanded", "false");
    await menuTrigger.click();
    await expect(menuTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator("nav a[href]").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menuTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar).toBeHidden();
    await expect(menuTrigger).toBeFocused();
});

test("English admin shell preserves LTR locale semantics", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page, "/en/login");
    await page.goto("/en/dashboard");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("body")).not.toBeEmpty();
});
