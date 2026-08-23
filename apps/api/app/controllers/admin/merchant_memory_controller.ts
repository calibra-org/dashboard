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

    async show({ params, response }: HttpContext) {
        return response.ok({ data: await memory.getMerchantMemory(params.publicId, "human") });
    }

    async create({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMerchantMemory(payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        return response.ok({
            data: await memory.retrieveMerchantMemory(
                {
                    ...payload,
                    requester_kind: "human",
                    requester_id: String(auth.user!.id),
                },
                auth.user!,
            ),
        });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.created({ data: await memory.supersedeMerchantMemory(params.publicId, payload, auth.user!) });
    }

    async feedback({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(merchantMemoryFeedbackValidator);
        return response.created({ data: await memory.recordMerchantMemoryFeedback(params.publicId, payload, auth.user!) });
    }
}