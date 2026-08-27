"use client";

import { Menu, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import styles from "./MobileNavigationTrigger.module.css";

const NAVIGATION_ID = "admin-primary-navigation";

export function MobileNavigationTrigger() {
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const menuLabel = locale === "fa" ? "منوی ناوبری" : "Navigation menu";
    const closeLabel = locale === "fa" ? "بستن منوی ناوبری" : "Close navigation menu";

    useEffect(() => {
        const sidebar = document.querySelector<HTMLElement>("aside.bg-sidebar");
        if (sidebar) sidebar.id = NAVIGATION_ID;
    }, []);

    useEffect(() => {
        document.documentElement.dataset.adminMobileNav = open ? "open" : "closed";
        document.body.style.overflow = open ? "hidden" : "";

        if (!open) return;

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        const closeOnNavigation = (event: MouseEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest("aside.bg-sidebar a[href]")) setOpen(false);
        };

        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("click", closeOnNavigation);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("click", closeOnNavigation);
        };
    }, [open]);

    useEffect(
        () => () => {
            delete document.documentElement.dataset.adminMobileNav;
            document.body.style.overflow = "";
        },
        [],
    );

    return (
        <>
            <Button
                type="button"
                variant="outline"
                size="icon"
                className={styles.trigger}
                aria-label={menuLabel}
                aria-controls={NAVIGATION_ID}
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                <Menu className="size-4" aria-hidden="true" />
            </Button>
            {open ? (
                <button type="button" className={styles.backdrop} aria-label={closeLabel} onClick={() => setOpen(false)}>
                    <X className={styles.closeIcon} aria-hidden="true" />
                </button>
            ) : null}
        </>
    );
}
