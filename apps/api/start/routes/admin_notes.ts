import router from "@adonisjs/core/services/router";

import { middleware } from "#start/kernel";
import { adminWriteLimiter } from "#start/limiter";

const NotesController = () => import("#controllers/admin/order_notes_controller");
const HistoryController = () => import("#controllers/admin/order_history_controller");

router
    .group(() => {
        router.get("/notes", [NotesController, "index"]).as("admin.orders.notes.index");
        router.post("/notes", [NotesController, "store"]).as("admin.orders.notes.store").use(adminWriteLimiter);
        router.delete("/notes/:id", [NotesController, "destroy"]).as("admin.orders.notes.destroy").use(adminWriteLimiter);
        router.get("/history", [HistoryController, "index"]).as("admin.orders.history.index");
    })
    .prefix("/api/v1/admin/orders/:order_id")
    .use(middleware.auth({ guards: ["api"] }))
    .use(middleware.admin());
