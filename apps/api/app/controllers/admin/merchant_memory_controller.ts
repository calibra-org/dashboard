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
        return response.ok({ data: await memory.overview() });
    }

    async index({ request, response }: HttpContext) {
        return response.ok({
            data: await memory.listMemories({
                status: request.input("status"),
                memory_class: request.input("memory_class"),
                subject_scope: request.input("subject_scope"),
                subject_key: request.input("subject_key"),
                limit: request.input("limit"),
            }),
        });
    }

    async show({ params, response }: HttpContext) {
        return response.ok({ data: await memory.memoryDetail(params.publicId) });
    }

    async store({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.created({ data: await memory.supersedeMemory(params.publicId, payload, auth.user!) });
    }

    async retrieve({ request, response }: HttpContext) {
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        return response.ok({ data: await memory.retrieveMemories(payload) });
    }

    async retrievals({ request, response }: HttpContext) {
        return response.ok({ data: await memory.listRetrievals(request.input("limit", 100)) });
    }

    async effectiveness({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(merchantMemoryFeedbackValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }
}
