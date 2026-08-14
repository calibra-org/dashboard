import { DateTime } from "luxon";

import { currentTrx } from "#services/tenant_context";

type SchedulerKind = "publish_due" | "ingest_due";
type DbRow = Record<string, unknown>;

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export class ContentSchedulerObservabilityService {
    async begin(kind: SchedulerKind): Promise<number | null> {
        const bucket = DateTime.utc().startOf("minute").toISO();
        const rows = await currentTrx()
            .table("content_scheduler_runs")
            .insert({ job_kind: kind, scheduled_bucket: bucket, status: "running", started_at: new Date() })
            .onConflict(["tenant_id", "job_kind", "scheduled_bucket"])
            .ignore()
            .returning("id");
        const id = numberValue((rows[0] as DbRow | undefined)?.id ?? rows[0]);
        return id > 0 ? id : null;
    }

    async complete(id: number, processedCount: number) {
        await currentTrx().from("content_scheduler_runs").where("id", id).update({
            status: "completed",
            processed_count: Math.max(0, Math.trunc(processedCount)),
            last_error: null,
            finished_at: new Date(),
            updated_at: new Date(),
        });
    }

    async fail(id: number, error: unknown, processedCount = 0) {
        await currentTrx().from("content_scheduler_runs").where("id", id).update({
            status: "failed",
            processed_count: Math.max(0, Math.trunc(processedCount)),
            last_error: error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000),
            finished_at: new Date(),
            updated_at: new Date(),
        });
    }

    async list(kind?: SchedulerKind, limit = 100) {
        let query = currentTrx().from("content_scheduler_runs");
        if (kind) query = query.where("job_kind", kind);
        const rows = await query.orderBy("created_at", "desc").limit(Math.max(1, Math.min(200, limit)));
        return {
            data: rows.map((row) => ({
                ...row,
                id: numberValue(row.id),
                processed_count: numberValue(row.processed_count),
            })),
        };
    }
}

export const contentSchedulerObservabilityService = new ContentSchedulerObservabilityService();
