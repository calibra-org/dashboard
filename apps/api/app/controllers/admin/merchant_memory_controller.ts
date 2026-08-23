import type { HttpContext } from "@adonisjs/core/http";

import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    merchantMemoryEffectivenessValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

export default class MerchantMemoryController {
    async overview({ response }: HttpContext) {
        return response.ok({ data: await memory.overview() });
    }

    async index({ response }: HttpContext) {
        return response.ok({ data: await memory.listMemories() });
    }

    async show({ params, response }: HttpContext) {
        return response.ok({ data: await memory.getMemory(params.publicId) });
    }

    async create({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.created({ data: await memory.supersedeMemory(params.publicId, payload, auth.user!) });
    }

    async retrieve({ request, response }: HttpContext) {
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        return response.ok({ data: await memory.retrieve(payload) });
    }

    async effectiveness({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(merchantMemoryEffectivenessValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }
}
