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
