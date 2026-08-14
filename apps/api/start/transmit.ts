import transmit from "@adonisjs/transmit/services/main";

import ProductExport from "#models/product_export";
import ProductImport from "#models/product_import";
import { setSseClients } from "#services/metrics/domain_metrics";
import { middleware } from "#start/kernel";

/**
 * Server-Sent Events backbone — `@adonisjs/transmit` handles the HTTP plumbing, channel registry,
 * heartbeats, and lifecycle. We define authenticated routes plus resource/user authorization.
 */
transmit.registerRoutes((route) => {
    route.use(middleware.auth({ guards: ["api"] }));
});

transmit.authorize<{ importId: string }>("imports/:importId", async (ctx, { importId }) => {
    const user = ctx.auth.user;
    if (user === undefined || user === null) return false;
    const row = await ProductImport.find(importId);
    return row !== null && Number(row.userId) === Number(user.id);
});

transmit.authorize<{ exportId: string }>("exports/:exportId", async (ctx, { exportId }) => {
    const user = ctx.auth.user;
    if (user === undefined || user === null) return false;
    const row = await ProductExport.find(exportId);
    return row !== null && Number(row.userId) === Number(user.id);
});

/** Every operator may subscribe only to their own tenant-filtered ticket inbox feed. */
transmit.authorize<{ userId: string }>("ticket-inbox/users/:userId", (ctx, { userId }) => {
    const user = ctx.auth.user;
    return user !== undefined && user !== null && Number(user.id) === Number(userId);
});

const sseSubscriberCounts = new Map<string, number>();
const KNOWN_CHANNEL_ROOTS = ["imports", "exports", "ticket-inbox"] as const;
for (const root of KNOWN_CHANNEL_ROOTS) {
    sseSubscriberCounts.set(root, 0);
    setSseClients(root, 0);
}

function channelRoot(channel: string): string {
    const slash = channel.indexOf("/");
    return slash === -1 ? channel : channel.slice(0, slash);
}

transmit.on("subscribe", ({ channel }) => {
    const root = channelRoot(channel);
    const next = (sseSubscriberCounts.get(root) ?? 0) + 1;
    sseSubscriberCounts.set(root, next);
    setSseClients(root, next);
});

transmit.on("unsubscribe", ({ channel }) => {
    const root = channelRoot(channel);
    const next = Math.max(0, (sseSubscriberCounts.get(root) ?? 0) - 1);
    sseSubscriberCounts.set(root, next);
    setSseClients(root, next);
});
