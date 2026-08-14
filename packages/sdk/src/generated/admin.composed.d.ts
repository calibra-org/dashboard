/**
 * Composed Admin SDK surface.
 *
 * Core declarations are generated from the historical Admin contract, while feature overlays are
 * generated from independently reviewed OpenAPI slices and intersected here.
 */
import type {
    components as CoreComponents,
    operations as CoreOperations,
    paths as CorePaths,
} from "./admin";
import type {
    components as Phase4Components,
    operations as Phase4Operations,
    paths as Phase4Paths,
} from "./admin.phase4";
import type {
    components as TicketComponents,
    operations as TicketOperations,
    paths as TicketPaths,
} from "./admin.tickets";

export type paths = CorePaths & Phase4Paths & TicketPaths;
export type components = CoreComponents & Phase4Components & TicketComponents;
export type operations = CoreOperations & Phase4Operations & TicketOperations;
