import encryption from "@adonisjs/core/services/encryption";

import type PaymentGateway from "#models/payment_gateway";
import { gatewayCredentialKeys, requiredGatewayCredentialKeys } from "#services/payment_gateway_catalog";

export const PAYMENT_CREDENTIAL_MASK = "***";

/**
 * Keeps merchant credentials out of `payment_gateways.settings`.
 *
 * Credentials are encrypted as one purpose-bound ChaCha20-Poly1305 payload using Adonis' configured
 * encryption manager. The purpose includes the stable gateway code, preventing ciphertext copied
 * from one provider row from being accepted as another provider's credentials. The service keeps a
 * legacy-read path for credentials that were historically stored in plaintext JSON, but the next
 * settings write migrates them into ciphertext and strips those keys from `settings`.
 */
export class PaymentGatewayCredentialsService {
    runtimeSettings(gateway: PaymentGateway): Record<string, unknown> {
        const publicSettings = { ...(((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>) };
        return { ...publicSettings, ...this.readCredentials(gateway) };
    }

    maskedSettings(gateway: PaymentGateway): Record<string, unknown> {
        const publicSettings = { ...(((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>) };
        const credentials = this.readCredentials(gateway);
        for (const key of gatewayCredentialKeys(gateway.code)) {
            const value = credentials[key];
            publicSettings[key] = typeof value === "string" && value.length > 0 ? PAYMENT_CREDENTIAL_MASK : "";
        }
        return publicSettings;
    }

    missingRequired(gateway: PaymentGateway, runtimeOverride?: Record<string, unknown>): string[] {
        const settings = runtimeOverride ?? this.runtimeSettings(gateway);
        return requiredGatewayCredentialKeys(gateway.code).filter((key) => {
            const value = settings[key];
            return typeof value !== "string" || value.trim().length === 0;
        });
    }

    /**
     * Applies an admin settings patch. Mask sentinels mean "leave existing secret unchanged";
     * explicit empty strings clear that credential. Every credential key is removed from public
     * settings before persistence.
     */
    applySettingsPatch(gateway: PaymentGateway, incoming: Record<string, unknown>): void {
        const credentialKeys = new Set(gatewayCredentialKeys(gateway.code));
        const publicSettings = { ...(((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>) };
        const credentials = this.readCredentials(gateway);

        for (const [key, raw] of Object.entries(incoming)) {
            if (!credentialKeys.has(key)) {
                publicSettings[key] = raw;
                continue;
            }
            if (raw === PAYMENT_CREDENTIAL_MASK) continue;
            if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim().length === 0)) {
                delete credentials[key];
            } else {
                credentials[key] = String(raw).trim();
            }
        }

        for (const key of credentialKeys) delete publicSettings[key];
        gateway.settings = publicSettings;
        gateway.credentialsCiphertext =
            Object.keys(credentials).length === 0
                ? null
                : encryption.encrypt(credentials, { purpose: this.purpose(gateway.code) });
    }

    private readCredentials(gateway: PaymentGateway): Record<string, string> {
        const result: Record<string, string> = {};
        const publicSettings = ((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

        /** Legacy compatibility: older deployments stored provider credentials in JSON settings. */
        for (const key of gatewayCredentialKeys(gateway.code)) {
            const legacy = publicSettings[key];
            if (typeof legacy === "string" && legacy.length > 0 && legacy !== PAYMENT_CREDENTIAL_MASK) result[key] = legacy;
        }

        if (!gateway.credentialsCiphertext) return result;
        const decrypted = encryption.decrypt(gateway.credentialsCiphertext, this.purpose(gateway.code));
        if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) return result;
        for (const [key, value] of Object.entries(decrypted as Record<string, unknown>)) {
            if (typeof value === "string") result[key] = value;
        }
        return result;
    }

    private purpose(code: string): string {
        return `payment-gateway:${code}:credentials:v1`;
    }
}

export const paymentGatewayCredentialsService = new PaymentGatewayCredentialsService();
