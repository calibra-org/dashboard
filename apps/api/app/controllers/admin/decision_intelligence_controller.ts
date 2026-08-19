import type { HttpContext } from "@adonisjs/core/http";

import { recordAudit } from "#services/admin_audit_log_service";
import {
    intelligenceCaseDetail,
    intelligenceSummary,
    listIntelligenceCases,
    recordIntelligenceDecision,
    recordIntelligenceOutcome,
} from "#services/decision_intelligence_service";
import { currentTrx } from "#services/tenant_context";
import {
    adminIntelligenceDecisionValidator,
    adminIntelligenceInboxValidator,
    adminIntelligenceOutcomeValidator,
} from "#validators/admin/intelligence_validator";

export default class AdminDecisionIntelligenceController {
    async inbox({ request }: HttpContext) {
        const input = await request.validateUsing(adminIntelligenceInboxValidator, { data: request.qs() });
        return listIntelligenceCases({
            page: input.page ?? 1,
            limit: input.limit ?? 50,
            domain: input.domain,
            severity: input.severity,
            state: input.state ?? "open",
            q: input.q,
        });
    }

    async summary() {
        const data = await intelligenceSummary();
        return {
            data: {
                ...data,
                sourceCoverage: data.sourceCoverage.filter(
                    (source) => !(source.source === "phase9" && source.status === "dependency_not_landed"),
                ),
            },
        };
    }

    async show({ params, response }: HttpContext) {
        const detail = await intelligenceCaseDetail(String(params.id));
        if (!detail) return response.notFound({ error: { code: "INTELLIGENCE_CASE_NOT_FOUND" } });
        return { data: detail };
    }

    async decide(ctx: HttpContext) {
        const input = await ctx.request.validateUsing(adminIntelligenceDecisionValidator);
        const actor = await ctx.auth.authenticate();
        const result = await recordIntelligenceDecision({
            caseId: String(ctx.params.id),
            decision: input.decision,
            reason: input.reason,
            version: input.version,
            reviewerUserId: Number(actor.id),
        });
        if (result.kind === "not_found") return ctx.response.notFound({ error: { code: "INTELLIGENCE_CASE_NOT_FOUND" } });
        if (result.kind === "conflict") {
            return ctx.response.conflict({
                error: { code: "INTELLIGENCE_CASE_VERSION_CONFLICT", currentVersion: result.currentVersion },
            });
        }
        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "intelligence.decision.record",
            entityKind: "intelligence_case",
            entityId: Number(ctx.params.id),
            payload: { decision: input.decision, reason: input.reason, case_version: input.version },
            trx: currentTrx(),
            strict: true,
        });
        return { data: result };
    }

    async recordOutcome(ctx: HttpContext) {
        const input = await ctx.request.validateUsing(adminIntelligenceOutcomeValidator);
        const actor = await ctx.auth.authenticate();
        const outcome = await recordIntelligenceOutcome({
            caseId: String(ctx.params.id),
            metricName: input.metric_name,
            baselineValue: input.baseline_value,
            observedValue: input.observed_value,
            measurementWindow: input.measurement_window,
            attributionConfidence: input.attribution_confidence,
            notes: input.notes,
            observedAt: input.observed_at,
            recordedByUserId: Number(actor.id),
        });
        if (!outcome) return ctx.response.notFound({ error: { code: "INTELLIGENCE_CASE_NOT_FOUND" } });
        await recordAudit({
            ctx,
            actorUserId: Number(actor.id),
            action: "intelligence.outcome.record",
            entityKind: "intelligence_case",
            entityId: Number(ctx.params.id),
            payload: {
                metric_name: input.metric_name,
                baseline_value: input.baseline_value ?? null,
                observed_value: input.observed_value ?? null,
                measurement_window: input.measurement_window ?? null,
                attribution_confidence: input.attribution_confidence ?? null,
            },
            trx: currentTrx(),
            strict: true,
        });
        return { data: outcome };
    }
}
