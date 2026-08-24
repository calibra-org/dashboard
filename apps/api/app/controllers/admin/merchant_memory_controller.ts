import { Exception } from "@adonisjs/core/exceptions";
import type { HttpContext } from "@adonisjs/core/http";

import {
    hasExplicitMerchantMemoryPermission,
    requireApprovedAgentPrincipal,
    requireExplicitMerchantMemoryPermission,
    requireMerchantMemoryPermission,
} from "#services/merchant_memory/permissions";
import * as memory from "#services/phase26_merchant_memory_service";
import {
    createMerchantMemoryValidator,
    recordMerchantMemoryEffectivenessValidator,
    retrieveMerchantMemoryValidator,
    supersedeMerchantMemoryValidator,
} from "#validators/admin/phase26_merchant_memory_validator";

function isSensitive(value: Record<string, unknown>) {
    return value.sensitivity === "customer_level_sensitive";
}

export default class MerchantMemoryController {
    async overview({ auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        return response.ok({ data: await memory.overview() });
    }

    async index({ auth, request, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const allowRestricted = await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        const data = await memory.listMemories({
            memory_class: request.input("memory_class") || undefined,
            status: request.input("status") || undefined,
            subject_type: request.input("subject_type") || undefined,
            subject_id: request.input("subject_id") || undefined,
        });
        return response.ok({
            data: allowRestricted ? data : data.filter((item) => item.sensitivity !== "customer_level_sensitive"),
        });
    }

    async show({ auth, params, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.view");
        const data = await memory.memoryDetail(params.publicId);
        if (isSensitive(data) && !(await hasExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted"))) {
            throw new Exception("Merchant memory not found", { status: 404, code: "E_MERCHANT_MEMORY_NOT_FOUND" });
        }
        return response.ok({ data });
    }

    async create({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.create");
        const payload = await request.validateUsing(createMerchantMemoryValidator);
        if (payload.sensitivity === "customer_level_sensitive") {
            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
        return response.created({ data: await memory.createMemory(payload, auth.user!) });
    }

    async supersede({ params, request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        const current = await memory.memoryDetail(params.publicId);
        const payload = await request.validateUsing(supersedeMerchantMemoryValidator);
        if (isSensitive(current) || payload.sensitivity === "customer_level_sensitive") {
            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
        return response.created({ data: await memory.supersedeMemory(params.publicId, payload, auth.user!) });
    }

    async retrieve({ request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.retrieve");
        const payload = await request.validateUsing(retrieveMerchantMemoryValidator);
        let agentPrincipal: Awaited<ReturnType<typeof requireApprovedAgentPrincipal>> | null = null;
        if (payload.consumer === "agent") {
            if (!payload.agent_principal_key) {
                throw new Exception("Agent retrieval requires an approved principal key", {
                    status: 403,
                    code: "E_MERCHANT_MEMORY_AGENT_PRINCIPAL_REQUIRED",
                });
            }
            agentPrincipal = await requireApprovedAgentPrincipal(payload.agent_principal_key);
            payload.include_customer_sensitive = false;
        } else if (payload.include_customer_sensitive) {
            await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        }
        return response.ok({ data: await memory.retrieveMemories(payload, auth.user!, agentPrincipal) });
    }

    async effectiveness({ params, request, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.effectiveness");
        const payload = await request.validateUsing(recordMerchantMemoryEffectivenessValidator);
        return response.created({ data: await memory.recordEffectiveness(params.publicId, payload, auth.user!) });
    }

    async revoke({ params, auth, response }: HttpContext) {
        await requireMerchantMemoryPermission(auth.user!, "merchant_memory.supersede");
        const current = await memory.memoryDetail(params.publicId);
        if (isSensitive(current)) await requireExplicitMerchantMemoryPermission(auth.user!, "merchant_memory.restricted");
        return response.ok({ data: await memory.revokeMemory(params.publicId, auth.user!) });
    }
}
