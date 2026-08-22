export const DISCOVERY_EVENT_TYPES = ["search_performed","results_served","result_clicked","zero_result","no_click","reformulated","filter_applied","sort_changed","add_to_cart","purchase","exit"] as const;
export type DiscoveryEventType=(typeof DISCOVERY_EVENT_TYPES)[number];
export const RELATION_STATES=["compatible","not_compatible","unknown"] as const;
export const RELATION_TYPES=["compatible_with","not_compatible_with","requires","optionally_requires","accessory_to","replacement_for","alternative_to","similar_to"] as const;
export const OPPORTUNITY_TYPES=["MISSING_PRODUCT","MISSING_VARIANT","MISSING_ATTRIBUTE","MISSING_CATEGORY","MISSING_COMPATIBILITY_DATA","MISSING_SYNONYM","SEARCH_RELEVANCE_GAP","CONTENT_GAP","INVENTORY_GAP","SUPPLIER_OPPORTUNITY","BUNDLE_OPPORTUNITY","REPLACEMENT_OPPORTUNITY","TREND_OPPORTUNITY","REGIONAL_OPPORTUNITY"] as const;
export const DISCOVERY_PERMISSIONS=["read","search:write","merchandising:write","compatibility:write","opportunity:write","governance:write","reindex"] as const;
export type DiscoveryPermission=(typeof DISCOVERY_PERMISSIONS)[number];
export const DEFAULT_PERMISSIONS:Record<DiscoveryPermission,boolean>=Object.fromEntries(DISCOVERY_PERMISSIONS.map((p)=>[p,true])) as Record<DiscoveryPermission,boolean>;
