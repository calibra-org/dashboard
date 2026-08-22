export interface Resource<T> {
    data: T;
}
export interface Paginated<T> {
    data: T[];
    meta?: { page: number; limit: number; total: number; lastPage: number };
}
export interface DiscoveryOverview {
    period_days: number;
    searches: number;
    sessions: number;
    zero_result_rate: number | null;
    click_rate: number | null;
    purchase_rate: number | null;
    open_opportunities: number;
    active_rules: number;
    relationship_count: number;
    permissions: Record<string, boolean>;
}
export interface SearchEvent {
    id: number;
    event_type: string;
    normalized_query: string | null;
    locale: string;
    surface: string;
    intent: string | null;
    result_count: number | null;
    product_id: number | null;
    position: number | null;
    occurred_at: string;
}
export interface SynonymRule {
    id: number;
    locale: string;
    term: string;
    synonyms: string[];
    mode: string;
    category_id: number | null;
    enabled: boolean;
    version: number;
    created_at: string;
}
export interface MerchRule {
    id: number;
    name: string;
    action: "boost" | "bury" | "pin" | "hide";
    status: string;
    query_pattern: string | null;
    product_id: number | null;
    category_id: number | null;
    boost_factor: number | null;
    pin_position: number | null;
    priority: number;
    reason: string;
    version: number;
    starts_at: string | null;
    ends_at: string | null;
}
export interface Relationship {
    id: number;
    subject_product_id: number;
    relation_type: string;
    object_product_id: number;
    state: "compatible" | "not_compatible" | "unknown";
    confidence_class: string;
    source_type: string;
    source_ref: string | null;
    evidence: Record<string, unknown>;
    status: string;
    version: number;
}
export interface Opportunity {
    id: number;
    type: string;
    status: string;
    title: string;
    summary: string;
    query: string | null;
    query_count: number;
    unique_sessions: number;
    zero_result_rate: number | null;
    trend_rate: number | null;
    confidence_class: string;
    recommended_actions: string[];
    assigned_to_user_id: number | null;
    resolution_note: string | null;
    version: number;
}
export interface SearchPolicy {
    id: number;
    name: string;
    status: string;
    active_version: number | null;
    version: number;
    updated_at: string;
}
export interface SearchResult {
    id: number;
    sku: string | null;
    name: string;
    slug: string | null;
    price_minor: number | null;
    status: string;
    catalog_visibility: string;
}
export interface Simulation {
    query: string;
    normalized_query: string;
    expanded_query: string;
    result_count: number;
    retrieval_source: string;
    retrieval_version: string;
    policy_version: string;
    degraded: boolean;
    rules_applied: number[];
    results: SearchResult[];
    explain: Record<string, string>;
}
export interface IndexHealth {
    available: boolean;
    product_count: number;
    fa_index: number | null;
    en_index: number | null;
    degraded: boolean;
}
