import crypto from "node:crypto";
import type { HttpContext } from "@adonisjs/core/http";
import mail from "@adonisjs/mail/services/main";
import { DateTime } from "luxon";

import PasswordResetToken from "#models/password_reset_token";
import User from "#models/user";
import { passwordForgotValidator } from "#validators/auth/password_validator";

const TOKEN_TTL_MINUTES = 60;

export default class PasswordForgotController {
    async handle(ctx: HttpContext) {
        const { email } = await ctx.request.validateUsing(passwordForgotValidator);
        const user = await User.findBy("email", email);
        if (user && !user.deletedAt) {
            const tokenPlain = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(tokenPlain).digest("hex");
            await PasswordResetToken.create({
                userId: user.id,
                tokenHash,
                expiresAt: DateTime.utc().plus({ minutes: TOKEN_TTL_MINUTES }),
            });
            try {
                await mail.send((message) => {
                    message
                        .to(email)
                        .subject("Calibra password reset")
                        .text(`Password reset token: ${tokenPlain}\nThis token expires in ${TOKEN_TTL_MINUTES} minutes.`);
                });
            } catch (error) {
                ctx.logger.warn({ err: error, user_id: user.id }, "password_reset_delivery_failed");
            }
        }
        return { message: "If the email matches an account, a reset link has been sent." };
    }
}
