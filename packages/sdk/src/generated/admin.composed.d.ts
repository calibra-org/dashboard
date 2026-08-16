/** Composed Admin SDK surface. Core and reviewed feature overlays intersect here. */
import type { components as CoreComponents, operations as CoreOperations, paths as CorePaths } from "./admin";
import type { components as Phase4Components, operations as Phase4Operations, paths as Phase4Paths } from "./admin.phase4";
import type { components as Phase5Components, operations as Phase5Operations, paths as Phase5Paths } from "./admin.phase5";
import type { components as Phase13Components, operations as Phase13Operations, paths as Phase13Paths } from "./admin.phase13";
import type { components as TicketComponents, operations as TicketOperations, paths as TicketPaths } from "./admin.tickets";
export type paths = CorePaths & Phase4Paths & TicketPaths & Phase5Paths & Phase13Paths;
export type components = CoreComponents & Phase4Components & TicketComponents & Phase5Components & Phase13Components;
export type operations = CoreOperations & Phase4Operations & TicketOperations & Phase5Operations & Phase13Operations;
