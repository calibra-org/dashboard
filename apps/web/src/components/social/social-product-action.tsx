"use client";
import { useState } from "react";
export function SocialProductAction({ productId, label = "Add to cart" }: { productId: number; label?: string }) {
    const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
    return (
        <div className="flex flex-col gap-1">
            <button
                type="button"
                disabled={state === "busy"}
                onClick={async () => {
                    setState("busy");
                    try {
                        const r = await fetch("/api/social/cart", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ product_id: productId, quantity: 1 }),
                        });
                        setState(r.ok ? "done" : "error");
                    } catch {
                        setState("error");
                    }
                }}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
                {state === "busy" ? "Adding…" : label}
            </button>
            <span aria-live="polite" className="text-xs text-muted-foreground">
                {state === "done" ? "Added to cart" : state === "error" ? "Could not add to cart" : ""}
            </span>
        </div>
    );
}
