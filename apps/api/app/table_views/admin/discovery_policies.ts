import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import DiscoverySearchPolicy from "#models/discovery_search_policy";
export const adminDiscoveryPoliciesView = createTableView({
    model: DiscoverySearchPolicy,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        name: { type: "string", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: true },
        active_version: { type: "number", filterable: true, orderable: true },
        version: { type: "number", filterable: true, orderable: true },
        updated_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [["updated_at", "desc"]],
});
export type AdminDiscoveryPoliciesViewQuery = InferTableViewQuery<typeof adminDiscoveryPoliciesView>;
