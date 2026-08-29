const baselineSecurityHeaders = [
    {
        key: "Content-Security-Policy",
        value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "X-Frame-Options",
        value: "DENY",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
];

const productionSecurityHeaders =
    process.env.NODE_ENV === "production"
        ? [
              {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
              },
          ]
        : [];

export const nextSecurityHeaders = [...baselineSecurityHeaders, ...productionSecurityHeaders];

export const nextSecurityHeaderRules = [
    {
        source: "/:path*",
        headers: nextSecurityHeaders,
    },
];
