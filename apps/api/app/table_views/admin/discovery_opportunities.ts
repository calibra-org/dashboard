import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import DiscoveryOpportunity from "#models/discovery_opportunity";
export const adminDiscoveryOpportunitiesView = createTableView({
    model: DiscoveryOpportunity,
    columns: {
        id: { type: "bigint", filterable: true, orderable: true },
        type: { type: "string", filterable: true, orderable: true },
        status: { type: "string", filterable: true, orderable: true },
        title: { type: "string", filterable: true, orderable: true },
        query: { type: "string", filterable: true, orderable: true },
        query_count: { type: "number", filterable: true, orderable: true },
        unique_sessions: { type: "number", filterable: true, orderable: true },
        confidence_class: { type: "string", filterable: true, orderable: true },
        assigned_to_user_id: { type: "bigint", filterable: true, orderable: false },
        updated_at: { type: "datetime", filterable: true, orderable: true },
    },
    defaultSort: [
        ["query_count", "desc"],
        ["updated_at", "desc"],
    ],
});
export type AdminDiscoveryOpportunitiesViewQuery = InferTableViewQuery<typeof adminDiscoveryOpportunitiesView>;
