"use client";

import { useTranslations } from "next-intl";

import { BarChart3, Sparkles, Tags, Users } from "#/icons";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

const items = [
    { href: "/customers", label: "customers", icon: Users, exact: true },
    { href: "/customers/intelligence", label: "intelligence", icon: Sparkles },
    { href: "/customers/segments", label: "segments", icon: Tags },
    { href: "/customers/cohorts", label: "cohorts", icon: BarChart3 },
] as const;

export function CustomerWorkspaceNav() {
    const t = useTranslations("CustomerIntelligence.workspace");
    const pathname = usePathname();

    return (
        <nav
            aria-label={t("customers")}
            className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 text-sm"
        >
            {items.map((item) => {
                const Icon = item.icon;
                const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <Link
                        key={item.href}
                        href={item.href as never}
                        className={cn(
                            "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 transition-colors",
                            active
                                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                        <span>{t(item.label)}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
