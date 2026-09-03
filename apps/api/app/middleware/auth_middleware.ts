import type { Authenticators } from "@adonisjs/auth/types";
import type { HttpContext } from "@adonisjs/core/http";
import type { NextFn } from "@adonisjs/core/types/http";

import { recordAuthEvent } from "#services/metrics/domain_metrics";
import { maybeTenantContext, serializeTenantTransactionQueries } from "#services/tenant_context";

/**
 * Authenticates the request through one of the configured guards (`api` by default — the access
 * tokens guard) and rejects unauthenticated callers with a localized 401. The framework's
 * `E_UNAUTHORIZED_ACCESS` exception already carries an i18n key, so the exception handler is what
 * renders the final body — we only need to surface the right HTTP status.
 */
export default class AuthMiddleware {
    async handle(ctx: HttpContext, next: NextFn, options: { guards?: (keyof Authenticators)[] } = {}) {
        try {
            await ctx.auth.authenticateUsing(options.guards);
        } catch (err) {
            recordAuthEvent("token_invalid");
            throw err;
        }

        /**
         * Keep authentication itself on the framework's unmodified transaction client. Once the
         * token/user lookup has completed, opt the remaining tenant-scoped request into explicit
         * query serialization so business-layer Promise.all fan-out cannot issue overlapping
         * `pg` client queries (deprecated in pg@8.23 and removed in pg@9).
         */
        const tenantContext = maybeTenantContext();
        if (tenantContext) {
            serializeTenantTransactionQueries(tenantContext.trx);
        }

        return next();
    }
}
