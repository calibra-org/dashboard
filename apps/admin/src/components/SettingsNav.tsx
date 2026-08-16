"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";

import { Banknote, CalendarDays, ImageIcon, LayoutDashboard, Palette, Settings2, Truck, Wallet } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

interface SettingsTab {
    href: string;
    match: string;
    labelKey?: string;
    labelFa?: string;
    labelEn?: string;
    exact?: boolean;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const TABS: SettingsTab[] = [
    { href: "/settings", match: "/settings", labelFa: "مرکز تنظیمات", labelEn: "Configuration", exact: true, icon: LayoutDashboard },
    { href: "/settings/general", match: "/settings/general", labelKey: "general", icon: Settings2 },
    { href: "/settings/datetime", match: "/settings/datetime", labelKey: "datetime", icon: CalendarDays },
    { href: "/settings/media", match: "/settings/media", labelKey: "media", icon: ImageIcon },
    { href: "/branding", match: "/branding", labelKey: "branding", icon: Palette },
    { href: "/tax/classes", match: "/tax", labelKey: "tax", icon: Wallet },
    { href: "/shipping/zones", match: "/shipping", labelKey: "shipping", icon: Truck },
    { href: "/payments", match: "/payments", labelKey: "payments", icon: Banknote },
];

function isActive(pathname: string, tab: SettingsTab): boolean {
    if (tab.exact) return pathname === tab.match;
    return pathname === tab.match || pathname.startsWith(`${tab.match}/`);
}

export function SettingsNav() {
    const locale = useLocale();
    const tGroups = useTranslations("Settings.groups");
    const tNav = useTranslations("Settings");
    const pathname = usePathname();
    return (
        <nav aria-label={tNav("groupsNav")} className="flex flex-col gap-1 text-sm">
            {TABS.map((tab) => {
                const active = isActive(pathname, tab);
                const label = tab.labelKey
                    ? tab.labelKey === "payments"
                        ? locale === "fa" ? "درگاه پرداخت" : "Payment Gateways"
                        : tGroups(tab.labelKey)
                    : locale === "fa" ? tab.labelFa : tab.labelEn;
                const Icon = tab.icon;
                return (
                    <Link
                        key={tab.href}
                        href={tab.href as never}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
                            active
                                ? "bg-accent font-medium text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                        )}
                    >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span>{label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
