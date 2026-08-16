import type { HttpContext } from "@adonisjs/core/http";

import type { SettingValueType } from "#models/setting";
import { recordAudit } from "#services/admin_audit_log_service";
import ConfigurationRevisionService from "#services/configuration_revision_service";
import SettingsService from "#services/settings_service";
import { toMediaSettings } from "#transformers/media_settings_transformer";
import { adminMediaSettingsUpdateValidator } from "#validators/admin/media_settings_validator";

interface PlannedWrite {
    key: string;
    value: unknown;
    type: SettingValueType;
}

type MediaSettingsPayload = Awaited<ReturnType<typeof adminMediaSettingsUpdateValidator.validate>>;

export default class AdminSettingsMediaController {
    private settings = new SettingsService();
    private revisions = new ConfigurationRevisionService();

    async show() {
        return { data: await this.load() };
    }

    async update(ctx: HttpContext) {
        const payload = await ctx.request.validateUsing(adminMediaSettingsUpdateValidator);
        const current = await this.settings.all("media");
        const changedWrites = this.planWrites(payload).filter((write) => current[write.key] !== write.value);

        if (changedWrites.length > 0) {
            await this.revisions.ensureBaseline("media");
            for (const write of changedWrites) await this.settings.set("media", write.key, write.value, write.type);
            await recordAudit({
                ctx,
                action: "settings.media.patch",
                entityKind: "settings",
                entityId: null,
                payload: payload as Record<string, unknown>,
            });
        }

        return { data: await this.load() };
    }

    private planWrites(payload: MediaSettingsPayload): PlannedWrite[] {
        const writes: PlannedWrite[] = [];
        const thumb = payload.thumbnail;
        if (thumb) {
            if (thumb.width !== undefined) writes.push({ key: "thumbnail_width", value: thumb.width, type: "number" });
            if (thumb.height !== undefined) writes.push({ key: "thumbnail_height", value: thumb.height, type: "number" });
            if (thumb.crop !== undefined) writes.push({ key: "thumbnail_crop", value: thumb.crop, type: "boolean" });
        }
        const medium = payload.medium;
        if (medium) {
            if (medium.width !== undefined) writes.push({ key: "medium_width", value: medium.width, type: "number" });
            if (medium.height !== undefined) writes.push({ key: "medium_height", value: medium.height, type: "number" });
        }
        const large = payload.large;
        if (large) {
            if (large.width !== undefined) writes.push({ key: "large_width", value: large.width, type: "number" });
            if (large.height !== undefined) writes.push({ key: "large_height", value: large.height, type: "number" });
        }
        const uploads = payload.uploads;
        if (uploads) {
            if (uploads.organize_by_date !== undefined)
                writes.push({ key: "organize_uploads_by_date", value: uploads.organize_by_date, type: "boolean" });
            if (uploads.max_upload_mb !== undefined)
                writes.push({ key: "max_upload_mb", value: uploads.max_upload_mb, type: "number" });
        }
        return writes;
    }

    private async load() {
        return toMediaSettings(await this.settings.all("media"));
    }
}
