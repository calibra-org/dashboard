import type { HttpContext } from "@adonisjs/core/http";

import {
    beginTotpEnrollment,
    confirmTotpEnrollment,
    generateRecoveryCodes,
    listIdentityCredentials,
    revokeIdentityCredential,
} from "#services/identity/credentials";
import { listIdentitySessions, revokeIdentitySession, revokeOtherIdentitySessions } from "#services/identity/sessions";
import { beginPasskeyRegistration, finishPasskeyRegistration } from "#services/identity/webauthn";
import IdentityRecordTransformer from "#transformers/identity_record_transformer";
import {
    identityCredentialRevokeValidator,
    identityPasskeyRegistrationValidator,
    identitySessionRevokeValidator,
    identityTotpConfirmValidator,
} from "#validators/identity/identity_validator";

function records(rows: Array<Record<string, unknown>>) {
    return rows.map((row) => new IdentityRecordTransformer(row).toObject());
}

export default class AccountIdentityController {
    async sessions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        return {
            data: records(
                await listIdentitySessions(
                    Number(user.id),
                    user.currentAccessToken ? Number(user.currentAccessToken.identifier) : null,
                ),
            ),
        };
    }

    async revokeSession(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const { reason } = await ctx.request.validateUsing(identitySessionRevokeValidator);
        await revokeIdentitySession({
            ctx,
            actorUserId: Number(user.id),
            targetUserId: Number(user.id),
            sessionId: Number(ctx.params.id),
            reason,
        });
        return { data: { revoked: true } };
    }

    async revokeOtherSessions(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const { reason } = await ctx.request.validateUsing(identitySessionRevokeValidator);
        const count = await revokeOtherIdentitySessions({
            ctx,
            userId: Number(user.id),
            currentTokenIdentifier: user.currentAccessToken ? Number(user.currentAccessToken.identifier) : null,
            reason,
        });
        return { data: { revoked: count } };
    }

    async credentials(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        return { data: records((await listIdentityCredentials(Number(user.id))) as Array<Record<string, unknown>>) };
    }

    async revokeCredential(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const { reason } = await ctx.request.validateUsing(identityCredentialRevokeValidator);
        await revokeIdentityCredential({
            actorUserId: Number(user.id),
            userId: Number(user.id),
            credentialId: Number(ctx.params.id),
            reason,
        });
        return { data: { revoked: true } };
    }

    async beginTotp(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        return { data: new IdentityRecordTransformer(await beginTotpEnrollment(Number(user.id))).toObject() };
    }

    async confirmTotp(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const { code } = await ctx.request.validateUsing(identityTotpConfirmValidator);
        const confirmed = await confirmTotpEnrollment(Number(user.id), code);
        if (!confirmed)
            return ctx.response.status(422).send({ errors: [{ message: "Invalid TOTP code", code: "E_IDENTITY_TOTP_INVALID" }] });
        return { data: { confirmed: true } };
    }

    async recoveryCodes(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const codes = await generateRecoveryCodes(Number(user.id));
        return { data: { codes } };
    }

    async beginPasskey(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        return {
            data: new IdentityRecordTransformer(
                (await beginPasskeyRegistration(Number(user.id))) as Record<string, unknown>,
            ).toObject(),
        };
    }

    async finishPasskey(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        const payload = await ctx.request.validateUsing(identityPasskeyRegistrationValidator);
        const result = await finishPasskeyRegistration({
            ctx,
            userId: Number(user.id),
            publicId: payload.verification_id,
            credentialId: payload.credential_id,
            clientDataJson: payload.client_data_json,
            authenticatorData: payload.authenticator_data,
            publicKeySpki: payload.public_key_spki,
            label: payload.label,
            transports: payload.transports,
        });
        return { data: new IdentityRecordTransformer(result as Record<string, unknown>).toObject() };
    }
}
