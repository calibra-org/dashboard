import fs from "node:fs";

function patch(path, oldText, newText, label) {
    const source = fs.readFileSync(path, "utf8");
    if (source.includes(newText)) return;
    if (!source.includes(oldText)) throw new Error(`${label}: anchor missing`);
    fs.writeFileSync(path, source.replace(oldText, newText), "utf8");
}

// Exact API typing fixes already proven by the successful Phase 9 Resume functional run.
patch(
    "apps/api/app/controllers/admin/personalization_controller.ts",
    "this.service.createCampaign(ctx.request.body(), actorId(ctx))",
    'this.service.createCampaign(ctx.request.body() as Parameters<Phase9PersonalizationService["createCampaign"]>[0], actorId(ctx))',
    "create campaign type",
);
patch(
    "apps/api/app/controllers/admin/personalization_controller.ts",
    "this.service.updateCampaign(id, ctx.request.body())",
    'this.service.updateCampaign(id, ctx.request.body() as Parameters<Phase9PersonalizationService["updateCampaign"]>[1])',
    "update campaign type",
);
patch(
    "apps/api/app/services/phase9_personalization_service.ts",
    '.where("campaign_id", campaign.id).orderBy("position", "asc")',
    '.where("campaign_id", Number(campaign.id)).orderBy("position", "asc")',
    "campaign id type",
);

const publicRoutes = {
    'router.get("/amazing-deals", [PersonalizationController, "amazingDeals"]);': 'router.get("/amazing-deals", [PersonalizationController, "amazingDeals"]).as("personalization.amazingDeals");',
    'router.get("/recommendations", [PersonalizationController, "recommendations"]);': 'router.get("/recommendations", [PersonalizationController, "recommendations"]).as("personalization.recommendations");',
    'router.post("/events", [PersonalizationController, "event"]).use(contentPublicLimiter);': 'router.post("/events", [PersonalizationController, "event"]).as("personalization.events.create").use(contentPublicLimiter);',
    'router.get("/consent", [PersonalizationController, "consent"]);': 'router.get("/consent", [PersonalizationController, "consent"]).as("personalization.consent.show");',
    'router.put("/consent", [PersonalizationController, "updateConsent"]).use(contentPublicLimiter);': 'router.put("/consent", [PersonalizationController, "updateConsent"]).as("personalization.consent.update").use(contentPublicLimiter);',
    'router.post("/reset", [PersonalizationController, "reset"]).use(contentPublicLimiter);': 'router.post("/reset", [PersonalizationController, "reset"]).as("personalization.reset").use(contentPublicLimiter);',
};
for (const [oldText, newText] of Object.entries(publicRoutes)) {
    patch("apps/api/start/routes/personalization.ts", oldText, newText, `public route ${oldText}`);
}

const adminRoutes = {
    'router.get("/overview", [Controller, "overview"]);': 'router.get("/overview", [Controller, "overview"]).as("admin.personalization.overview");',
    'router.get("/health", [Controller, "health"]);': 'router.get("/health", [Controller, "health"]).as("admin.personalization.health");',
    'router.get("/campaigns", [Controller, "campaigns"]);': 'router.get("/campaigns", [Controller, "campaigns"]).as("admin.personalization.campaigns.index");',
    'router.post("/campaigns", [Controller, "createCampaign"]).use(adminWriteLimiter);': 'router.post("/campaigns", [Controller, "createCampaign"]).as("admin.personalization.campaigns.create").use(adminWriteLimiter);',
    'router.patch("/campaigns/:id", [Controller, "updateCampaign"]).use(adminWriteLimiter);': 'router.patch("/campaigns/:id", [Controller, "updateCampaign"]).as("admin.personalization.campaigns.update").use(adminWriteLimiter);',
    'router.post("/campaigns/:id/publish", [Controller, "publishCampaign"]).use(adminWriteLimiter);': 'router.post("/campaigns/:id/publish", [Controller, "publishCampaign"]).as("admin.personalization.campaigns.publish").use(adminWriteLimiter);',
    'router.post("/campaigns/:id/pause", [Controller, "pauseCampaign"]).use(adminWriteLimiter);': 'router.post("/campaigns/:id/pause", [Controller, "pauseCampaign"]).as("admin.personalization.campaigns.pause").use(adminWriteLimiter);',
    'router.get("/settings", [Controller, "settings"]);': 'router.get("/settings", [Controller, "settings"]).as("admin.personalization.settings.show");',
    'router.patch("/settings", [Controller, "updateSettings"]).use(adminWriteLimiter);': 'router.patch("/settings", [Controller, "updateSettings"]).as("admin.personalization.settings.update").use(adminWriteLimiter);',
    'router.get("/placements", [Controller, "placements"]);': 'router.get("/placements", [Controller, "placements"]).as("admin.personalization.placements.index");',
    'router.patch("/placements/:placement", [Controller, "updatePlacement"]).use(adminWriteLimiter);': 'router.patch("/placements/:placement", [Controller, "updatePlacement"]).as("admin.personalization.placements.update").use(adminWriteLimiter);',
    'router.post("/simulate", [Controller, "simulate"]).use(adminWriteLimiter);': 'router.post("/simulate", [Controller, "simulate"]).as("admin.personalization.simulate").use(adminWriteLimiter);',
    'router.get("/events", [Controller, "events"]);': 'router.get("/events", [Controller, "events"]).as("admin.personalization.events.index");',
    'router.get("/consents", [Controller, "consents"]);': 'router.get("/consents", [Controller, "consents"]).as("admin.personalization.consents.index");',
};
for (const [oldText, newText] of Object.entries(adminRoutes)) {
    patch("apps/api/start/routes/admin_personalization.ts", oldText, newText, `admin route ${oldText}`);
}

// Main currently has a Phase 6 UI compile blocker: ConfigurationChangeInput requires these two
// explicit fields. A normal tenant value update is not an unset and rolls out to the full tenant.
patch(
    "apps/admin/src/views/store-config/settings/configuration-group-view.tsx",
    '        scope_type: "tenant",\n        value: parsed.value,',
    '        scope_type: "tenant",\n        unset: false,\n        rollout_percent: 100,\n        value: parsed.value,',
    "Phase 6 ConfigurationChangeInput defaults",
);
