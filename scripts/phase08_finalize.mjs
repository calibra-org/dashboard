import fs from "node:fs";

const storefrontPath = "docs/api/reference/openapi/storefront.v1.yaml";
let storefront = fs.readFileSync(storefrontPath, "utf8");
const paymentInit = `    /api/v1/payment/init:\n        post:\n            $ref: "./storefront/paths/payment/init.post.yaml"\n`;
const bridge = `    /api/v1/payment/redirect/mellat:\n        get:\n            $ref: "./storefront/paths/payment/redirect-mellat.get.yaml"\n        head:\n            $ref: "./common/components/operations/HeadCompanion.yaml"\n`;
if (!storefront.includes(bridge)) {
    if (!storefront.includes(paymentInit)) throw new Error("payment init anchor not found in storefront OpenAPI root");
    storefront = storefront.replace(paymentInit, `${paymentInit}${bridge}`);
    fs.writeFileSync(storefrontPath, storefront);
}

const adminPath = "docs/api/reference/openapi/admin.v1.yaml";
let admin = fs.readFileSync(adminPath, "utf8");
admin = admin.replace(
    "description: Read-only payment-gateway registry and payment-attempt audit log.",
    "description: Secure payment-gateway configuration, provider capability registry, and payment-attempt audit log.",
);
fs.writeFileSync(adminPath, admin);

const servicePath = "apps/api/app/services/payment_service.ts";
let service = fs.readFileSync(servicePath, "utf8");
if (!service.includes('from "#services/payment_gateway_credentials_service"')) {
    const anchor = 'import { paymentAdapterRegistry } from "#services/payment_adapter_registry";\n';
    if (!service.includes(anchor)) throw new Error("payment service adapter-registry import anchor not found");
    service = service.replace(
        anchor,
        `${anchor}import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";\n`,
    );
}

const payloadAnchor = `            attempt.gatewayPayload = (initResult.payload as Record<string, unknown>) ?? {};\n            if (initResult.authority) attempt.gatewayAuthority = initResult.authority;`;
if (service.includes(payloadAnchor)) {
    service = service.replace(
        payloadAnchor,
        `            attempt.gatewayPayload = {\n                ...(((initResult.payload as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>),\n                redirect_url: initResult.redirect_url,\n            };\n            if (initResult.authority) attempt.gatewayAuthority = initResult.authority;`,
    );
}

const initFailureAnchor = `            recordPaymentPhase(gateway.code, "init", Number(process.hrtime.bigint() - initStartedAt) / 1e9);\n            throw error;`;
if (service.includes(initFailureAnchor) && !service.includes("paymentGatewayCredentialsService.markError(gateway")) {
    service = service.replace(
        initFailureAnchor,
        `            recordPaymentPhase(gateway.code, "init", Number(process.hrtime.bigint() - initStartedAt) / 1e9);\n            paymentGatewayCredentialsService.markError(gateway, this.errorCodeFromException(error));\n            await gateway.save();\n            throw error;`,
    );
}

const verifiedAnchor = `        if (result.attempt?.status === PaymentAttemptStatus.Verified) {\n            await emitter.emit("payment:verified", {`;
if (service.includes(verifiedAnchor) && !service.includes("paymentGatewayCredentialsService.markHealthy(gateway")) {
    service = service.replace(
        verifiedAnchor,
        `        if (result.attempt?.status === PaymentAttemptStatus.Verified) {\n            paymentGatewayCredentialsService.markHealthy(gateway, DateTime.utc().toISO() ?? new Date().toISOString());\n            await gateway.save();\n            await emitter.emit("payment:verified", {`,
    );
}
fs.writeFileSync(servicePath, service);

const adapterContractPath = "apps/api/app/services/adapters/base_redirect_gateway.ts";
let adapterContract = fs.readFileSync(adapterContractPath, "utf8");
adapterContract = adapterContract.replace(
    "/** Decrypted gateway settings (merchant_id, api_key, …) sourced from `payment_gateways.settings`. */",
    "/** Stored gateway settings. Concrete adapters decrypt protected merchant fields only at the provider boundary. */",
);
fs.writeFileSync(adapterContractPath, adapterContract);
