import type { InitArgs, InitResult, PaymentAdapter, PaymentAdapterCapabilities } from "#services/adapters/base_redirect_gateway";
import { paymentGatewayCredentialsService } from "#services/payment_gateway_credentials_service";

interface CardToCardSettings {
    card_number?: string;
    card_holder?: string;
    iban?: string;
    notes?: string;
}

function maskPan(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 8) return "****";
    return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

/** Offline card-to-card instructions. No external PSP call or redirect exists. */
export class CardToCardGateway implements PaymentAdapter {
    readonly code = "card_to_card";
    readonly capabilities: PaymentAdapterCapabilities = { redirect: false, refunds: false, partial_refunds: false };

    async init(args: InitArgs): Promise<InitResult> {
        const settings = paymentGatewayCredentialsService.runtimeSettingsFromStored("card_to_card", args.settings) as CardToCardSettings;
        const cardNumber = settings.card_number?.trim() ?? "";
        const cardHolder = settings.card_holder?.trim() ?? "";
        if (!cardNumber || !cardHolder) throw new Error("card_to_card card_number and card_holder are required");
        const lines = [`Card: ${maskPan(cardNumber)}`, `Card holder: ${cardHolder}`];
        if (settings.iban?.trim()) lines.push(`IBAN: ${settings.iban.trim()}`);
        if (settings.notes?.trim()) lines.push(settings.notes.trim());
        return {
            redirect_url: null,
            payload: {
                method: "card_to_card",
                customer_note: lines.join("\n"),
                card_number_masked: maskPan(cardNumber),
                card_holder: cardHolder,
                iban: settings.iban?.trim() || null,
            },
        };
    }
}

export const cardToCardGateway = new CardToCardGateway();
