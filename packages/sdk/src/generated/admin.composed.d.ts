/**
 * Composed Admin SDK surface.
 *
 * `admin.d.ts` is the historical OpenAPI-generated contract. Feature overlays are generated from
 * their independently reviewed OpenAPI slices and intersected here so new operations are typed
 * without forcing unrelated generated declarations to churn.
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

export type paths = CorePaths & Phase4Paths;
export type components = CoreComponents & Phase4Components;
export type operations = CoreOperations & Phase4Operations;
