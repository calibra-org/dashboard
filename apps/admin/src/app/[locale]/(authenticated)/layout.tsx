import { setRequestLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { ImpersonationBanner } from "#/components/ImpersonationBanner";
import { Sidebar } from "#/components/Sidebar";
import { Topbar } from "#/components/Topbar";
import { Toaster } from "#/components/ui/toast";
import { requireSession } from "#/lib/auth";
import { MoneyFormatProvider } from "#/lib/currency/provider";
import { getMoneyFormatConfig } from "#/lib/currency/server";
import { DateTimeFormatProvider } from "#/lib/datetime/provider";
import { getDateTimeConfig } from "#/lib/datetime/server";
import { QueryProvider } from "#/lib/queries/QueryProvider";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}

/**
 * Authenticated shell. Guards every page inside `(authenticated)`: unauthenticated requests are
 * redirected to `/login` from {@link requireSession}. The resolved user is passed down into the
 * shell so realtime user-specific channels can be authorized without exposing bearer state.
 */
export default async function AuthenticatedLayout({ children, params }: LayoutProps) {
    const { locale } = await params;
    setRequestLocale(locale);
    const [{ session, impersonatedBy }, moneyConfig, dateTimeConfig] = await Promise.all([
        requireSession(locale),
        getMoneyFormatConfig(),
        getDateTimeConfig(),
    ]);

    return (
        <NuqsAdapter>
            <QueryProvider>
                <DateTimeFormatProvider config={dateTimeConfig}>
                    <MoneyFormatProvider config={moneyConfig}>
                        <div className="flex min-h-dvh flex-col">
                            {impersonatedBy !== null ? <ImpersonationBanner shopName={session.tenantSlug} /> : null}
                            <div className="flex min-h-0 flex-1">
                                <Sidebar userId={session.userId} />
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <Topbar user={{ email: session.email, displayName: session.displayName }} />
                                    <main className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-6">{children}</main>
                                </div>
                            </div>
                        </div>
                        <Toaster />
                    </MoneyFormatProvider>
                </DateTimeFormatProvider>
            </QueryProvider>
        </NuqsAdapter>
    );
}
