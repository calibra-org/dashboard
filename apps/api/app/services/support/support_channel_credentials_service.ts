import encryption from "@adonisjs/core/services/encryption";

import { providerDefinition } from "#services/support/channel_catalog";
import { currentTenantId } from "#services/tenant_context";

export const SUPPORT_CREDENTIAL_MASK = "***";

type IntegrationRow = Record<string, unknown> & {
    channel?: unknown;
    provider_key?: unknown;
    credentials_ciphertext?: unknown;
};

export class SupportChannelCredentialsService {
    runtimeCredentials(row: IntegrationRow): Record<string, string> {
        const ciphertext = row.credentials_ciphertext;
        if (typeof ciphertext !== "string" || ciphertext.length === 0) return {};
        const decrypted = encryption.decrypt(ciphertext, this.purpose(row));
        if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) return {};
        return Object.fromEntries(
            Object.entries(decrypted as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
                .map(([key, value]) => [key, value]),
        );
    }

    applyPatch(
        row: IntegrationRow,
        incoming: Record<string, unknown> | undefined,
    ): {
        ciphertext: string | null;
        keys: string[];
        changed: boolean;
    } {
        const definition = providerDefinition(String(row.channel ?? ""), String(row.provider_key ?? ""));
        const allowed = new Set((definition?.credential_fields ?? []).map((field) => field.key));
        const previous = this.runtimeCredentials(row);
        const next = { ...previous };
        for (const [key, raw] of Object.entries(incoming ?? {})) {
            if (!allowed.has(key) || raw === SUPPORT_CREDENTIAL_MASK) continue;
            if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim().length === 0)) delete next[key];
            else next[key] = String(raw).trim();
        }
        const changed = JSON.stringify(previous) !== JSON.stringify(next);
        const keys = Object.keys(next).sort();
        if (keys.length === 0) return { ciphertext: null, keys, changed };
        if (!changed && typeof row.credentials_ciphertext === "string") {
            return { ciphertext: row.credentials_ciphertext, keys, changed: false };
        }
        return {
            ciphertext: encryption.encrypt(next, { purpose: this.purpose(row) }),
            keys,
            changed,
        };
    }

    missingRequired(row: IntegrationRow, credentials?: Record<string, string>): string[] {
        const definition = providerDefinition(String(row.channel ?? ""), String(row.provider_key ?? ""));
        const values = credentials ?? this.runtimeCredentials(row);
        return (definition?.credential_fields ?? [])
            .filter((field) => field.required)
            .map((field) => field.key)
            .filter((key) => !values[key]?.trim());
    }

    summary(row: IntegrationRow) {
        const credentials = this.runtimeCredentials(row);
        const definition = providerDefinition(String(row.channel ?? ""), String(row.provider_key ?? ""));
        return {
            configured: this.missingRequired(row, credentials).length === 0 && Boolean(definition?.production_available),
            fields: (definition?.credential_fields ?? []).map((field) => ({
                key: field.key,
                configured: Boolean(credentials[field.key]),
                value: credentials[field.key] ? SUPPORT_CREDENTIAL_MASK : "",
            })),
        };
    }

    encryptApiWebhookSecret(secret: string, subscriptionId: number | string): string {
        return encryption.encrypt(secret, { purpose: `support-api-webhook:${currentTenantId()}:${subscriptionId}:v1` });
    }

    decryptApiWebhookSecret(ciphertext: string, subscriptionId: number | string): string | null {
        const value = encryption.decrypt(ciphertext, `support-api-webhook:${currentTenantId()}:${subscriptionId}:v1`);
        return typeof value === "string" ? value : null;
    }

    private purpose(row: IntegrationRow): string {
        return `support-channel:${currentTenantId()}:${String(row.channel ?? "unknown")}:${String(row.provider_key ?? "default")}:credentials:v1`;
    }
}

export const supportChannelCredentialsService = new SupportChannelCredentialsService();
