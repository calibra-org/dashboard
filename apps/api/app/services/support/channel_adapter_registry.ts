import type { SupportChannelAdapter } from "#services/support/channel_adapters/adapter";
import { BaleAdapter } from "#services/support/channel_adapters/bale_adapter";
import { GmailAdapter } from "#services/support/channel_adapters/gmail_adapter";
import { InstagramAdapter } from "#services/support/channel_adapters/instagram_adapter";
import { MicrosoftGraphMailAdapter } from "#services/support/channel_adapters/microsoft_graph_mail_adapter";
import { RubikaAdapter } from "#services/support/channel_adapters/rubika_adapter";
import { TelegramAdapter } from "#services/support/channel_adapters/telegram_adapter";
import { WhatsAppAdapter } from "#services/support/channel_adapters/whatsapp_adapter";

const adapters: SupportChannelAdapter[] = [
    new WhatsAppAdapter(),
    new TelegramAdapter(),
    new InstagramAdapter(),
    new RubikaAdapter(),
    new BaleAdapter(),
    new GmailAdapter(),
    new MicrosoftGraphMailAdapter(),
];

export class SupportChannelAdapterRegistry {
    private readonly byKey = new Map(adapters.map((adapter) => [adapter.providerKey, adapter]));
    get(providerKey: string): SupportChannelAdapter | null {
        return this.byKey.get(providerKey) ?? null;
    }
    require(providerKey: string): SupportChannelAdapter {
        const adapter = this.get(providerKey);
        if (!adapter)
            throw Object.assign(new Error(`No production adapter is registered for ${providerKey}`), {
                code: "E_SUPPORT_PROVIDER_UNAVAILABLE",
                status: 422,
            });
        return adapter;
    }
}

export const supportChannelAdapterRegistry = new SupportChannelAdapterRegistry();
