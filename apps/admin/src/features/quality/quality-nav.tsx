"use client";
import { useLocale } from "next-intl";

import { HelperTooltip } from "#/components/ui/helper-tooltip";
import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

import { QUALITY_SECTIONS } from "./copy";

export function QualityNav() {
    const locale = useLocale();
    const fa = locale === "fa";
    const pathname = usePathname();
    return (
        <nav
            className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5"
            aria-label={fa ? "بخش‌های کیفیت و اعتماد" : "Quality and trust sections"}
        >
            {QUALITY_SECTIONS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <div key={item.key} className="flex shrink-0 items-center">
                        <Link
                            href={item.href as never}
                            className={cn(
                                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                                active
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <Icon className="size-3.5" aria-hidden="true" />
                            <span>{fa ? item.fa : item.en}</span>
                        </Link>
                        <HelperTooltip>{fa ? item.helpFa : item.helpEn}</HelperTooltip>
                    </div>
                );
            })}
        </nav>
    );
}
