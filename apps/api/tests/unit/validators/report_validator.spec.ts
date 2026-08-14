import { test } from "@japa/runner";

import { adminReportStatsValidator, adminReportTableValidator } from "#validators/admin/report_validator";

test.group("report date bounds", () => {
    test("expands date-only report bounds to the full inclusive UTC day", async ({ assert }) => {
        const stats = await adminReportStatsValidator.validate({
            date_from: "2026-08-01",
            date_to: "2026-08-14",
            compare_from: "2026-07-01",
            compare_to: "2026-07-31",
        });

        assert.equal(stats.date_from, "2026-08-01T00:00:00.000Z");
        assert.equal(stats.date_to, "2026-08-14T23:59:59.999Z");
        assert.equal(stats.compare_from, "2026-07-01T00:00:00.000Z");
        assert.equal(stats.compare_to, "2026-07-31T23:59:59.999Z");
    });

    test("preserves explicit timestamp precision for sub-day report windows", async ({ assert }) => {
        const table = await adminReportTableValidator.validate({
            date_from: "2026-08-14T05:30:00.000Z",
            date_to: "2026-08-14T06:30:00.000Z",
        });

        assert.equal(table.date_from, "2026-08-14T05:30:00.000Z");
        assert.equal(table.date_to, "2026-08-14T06:30:00.000Z");
    });
});
