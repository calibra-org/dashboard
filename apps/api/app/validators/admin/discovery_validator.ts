import vine from "@vinejs/vine";
import { adminDiscoverySearchEventsView } from "#table_views/admin/discovery_search_events";
import { adminDiscoverySynonymsView } from "#table_views/admin/discovery_synonyms";
import { adminDiscoveryMerchandisingView } from "#table_views/admin/discovery_merchandising";
import { adminDiscoveryRelationshipsView } from "#table_views/admin/discovery_relationships";
import { adminDiscoveryOpportunitiesView } from "#table_views/admin/discovery_opportunities";
import { adminDiscoveryPoliciesView } from "#table_views/admin/discovery_policies";
import { DISCOVERY_EVENT_TYPES, RELATION_STATES, RELATION_TYPES } from "#services/discovery/domain";

export const discoverySearchEventListValidator = vine.compile(
    vine.object({ ...adminDiscoverySearchEventsView.schema.getProperties(), q: vine.string().trim().maxLength(255).optional() }),
);
export const discoverySynonymListValidator = vine.compile(vine.object({ ...adminDiscoverySynonymsView.schema.getProperties() }));
export const discoveryMerchandisingListValidator = vine.compile(
    vine.object({ ...adminDiscoveryMerchandisingView.schema.getProperties() }),
);
export const discoveryRelationshipListValidator = vine.compile(
    vine.object({ ...adminDiscoveryRelationshipsView.schema.getProperties() }),
);
export const discoveryOpportunityListValidator = vine.compile(
    vine.object({ ...adminDiscoveryOpportunitiesView.schema.getProperties() }),
);
export const discoveryPolicyListValidator = vine.compile(vine.object({ ...adminDiscoveryPoliciesView.schema.getProperties() }));

export const discoverySearchValidator = vine.compile(
    vine.object({
        query: vine.string().trim().minLength(1).maxLength(255),
        locale: vine.enum(["fa", "en"]).optional(),
        limit: vine.number().min(1).max(100).optional(),
        category_id: vine.number().positive().optional(),
    }),
);
export const discoveryEventValidator = vine.compile(
    vine.object({
        event_key: vine.string().uuid(),
        event_type: vine.enum(DISCOVERY_EVENT_TYPES),
        query: vine.string().trim().maxLength(255).optional(),
        locale: vine.enum(["fa", "en"]).optional(),
        surface: vine.string().trim().maxLength(40).optional(),
        session_key: vine.string().trim().maxLength(255).optional(),
        result_count: vine.number().min(0).optional(),
        product_id: vine.number().positive().optional(),
        position: vine.number().min(1).optional(),
        occurred_at: vine.string().trim().optional(),
    }),
);
export const discoverySynonymCreateValidator = vine.compile(
    vine.object({
        locale: vine.enum(["fa", "en"]),
        term: vine.string().trim().minLength(1).maxLength(191),
        synonyms: vine.array(vine.string().trim().minLength(1).maxLength(191)).minLength(1).maxLength(50),
        mode: vine.enum(["equivalent", "directional"]),
        category_id: vine.number().positive().optional(),
        enabled: vine.boolean().optional(),
    }),
);
export const discoveryMerchandisingCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(160),
        action: vine.enum(["boost", "bury", "pin", "hide"]),
        query_pattern: vine.string().trim().maxLength(255).optional(),
        product_id: vine.number().positive().optional(),
        category_id: vine.number().positive().optional(),
        boost_factor: vine.number().min(0).max(10).optional(),
        pin_position: vine.number().min(1).max(100).optional(),
        priority: vine.number().min(1).max(10000).optional(),
        starts_at: vine.string().trim().optional(),
        ends_at: vine.string().trim().optional(),
        reason: vine.string().trim().minLength(3).maxLength(500),
    }),
);
export const discoveryRelationshipCreateValidator = vine.compile(
    vine.object({
        subject_product_id: vine.number().positive(),
        relation_type: vine.enum(RELATION_TYPES),
        object_product_id: vine.number().positive(),
        state: vine.enum(RELATION_STATES),
        confidence_class: vine.enum([
            "verified",
            "manufacturer_declared",
            "operator_confirmed",
            "derived",
            "experimental",
            "unknown",
        ]),
        source_type: vine.string().trim().minLength(2).maxLength(40),
        source_ref: vine.string().trim().maxLength(1000).optional(),
        evidence: vine.record(vine.any()).optional(),
    }),
);
export const discoveryRelationshipResolveValidator = vine.compile(
    vine.object({
        state: vine.enum(RELATION_STATES),
        confidence_class: vine.enum([
            "verified",
            "manufacturer_declared",
            "operator_confirmed",
            "derived",
            "experimental",
            "unknown",
        ]),
        source_ref: vine.string().trim().maxLength(1000).optional(),
        evidence: vine.record(vine.any()).optional(),
        expected_version: vine.number().min(1),
    }),
);
export const discoveryOpportunityActionValidator = vine.compile(
    vine.object({
        action: vine.enum([
            "triage",
            "accept",
            "reject",
            "assign",
            "start",
            "implement",
            "measure",
            "validate",
            "close",
            "insufficient_evidence",
            "duplicate",
        ]),
        assigned_to_user_id: vine.number().positive().optional(),
        note: vine.string().trim().maxLength(2000).optional(),
        expected_version: vine.number().min(1),
    }),
);
export const discoveryPolicyCreateValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(160),
        max_results: vine.number().min(1).max(100),
        typo_tolerance: vine.boolean(),
        typo_max_edits: vine.number().min(0).max(2),
        ranking_weights: vine.record(vine.number()).optional(),
        reason: vine.string().trim().maxLength(1000).optional(),
    }),
);
export const discoveryPolicyVersionValidator = vine.compile(
    vine.object({
        max_results: vine.number().min(1).max(100),
        typo_tolerance: vine.boolean(),
        typo_max_edits: vine.number().min(0).max(2),
        ranking_weights: vine.record(vine.number()).optional(),
        reason: vine.string().trim().maxLength(1000).optional(),
        expected_version: vine.number().min(1),
    }),
);
export const discoverySimulationValidator = vine.compile(
    vine.object({
        query: vine.string().trim().minLength(1).maxLength(255),
        locale: vine.enum(["fa", "en"]).optional(),
        limit: vine.number().min(1).max(100).optional(),
        category_id: vine.number().positive().optional(),
    }),
);
