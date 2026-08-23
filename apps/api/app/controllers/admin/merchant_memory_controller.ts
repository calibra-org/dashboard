import type { HttpContext } from "@adonisjs/core/http";

import {
    hasExplicitMerchantMemoryPermission,
    requireMerchantMemoryPermission,
} from "#services/merchant_memory/permissions";
import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    merchantMemoryEffectivenessValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

export default class MerchantMemoryController {
    async overview({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        return response.ok({ data: await memory.overview() });
    }

    async create({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.create");
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.retrieve");
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        const restricted = await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        const accessScopes = restricted ? ["tenant_admin", "restricted_humans"] : ["tenant_admin"];
        return response.ok({
            data: await memory.retrieveMemory({
                ...payload,
                requester_type: "human",
                requester_ref: String(auth.user!.id),
                access_scopes: accessScopes,
            }),
        });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        return response.ok({
            data: await memory.supersedeMemory(params.publicId, payload.successor_public_id, payload.reason, auth.user!),
        });
    }

    async expireDue({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        return response.ok({ data: await memory.expireDueMemory() });
    }

    async effectiveness({ params, request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.effectiveness");
        const payload = await request.validateUsing(merchantMemoryEffectivenessValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }
}
