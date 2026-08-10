from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


service_path = Path("apps/api/app/services/seo/search_engines.ts")
service = service_path.read_text()
service = replace_once(
    service,
    '''function inferredLocale(phrase: string): "fa" | "en" {
    /** Search webmaster APIs do not expose a content-language dimension. */
    return /[\\u0600-\\u06FF]/u.test(phrase) ? "fa" : "en";
}
''',
    '''function inferredLocale(phrase: string): "fa" | "en" {
    /** Search webmaster APIs do not expose a content-language dimension. */
    return /[\\u0600-\\u06FF]/u.test(phrase) ? "fa" : "en";
}

function redactProviderError(message: string, secret: string): string {
    const sensitive = new Set<string>([secret]);
    try {
        const parsed = JSON.parse(secret) as unknown;
        if (parsed && typeof parsed === "object") {
            const record = parsed as JsonObject;
            for (const key of ["access_token", "refresh_token", "client_secret", "client_id"]) {
                const value = stringValue(record[key]);
                if (value && value.length >= 4) sensitive.add(value);
            }
        }
    } catch {
        /** Plain token/API-key secrets are already covered by the full secret value. */
    }
    let redacted = message;
    for (const value of sensitive) redacted = redacted.split(value).join("[REDACTED]");
    return redacted;
}
''',
    "provider secret redaction helper",
)
service = replace_once(
    service,
    '''    if (!bundle) return secret;
    const accessToken = stringValue(bundle.access_token);
    if (accessToken) return accessToken;

    const clientId = stringValue(bundle.client_id);
    const clientSecret = stringValue(bundle.client_secret);
    const refreshToken = stringValue(bundle.refresh_token);
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Google credential JSON must contain access_token or client_id/client_secret/refresh_token");
    }

    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
    });
    const payload = (await jsonRequest("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    })) as { access_token?: string };
    const refreshed = stringValue(payload.access_token);
    if (!refreshed) throw new Error("Google OAuth refresh succeeded without an access_token");
    return refreshed;''',
    '''    if (!bundle) return secret;
    const accessToken = stringValue(bundle.access_token);
    const clientId = stringValue(bundle.client_id);
    const clientSecret = stringValue(bundle.client_secret);
    const refreshToken = stringValue(bundle.refresh_token);

    /** Prefer a refresh flow when the long-lived bundle is available. */
    if (clientId && clientSecret && refreshToken) {
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        });
        const payload = (await jsonRequest("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        })) as { access_token?: string };
        const refreshed = stringValue(payload.access_token);
        if (!refreshed) throw new Error("Google OAuth refresh succeeded without an access_token");
        return refreshed;
    }
    if (accessToken) return accessToken;
    throw new Error("Google credential JSON must contain access_token or client_id/client_secret/refresh_token");''',
    "Google refresh-first credential behavior",
)
service = replace_once(
    service,
    '''    const end = DateTime.utc().minus({ days: 1 }).toISODate()!;
    const start = DateTime.fromISO(end)
        .minus({ days: days - 1 })
        .toISODate()!;''',
    '''    /** Search Console interprets date boundaries in Pacific Time. */
    const end = DateTime.now().setZone("America/Los_Angeles").minus({ days: 1 }).toISODate()!;
    const start = DateTime.fromISO(end, { zone: "America/Los_Angeles" })
        .minus({ days: days - 1 })
        .toISODate()!;''',
    "Google Pacific date boundaries",
)
service = replace_once(
    service,
    '''    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;

    /** Fail before submission when the public proof file cannot validate this key. */
    const proof = await textRequest(keyLocation);''',
    '''    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;
    const proofUrl = new URL(keyLocation);
    if (proofUrl.protocol !== "https:" && proofUrl.protocol !== "http:") {
        throw new Error("IndexNow keyLocation must use HTTP or HTTPS");
    }
    if (proofUrl.hostname.toLowerCase() !== siteHostname) {
        throw new Error("IndexNow keyLocation must be hosted on the same hostname as the submitted site");
    }
    const pathSegments = proofUrl.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== 1) {
        throw new Error("This connector submits the site root, so IndexNow keyLocation must be a root-level proof file");
    }

    /** Fail before submission when the public proof file cannot validate this key. */
    const proof = await textRequest(proofUrl.toString());''',
    "IndexNow same-host root proof",
)
service = replace_once(
    service,
    '''            const message = error instanceof Error ? error.message : String(error);
            const safeMessage = message.split(secret).join("[REDACTED]");''',
    '''            const message = error instanceof Error ? error.message : String(error);
            const safeMessage = redactProviderError(message, secret);''',
    "provider error redaction",
)
service_path.write_text(service)

ui_path = Path("apps/admin/src/features/seo/workspace.tsx")
ui = ui_path.read_text()
ui = replace_once(
    ui,
    '''    const [keyLocation, setKeyLocation] = useState(String(item.configuration.key_location ?? ""));
    return (''',
    '''    const [keyLocation, setKeyLocation] = useState(String(item.configuration.key_location ?? ""));
    const syncEvidence =
        item.configuration.last_sync_evidence && typeof item.configuration.last_sync_evidence === "object"
            ? (item.configuration.last_sync_evidence as Record<string, unknown>)
            : null;
    return (''',
    "sync evidence state",
)
ui = replace_once(
    ui,
    '''            {item.last_synced_at ? (
                <p className="mt-2 text-muted-foreground text-xs">
                    آخرین پاسخ موفق: {new Date(item.last_synced_at).toLocaleString("fa-IR")}
                </p>
            ) : null}
            {item.last_error ? (''',
    '''            {item.last_synced_at ? (
                <p className="mt-2 text-muted-foreground text-xs">
                    آخرین پاسخ موفق: {new Date(item.last_synced_at).toLocaleString("fa-IR")}
                </p>
            ) : null}
            {syncEvidence ? (
                <p dir="ltr" className="mt-2 break-words rounded-md bg-muted/60 p-2 text-muted-foreground text-xs">
                    Evidence: {formatSyncEvidence(syncEvidence)}
                </p>
            ) : null}
            {item.last_error ? (''',
    "sync evidence display",
)
marker = '''function providerLabel(provider: string) {'''
if marker not in ui:
    raise SystemExit("providerLabel marker missing")
helper = '''function formatSyncEvidence(evidence: Record<string, unknown>) {
    const preferred = [
        "mode",
        "imported",
        "checked",
        "found",
        "submitted",
        "target",
        "property",
        "host_id",
        "status_code",
        "verification_pending",
    ];
    const parts = preferred.flatMap((key) => {
        const value = evidence[key];
        return value === null || value === undefined || typeof value === "object" ? [] : [`${key}=${String(value)}`];
    });
    return parts.length > 0 ? parts.join(" · ") : "provider response verified";
}

'''
ui = ui.replace(marker, helper + marker, 1)
ui_path.write_text(ui)

verifier_path = Path("scripts/verify-seo-search-engines.mjs")
verifier = verifier_path.read_text()
verifier = replace_once(
    verifier,
    '''contains(serviceFile, 'split(secret).join("[REDACTED]")', "Provider errors must redact runtime secrets");''',
    '''contains(serviceFile, "redactProviderError", "Provider errors must redact runtime secrets and credential bundle fields");''',
    "verifier redaction invariant",
)
verifier = replace_once(
    verifier,
    '''contains(serviceFile, "IndexNow key file does not exactly match", "IndexNow must verify the public proof file before submission");''',
    '''contains(serviceFile, "IndexNow key file does not exactly match", "IndexNow must verify the public proof file before submission");
contains(serviceFile, "same hostname as the submitted site", "IndexNow proof fetch must be same-host to avoid SSRF and scope mistakes");
contains(serviceFile, "America/Los_Angeles", "Google Search Console date windows must follow Pacific Time semantics");''',
    "verifier provider precision invariants",
)
verifier = replace_once(
    verifier,
    '''contains(
    migrationFile,
    "ALTER COLUMN country TYPE varchar(3)",
    "Google Search Console alpha-3 country values must fit the schema",
);''',
    '''contains(
    migrationFile,
    "ALTER COLUMN country TYPE varchar(3)",
    "Google Search Console alpha-3 country values must fit the schema",
);
contains(
    migrationFile,
    "device IN ('all','desktop','mobile','tablet')",
    "Database device constraint must allow truthful aggregate provider observations",
);''',
    "verifier device constraint",
)
verifier_path.write_text(verifier)

docs_path = Path("docs/seo-integration/SEARCH_ENGINES_REAL_INTEGRATIONS_FA.md")
docs = docs_path.read_text()
docs = docs.replace(
    "- Search Analytics را با ابعاد `query`, `device`, `country` می‌خواند.\n",
    "- Search Analytics را با ابعاد `query`, `device`, `country` و بازه تاریخ بر اساس Pacific Time می‌خواند.\n",
    1,
)
docs = docs.replace(
    "- `keyLocation` عمومی Fetch می‌شود.\n",
    "- `keyLocation` عمومی Fetch می‌شود و برای جلوگیری از SSRF/Scope اشتباه باید روی همان Host و در Root سایت باشد.\n",
    1,
)
docs_path.write_text(docs)
