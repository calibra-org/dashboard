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
    '        credentialKind: "oauth_access_token",',
    '        credentialKind: "oauth_access_token_or_refresh_bundle",',
    "google credential kind",
)
service = replace_once(
    service,
    '''async function textRequest(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<{ status: number; body: string }> {''',
    '''async function resolveGoogleAccessToken(secret: string): Promise<string> {
    let bundle: JsonObject | null = null;
    try {
        const parsed = JSON.parse(secret) as unknown;
        if (parsed && typeof parsed === "object") bundle = parsed as JsonObject;
    } catch {
        /** A plain string is treated as an already-issued OAuth access token. */
    }

    if (!bundle) return secret;
    const accessToken = stringValue(bundle.access_token);
    if (accessToken) return accessToken;

    const clientId = stringValue(bundle.client_id);
    const clientSecret = stringValue(bundle.client_secret);
    const refreshToken = stringValue(bundle.refresh_token);
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            "Google credential JSON must contain access_token or client_id/client_secret/refresh_token",
        );
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
    return refreshed;
}

async function textRequest(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<{ status: number; body: string }> {''',
    "google refresh helper",
)
service = replace_once(
    service,
    '''async function syncGoogle(configuration: JsonObject, token: string) {
    const siteUrl = await resolveGoogleProperty(configuration, token);''',
    '''async function syncGoogle(configuration: JsonObject, secret: string) {
    const token = await resolveGoogleAccessToken(secret);
    const siteUrl = await resolveGoogleProperty(configuration, token);''',
    "google refreshed token use",
)
service_path.write_text(service)

ui_path = Path("apps/admin/src/features/seo/workspace.tsx")
ui = ui_path.read_text()
ui = replace_once(
    ui,
    '''    const [envRef, setEnvRef] = useState(item.credential_env_ref ?? "");
    return (''',
    '''    const [envRef, setEnvRef] = useState(item.credential_env_ref ?? "");
    const supportsKeyLocation = item.provider === "naver_search_advisor" || item.provider === "seznam_indexnow";
    const [keyLocation, setKeyLocation] = useState(String(item.configuration.key_location ?? ""));
    return (''',
    "IndexNow UI state",
)
ui = replace_once(
    ui,
    '''            <Input
                dir="ltr"
                className="mt-3 h-8 text-xs"
                value={envRef}
                onChange={(event) => setEnvRef(event.target.value)}
                placeholder="ENV_VARIABLE_NAME"
            />
            {item.last_synced_at ? (''',
    '''            <Input
                dir="ltr"
                className="mt-3 h-8 text-xs"
                value={envRef}
                onChange={(event) => setEnvRef(event.target.value)}
                placeholder="ENV_VARIABLE_NAME"
            />
            {supportsKeyLocation ? (
                <Input
                    dir="ltr"
                    className="mt-2 h-8 text-xs"
                    value={keyLocation}
                    onChange={(event) => setKeyLocation(event.target.value)}
                    placeholder="https://example.com/<INDEXNOW_KEY>.txt"
                />
            ) : null}
            {item.last_synced_at ? (''',
    "IndexNow key-location input",
)
ui = replace_once(
    ui,
    '''                        configuration: item.configuration,
                    })''',
    '''                        configuration: {
                            ...item.configuration,
                            ...(supportsKeyLocation ? { key_location: keyLocation || undefined } : {}),
                        },
                    })''',
    "IndexNow key-location save",
)
ui_path.write_text(ui)
