import "server-only";
import { cookies, headers } from "next/headers";
import { TENANT_HEADER } from "#/lib/tenant/constants";

export interface SocialProductMarker {
    id: number;
    product_id: number;
    label?: string | null;
    product?: {
        id: number;
        name?: string | null;
        regular_price?: string | number | null;
        sale_price?: string | number | null;
        stock_status?: string | null;
        stock_quantity?: number | null;
        source?: "catalog_inventory_live" | string;
    };
}
export interface SocialContent {
    id: number;
    kind: string;
    status: string;
    title: string;
    description?: string | null;
    cover_media_id?: number | null;
    primary_media_id?: number | null;
    aspect_ratio?: string | null;
    product_markers?: SocialProductMarker[];
}
async function socialGet(path: string, query: Record<string, string | number | undefined> = {}) {
    const [h, c] = await Promise.all([headers(), cookies()]);
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
    const tenant = h.get(TENANT_HEADER);
    const cart = c.get("cart_token")?.value;
    try {
        const res = await fetch(url, {
            headers: {
                accept: "application/json",
                ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
                ...(cart ? { cookie: `cart_token=${cart}` } : {}),
            },
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return { data: [] as SocialContent[], meta: { status: "http", code: res.status } };
        return (await res.json()) as { data: SocialContent[]; meta?: Record<string, unknown> };
    } catch {
        return { data: [] as SocialContent[], meta: { status: "network" } };
    }
}
export const getStoryRail = (locale: string, limit = 16) => socialGet("/api/v1/storefront/social/story-rail", { locale, limit });
export const getDiscover = (locale: string, tab: string, page = 1) =>
    socialGet("/api/v1/storefront/social/discover", { locale, tab, page, limit: 24 });
export const SOCIAL_COMMERCE_INTEGRITY = "catalog_inventory_live";
