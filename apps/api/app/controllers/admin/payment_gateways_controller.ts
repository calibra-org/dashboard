import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import { GatewayNotImplementedException } from "#exceptions/payment_exceptions";
import PaymentGateway from "#models/payment_gateway";
import { recordAudit } from "#services/admin_audit_log_service";
import { ensurePaymentGatewayCatalog } from "#services/payment_gateway_catalog_service";
import { paymentGatewayConnectionVerifier } from "#services/payment_gateway_connection_verifier";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";
import { adminPaymentGatewaysView } from "#table_views/admin/payment_gateways";
import PaymentGatewayTransformer, { readImplementationStatus } from "#transformers/payment_gateway_transformer";
import {
    adminPaymentGatewayListValidator,
    adminPaymentGatewayUpdateValidator,
} from "#validators/admin/payment_gateway_validator";

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

    async verify(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        this.assertImplementedAndConfigured(gateway);
        await this.verifyAndPersist(gateway, ctx);
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    async update(ctx: HttpContext) {
        const gateway = await this.findOrFail(ctx.params.id);
        const payload = await ctx.request.validateUsing(adminPaymentGatewayUpdateValidator);
        const credentialsChanged = Boolean(payload.settings);

        if (payload.settings) paymentGatewayCredentialsService.applySettingsPatch(gateway, payload.settings);
        if (payload.ordering !== undefined) gateway.ordering = payload.ordering;
        if (payload.enabled !== undefined) {
            if (payload.enabled) {
                this.assertImplementedAndConfigured(gateway);
                if (credentialsChanged || paymentGatewayCredentialsService.health(gateway).status !== "healthy") {
                    await this.verifyAndPersist(gateway, ctx, false);
                }
                this.assertVerified(gateway);
            }
            gateway.enabled = payload.enabled;
        }

        await gateway.save();
        await recordAudit({
            ctx,
            action: payload.enabled === true ? "payment_gateway.verify_and_enable" : "payment_gateway.patch",
            entityKind: "payment_gateway",
            entityId: gateway.id,
            payload: {
                gateway: gateway.code,
                enabled: payload.enabled,
                ordering: payload.ordering,
                credentials_changed: credentialsChanged,
                health_status: paymentGatewayCredentialsService.health(gateway).status,
            },
        });
        return { data: new PaymentGatewayTransformer(gateway).forAdmin() };
    }

    private async verifyAndPersist(gateway: PaymentGateway, ctx: HttpContext, audit = true): Promise<void> {
        try {
            await paymentGatewayConnectionVerifier.verify(gateway);
            await gateway.save();
            if (audit) {
                await recordAudit({
                    ctx,
                    action: "payment_gateway.verify_connection",
                    entityKind: "payment_gateway",
                    entityId: gateway.id,
                    payload: {
                        gateway: gateway.code,
                        health_status: paymentGatewayCredentialsService.health(gateway).status,
                    },
                });
            }
        } catch (error) {
            await gateway.save();
            if (audit) {
                await recordAudit({
                    ctx,
                    action: "payment_gateway.verify_connection_failed",
                    entityKind: "payment_gateway",
                    entityId: gateway.id,
                    payload: {
                        gateway: gateway.code,
                        health_status: paymentGatewayCredentialsService.health(gateway).status,
                        last_error: paymentGatewayCredentialsService.health(gateway).lastError,
                    },
                });
            }
            throw error;
        }
    }

    private assertImplementedAndConfigured(gateway: PaymentGateway): void {
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

    private assertVerified(gateway: PaymentGateway): void {
        if (paymentGatewayCredentialsService.health(gateway).status !== "healthy") {
            throw new Exception(`Payment gateway "${gateway.code}" connection is not verified`, {
                status: 422,
                code: "E_PAYMENT_GATEWAY_CONNECTION_REQUIRED",
                cause: { gateway: gateway.code },
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
