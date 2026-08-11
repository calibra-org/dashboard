import encryption from "@adonisjs/core/services/encryption";

import type PaymentGateway from "#models/payment_gateway";
import { gatewayCredentialKeys, requiredGatewayCredentialKeys } from "#services/payment_gateway_catalog";

export const PAYMENT_CREDENTIAL_MASK = "***";

export type PaymentGatewayHealthStatus = "unconfigured" | "configured" | "healthy" | "error";

interface SecurityAttributes {
    credentials_ciphertext?: string;
    health_status?: PaymentGatewayHealthStatus;
    last_verified_at?: string | null;
    last_error?: string | null;
    [key: string]: unknown;
}

/**
 * Keeps merchant credentials out of the public settings dictionary.
 *
 * Credentials are encrypted as one purpose-bound ChaCha20-Poly1305 payload using Calibra's Adonis
 * encryption manager and stored inside the already tenant-isolated `attributes` JSONB. Purpose
 * binding includes the gateway code, so moving a ciphertext between providers makes decryption
 * fail closed. GET surfaces only mask sentinels; a PATCH containing `***` preserves the existing
 * value, while an empty string explicitly clears it.
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

    health(gateway: PaymentGateway): {
        status: PaymentGatewayHealthStatus;
        lastVerifiedAt: string | null;
        lastError: string | null;
    } {
        const attrs = this.attributes(gateway);
        const raw = attrs.health_status;
        const status: PaymentGatewayHealthStatus =
            raw === "configured" || raw === "healthy" || raw === "error" ? raw : "unconfigured";
        return {
            status,
            lastVerifiedAt: typeof attrs.last_verified_at === "string" ? attrs.last_verified_at : null,
            lastError: typeof attrs.last_error === "string" ? attrs.last_error : null,
        };
    }

    markConfigured(gateway: PaymentGateway): void {
        const attrs = this.attributes(gateway);
        attrs.health_status = this.missingRequired(gateway).length === 0 ? "configured" : "unconfigured";
        attrs.last_error = null;
        gateway.attributes = attrs;
    }

    markHealthy(gateway: PaymentGateway, atIso: string): void {
        const attrs = this.attributes(gateway);
        attrs.health_status = "healthy";
        attrs.last_verified_at = atIso;
        attrs.last_error = null;
        gateway.attributes = attrs;
    }

    markError(gateway: PaymentGateway, message: string): void {
        const attrs = this.attributes(gateway);
        attrs.health_status = "error";
        /** Persist a bounded operational message only; provider credentials never reach this string. */
        attrs.last_error = message.slice(0, 500);
        gateway.attributes = attrs;
    }

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
        const attrs = this.attributes(gateway);
        if (Object.keys(credentials).length === 0) {
            delete attrs.credentials_ciphertext;
        } else {
            attrs.credentials_ciphertext = encryption.encrypt(credentials, { purpose: this.purpose(gateway.code) });
        }
        gateway.attributes = attrs;
        this.markConfigured(gateway);
    }

    private readCredentials(gateway: PaymentGateway): Record<string, string> {
        const result: Record<string, string> = {};
        const publicSettings = ((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;

        /** Legacy compatibility: older deployments stored provider credentials in plaintext JSON. */
        for (const key of gatewayCredentialKeys(gateway.code)) {
            const legacy = publicSettings[key];
            if (typeof legacy === "string" && legacy.length > 0 && legacy !== PAYMENT_CREDENTIAL_MASK) result[key] = legacy;
        }

        const ciphertext = this.attributes(gateway).credentials_ciphertext;
        if (typeof ciphertext !== "string" || ciphertext.length === 0) return result;
        const decrypted = encryption.decrypt(ciphertext, this.purpose(gateway.code));
        if (!decrypted || typeof decrypted !== "object" || Array.isArray(decrypted)) return result;
        for (const [key, value] of Object.entries(decrypted as Record<string, unknown>)) {
            if (typeof value === "string") result[key] = value;
        }
        return result;
    }

    private attributes(gateway: PaymentGateway): SecurityAttributes {
        return { ...(((gateway.attributes as SecurityAttributes | null) ?? {}) as SecurityAttributes) };
    }

    private purpose(code: string): string {
        return `payment-gateway:${code}:credentials:v1`;
    }
}

export const paymentGatewayCredentialsService = new PaymentGatewayCredentialsService();
