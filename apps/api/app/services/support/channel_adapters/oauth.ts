import { ProviderAdapterError } from "#services/support/channel_adapters/adapter";

export async function refreshOAuthToken(
    url: string,
    form: Record<string, string>,
): Promise<{ accessToken: string; expiresIn?: number; refreshToken?: string }> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(12_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof payload.access_token !== "string") {
        throw new ProviderAdapterError(
            "E_PROVIDER_OAUTH_REFRESH",
            `OAuth refresh failed (${response.status})`,
            response.status === 429 ? 429 : 502,
        );
    }
    return {
        accessToken: payload.access_token,
        expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
        refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    };
}
