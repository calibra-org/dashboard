import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { TENANT_HEADER } from "#/lib/tenant/constants";
export async function POST(request: Request) {
    const body = (await request.json().catch(() => null)) as {
        product_id?: unknown;
        variation_id?: unknown;
        quantity?: unknown;
    } | null;
    const productId = Number(body?.product_id),
        quantity = Number(body?.quantity ?? 1);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(quantity) || quantity < 1)
        return NextResponse.json({ errors: [{ code: "E_VALIDATION_ERROR", message: "Invalid cart item" }] }, { status: 422 });
    const [h, c] = await Promise.all([headers(), cookies()]);
    const tenant = h.get(TENANT_HEADER);
    const cartToken = c.get("cart_token")?.value;
    const base = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3333").replace(/\/$/, "");
    const upstream = await fetch(`${base}/api/v1/cart/items`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
            ...(cartToken ? { cookie: `cart_token=${cartToken}` } : {}),
        },
        body: JSON.stringify({ product_id: productId, variation_id: body?.variation_id ?? null, quantity }),
        cache: "no-store",
    });
    if (upstream.ok) {
        void fetch(`${base}/api/v1/storefront/social/interactions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                ...(tenant ? { [TENANT_HEADER]: tenant } : {}),
            },
            body: JSON.stringify({
                event_type: "cart",
                product_id: productId,
                source_surface: "canonical_cart_path",
                anonymous_id: c.get("calibra_content_session")?.value ?? undefined,
            }),
            cache: "no-store",
        }).catch(() => undefined);
    }
    const response = new NextResponse(upstream.body, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" },
    });
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) response.headers.append("set-cookie", setCookie);
    return response;
}
