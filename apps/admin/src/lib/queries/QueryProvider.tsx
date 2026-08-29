"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createStore, del, get, set } from "idb-keyval";
import { lazy, Suspense, useState } from "react";

const ReactQueryDevtools =
    process.env.NODE_ENV === "development"
        ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
        : null;

/**
 * 24-hour budget. Anything older than this is discarded on rehydrate, so a tab left open for days
 * never resurfaces stale dashboard numbers from yesterday.
 */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Bumped whenever the persisted query shape changes (queryFn return type, queryKey schema). A
 * mismatch wipes the cache instead of trying to rehydrate stale entries into new types.
 *
 * Bumped to "v2" on the namespace-per-origin + refetch-on-mount fix so any browser carrying a
 * pre-existing "v1" cache (which could have absorbed an empty snapshot from a now-purged spin)
 * gets a clean rehydrate on first load.
 */
const PERSIST_BUSTER = "v2";

const STORE_KEY = "react-query-cache";

/**
 * Per-origin IDB database name. Different spins / staging / production all hit different
 * origins (`admin.<slug>.spin.localhost:<caddyHttps>`, `admin.staging.example.com`, …); giving
 * each its own IDB database prevents one environment's cache from rehydrating into another.
 */
function storeName(): string {
    return `calibra-admin-query-cache:${window.location.host}`;
}

/**
 * Builds a QueryClient with admin-panel defaults:
 *
 * - `staleTime: 5 min` so dashboard widgets dedupe across components that mount together.
 * - `gcTime: 24h` matches the persistence budget so valid persisted data is not collected first.
 * - `retry: 1` keeps the UI snappy when the API is down without spinning on every render.
 * - `refetchOnWindowFocus: true` refreshes operator data when returning to the admin tab.
 * - `refetchOnMount: "always"` keeps the network authoritative even after optimistic cache paint.
 */
function buildClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 5 * 60 * 1000,
                gcTime: CACHE_MAX_AGE_MS,
                retry: 1,
                refetchOnWindowFocus: true,
                refetchOnMount: "always",
            },
        },
    });
}

/**
 * Creates a universal async persister whose IndexedDB access is lazy and browser-only. The same
 * `PersistQueryClientProvider` therefore renders during SSR and the browser's first hydration
 * pass. TanStack keeps queries in an idle fetch state while restoration is in progress, so query
 * state cannot diverge between the server markup and the initial client render.
 */
function buildPersister() {
    let idbStore: ReturnType<typeof createStore> | null = null;

    const browserStore = () => {
        if (typeof window === "undefined") return null;
        idbStore ??= createStore(storeName(), "kv");
        return idbStore;
    };

    return createAsyncStoragePersister({
        storage: {
            getItem: async (key) => {
                const store = browserStore();
                if (store === null) return null;
                const value = await get(key, store);
                return typeof value === "string" ? value : null;
            },
            setItem: async (key, value) => {
                const store = browserStore();
                if (store !== null) await set(key, value, store);
            },
            removeItem: async (key) => {
                const store = browserStore();
                if (store !== null) await del(key, store);
            },
        },
        key: STORE_KEY,
        throttleTime: 1000,
        /** Quietly evict the oldest query if the serialized cache grows past browser quotas. */
        retry: removeOldestQuery,
    });
}

/**
 * Restrict persistence to keys we know are safe to rehydrate. Any query rooted at one of these
 * tags survives full reloads; everything else stays in-memory only and refetches on next mount.
 */
const PERSIST_ROOTS = new Set(["dashboard"]);

/**
 * Holds one QueryClient and one provider shape for the entire authenticated admin tree. Keeping
 * the provider type stable is load-bearing: swapping from QueryClientProvider to
 * PersistQueryClientProvider after mount remounts the subtree, resets local UI state, and can make
 * the first SSR/client query states disagree. The persister itself lazily touches IndexedDB only
 * in the browser, so this provider is safe to render on both sides.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = useState(buildClient);
    const [persister] = useState(buildPersister);

    const devtools =
        ReactQueryDevtools !== null ? (
            <Suspense fallback={null}>
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            </Suspense>
        ) : null;

    return (
        <PersistQueryClientProvider
            client={client}
            persistOptions={{
                persister,
                maxAge: CACHE_MAX_AGE_MS,
                buster: PERSIST_BUSTER,
                dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                        const root = query.queryKey[0];
                        return typeof root === "string" && PERSIST_ROOTS.has(root) && query.state.status === "success";
                    },
                },
            }}
        >
            {children}
            {devtools}
        </PersistQueryClientProvider>
    );
}
