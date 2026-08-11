import { BaseTransformer } from "@adonisjs/core/transformers";

import type PaymentGateway from "#models/payment_gateway";
import { type GatewayImplementationStatus, gatewayCredentialKeys, gatewayDefinition } from "#services/payment_gateway_catalog";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";

/** Backwards-compatible export used by tests/other modules; catalog-specific keys are added dynamically. */
const SENSITIVE_KEYS = new Set([
    "merchant_id",
    "api_key",
    "secret",
    "secret_key",
    "client_secret",
    "private_key",
    "password",
    "token",
    "terminal_id",
    "terminal_key",
    "username",
    "login_account",
    "card_number",
]);

/**
 * Owns `/api/v1/admin/payment-gateways/*` response shape. Merchant secrets are never serialized:
 * credential fields are represented only as `***`/empty sentinels and the encrypted ciphertext
 * stays inside the model's private attributes bag.
 */
export default class PaymentGatewayTransformer extends BaseTransformer<PaymentGateway> {
    toObject() {
        return this.forAdmin();
    }

    forStorefront() {
        const gateway = this.resource;
        return {
            id: Number(gateway.id),
            code: gateway.code,
            enabled: gateway.enabled,
            ordering: gateway.ordering,
            supports: (gateway.supports as Record<string, unknown>) ?? {},
            implementation_status: readImplementationStatus(gateway),
        };
    }

    forAdmin() {
        const gateway = this.resource;
        const definition = gatewayDefinition(gateway.code);
        const attrs = ((gateway.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
        const health = paymentGatewayCredentialsService.health(gateway);
        return {
            ...this.forStorefront(),
            category: definition?.category ?? (typeof attrs.category === "string" ? attrs.category : "legacy"),
            admin_visible: definition?.adminVisible ?? attrs.admin_visible !== false,
            credential_fields: (definition?.credentialFields ?? []).map((field) => ({ ...field })),
            settings: paymentGatewayCredentialsService.maskedSettings(gateway),
            health_status: health.status,
            last_verified_at: health.lastVerifiedAt,
            last_error: health.lastError,
            created_at: gateway.createdAt?.toISO() ?? null,
            updated_at: gateway.updatedAt?.toISO() ?? null,
        };
    }
}

export { SENSITIVE_KEYS };

/**
 * Fail closed: unknown/missing values are `stub`. `implemented` means a concrete adapter exists but
 * a tenant may still be unconfigured/unverified; `live` is reserved for offline methods or
 * provider-verified integrations.
 */
export function readImplementationStatus(gateway: PaymentGateway): GatewayImplementationStatus {
    const attrs = (gateway.attributes as Record<string, unknown> | null) ?? {};
    const raw = attrs.implementation_status;
    if (raw === "live" || raw === "implemented") return raw;
    const definition = gatewayDefinition(gateway.code);
    return definition?.implementationStatus ?? "stub";
}

export function expectedGatewayCredentialKeys(gateway: PaymentGateway): readonly string[] {
    return gatewayCredentialKeys(gateway.code);
}
