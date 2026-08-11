import { GatewayNotConfiguredException, GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import { bankTransferGateway } from "#services/adapters/bank_transfer_gateway";
import type { PaymentAdapter, PaymentAdapterCapabilities } from "#services/adapters/base_redirect_gateway";
import { cardToCardGateway } from "#services/adapters/card_to_card_gateway";
import { codGateway } from "#services/adapters/cod_gateway";
import { mellatGateway } from "#services/adapters/mellat_gateway";
import { parsianGateway } from "#services/adapters/parsian_gateway";
import { UnimplementedPspGateway } from "#services/adapters/unimplemented_psp_gateway";
import { zarinpalGateway } from "#services/adapters/zarinpal_gateway";
import { readImplementationStatus } from "#transformers/payment_gateway_transformer";

/**
 * Singleton registry of payment adapters. Concrete adapters are registered only when Calibra has
 * an actual protocol implementation. A catalog row may still exist as `stub` so operators can see
 * the planned method without being allowed to route customer money through speculative code.
 */
export class PaymentAdapterRegistry {
    private readonly adapters = new Map<string, PaymentAdapter>();

    register(adapter: PaymentAdapter): void {
        this.adapters.set(adapter.code, adapter);
    }

    has(code: string): boolean {
        return this.adapters.has(code);
    }

    get(code: string): PaymentAdapter {
        const adapter = this.adapters.get(code);
        if (!adapter) {
            throw new GatewayNotConfiguredException(code, `No payment adapter registered for code "${code}"`);
        }
        return adapter;
    }

    /** Resolve an enabled gateway for starting new customer traffic. */
    async resolveForCode(code: string): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const resolved = await this.resolveHistoricalForCode(code, "verify");
        if (!resolved.gateway.enabled) {
            throw new GatewayNotConfiguredException(code, `Payment gateway "${code}" is disabled`);
        }
        return resolved;
    }

    /** Resolve an enabled gateway by id for starting a new payment. */
    async resolveForGatewayId(gatewayId: number | bigint): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const resolved = await this.resolveHistoricalForGatewayId(gatewayId, "init");
        if (!resolved.gateway.enabled) {
            throw new GatewayNotConfiguredException(
                resolved.gateway.code,
                `Payment gateway "${resolved.gateway.code}" is disabled`,
            );
        }
        return resolved;
    }

    /**
     * Resolve the implementation that owns an already-created payment callback. A gateway may be
     * disabled after the shopper has been redirected to the PSP; disabling must block only *new*
     * payment initializations, never strand an in-flight callback.
     */
    async resolveForCallbackCode(code: string): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        return this.resolveHistoricalForCode(code, "verify");
    }

    /**
     * Resolve the implementation captured by a historical attempt. Refund/reconciliation must keep
     * working after an operator disables the gateway for new checkouts.
     */
    async resolveForHistoricalGatewayId(
        gatewayId: number | bigint,
    ): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        return this.resolveHistoricalForGatewayId(gatewayId, "refund");
    }

    private async resolveHistoricalForCode(
        code: string,
        operation: "verify" | "refund",
    ): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const adapter = this.get(code);
        const gateway = await PaymentGateway.query().where("code", code).first();
        if (!gateway) {
            throw new GatewayNotConfiguredException(code, `Payment gateway row for code "${code}" not found`);
        }
        this.assertImplemented(gateway, operation);
        return { adapter, gateway };
    }

    private async resolveHistoricalForGatewayId(
        gatewayId: number | bigint,
        operation: "init" | "refund",
    ): Promise<{ adapter: PaymentAdapter; gateway: PaymentGateway }> {
        const gateway = await PaymentGateway.find(Number(gatewayId));
        if (!gateway) {
            throw new GatewayNotConfiguredException(String(gatewayId), `Payment gateway id ${gatewayId} not found`);
        }
        this.assertImplemented(gateway, operation);
        return { adapter: this.get(gateway.code), gateway };
    }

    private assertImplemented(gateway: PaymentGateway, operation: "init" | "verify" | "refund"): void {
        if (readImplementationStatus(gateway) === "stub") {
            throw new GatewayNotImplementedException(gateway.code, operation);
        }
    }
}

export const paymentAdapterRegistry = new PaymentAdapterRegistry();

/** Concrete, provider-speaking adapters. */
paymentAdapterRegistry.register(mellatGateway);
paymentAdapterRegistry.register(parsianGateway);
paymentAdapterRegistry.register(zarinpalGateway);
paymentAdapterRegistry.register(cardToCardGateway);
paymentAdapterRegistry.register(codGateway);

/** Legacy offline adapter remains routable for existing tenants but is hidden from the new catalog UI. */
paymentAdapterRegistry.register(bankTransferGateway);

/**
 * Visible methods that lack sufficient official merchant documentation/sandbox validation stay
 * fail-closed. Legacy PSP codes remain registered as stubs so historical rows fail with the same
 * explicit E_GATEWAY_NOT_IMPLEMENTED error instead of an ambiguous missing-adapter error.
 */
const STUB_PSP_CAPABILITIES: ReadonlyArray<{ code: string; capabilities: PaymentAdapterCapabilities }> = [
    { code: "sadad", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "bitpay", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "digipay", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "snapppay", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "azkivam", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "idpay", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
    { code: "nextpay", capabilities: { redirect: true, refunds: false, partial_refunds: false } },
    { code: "payir", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
    { code: "zibal", capabilities: { redirect: true, refunds: true, partial_refunds: false } },
];

for (const { code, capabilities } of STUB_PSP_CAPABILITIES) {
    paymentAdapterRegistry.register(new UnimplementedPspGateway(code, capabilities));
}
