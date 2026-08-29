export type SecurityHeader = Readonly<{ key: string; value: string }>;

const contentSecurityPolicy = ["base-uri 'self'", "frame-ancestors 'none'", "object-src 'none'"].join("; ");

export const productionSecurityHeaders: readonly SecurityHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export function nextSecurityHeaders() {
    return [
        {
            source: "/:path*",
            headers: productionSecurityHeaders.map(({ key, value }) => ({ key, value })),
        },
    ];
}
