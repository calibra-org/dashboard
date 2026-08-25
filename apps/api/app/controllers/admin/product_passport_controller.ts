import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { requireRecentIdentityStepUp } from "#services/identity/step_up";
import {
    applyProductPassportAccessPreset,
    listProductPassportAccess,
    requireProductPassportPermission,
} from "#services/product_passport/permissions";
import * as passports from "#services/product_passport/product_passport_service";
import {
    productPassportAccessPresetValidator,
    productPassportCreateValidator,
    productPassportEdgeValidator,
    productPassportEvidenceStateValidator,
    productPassportEvidenceValidator,
    productPassportRegulatoryMappingValidator,
    productPassportRegulatoryStateValidator,
    productPassportStateValidator,
    productPassportUpdateValidator,
} from "#validators/product_passport/product_passport_validator";

export default class ProductPassportController {
    async overview(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.view");
        return { data: await passports.overview() };
    }

    async index(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.view");
        return { data: await passports.listPassports() };
    }

    async show(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.view");
        return { data: await passports.passportDetail(ctx.params.publicId) };
    }

    async create(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.manage");
        const payload = await ctx.request.validateUsing(productPassportCreateValidator);
        const data = await passports.createPassport(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.create",
            entityKind: "product_passport",
            entityId: data.passport.id,
            payload: {
                public_id: data.passport.public_id,
                identity_level: payload.identity_level,
                product_id: payload.product_id,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async update(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.manage");
        const payload = await ctx.request.validateUsing(productPassportUpdateValidator);
        const data = await passports.updatePassport(ctx.params.publicId, payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.update",
            entityKind: "product_passport",
            entityId: data.passport.id,
            payload: { public_id: ctx.params.publicId, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async publish(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.publish");
        await requireRecentIdentityStepUp(Number(user.id), "product.passport.publish");
        const payload = await ctx.request.validateUsing(productPassportStateValidator);
        const data = await passports.publishPassport(ctx.params.publicId, user);
        if (data.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "product_passport.publish",
                entityKind: "product_passport",
                entityId: data.passport.passport.id,
                payload: { public_id: ctx.params.publicId, version: data.version?.version ?? null, reason: payload.reason },
                strict: true,
            });
        }
        return { data };
    }

    async revoke(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.revoke");
        await requireRecentIdentityStepUp(Number(user.id), "product.passport.revoke");
        const payload = await ctx.request.validateUsing(productPassportStateValidator);
        const data = await passports.revokePassport(ctx.params.publicId, user);
        if (data.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "product_passport.revoke",
                entityKind: "product_passport",
                entityId: data.passport.passport.id,
                payload: { public_id: ctx.params.publicId, reason: payload.reason },
                strict: true,
            });
        }
        return { data };
    }

    async addEvidence(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.evidence.manage");
        const payload = await ctx.request.validateUsing(productPassportEvidenceValidator);
        const data = await passports.addEvidence(ctx.params.publicId, payload, user);
        if (data.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "product_passport.evidence.create",
                entityKind: "product_passport_evidence",
                entityId: data.evidence?.id ?? null,
                payload: {
                    passport_public_id: ctx.params.publicId,
                    evidence_type: payload.evidence_type,
                    visibility: payload.visibility,
                    reason: payload.reason,
                },
                strict: true,
            });
        }
        return ctx.response.created({ data });
    }

    async verifyEvidence(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.evidence.verify");
        await requireRecentIdentityStepUp(Number(user.id), "product.passport.evidence.verify");
        const payload = await ctx.request.validateUsing(productPassportEvidenceStateValidator);
        const data = await passports.setEvidenceStatus(
            ctx.params.publicId,
            ctx.params.evidencePublicId,
            payload.verification_status,
        );
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.evidence.verify",
            entityKind: "product_passport_evidence",
            entityId: data?.id ?? null,
            payload: {
                passport_public_id: ctx.params.publicId,
                evidence_public_id: ctx.params.evidencePublicId,
                verification_status: payload.verification_status,
                reason: payload.reason,
            },
            strict: true,
        });
        return { data };
    }

    async addEdge(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.manage");
        const payload = await ctx.request.validateUsing(productPassportEdgeValidator);
        const data = await passports.addEdge(ctx.params.publicId, payload, user);
        if (data.changed) {
            await recordAudit({
                ctx,
                actorUserId: Number(user.id),
                action: "product_passport.edge.create",
                entityKind: "product_passport_edge",
                entityId: data.edge?.id ?? null,
                payload: {
                    passport_public_id: ctx.params.publicId,
                    relation_type: payload.relation_type,
                    visibility: payload.visibility,
                    reason: payload.reason,
                },
                strict: true,
            });
        }
        return ctx.response.created({ data });
    }

    async regulatoryMappings(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.view");
        return { data: await passports.listRegulatoryMappings() };
    }

    async createRegulatoryMapping(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.regulatory.manage");
        const payload = await ctx.request.validateUsing(productPassportRegulatoryMappingValidator);
        const data = await passports.createRegulatoryMapping(payload, user);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.regulatory.create",
            entityKind: "product_passport_regulatory_mapping",
            entityId: data.id,
            payload: {
                jurisdiction: payload.jurisdiction,
                framework: payload.framework,
                framework_version: payload.framework_version,
                mapping_version: payload.mapping_version,
                reason: payload.reason,
            },
            strict: true,
        });
        return ctx.response.created({ data });
    }

    async setRegulatoryStatus(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.regulatory.manage");
        await requireRecentIdentityStepUp(Number(user.id), "product.passport.regulatory");
        const payload = await ctx.request.validateUsing(productPassportRegulatoryStateValidator);
        const data = await passports.setRegulatoryMappingStatus(ctx.params.publicId, payload.status);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.regulatory.status",
            entityKind: "product_passport_regulatory_mapping",
            entityId: data?.id ?? null,
            payload: { public_id: ctx.params.publicId, status: payload.status, reason: payload.reason },
            strict: true,
        });
        return { data };
    }

    async access(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.access.manage");
        return { data: await listProductPassportAccess() };
    }

    async accessPreset(ctx: HttpContext) {
        const user = ctx.auth.getUserOrFail();
        await requireProductPassportPermission(user, "product_passport.access.manage");
        await requireRecentIdentityStepUp(Number(user.id), "product.passport.access");
        const payload = await ctx.request.validateUsing(productPassportAccessPresetValidator);
        const data = await applyProductPassportAccessPreset(Number(user.id), payload.user_id, payload.preset);
        await recordAudit({
            ctx,
            actorUserId: Number(user.id),
            action: "product_passport.access.preset.apply",
            entityKind: "admin_user",
            entityId: payload.user_id,
            payload: { preset: payload.preset, reason: payload.reason },
            strict: true,
        });
        return { data };
    }
}
