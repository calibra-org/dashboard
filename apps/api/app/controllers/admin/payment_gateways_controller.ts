import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import { ensurePaymentGatewayCatalog } from "#services/payment_gateway_catalog_service";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";
import { adminPaymentGatewaysView } from "#table_views/admin/payment_gateways";
import PaymentGatewayTransformer, { readImplementationStatus } from "#transformers/payment_gateway_transformer";
import { adminPaymentGatewayListValidator, adminPaymentGatewayUpdateValidator } from "#validators/admin/payment_gateway_validator";

/** Admin configuration surface for tenant payment gateways. */
export default class AdminPaymentGatewaysController {
    async index(ctx: HttpContext) {
        await ensurePaymentGatewayCatalog();
        const parsed = await ctx.request.validateUsing(adminPaymentGatewayListValidator);
        const { data: rows, meta } = await adminPaymentGatewaysView.run<PaymentGateway>(PaymentGateway.query(), parsed);
        return {
            data: rows.map((row) => new PaymentGatewayTransformer(row).forAdmin()),
            meta,
        };
    }

    async show(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    async update(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminPaymentGatewayUpdateValidator);

        if (payload.settings) paymentGatewayCredentialsService.applySettingsPatch(gateway, payload.settings);
        if (payload.ordering !== undefined) gateway.ordering = payload.ordering;
        if (payload.enabled !== undefined) {
            if (payload.enabled) this.assertCanEnable(gateway);
            gateway.enabled = payload.enabled;
        }

        await gateway.save();
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    private assertCanEnable(gateway: PaymentGateway): void {
        if (readImplementationStatus(gateway) === "stub") {
            throw new GatewayNotImplementedException(gateway.code, "enable");
        }
        const missing = paymentGatewayCredentialsService.missingRequired(gateway);
        if (missing.length > 0) {
            throw new Exception(`Payment gateway "${gateway.code}" is missing required credentials`, {
                status: 422,
                code: "E_PAYMENT_GATEWAY_CREDENTIALS_REQUIRED",
                cause: { gateway: gateway.code, missing },
            });
        }
    }

    private async findOrFail(id: unknown): Promise<PaymentGateway> {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            throw new Exception("Payment gateway not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const row = await PaymentGateway.find(numericId);
        if (!row) {
            throw new Exception("Payment gateway not found", { status: 404, code: "E_NOT_FOUND" });
        }
        return row;
    }
}
