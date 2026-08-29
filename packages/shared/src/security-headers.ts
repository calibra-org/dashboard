export type SecurityHeader = Readonly<{ key: string; value: string }>;

export type NextSecurityHeadersOptions = Readonly<{
    formActionSelf?: boolean;
    hstsIncludeSubDomains?: boolean;
}>;

export function nextSecurityHeaders(options: NextSecurityHeadersOptions = {}) {
    const contentSecurityPolicy = [
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        ...(options.formActionSelf ? ["form-action 'self'"] : []),
    ].join("; ");

    const baselineSecurityHeaders: readonly SecurityHeader[] = [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    const hstsValue = options.hstsIncludeSubDomains
        ? "max-age=31536000; includeSubDomains"
        : "max-age=31536000";

    const headers = [
        ...baselineSecurityHeaders,
        ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: hstsValue }]
            : []),
    ];

    return [
        {
            source: "/:path*",
            headers: headers.map(({ key, value }) => ({ key, value })),
        },
    ];
}
