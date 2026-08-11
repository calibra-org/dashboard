import db from "@adonisjs/lucid/services/db";

import PaymentGateway from "#models/payment_gateway";
import { ensurePaymentGatewayCatalog } from "#services/payment_gateway_catalog_service";
import { resetPhase05 } from "#tests/helpers/orders";

const LEGACY_STUB_CODES = ["idpay", "nextpay", "payir", "zibal"] as const;
const APPROVED_REMOTE_CODES = ["mellat", "sadad", "parsian", "zarinpal", "bitpay", "digipay", "snapppay", "azkivam"] as const;

/** Canonical clean state for payment specs after the Phase 08 gateway-catalog expansion. */
export async function resetPhase08(): Promise<void> {
    await resetPhase05();
    await db.rawQuery(`TRUNCATE TABLE "payment_links", "payment_attempts" RESTART IDENTITY CASCADE`);
    await ensurePaymentGatewayCatalog();

    const bank = await PaymentGateway.findByOrFail("code", "bank_transfer");
    bank.enabled = true;
    bank.settings = {
        iban: "IR000000000000000001",
        account_name: "Calibra",
    };
    await bank.save();

    const cod = await PaymentGateway.findByOrFail("code", "cod");
    cod.enabled = true;
    cod.settings = {};
    cod.attributes = {
        ...(((cod.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
        health_status: "configured",
    };
    await cod.save();

    const card = await PaymentGateway.findByOrFail("code", "card_to_card");
    card.enabled = false;
    card.settings = {};
    card.attributes = {
        ...(((card.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
        health_status: "unconfigured",
    };
    await card.save();

    for (const code of APPROVED_REMOTE_CODES) {
        const gateway = await PaymentGateway.findByOrFail("code", code);
        gateway.enabled = false;
        gateway.settings = {};
        gateway.attributes = {
            ...(((gateway.attributes as Record<string, unknown> | null) ?? {}) as Record<string, unknown>),
            health_status: "unconfigured",
            last_verified_at: null,
            last_error: null,
        };
        await gateway.save();
    }

    for (const code of LEGACY_STUB_CODES) {
        const gateway = await PaymentGateway.findByOrFail("code", code);
        gateway.enabled = false;
        await gateway.save();
    }
}
