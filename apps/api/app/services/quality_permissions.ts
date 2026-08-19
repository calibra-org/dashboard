import { currentTenantId, currentTrx } from "#services/tenant_context";

export const QUALITY_PERMISSIONS = [
    "quality.view",
    "quality.cases.manage",
    "quality.inspections.manage",
    "quality.voc.manage",
    "quality.signals.manage",
    "quality.actions.manage",
    "quality.taxonomy.manage",
    "quality.audit.view",
] as const;

export type QualityPermission = (typeof QUALITY_PERMISSIONS)[number];

export async function requireQualityPermission(
    user: { id: string | number | bigint; role: string },
    permission: QualityPermission,
): Promise<void> {
    if (user.role !== "admin") {
        const error = new Error("Quality permission denied") as Error & { status?: number; code?: string };
        error.status = 403;
        error.code = "E_QUALITY_PERMISSION_DENIED";
        throw error;
    }
    const override = await currentTrx()
        .from("admin_permissions")
        .where("tenant_id", Number(currentTenantId()))
        .where("user_id", Number(user.id))
        .where("permission", permission)
        .first();
    if (override && !override.allowed) {
        const error = new Error("Quality permission denied") as Error & { status?: number; code?: string };
        error.status = 403;
        error.code = "E_QUALITY_PERMISSION_DENIED";
        throw error;
    }
}
