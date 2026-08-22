import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

import { OrderStatus } from "#enums/order_status";
import Order from "#models/order";
import { isForbiddenHandlerKey, RISK_ORDER, requiresHumanApproval, type ToolRisk } from "#services/agent_orchestrator/contracts";
import { orderStateMachine } from "#services/order_state_machine";
import { currentTenantId, currentTrx } from "#services/tenant_context";

interface BuiltinHandlerDefinition {
    minimumRisk: ToolRisk;
    mutation: boolean;
    approvalRequired: boolean;
}

const BUILTIN_HANDLERS: Readonly<Record<string, BuiltinHandlerDefinition>> = {
    "catalog.product.snapshot": { minimumRisk: "read_only", mutation: false, approvalRequired: false },
    "commerce.order.read": { minimumRisk: "read_only", mutation: false, approvalRequired: false },
    "commerce.order.hold": { minimumRisk: "high", mutation: true, approvalRequired: true },
};

function parseJsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string") return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

export function handlerDefinition(handlerKey: string): BuiltinHandlerDefinition | null {
    return BUILTIN_HANDLERS[handlerKey] ?? null;
}

export async function registerTool(input: {
    toolKey: string;
    version: number;
    handlerKey: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    requiredScopes: string[];
    requiredPermission?: string | null;
    riskClass: ToolRisk;
    supportsDryRun: boolean;
    reversible: boolean;
    rollbackPlan?: string | null;
    approvalRequired: boolean;
    sideEffects: string[];
    actorUserId: number;
}) {
    const definition = handlerDefinition(input.handlerKey);
    if (isForbiddenHandlerKey(input.handlerKey) || !definition) {
        throw Object.assign(new Error("Only deterministic registered handlers are allowed"), {
            status: 422,
            code: "E_AGENT_TOOL_HANDLER_FORBIDDEN",
        });
    }
    if (RISK_ORDER[input.riskClass] < RISK_ORDER[definition.minimumRisk]) {
        throw Object.assign(new Error("Tool risk cannot be lower than the registered handler risk"), {
            status: 422,
            code: "E_AGENT_TOOL_RISK_UNDERSPECIFIED",
        });
    }

    const trx = currentTrx();
    const tenantId = Number(currentTenantId());
    const now = DateTime.utc().toSQL();
    const approvalRequired = definition.approvalRequired || requiresHumanApproval(input.riskClass, input.approvalRequired);

    const existing = await trx
        .from("agent_tool_registry")
        .where({ tenant_id: tenantId, tool_key: input.toolKey, version: input.version })
        .first();
    if (existing) {
        throw Object.assign(new Error("Tool version already exists; publish a new version instead"), {
            status: 409,
            code: "E_AGENT_TOOL_VERSION_EXISTS",
        });
    }

    const rows = await trx
        .table("agent_tool_registry")
        .insert({
            public_id: randomUUID(),
            tenant_id: tenantId,
            tool_key: input.toolKey,
            version: input.version,
            handler_key: input.handlerKey,
            input_schema: JSON.stringify(input.inputSchema),
            output_schema: JSON.stringify(input.outputSchema),
            required_scopes: JSON.stringify(input.requiredScopes),
            required_permission: input.requiredPermission ?? null,
            risk_class: input.riskClass,
            supports_dry_run: input.supportsDryRun,
            reversible: input.reversible,
            rollback_plan: input.rollbackPlan ?? null,
            approval_required: approvalRequired,
            side_effects: JSON.stringify(input.sideEffects),
            is_active: true,
            created_by_user_id: input.actorUserId,
            created_at: now,
        })
        .returning("*");
    return rows[0];
}

export async function listTools() {
    return currentTrx()
        .from("agent_tool_registry")
        .where("tenant_id", Number(currentTenantId()))
        .where("is_active", true)
        .orderBy(["tool_key", "version"]);
}

export function assertAgentScopes(agentScopesValue: unknown, toolScopesValue: unknown): void {
    const agentScopes = new Set(parseJsonArray(agentScopesValue));
    const requiredScopes = parseJsonArray(toolScopesValue);
    if (requiredScopes.some((scope) => !agentScopes.has(scope))) {
        throw Object.assign(new Error("Agent scope does not allow this registered tool"), {
            status: 403,
            code: "E_AGENT_TOOL_SCOPE_DENIED",
        });
    }
}

export async function invokeRegisteredTool(tool: Record<string, any>, input: Record<string, any>, actor: any, dryRun: boolean) {
    const definition = handlerDefinition(String(tool.handler_key));
    if (!definition) {
        throw Object.assign(new Error("Tool handler is not executable"), {
            status: 409,
            code: "E_AGENT_TOOL_NOT_EXECUTABLE",
        });
    }
    if (dryRun && !tool.supports_dry_run) {
        throw Object.assign(new Error("Tool does not support dry-run"), {
            status: 409,
            code: "E_AGENT_TOOL_DRY_RUN_UNSUPPORTED",
        });
    }

    const trx = currentTrx();
    const tenantId = Number(currentTenantId());

    if (tool.handler_key === "catalog.product.snapshot") {
        const row = await trx
            .from("products")
            .where("tenant_id", tenantId)
            .where("id", Number(input.product_id))
            .select(["id", "sku", "status", "regular_price", "sale_price", "updated_at"])
            .first();
        if (!row) {
            throw Object.assign(new Error("Product not found"), {
                status: 404,
                code: "E_AGENT_PRODUCT_NOT_FOUND",
            });
        }
        return { result: row, verification: { readback: true } };
    }

    if (tool.handler_key === "commerce.order.read") {
        const row = await trx
            .from("orders")
            .where("tenant_id", tenantId)
            .where("id", Number(input.order_id))
            .select(["id", "status", "grand_total", "currency", "updated_at"])
            .first();
        if (!row) {
            throw Object.assign(new Error("Order not found"), {
                status: 404,
                code: "E_AGENT_ORDER_NOT_FOUND",
            });
        }
        return { result: row, verification: { readback: true } };
    }

    const order = await Order.query({ client: trx })
        .where("tenant_id", tenantId)
        .where("id", Number(input.order_id))
        .forUpdate()
        .first();
    if (!order) {
        throw Object.assign(new Error("Order not found"), {
            status: 404,
            code: "E_AGENT_ORDER_NOT_FOUND",
        });
    }

    if (dryRun) {
        return {
            result: {
                would_transition: order.status === OrderStatus.Pending || order.status === OrderStatus.OnHold,
                from: order.status,
                to: OrderStatus.OnHold,
            },
            verification: { dry_run: true },
        };
    }

    if (order.status === OrderStatus.Pending) {
        await orderStateMachine.transition(order, OrderStatus.OnHold, {
            actor,
            reason: String(input.reason ?? "agent-orchestrator"),
            trx,
        });
    } else if (order.status !== OrderStatus.OnHold) {
        throw Object.assign(new Error(`Order cannot be held from ${order.status}`), {
            status: 409,
            code: "E_AGENT_ORDER_HOLD_UNSUPPORTED_STATE",
        });
    }

    const readback = await trx
        .from("orders")
        .where("tenant_id", tenantId)
        .where("id", Number(order.id))
        .select(["id", "status", "updated_at"])
        .first();
    return {
        result: { order_id: Number(order.id), status: readback?.status },
        verification: {
            readback_status: readback?.status,
            expected: OrderStatus.OnHold,
            passed: readback?.status === OrderStatus.OnHold,
        },
    };
}
