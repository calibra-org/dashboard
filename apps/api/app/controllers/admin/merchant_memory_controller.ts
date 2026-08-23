import type { HttpContext } from "@adonisjs/core/http";

import {
    hasMerchantMemoryPermission,
    requireMerchantMemoryPermission,
} from "#services/merchant_memory/permissions";
import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    merchantMemoryFeedbackValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

export default class MerchantMemoryController {
    async overview({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        return response.ok({ data: await memory.merchantMemoryOverview() });
    }

    async index({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const restricted = await hasMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        const rows = await memory.listMerchantMemories({
            memory_class: request.input("memory_class"),
            status: request.input("status"),
            scope_kind: request.input("scope_kind"),
            privacy_level: request.input("privacy_level"),
            limit: request.input("limit") ? Number(request.input("limit")) : undefined,
        });
        return response.ok({
            data: restricted ? rows : rows.filter((row) => row.privacy_level !== "restricted"),
        });
    }

    async show({ params, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const restricted = await hasMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        return response.ok({
            data: await memory.getMerchantMemory(params.publicId, {
                includeRestricted: restricted,
                includeInactive: true,
            }),
        });
    }

    async create({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.create");
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        if (payload.privacy_level === "restricted") {
            await requireMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
        return response.created({ data: await memory.createMerchantMemory(payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.retrieve");
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        const restricted = payload.include_restricted
            ? await hasMerchantMemoryPermission(auth.user!, "merchant_memory.restricted")
            : false;
        return response.ok({
            data: await memory.retrieveMerchantMemory({
                query: payload.query,
                principal_type: "human",
                principal_ref: String(auth.user!.id),
                classes: payload.memory_classes,
                scope_kind: payload.scope_kind,
                scope_key: payload.scope_key,
                include_restricted: restricted,
                limit: payload.limit,
                purpose: payload.purpose,
            }),
        });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        if (payload.replacement.privacy_level === "restricted") {
            await requireMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
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
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.effectiveness");
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
