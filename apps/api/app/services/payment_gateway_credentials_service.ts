import encryption from "@adonisjs/core/services/encryption";

import type PaymentGateway from "#models/payment_gateway";
import { gatewayCredentialKeys, requiredGatewayCredentialKeys } from "#services/payment_gateway_catalog";

export const PAYMENT_CREDENTIAL_MASK = "***";
const CIPHERTEXT_KEY = "__credentials_ciphertext";

export type PaymentGatewayHealthStatus = "unconfigured" | "configured" | "healthy" | "error";

interface SecurityAttributes {
    health_status?: PaymentGatewayHealthStatus;
    last_verified_at?: string | null;
    last_error?: string | null;
    [key: string]: unknown;
}

export interface PaymentGatewaySettingsPatchResult {
    changed: boolean;
    credentialsChanged: boolean;
}

export class PaymentGatewayCredentialsService {
    runtimeSettings(gateway: PaymentGateway): Record<string, unknown> {
        return this.runtimeSettingsFromStored(gateway.code, (gateway.settings as Record<string, unknown> | null) ?? {});
    }

    runtimeSettingsFromStored(code: string, stored: Record<string, unknown>): Record<string, unknown> {
        const publicSettings = { ...stored };
        delete publicSettings[CIPHERTEXT_KEY];
        return { ...publicSettings, ...this.readCredentialsFromStored(code, stored) };
    }

    maskedSettings(gateway: PaymentGateway): Record<string, unknown> {
        const stored = { ...(((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>) };
        const credentials = this.readCredentialsFromStored(gateway.code, stored);
        delete stored[CIPHERTEXT_KEY];
        for (const key of gatewayCredentialKeys(gateway.code)) {
            const value = credentials[key];
            stored[key] = typeof value === "string" && value.length > 0 ? PAYMENT_CREDENTIAL_MASK : "";
        }
        return stored;
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
        attrs.last_verified_at = null;
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
        attrs.last_verified_at = null;
        attrs.last_error = message.slice(0, 500);
        gateway.attributes = attrs;
    }

    /** Apply a settings patch and report whether effective settings / credentials actually changed. */
    applySettingsPatch(gateway: PaymentGateway, incoming: Record<string, unknown>): PaymentGatewaySettingsPatchResult {
        const credentialKeys = new Set(gatewayCredentialKeys(gateway.code));
        const originalRuntime = this.runtimeSettings(gateway);
        const originalCredentials = this.readCredentialsFromStored(
            gateway.code,
            (gateway.settings as Record<string, unknown> | null) ?? {},
        );
        const stored = { ...(((gateway.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>) };
        const credentials = { ...originalCredentials };

        for (const [key, raw] of Object.entries(incoming)) {
            if (!credentialKeys.has(key)) {
                if (key !== CIPHERTEXT_KEY) stored[key] = raw;
                continue;
            }
            if (raw === PAYMENT_CREDENTIAL_MASK) continue;
            if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim().length === 0)) {
                delete credentials[key];
            } else {
                credentials[key] = String(raw).trim();
            }
        }

        const nextRuntime: Record<string, unknown> = { ...stored, ...credentials };
        delete nextRuntime[CIPHERTEXT_KEY];
        const changed = !this.sameSettings(originalRuntime, nextRuntime);
        const credentialsChanged = !this.sameSettings(originalCredentials, credentials);
        if (!changed) return { changed: false, credentialsChanged: false };

        for (const key of credentialKeys) delete stored[key];
        if (Object.keys(credentials).length === 0) {
            delete stored[CIPHERTEXT_KEY];
        } else if (credentialsChanged || typeof stored[CIPHERTEXT_KEY] !== "string") {
            stored[CIPHERTEXT_KEY] = encryption.encrypt(credentials, { purpose: this.purpose(gateway.code) });
        }
        gateway.settings = stored;
        if (credentialsChanged) this.markConfigured(gateway);
        return { changed: true, credentialsChanged };
    }

    private sameSettings(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
        const leftKeys = Object.keys(left).sort();
        const rightKeys = Object.keys(right).sort();
        if (leftKeys.length !== rightKeys.length) return false;
        return leftKeys.every((key, index) => key === rightKeys[index] && this.sameValue(left[key], right[key]));
    }

    private sameValue(left: unknown, right: unknown): boolean {
        if (left === right) return true;
        if (left === null || right === null || left === undefined || right === undefined) return false;
        if (typeof left !== "object" || typeof right !== "object") return false;
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch {
            return false;
        }
    }

    private readCredentialsFromStored(code: string, stored: Record<string, unknown>): Record<string, string> {
        const result: Record<string, string> = {};
        for (const key of gatewayCredentialKeys(code)) {
            const legacy = stored[key];
            if (typeof legacy === "string" && legacy.length > 0 && legacy !== PAYMENT_CREDENTIAL_MASK) result[key] = legacy;
        }

        const ciphertext = stored[CIPHERTEXT_KEY];
        if (typeof ciphertext !== "string" || ciphertext.length === 0) return result;
        const decrypted = encryption.decrypt(ciphertext, this.purpose(code));
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
