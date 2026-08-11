import PaymentGateway from "#models/payment_gateway";
import { PAYMENT_GATEWAY_CATALOG } from "#services/payment_gateway_catalog";

/**
 * Idempotently reconciles the approved operator-facing catalog inside the current tenant context.
 * Existing tenant enablement and settings are never reset; only non-secret provider metadata is
 * refreshed. This makes the upgrade safe for already-running shops while new shops see the full
 * catalog the first time the configuration surface is opened.
 */
export async function ensurePaymentGatewayCatalog(): Promise<void> {
    const approved = new Set(PAYMENT_GATEWAY_CATALOG.map((definition) => definition.code));
    for (const definition of PAYMENT_GATEWAY_CATALOG) {
        const existing = await PaymentGateway.query().where("code", definition.code).first();
        if (!existing) {
            await PaymentGateway.create({
                code: definition.code,
                enabled: definition.defaultEnabled,
                ordering: definition.ordering,
                settings: { ...definition.defaultSettings },
                supports: { ...definition.supports },
                attributes: {
                    implementation_status: definition.implementationStatus,
                    admin_visible: definition.adminVisible,
                    category: definition.category,
                    health_status: definition.credentialFields.length === 0 ? "configured" : "unconfigured",
                },
            });
            continue;
        }
        existing.ordering = definition.ordering;
        existing.supports = { ...definition.supports };
        existing.attributes = {
            ...(((existing.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
            implementation_status: definition.implementationStatus,
            admin_visible: definition.adminVisible,
            category: definition.category,
        };
        await existing.save();
    }

    /** Historical gateways remain usable for old orders but disappear from the new configuration UI. */
    const legacyRows = await PaymentGateway.query();
    for (const gateway of legacyRows) {
        if (approved.has(gateway.code)) continue;
        const attrs = ((gateway.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
        if (attrs.admin_visible === false) continue;
        gateway.attributes = { ...attrs, admin_visible: false };
        await gateway.save();
    }
}
