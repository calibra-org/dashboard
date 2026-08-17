import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { authLimiter } from "#start/limiter";

const AccountIdentityController = () => import("#controllers/account/identity_controller");

router
    .group(() => {
        router.get("/sessions", [AccountIdentityController, "sessions"]).as("account.identity.sessions");
        router
            .delete("/sessions/:id", [AccountIdentityController, "revokeSession"])
            .as("account.identity.sessions.revoke")
            .use(authLimiter);
        router
            .post("/sessions/revoke-others", [AccountIdentityController, "revokeOtherSessions"])
            .as("account.identity.sessions.revoke_others")
            .use(authLimiter);
        router.get("/credentials", [AccountIdentityController, "credentials"]).as("account.identity.credentials");
        router
            .delete("/credentials/:id", [AccountIdentityController, "revokeCredential"])
            .as("account.identity.credentials.revoke")
            .use(authLimiter);
        router.post("/totp/begin", [AccountIdentityController, "beginTotp"]).as("account.identity.totp.begin").use(authLimiter);
        router
            .post("/totp/confirm", [AccountIdentityController, "confirmTotp"])
            .as("account.identity.totp.confirm")
            .use(authLimiter);
        router
            .post("/recovery-codes", [AccountIdentityController, "recoveryCodes"])
            .as("account.identity.recovery_codes")
            .use(authLimiter);
        router
            .post("/passkeys/begin", [AccountIdentityController, "beginPasskey"])
            .as("account.identity.passkeys.begin")
            .use(authLimiter);
        router
            .post("/passkeys/finish", [AccountIdentityController, "finishPasskey"])
            .as("account.identity.passkeys.finish")
            .use(authLimiter);
    })
    .prefix("/api/v1/account/identity")
    .use(middleware.auth({ guards: ["api"] }));
