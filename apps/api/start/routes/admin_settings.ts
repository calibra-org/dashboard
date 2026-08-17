import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const AdminSettingsGeneralController = () => import("#controllers/admin/settings_general_controller");
const AdminSettingsDatetimeController = () => import("#controllers/admin/settings_datetime_controller");
const AdminSettingsMediaController = () => import("#controllers/admin/settings_media_controller");
const AdminSettingsBrandingController = () => import("#controllers/admin/settings_branding_controller");
const AdminConfigurationController = () => import("#controllers/admin/configuration_controller");

router
    .group(() => {
        router.get("/general", [AdminSettingsGeneralController, "show"]).as("admin.settings.general.show");
        router
            .patch("/general", [AdminSettingsGeneralController, "update"])
            .as("admin.settings.general.update")
            .use(adminWriteLimiter);
        router.get("/datetime", [AdminSettingsDatetimeController, "show"]).as("admin.settings.datetime.show");
        router
            .patch("/datetime", [AdminSettingsDatetimeController, "update"])
            .as("admin.settings.datetime.update")
            .use(adminWriteLimiter);
        router.get("/media", [AdminSettingsMediaController, "show"]).as("admin.settings.media.show");
        router.patch("/media", [AdminSettingsMediaController, "update"]).as("admin.settings.media.update").use(adminWriteLimiter);
        router.get("/branding", [AdminSettingsBrandingController, "show"]).as("admin.settings.branding.show");
        router
            .patch("/branding", [AdminSettingsBrandingController, "update"])
            .as("admin.settings.branding.update")
            .use(adminWriteLimiter);

        router
            .get("/configuration/registry", [AdminConfigurationController, "registry"])
            .as("admin.settings.configuration.registry");
        router
            .get("/configuration/definitions", [AdminConfigurationController, "definitions"])
            .as("admin.settings.configuration.definitions");
        router
            .get("/configuration/groups/:group", [AdminConfigurationController, "group"])
            .as("admin.settings.configuration.group");
        router
            .post("/configuration/groups/:group/preview", [AdminConfigurationController, "preview"])
            .as("admin.settings.configuration.preview")
            .use(adminWriteLimiter);
        router
            .post("/configuration/groups/:group/test", [AdminConfigurationController, "test"])
            .as("admin.settings.configuration.test")
            .use(adminWriteLimiter);
        router
            .put("/configuration/groups/:group", [AdminConfigurationController, "update"])
            .as("admin.settings.configuration.update")
            .use(adminWriteLimiter);
        router
            .get("/configuration/history", [AdminConfigurationController, "history"])
            .as("admin.settings.configuration.history");
        router
            .get("/configuration/history/:scope/:revision", [AdminConfigurationController, "show"])
            .as("admin.settings.configuration.history.show");
        router
            .post("/configuration/history/:scope/:revision/rollback", [AdminConfigurationController, "rollback"])
            .as("admin.settings.configuration.history.rollback")
            .use(adminWriteLimiter);
        router
            .get("/configuration/blueprint", [AdminConfigurationController, "blueprint"])
            .as("admin.settings.configuration.blueprint");
        router
            .post("/configuration/blueprint/validate", [AdminConfigurationController, "validateBlueprint"])
            .as("admin.settings.configuration.blueprint.validate")
            .use(adminWriteLimiter);
        router
            .post("/configuration/blueprint/apply", [AdminConfigurationController, "applyBlueprint"])
            .as("admin.settings.configuration.blueprint.apply")
            .use(adminWriteLimiter);
        router.get("/configuration/drift", [AdminConfigurationController, "drift"]).as("admin.settings.configuration.drift");
        router
            .get("/configuration/url-redirects", [AdminConfigurationController, "urlRedirectHistory"])
            .as("admin.settings.configuration.urlRedirects");
        router
            .post("/configuration/tax/simulate", [AdminConfigurationController, "taxSimulate"])
            .as("admin.settings.configuration.taxSimulate")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/settings")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
