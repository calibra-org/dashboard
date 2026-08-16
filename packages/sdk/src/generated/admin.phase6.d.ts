/** Generated Admin Phase 6 configuration overlay. Source: docs/api/reference/openapi/admin.phase6.v1.yaml */
export interface components {
    schemas: {
        ConfigurationScope: "general" | "datetime" | "media" | "branding";
        ConfigurationCapability: {
            key: string;
            category: "site" | "store";
            mode: "settings" | "domain";
            label_fa: string;
            label_en: string;
            description_fa: string;
            description_en: string;
            href: string;
            api_path: string;
            history_enabled: boolean;
        };
        ConfigurationCapabilityEnvelope: { data: components["schemas"]["ConfigurationCapability"][] };
        ConfigurationRevision: {
            id: number;
            scope: components["schemas"]["ConfigurationScope"];
            revision: number;
            source: "update" | "rollback";
            rollback_of_revision: number | null;
            created_by_user_id: number | null;
            created_at: string;
            changed_keys: string[];
        };
        ConfigurationRevisionListEnvelope: { data: components["schemas"]["ConfigurationRevision"][] };
        ConfigurationSnapshotEntry: {
            group: string;
            key: string;
            type: "string" | "number" | "boolean" | "json";
            exists: boolean;
            value: unknown;
        };
        ConfigurationSnapshot: { entries: components["schemas"]["ConfigurationSnapshotEntry"][] };
        ConfigurationDiffEntry: {
            key: string;
            before: unknown;
            after: unknown;
            before_exists: boolean;
            after_exists: boolean;
        };
        ConfigurationRevisionDetail: components["schemas"]["ConfigurationRevision"] & {
            snapshot: components["schemas"]["ConfigurationSnapshot"];
            diff: components["schemas"]["ConfigurationDiffEntry"][];
        };
        ConfigurationRevisionDetailEnvelope: { data: components["schemas"]["ConfigurationRevisionDetail"] };
        ConfigurationRollbackEnvelope: {
            data: components["schemas"]["ConfigurationRevisionDetail"];
            meta: { changed: boolean };
        };
    };
}

export interface paths {
    "/api/v1/admin/settings/configuration/registry": {
        get: operations["adminPhase6ConfigurationRegistry"];
    };
    "/api/v1/admin/settings/configuration/history": {
        get: operations["adminPhase6ConfigurationHistory"];
    };
    "/api/v1/admin/settings/configuration/history/{scope}/{revision}": {
        get: operations["adminPhase6ConfigurationRevisionShow"];
    };
    "/api/v1/admin/settings/configuration/history/{scope}/{revision}/rollback": {
        post: operations["adminPhase6ConfigurationRollback"];
    };
}

export interface operations {
    adminPhase6ConfigurationRegistry: {
        responses: { 200: { content: { "application/json": components["schemas"]["ConfigurationCapabilityEnvelope"] } } };
    };
    adminPhase6ConfigurationHistory: {
        parameters: { query?: { scope?: components["schemas"]["ConfigurationScope"]; limit?: number } };
        responses: { 200: { content: { "application/json": components["schemas"]["ConfigurationRevisionListEnvelope"] } } };
    };
    adminPhase6ConfigurationRevisionShow: {
        parameters: { path: { scope: components["schemas"]["ConfigurationScope"]; revision: number } };
        responses: { 200: { content: { "application/json": components["schemas"]["ConfigurationRevisionDetailEnvelope"] } } };
    };
    adminPhase6ConfigurationRollback: {
        parameters: { path: { scope: components["schemas"]["ConfigurationScope"]; revision: number } };
        responses: { 200: { content: { "application/json": components["schemas"]["ConfigurationRollbackEnvelope"] } } };
    };
}
