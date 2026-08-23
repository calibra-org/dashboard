import type { HttpContext } from "@adonisjs/core/http";

import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    merchantMemoryFeedbackValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

export default class MerchantMemoryController {
    async overview({ response }: HttpContext) {
        return response.ok({ data: await memory.merchantMemoryOverview() });
    }

    async index({ request, response }: HttpContext) {
        return response.ok({
            data: await memory.listMerchantMemories({
                memory_class: request.input("memory_class"),
                status: request.input("status"),
                scope_kind: request.input("scope_kind"),
                privacy_level: request.input("privacy_level"),
                limit: request.input("limit") ? Number(request.input("limit")) : undefined,
            }),
        });
    }

    async show({ params, response }: HttpContext) {
        return response.ok({
            data: await memory.getMerchantMemory(params.publicId, { includeRestricted: true, includeInactive: true }),
        });
    }

    async create({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMerchantMemory(payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        return response.ok({
            data: await memory.retrieveMerchantMemory({
                query: payload.query,
                principal_type: "human",
                principal_ref: String(auth.user!.id),
                classes: payload.memory_classes,
                scope_kind: payload.scope_kind,
                scope_key: payload.scope_key,
                include_restricted: payload.include_restricted,
                limit: payload.limit,
                purpose: payload.purpose,
            }),
        });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.created({
            data: await memory.supersedeMerchantMemory(
                params.publicId,
                payload.replacement,
                payload.relation,
                payload.reason,
                auth.user!,
            ),
        });
    }

    async feedback({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(merchantMemoryFeedbackValidator);
        return response.ok({
            data: await memory.recordMerchantMemoryFeedback(
                params.retrievalPublicId,
                payload.memory_public_id,
                {
                    feedback: payload.feedback,
                    usefulness_score: payload.usefulness_score,
                    prevented_repeat_error: payload.prevented_repeat_error,
                    outcome_delta: payload.outcome_delta,
                    note: payload.note,
                },
                auth.user!,
            ),
        });
    }
}
