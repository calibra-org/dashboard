import { createTableView } from "#lib/table_view/create_table_view";
import type { InferTableViewQuery } from "#lib/table_view/types";
import DiscoverySearchEvent from "#models/discovery_search_event";
export const adminDiscoverySearchEventsView = createTableView({
 model: DiscoverySearchEvent,
 columns: {
  id:{type:"bigint",filterable:true,orderable:true}, event_type:{type:"string",filterable:true,orderable:true}, locale:{type:"string",filterable:true,orderable:false},
  surface:{type:"string",filterable:true,orderable:false}, normalized_query:{type:"string",filterable:true,orderable:true}, intent:{type:"string",filterable:true,orderable:false},
  result_count:{type:"number",filterable:true,orderable:true}, product_id:{type:"bigint",filterable:true,orderable:false}, occurred_at:{type:"datetime",filterable:true,orderable:true}
 }, defaultSort:[["occurred_at","desc"],["id","desc"]]
});
export type AdminDiscoverySearchEventsViewQuery=InferTableViewQuery<typeof adminDiscoverySearchEventsView>;
