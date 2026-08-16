import { createHash, randomBytes } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import encryption from "@adonisjs/core/services/encryption";

import { providerDefinition, type SupportChannel } from "#services/support/channel_catalog";
import { supportChannelCredentialsService } from "#services/support/support_channel_credentials_service";
import { currentTrx } from "#services/tenant_context";

type Row = Record<string, unknown>;

function sha256(value: string) {
    return createHash("sha256").update(value).digest("hex");
}
function challenge(verifier: string) {
    return createHash("sha256").update(verifier).digest("base64url");
}
function objectValue(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        } catch {}
    }
    return {};
}
function stringValue(value: unknown, label: string) {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result) throw new Exception(`${label} is required`, { status: 422, code: "E_SUPPORT_OAUTH_CONFIGURATION" });
    return result;
}

export class SupportChannelOAuthService {
    async begin(channel: SupportChannel, origin: string, actorUserId: number, returnPath = "/fa/tickets/channels") {
        const row = (await currentTrx().from("support_channel_integrations").where("channel", channel).first()) as
            | Row
            | undefined;
        if (!row)
            throw new Exception("Support integration is not configured", { status: 404, code: "E_SUPPORT_CHANNEL_NOT_FOUND" });
        const providerKey = String(row.provider_key ?? "");
        const definition = providerDefinition(channel, providerKey);
        if (!definition || definition.auth_model !== "oauth2" || !definition.production_available)
            throw new Exception("OAuth is not available for this provider", { status: 422, code: "E_SUPPORT_OAUTH_UNAVAILABLE" });
        if (providerKey !== "gmail_api" && providerKey !== "microsoft_graph_mail")
            throw new Exception("Interactive OAuth is not implemented for this provider", {
                status: 422,
                code: "E_SUPPORT_OAUTH_UNAVAILABLE",
            });
        const credentials = supportChannelCredentialsService.runtimeCredentials(row);
        const clientId = stringValue(credentials.client_id, "OAuth client_id");
        const state = randomBytes(32).toString("base64url");
        const verifier = randomBytes(48).toString("base64url");
        const redirectUri = `${origin.replace(/\/$/, "")}/api/v1/support/oauth/${encodeURIComponent(channel)}/callback`;
        const safeReturnPath =
            returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath.slice(0, 512) : "/fa/tickets/channels";
        const [session] = await currentTrx()
            .table("support_channel_oauth_sessions")
            .insert({
                integration_id: row.id,
                provider_key: providerKey,
                state_hash: sha256(state),
                pkce_verifier_ciphertext: encryption.encrypt(verifier, { purpose: `support-oauth:${String(row.id)}:pkce:v1` }),
                redirect_uri: redirectUri,
                return_path: safeReturnPath,
                expires_at: new Date(Date.now() + 10 * 60_000),
                created_by_user_id: actorUserId,
            })
            .returning("*");

        let authorizationUrl: URL;
        if (providerKey === "gmail_api") {
            authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
            authorizationUrl.searchParams.set("client_id", clientId);
            authorizationUrl.searchParams.set("redirect_uri", redirectUri);
            authorizationUrl.searchParams.set("response_type", "code");
            authorizationUrl.searchParams.set("access_type", "offline");
            authorizationUrl.searchParams.set("prompt", "consent");
            authorizationUrl.searchParams.set(
                "scope",
                "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
            );
        } else {
            const configuration = objectValue(row.configuration);
            const tenant = stringValue(configuration.tenant, "Microsoft tenant");
            authorizationUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
            authorizationUrl.searchParams.set("client_id", clientId);
            authorizationUrl.searchParams.set("redirect_uri", redirectUri);
            authorizationUrl.searchParams.set("response_type", "code");
            authorizationUrl.searchParams.set("response_mode", "query");
            authorizationUrl.searchParams.set("scope", "offline_access Mail.Read Mail.Send User.Read");
        }
        authorizationUrl.searchParams.set("state", state);
        authorizationUrl.searchParams.set("code_challenge", challenge(verifier));
        authorizationUrl.searchParams.set("code_challenge_method", "S256");
        return {
            data: {
                session_id: Number(session.id),
                authorization_url: authorizationUrl.toString(),
                expires_at: session.expires_at,
            },
        };
    }

    async callback(channel: SupportChannel, state: string, code: string) {
        if (!state || !code)
            throw new Exception("OAuth callback is incomplete", { status: 422, code: "E_SUPPORT_OAUTH_CALLBACK" });
        const session = (await currentTrx()
            .from("support_channel_oauth_sessions")
            .where("state_hash", sha256(state))
            .whereNull("used_at")
            .where("expires_at", ">", new Date())
            .forUpdate()
            .first()) as Row | undefined;
        if (!session) throw new Exception("OAuth state is invalid or expired", { status: 401, code: "E_SUPPORT_OAUTH_STATE" });
        const integration = (await currentTrx()
            .from("support_channel_integrations")
            .where("id", Number(session.integration_id))
            .where("channel", channel)
            .first()) as Row | undefined;
        if (!integration || String(integration.provider_key) !== String(session.provider_key))
            throw new Exception("OAuth integration changed during authorization", {
                status: 409,
                code: "E_SUPPORT_OAUTH_CHANGED",
            });
        const verifier = encryption.decrypt(
            String(session.pkce_verifier_ciphertext),
            `support-oauth:${String(integration.id)}:pkce:v1`,
        );
        if (typeof verifier !== "string")
            throw new Exception("OAuth verifier could not be decrypted", { status: 500, code: "E_SUPPORT_OAUTH_VERIFIER" });
        const stored = supportChannelCredentialsService.runtimeCredentials(integration);
        const clientId = stringValue(stored.client_id, "OAuth client_id");
        const clientSecret = stringValue(stored.client_secret, "OAuth client_secret");
        const providerKey = String(integration.provider_key);
        let tokenUrl = "";
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: String(session.redirect_uri),
            grant_type: "authorization_code",
            code_verifier: verifier,
        });
        if (providerKey === "gmail_api") tokenUrl = "https://oauth2.googleapis.com/token";
        else if (providerKey === "microsoft_graph_mail") {
            const tenant = stringValue(objectValue(integration.configuration).tenant, "Microsoft tenant");
            tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
            params.set("scope", "offline_access Mail.Read Mail.Send User.Read");
        } else throw new Exception("OAuth provider is unsupported", { status: 422, code: "E_SUPPORT_OAUTH_UNAVAILABLE" });
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
            body: params.toString(),
            signal: AbortSignal.timeout(15_000),
        });
        const token = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok || typeof token.refresh_token !== "string" || !token.refresh_token)
            throw new Exception("OAuth token exchange failed or did not return an offline refresh token", {
                status: 502,
                code: "E_SUPPORT_OAUTH_TOKEN",
            });
        const patch = supportChannelCredentialsService.applyPatch(integration, { refresh_token: token.refresh_token });
        const expiresIn = Number(token.expires_in ?? 0);
        await currentTrx()
            .from("support_channel_integrations")
            .where("id", Number(integration.id))
            .update({
                credentials_ciphertext: patch.ciphertext,
                credential_keys: JSON.stringify(patch.keys),
                token_expires_at: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
                last_rotated_at: new Date(),
                status: "configured",
                last_error: null,
                updated_at: new Date(),
            });
        await currentTrx().from("support_channel_oauth_sessions").where("id", Number(session.id)).update({ used_at: new Date() });
        return {
            provider_key: providerKey,
            integration_id: Number(integration.id),
            return_path: String(session.return_path ?? "/fa/tickets/channels"),
        };
    }
}

export const supportChannelOAuthService = new SupportChannelOAuthService();
