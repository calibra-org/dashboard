import type { SVGProps } from "react";

export function SupportProviderIcon({ provider, ...props }: SVGProps<SVGSVGElement> & { provider: string }) {
    const common = {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        ...props,
    };
    if (provider === "whatsapp")
        return (
            <svg {...common} aria-hidden="true">
                <path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4A8 8 0 1 1 20 11.7Z" />
                <path d="M8.5 8.2c.5 3.2 2.1 4.9 5.3 5.7l1.3-1.2 2 .9c-.3 1.5-1.3 2.3-2.8 2.3-4.2-.4-7.4-3.5-7.8-7.7 0-1.4.8-2.5 2.2-2.8l1 2-1.2.8Z" />
            </svg>
        );
    if (provider === "telegram")
        return (
            <svg {...common} aria-hidden="true">
                <path d="m21 4-4 16-6-5-3 3v-5l9-6-11 5-4-2 19-6Z" />
            </svg>
        );
    if (provider === "instagram")
        return (
            <svg {...common} aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
        );
    if (provider === "email")
        return (
            <svg {...common} aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
            </svg>
        );
    if (provider === "sms")
        return (
            <svg {...common} aria-hidden="true">
                <path d="M4 5h16v11H9l-5 4V5Z" />
                <path d="M8 10h8M8 13h5" />
            </svg>
        );
    if (provider === "api")
        return (
            <svg {...common} aria-hidden="true">
                <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
            </svg>
        );
    if (provider === "web")
        return (
            <svg {...common} aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
        );
    if (provider === "phone")
        return (
            <svg {...common} aria-hidden="true">
                <path d="M6.6 3 9 7.4 7.5 9c1.3 3 3.6 5.3 6.5 6.6l1.6-1.5L20 16.5c-.5 2.6-2 4-4.4 4C9 19.5 4.5 15 3.5 8.4 3.5 6 4 4.3 6.6 3Z" />
            </svg>
        );
    return (
        <svg {...common} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12h8M12 8v8" />
        </svg>
    );
}
