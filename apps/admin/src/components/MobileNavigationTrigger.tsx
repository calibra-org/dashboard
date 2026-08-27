"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { PanelLeft, X } from "#/icons";

import { Button } from "./ui/button";
import styles from "./MobileNavigationTrigger.module.css";

const NAVIGATION_ID = "admin-primary-navigation";

export function MobileNavigationTrigger() {
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuLabel = locale === "fa" ? "منوی ناوبری" : "Navigation menu";
    const closeLabel = locale === "fa" ? "بستن منوی ناوبری" : "Close navigation menu";

    const closeNavigation = useCallback(() => {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    }, []);

    useEffect(() => {
        const sidebar = document.querySelector<HTMLElement>("aside.bg-sidebar");
        if (sidebar) sidebar.id = NAVIGATION_ID;
    }, []);

    useEffect(() => {
        const sidebar = document.querySelector<HTMLElement>(`#${NAVIGATION_ID}`);
        document.documentElement.dataset.adminMobileNav = open ? "open" : "closed";
        document.body.style.overflow = open ? "hidden" : "";

        if (!open || !sidebar) {
            sidebar?.removeAttribute("role");
            sidebar?.removeAttribute("aria-modal");
            sidebar?.removeAttribute("aria-label");
            return;
        }

        sidebar.setAttribute("role", "dialog");
        sidebar.setAttribute("aria-modal", "true");
        sidebar.setAttribute("aria-label", menuLabel);
        requestAnimationFrame(() => sidebar.querySelector<HTMLElement>("a[href], button")?.focus());

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeNavigation();
        };
        const closeOnNavigation = (event: MouseEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(`#${NAVIGATION_ID} a[href]`)) closeNavigation();
        };

        document.addEventListener("keydown", closeOnEscape);
        document.addEventListener("click", closeOnNavigation);
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.removeEventListener("click", closeOnNavigation);
            sidebar.removeAttribute("role");
            sidebar.removeAttribute("aria-modal");
            sidebar.removeAttribute("aria-label");
        };
    }, [closeNavigation, menuLabel, open]);

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
                ref={triggerRef}
                type="button"
                variant="outline"
                size="icon"
                className={styles.trigger}
                aria-label={menuLabel}
                aria-controls={NAVIGATION_ID}
                aria-expanded={open}
                onClick={() => (open ? closeNavigation() : setOpen(true))}
            >
                <PanelLeft className="size-4" aria-hidden="true" />
            </Button>
            {open ? (
                <button type="button" className={styles.backdrop} aria-label={closeLabel} onClick={closeNavigation}>
                    <X className={styles.closeIcon} aria-hidden="true" />
                </button>
            ) : null}
        </>
    );
}
