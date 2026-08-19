import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import { type QualityPermission, requireQualityPermission } from "#services/quality_permissions";
import { qualityTrustService } from "#services/quality_trust_service";
import {
    actionValidator,
    adjudicateFindingValidator,
    classifyValidator,
    createCaseValidator,
    evidenceValidator,
    findingValidator,
    inspectionValidator,
    listQualityValidator,
    outcomeValidator,
    reasonValidator,
    signalEvaluateValidator,
    sourceValidator,
    updateActionValidator,
    updateCaseValidator,
} from "#validators/admin/quality_trust_validator";

async function authorize(ctx: HttpContext, permission: QualityPermission): Promise<number> {
    const user = await ctx.auth.authenticate();
    await requireQualityPermission({ id: user.id, role: user.role }, permission);
    return Number(user.id);
}

function idempotencyKey(ctx: HttpContext): string | undefined {
    return ctx.request.header("idempotency-key")?.trim() || undefined;
}

function failure(ctx: HttpContext, error: unknown) {
    const status = Number((error as { status?: number })?.status ?? 500);
    if (status >= 500) ctx.logger.error({ err: error }, "quality_trust_request_failed");
    return ctx.response
        .status(status)
        .send({ error: { message: error instanceof Error ? error.message : "quality operation failed" } });
}

export default class QualityTrustController {
    async overview(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.overview();
    }

    async cases(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.listCases(await ctx.request.validateUsing(listQualityValidator));
    }

    async showCase(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        const data = await qualityTrustService.caseDetail(Number(ctx.params.id));
        return data ? { data } : ctx.response.notFound({ error: { message: "quality case not found" } });
    }

    async createCase(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(createCaseValidator);
            const result = await qualityTrustService.createCase(
                data,
                await authorize(ctx, "quality.cases.manage"),
                idempotencyKey(ctx),
            );
            await recordAudit({
                ctx,
                action: "quality.case.created",
                entityKind: "quality_case",
                entityId: result.data.id,
                payload: { replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async updateCase(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(updateCaseValidator);
            const result = await qualityTrustService.updateCase(
                Number(ctx.params.id),
                data,
                await authorize(ctx, "quality.cases.manage"),
            );
            if (!result) return ctx.response.notFound({ error: { message: "quality case not found" } });
            await recordAudit({
                ctx,
                action: "quality.case.updated",
                entityKind: "quality_case",
                entityId: result.id,
                payload: { status: result.status, version: result.version },
                strict: true,
            });
            return { data: result };
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async addSource(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(sourceValidator);
            const result = await qualityTrustService.addSource(
                Number(ctx.params.id),
                data,
                await authorize(ctx, "quality.cases.manage"),
            );
            await recordAudit({
                ctx,
                action: "quality.case.source_linked",
                entityKind: "quality_case",
                entityId: Number(ctx.params.id),
                payload: { source_id: result.id },
                strict: true,
            });
            return ctx.response.created({ data: result });
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async addEvidence(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(evidenceValidator);
            const result = await qualityTrustService.addEvidence(
                Number(ctx.params.id),
                data,
                await authorize(ctx, "quality.cases.manage"),
            );
            await recordAudit({
                ctx,
                action: "quality.evidence.recorded",
                entityKind: "quality_case",
                entityId: Number(ctx.params.id),
                payload: { evidence_id: result.data.id, replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async addFinding(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(findingValidator);
            const result = await qualityTrustService.addFinding(
                Number(ctx.params.id),
                data,
                await authorize(ctx, "quality.cases.manage"),
                idempotencyKey(ctx),
            );
            await recordAudit({
                ctx,
                action: "quality.finding.recorded",
                entityKind: "quality_case",
                entityId: Number(ctx.params.id),
                payload: { finding_id: result.data.id, replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async adjudicateFinding(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(adjudicateFindingValidator);
            const result = await qualityTrustService.adjudicateFinding(
                Number(ctx.params.id),
                Number(ctx.params.findingId),
                data,
                await authorize(ctx, "quality.cases.manage"),
            );
            await recordAudit({
                ctx,
                action: "quality.finding.adjudicated",
                entityKind: "quality_case",
                entityId: Number(ctx.params.id),
                payload: { finding_id: result.id, truth_state: result.truth_state },
                strict: true,
            });
            return { data: result };
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async inspect(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(inspectionValidator);
            const result = await qualityTrustService.inspectReturnItem(
                Number(ctx.params.returnId),
                Number(ctx.params.itemId),
                data,
                await authorize(ctx, "quality.inspections.manage"),
                idempotencyKey(ctx),
            );
            if (!result) return ctx.response.notFound({ error: { message: "return item not found" } });
            await recordAudit({
                ctx,
                action: "quality.return_item.inspected",
                entityKind: "order_return_item",
                entityId: Number(ctx.params.itemId),
                payload: { inspection_id: result.data.id, replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async returns(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.returns(await ctx.request.validateUsing(listQualityValidator));
    }

    async voc(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.voc(await ctx.request.validateUsing(listQualityValidator));
    }

    async classify(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(classifyValidator);
            const result = await qualityTrustService.classify(
                data,
                await authorize(ctx, "quality.voc.manage"),
                idempotencyKey(ctx),
            );
            await recordAudit({
                ctx,
                action: "quality.feedback.classified",
                entityKind: "feedback_classification",
                entityId: result.data.id,
                payload: { replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async signals(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.listSignals(await ctx.request.validateUsing(listQualityValidator));
    }

    async evaluateSignals(ctx: HttpContext) {
        try {
            await authorize(ctx, "quality.signals.manage");
            const data = await ctx.request.validateUsing(signalEvaluateValidator);
            const result = await qualityTrustService.evaluateSignals(data);
            await recordAudit({
                ctx,
                action: "quality.signals.evaluated",
                entityKind: "quality_signal",
                entityId: null,
                payload: result.data,
                strict: true,
            });
            return result;
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async acknowledgeSignal(ctx: HttpContext) {
        const result = await qualityTrustService.transitionSignal(
            Number(ctx.params.id),
            "acknowledge",
            await authorize(ctx, "quality.signals.manage"),
        );
        if (!result) return ctx.response.notFound({ error: { message: "signal not found" } });
        await recordAudit({
            ctx,
            action: "quality.signal.acknowledged",
            entityKind: "quality_signal",
            entityId: result.id,
            payload: {},
            strict: true,
        });
        return { data: result };
    }

    async resolveSignal(ctx: HttpContext) {
        const result = await qualityTrustService.transitionSignal(
            Number(ctx.params.id),
            "resolve",
            await authorize(ctx, "quality.signals.manage"),
        );
        if (!result) return ctx.response.notFound({ error: { message: "signal not found" } });
        await recordAudit({
            ctx,
            action: "quality.signal.resolved",
            entityKind: "quality_signal",
            entityId: result.id,
            payload: {},
            strict: true,
        });
        return { data: result };
    }

    async actions(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.listActions(await ctx.request.validateUsing(listQualityValidator));
    }

    async createAction(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(actionValidator);
            const result = await qualityTrustService.createAction(
                data,
                await authorize(ctx, "quality.actions.manage"),
                idempotencyKey(ctx),
            );
            await recordAudit({
                ctx,
                action: "quality.action.created",
                entityKind: "quality_case",
                entityId: Number(data.quality_case_id),
                payload: { action_id: result.data.id, replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async updateAction(ctx: HttpContext) {
        try {
            await authorize(ctx, "quality.actions.manage");
            const data = await ctx.request.validateUsing(updateActionValidator);
            const result = await qualityTrustService.updateAction(Number(ctx.params.id), data);
            if (!result) return ctx.response.notFound({ error: { message: "action not found" } });
            await recordAudit({
                ctx,
                action: "quality.action.updated",
                entityKind: "quality_case",
                entityId: result.quality_case_id,
                payload: { action_id: result.id, status: result.status },
                strict: true,
            });
            return { data: result };
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async createOutcome(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(outcomeValidator);
            const result = await qualityTrustService.createOutcome(
                data,
                await authorize(ctx, "quality.actions.manage"),
                idempotencyKey(ctx),
            );
            await recordAudit({
                ctx,
                action: "quality.outcome.recorded",
                entityKind: "quality_case",
                entityId: Number(data.quality_case_id),
                payload: { outcome_id: result.data.id, replayed: result.replayed },
                strict: true,
            });
            return ctx.response.status(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async reasons(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.reasons();
    }

    async createReason(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(reasonValidator);
            return ctx.response.created({
                data: await qualityTrustService.createReason(data, await authorize(ctx, "quality.taxonomy.manage")),
            });
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async createReasonVersion(ctx: HttpContext) {
        try {
            const data = await ctx.request.validateUsing(reasonValidator);
            const result = await qualityTrustService.createReasonVersion(
                Number(ctx.params.id),
                data,
                await authorize(ctx, "quality.taxonomy.manage"),
            );
            return result
                ? ctx.response.created({ data: result })
                : ctx.response.notFound({ error: { message: "reason definition not found" } });
        } catch (error) {
            return failure(ctx, error);
        }
    }

    async traceability(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.traceability();
    }

    async supplierQuality(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.supplierQuality();
    }

    async metrics(ctx: HttpContext) {
        await authorize(ctx, "quality.view");
        return qualityTrustService.metrics();
    }

    async audit(ctx: HttpContext) {
        await authorize(ctx, "quality.audit.view");
        const caseId = ctx.request.input("case_id");
        return qualityTrustService.audit(caseId ? Number(caseId) : undefined);
    }
}
