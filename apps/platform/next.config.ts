import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const securityHeaders = [
    { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
        : []),
] as const;

const nextConfig: NextConfig = {
    /** Self-contained server bundle for the Dockerfile; do not change without rewriting it. */
    output: "standalone",
    reactStrictMode: true,
    /**
     * `@calibra/shared` and `@calibra/panel-kit` ship as raw TS source — Next compiles them like
     * any local file via `transpilePackages`, and `@tailwindcss/postcss` then scans the compiled
     * output for utility classes. This is the whole mechanism that styles panel-kit primitives;
     * there is no `@source` directive. Drop panel-kit here and its primitives render unstyled.
     */
    transpilePackages: ["@calibra/shared", "@calibra/panel-kit"],
    /**
     * Allow dev-server cross-origin requests from the per-spin Caddy hostname. The control plane is
     * a single global host (NOT per-tenant), reached at `https://console.<slug>.spin.localhost:<caddyHttps>`
     * in a spin and `console.localhost:<port>` directly. Next's glob `*` matches one dot-less label,
     * so `*.spin.localhost` catches `console.spin.localhost` and `*.*.spin.localhost` catches
     * `console.<slug>.spin.localhost`. `NEXT_DEV_ALLOWED_ORIGINS` (emitted by spin) is merged in.
     */
    allowedDevOrigins: [
        "*.spin.localhost",
        "*.*.spin.localhost",
        "console.localhost",
        ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? []),
    ],
    async headers() {
        return [{ source: "/:path*", headers: [...securityHeaders] }];
    },
    /**
     * Pin Turbopack's workspace root to the monorepo this `apps/platform` lives in, so a nested
     * worktree (`.claude/worktrees/<slug>/apps/platform`) doesn't make Turbopack pick the outer
     * workspace and serve stale files from the wrong tree.
     */
    turbopack: {
        root: path.resolve(import.meta.dirname, "../.."),
    },
};

export default withNextIntl(nextConfig);
