import type { HttpContext } from "@adonisjs/core/http";

import {
    hasExplicitMerchantMemoryPermission,
    requireExplicitMerchantMemoryPermission,
    requireMerchantMemoryPermission,
} from "#services/merchant_memory/permissions";
import * as memory from "#services/phase26_merchant_memory_service";
import {
    addMerchantMemoryEvidenceValidator,
    createMerchantMemoryValidator,
    merchantMemoryFeedbackValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

export default class MerchantMemoryController {
    async overview({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        return response.ok({ data: await memory.overview() });
    }

    async memories({ auth, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const allowRestricted = await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        const memoryClass = request.input("memory_class");
        const status = request.input("status");
        const limit = Number(request.input("limit") ?? 50);
        return response.ok({
            data: await memory.listMemories(
                {
                    memory_class: typeof memoryClass === "string" ? memoryClass : undefined,
                    status: typeof status === "string" ? status : undefined,
                    limit: Number.isFinite(limit) ? limit : 50,
                },
                allowRestricted,
            ),
        });
    }

    async memory({ auth, params, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const allowRestricted = await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        return response.ok({ data: await memory.memoryDetail(params.publicId, allowRestricted) });
    }

    async create({ auth, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.create");
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        if (payload.privacy_mode === "restricted" || payload.visibility_scope === "restricted_humans") {
            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async addEvidence({ auth, params, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.create");
        const access = await memory.memoryAccessClass(params.publicId);
        if (access.restricted) await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        const payload = await request.validateUsing(addMerchantMemoryEvidenceValidator);
        return response.created({ data: await memory.addEvidence(params.publicId, payload, access.restricted) });
    }

    async supersede({ auth, params, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        const access = await memory.memoryAccessClass(params.publicId);
        const restricted =
            access.restricted ||
            payload.replacement.privacy_mode === "restricted" ||
            payload.replacement.visibility_scope === "restricted_humans";
        if (restricted) await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        return response.created({
            data: await memory.supersedeMemory(
                params.publicId,
                payload.relation,
                payload.reason,
                payload.replacement,
                auth.user!,
                restricted,
            ),
        });
    }

    async retrieve({ auth, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.retrieve");
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        const allowRestricted =
            payload.requester_type === "human" &&
            (await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted"));
        return response.ok({ data: await memory.retrieveMemory(payload, { allowRestricted }) });
    }

    async feedback({ auth, params, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.effectiveness");
        const payload = await request.validateUsing(merchantMemoryFeedbackValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }

    async effectiveness({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.effectiveness");
        return response.ok({ data: await memory.effectiveness() });
    }
}
