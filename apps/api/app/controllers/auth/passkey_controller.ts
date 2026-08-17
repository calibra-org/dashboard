import type { HttpContext } from "@adonisjs/core/http";
import { DateTime } from "luxon";

import User from "#models/user";
import { recordAuthEvent } from "#services/metrics/domain_metrics";
import { registerIdentitySession } from "#services/identity/sessions";
import { beginPasskeyAuthentication, finishPasskeyAuthentication } from "#services/identity/webauthn";
import UserTransformer from "#transformers/user_transformer";
import { identityPasskeyAuthenticationValidator } from "#validators/identity/identity_validator";

export default class PasskeyController {
    async begin() {
        return { data: await beginPasskeyAuthentication() };
    }

    async finish(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(identityPasskeyAuthenticationValidator);
        const proof = await finishPasskeyAuthentication({
            ctx,
            publicId: payload.verification_id,
            credentialId: payload.credential_id,
            clientDataJson: payload.client_data_json,
            authenticatorData: payload.authenticator_data,
            signature: payload.signature,
        });
        const user = await User.findOrFail(proof.userId);
        if (user.deletedAt) {
            recordAuthEvent("login_locked");
            return ctx.response.status(401).send({ errors: [{ message: "Account unavailable", code: "E_ACCOUNT_LOCKED" }] });
        }
        user.lastLoginAt = DateTime.utc();
        await user.save();
        const token = await User.accessTokens.create(user);
        await registerIdentitySession({
            ctx,
            userId: Number(user.id),
            tokenIdentifier: Number(token.identifier),
            expiresAt: token.expiresAt?.toISOString() ?? null,
            authMethod: "passkey",
        });
        recordAuthEvent("login_success");
        return {
            data: {
                user: new UserTransformer(user).toObject(),
                token: { type: "bearer", value: token.value!.release(), expires_at: token.expiresAt?.toISOString() ?? null },
            },
        };
    }
}
