export type SecurityHeader = Readonly<{ key: string; value: string }>;

const contentSecurityPolicy = ["base-uri 'self'", "frame-ancestors 'none'", "object-src 'none'"].join("; ");

const baselineSecurityHeaders: readonly SecurityHeader[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

export function nextSecurityHeaders() {
    const headers = [
        ...baselineSecurityHeaders,
        ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
    ];

    return [
        {
            source: "/:path*",
            headers: headers.map(({ key, value }) => ({ key, value })),
        },
    ];
}
