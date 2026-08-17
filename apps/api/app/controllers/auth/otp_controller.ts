import { randomUUID } from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import hash from "@adonisjs/core/services/hash";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";

import User from "#models/user";
import { registerIdentitySession } from "#services/identity/sessions";
import {
    consumeVerifiedTransaction,
    requestVerification,
    resendVerification,
    verifyChallenge,
} from "#services/identity/verification";
import { recordAuthEvent } from "#services/metrics/domain_metrics";
import { otpService } from "#services/otp_service";
import { currentTenantId } from "#services/tenant_context";
import UserTransformer from "#transformers/user_transformer";
import { otpRequestValidator, otpResendValidator, otpVerifyValidator } from "#validators/auth/otp_validator";

export default class OtpController {
    async request(ctx: HttpContext) {
        const { identifier, channel } = await ctx.request.validateUsing(otpRequestValidator);
        const result = await requestVerification({ ctx, identifier, channel, purpose: "login" });
        return { data: { verification_id: result.publicId, expires_in: result.expiresIn, delivery: result.delivery } };
    }

    async resend(ctx: HttpContext) {
        const { identifier, verification_id: verificationId } = await ctx.request.validateUsing(otpResendValidator);
        const result = await resendVerification({ ctx, publicId: verificationId, identifier });
        return { data: { verification_id: result.publicId, expires_in: result.expiresIn, delivery: result.delivery } };
    }

    async verify(ctx: HttpContext) {
        const { identifier, code } = await ctx.request.validateUsing(otpVerifyValidator);
        const publicId =
            typeof ctx.request.input("verification_id") === "string" ? String(ctx.request.input("verification_id")) : undefined;
        const proof = await verifyChallenge({ ctx, identifier, code, purpose: "login", publicId });
        const legacy = proof.ok ? false : await otpService.verify(identifier, code, "login");
        if (!proof.ok && !legacy) {
            recordAuthEvent("login_fail");
            return ctx.response.status(422).send({
                errors: [
                    { message: ctx.i18n.t("errors.auth.invalid_otp", {}, "Invalid or expired code"), code: "E_INVALID_OTP" },
                ],
            });
        }

        const resolvedIdentifier = proof.ok ? proof.identifier : identifier;
        const isEmail = resolvedIdentifier.includes("@");
        const column = isEmail ? "email" : "phone";
        const value = isEmail ? resolvedIdentifier.toLowerCase() : resolvedIdentifier;
        const tenantId = Number(currentTenantId());
        let user = (await User.query().where(column, value).where("tenant_id", tenantId).first()) as User | null;

        if (user?.deletedAt) {
            recordAuthEvent("login_locked");
            return ctx.response.status(401).send({ errors: [{ message: "Account unavailable", code: "E_ACCOUNT_LOCKED" }] });
        }

        if (!user) {
            const passwordHash = await hash.make(randomUUID());
            const now = DateTime.utc().toSQL()!;
            const inserted = await db
                .connection("postgres_admin")
                .table("users")
                .insert({
                    tenant_id: tenantId,
                    email: isEmail ? value : null,
                    phone: isEmail ? null : value,
                    password_hash: passwordHash,
                    role: "customer",
                    locale: ctx.i18n.locale ?? "fa",
                    last_login_at: now,
                    created_at: now,
                    updated_at: now,
                })
                .returning(["id"]);
            user = (await User.query({ client: db.connection("postgres_admin") })
                .where("id", Number(inserted[0].id))
                .firstOrFail()) as User;
        } else {
            user.lastLoginAt = DateTime.utc();
            await user.save();
        }

        const token = await User.accessTokens.create(user);
        await registerIdentitySession({
            ctx,
            userId: Number(user.id),
            tokenIdentifier: Number(token.identifier),
            expiresAt: token.expiresAt?.toISOString() ?? null,
            authMethod: proof.ok ? proof.method : "legacy_otp",
        });
        if (proof.ok) await consumeVerifiedTransaction(proof.verificationId, Number(user.id));
        recordAuthEvent("login_success");

        return {
            data: {
                user: new UserTransformer(user).toObject(),
                token: { type: "bearer", value: token.value!.release(), expires_at: token.expiresAt?.toISOString() ?? null },
            },
        };
    }
}
