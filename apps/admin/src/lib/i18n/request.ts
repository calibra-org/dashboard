import type { Locale } from "@calibra/shared/i18n";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Per-request locale + message-catalog loader. Wired into Next.js via the `createNextIntlPlugin`
 * call in `next.config.ts`.
 *
 * Feature catalogs may live in their own files so large operational surfaces can be maintained
 * independently without duplicating the base catalog. Their namespaces are merged here before
 * next-intl receives the request messages.
 */
export default getRequestConfig(async ({ requestLocale }) => {
    const requested = await requestLocale;
    const locale: Locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
    const base = (await import(`../../../messages/${locale}.json`)).default;
    const transactions = (await import(`../../../messages/transactions/${locale}.json`)).default;
    const tickets = (await import(`../../../messages/tickets/${locale}.json`)).default;
    const operations = (await import(`../../../messages/operations/${locale}.json`)).default;
    const personalization = (await import(`../../../messages/personalization/${locale}.json`)).default;
    const trust = (await import(`../../../messages/trust/${locale}.json`)).default;
    const customerIntelligence = (await import(`../../../messages/customer-intelligence/${locale}.json`)).default;

    return {
        locale,
        messages: {
            ...base,
            ...transactions,
            ...tickets,
            ...operations,
            ...personalization,
            ...trust,
            ...customerIntelligence,
            Nav: {
                ...base.Nav,
                ...transactions.Nav,
                ...tickets.Nav,
                ...personalization.Nav,
                ...trust.Nav,
            },
        },
    };
});
