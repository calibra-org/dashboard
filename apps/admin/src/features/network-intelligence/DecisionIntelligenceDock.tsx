"use client";

import { Link, usePathname } from "#/lib/i18n/navigation";
import { cn } from "#/lib/utils";

const links = [
    { href: "/analytics/decision-intelligence", label: "مرکز تصمیم‌گیری" },
    { href: "/decision-intelligence/network-intelligence/benchmarks", label: "هوش شبکه خصوصی" },
] as const;

export function DecisionIntelligenceDock() {
    const pathname = usePathname();
    const visible = pathname === "/analytics/decision-intelligence" || pathname.startsWith("/decision-intelligence/network-intelligence/");
    if (!visible) return null;

    return (
        <div className="border-b bg-background/90 px-6 py-2 backdrop-blur">
            <nav className="flex flex-wrap items-center gap-2" aria-label="Decision Intelligence">
                <span className="me-1 text-muted-foreground text-xs">Decision Intelligence</span>
                {links.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                        <Link
                            key={item.href}
                            href={item.href as never}
                            className={cn(
                                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                                active ? "border-primary/30 bg-primary/10 font-medium text-primary" : "bg-card text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
