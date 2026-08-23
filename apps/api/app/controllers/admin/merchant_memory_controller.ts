import type { HttpContext } from "@adonisjs/core/http";

import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    recordMerchantMemoryEffectivenessValidator,
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
                memory_class: request.input("memory_class") || undefined,
                status: request.input("status") || undefined,
                subject_type: request.input("subject_type") || undefined,
                subject_id: request.input("subject_id") || undefined,
            }),
        });
    }

    async show({ params, response }: HttpContext) {
        return response.ok({ data: await memory.memoryDetail(params.publicId) });
    }

    async create({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.created({ data: await memory.supersedeMemory(params.publicId, payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        return response.ok({ data: await memory.retrieveMemories(payload, auth.user!) });
    }

    async effectiveness({ params, request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(recordMerchantMemoryEffectivenessValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }

    async revoke({ params, auth, response }: HttpContext) {
        return response.ok({ data: await memory.revokeMemory(params.publicId, auth.user!) });
    }
}
