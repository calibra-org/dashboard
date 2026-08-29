import { defineConfig } from "@adonisjs/cors";

import env from "#start/env";

/**
 * CORS policy. `ALLOWED_ORIGINS` is a comma-separated allowlist (e.g.
 * `http://localhost:3000,http://localhost:3001`). Development and test may omit it for local
 * convenience; production refuses to boot without an explicit allowlist.
 *
 * @see https://docs.adonisjs.com/guides/security/cors
 */
const allowedOrigins = (env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

if (env.get("NODE_ENV") === "production" && allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS must define at least one production origin");
}

const corsConfig = defineConfig({
    enabled: true,
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
    headers: true,
    exposeHeaders: ["Cart-Token"],
    credentials: true,
    maxAge: 90,
});

export default corsConfig;
