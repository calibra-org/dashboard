import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const RetailMediaController = () => import("#controllers/admin/retail_media_controller");

router
    .group(() => {
        router.get("/overview", [RetailMediaController, "overview"]).as("admin.retail_media.overview");
        router.get("/advertisers", [RetailMediaController, "advertisers"]).as("admin.retail_media.advertisers");
        router
            .post("/advertisers", [RetailMediaController, "createAdvertiser"])
            .as("admin.retail_media.advertisers.create")
            .use(adminWriteLimiter);

        router.get("/campaigns", [RetailMediaController, "campaigns"]).as("admin.retail_media.campaigns");
        router.get("/campaigns/:publicId", [RetailMediaController, "campaign"]).as("admin.retail_media.campaigns.show");
        router
            .post("/campaigns", [RetailMediaController, "createCampaign"])
            .as("admin.retail_media.campaigns.create")
            .use(adminWriteLimiter);
        router
            .patch("/campaigns/:publicId", [RetailMediaController, "updateCampaign"])
            .as("admin.retail_media.campaigns.update")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:publicId/status", [RetailMediaController, "setCampaignStatus"])
            .as("admin.retail_media.campaigns.status")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:publicId/products", [RetailMediaController, "addCampaignProduct"])
            .as("admin.retail_media.campaigns.products")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:publicId/placements", [RetailMediaController, "attachCampaignPlacement"])
            .as("admin.retail_media.campaigns.placements")
            .use(adminWriteLimiter);
        router
            .post("/campaigns/:publicId/funding", [RetailMediaController, "fundCampaign"])
            .as("admin.retail_media.campaigns.funding")
            .use(adminWriteLimiter);

        router.get("/placements", [RetailMediaController, "placements"]).as("admin.retail_media.placements");
        router
            .post("/placements", [RetailMediaController, "createPlacement"])
            .as("admin.retail_media.placements.create")
            .use(adminWriteLimiter);
        router
            .post("/placements/:publicId/status", [RetailMediaController, "setPlacementStatus"])
            .as("admin.retail_media.placements.status")
            .use(adminWriteLimiter);

        router.get("/creators", [RetailMediaController, "creators"]).as("admin.retail_media.creators");
        router
            .post("/creators", [RetailMediaController, "createCreator"])
            .as("admin.retail_media.creators.create")
            .use(adminWriteLimiter);
        router
            .post("/creators/:publicId/links", [RetailMediaController, "createAffiliateLink"])
            .as("admin.retail_media.creators.links")
            .use(adminWriteLimiter);
        router
            .post("/creators/:publicId/payouts", [RetailMediaController, "payout"])
            .as("admin.retail_media.creators.payouts")
            .use(adminWriteLimiter);
        router.get("/commissions", [RetailMediaController, "commissions"]).as("admin.retail_media.commissions");
        router.get("/measurement", [RetailMediaController, "measurement"]).as("admin.retail_media.measurement");
        router.get("/access", [RetailMediaController, "access"]).as("admin.retail_media.access");
        router
            .post("/access/preset", [RetailMediaController, "accessPreset"])
            .as("admin.retail_media.access.preset")
            .use(adminWriteLimiter);
    })
    .prefix("/api/v1/admin/retail-media")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
