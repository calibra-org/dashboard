import { isMutationCapability } from "#services/agentic_gateway/contracts";
import { phase20TrustRiskService } from "#services/phase20_trust_risk_service";

export async function assertAgenticTrustAllowed(input: {
    principalPublicId: string;
    capabilityKey: string;
    idempotencyKey: string;
}) {
    if (!isMutationCapability(input.capabilityKey)) return null;

    const result = await phase20TrustRiskService.evaluate({
        subject_type: "agent_principal",
        subject_id: input.principalPublicId,
        signals: [],
        idempotency_key: `agentic:${input.idempotencyKey}:risk`.slice(0, 180),
    });
    const decision = String(result.data.decision?.decision ?? "allow");

    if (decision === "block") {
        throw Object.assign(new Error("Agentic action blocked by canonical trust policy"), {
            status: 403,
            code: "E_AGENTIC_TRUST_BLOCKED",
        });
    }
    if (decision !== "allow") {
        throw Object.assign(new Error("Agentic action requires canonical trust review"), {
            status: 409,
            code: "E_AGENTIC_TRUST_REVIEW",
            meta: { decision },
        });
    }
    return result;
}
