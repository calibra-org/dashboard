"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { navItems } from "@/src/lib/navigation";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 lg:hidden">
      {navItems.slice(0, 6).map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "rounded-full px-3 py-2 text-sm transition",
              active ? "bg-violet-600 text-white" : "bg-white text-slate-600 shadow-sm"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
