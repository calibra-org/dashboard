import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
    async up() {
        this.schema.raw(`
            CREATE OR REPLACE FUNCTION calibra_validate_configuration_governance_approval()
            RETURNS trigger AS $$
            DECLARE approval governance_approval_requests%ROWTYPE;
            BEGIN
                IF NEW.approval_reference IS NULL OR btrim(NEW.approval_reference) = '' THEN
                    RETURN NEW;
                END IF;

                SELECT * INTO approval
                FROM governance_approval_requests
                WHERE tenant_id = NEW.tenant_id
                  AND reference = NEW.approval_reference
                FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'governance approval reference does not exist';
                END IF;
                IF approval.status <> 'approved' THEN
                    RAISE EXCEPTION 'governance approval reference is not approved';
                END IF;
                IF approval.expires_at <= now() THEN
                    RAISE EXCEPTION 'governance approval reference is expired';
                END IF;
                IF approval.action_key <> 'configuration.apply' THEN
                    RAISE EXCEPTION 'governance approval is scoped to another action';
                END IF;
                IF approval.resource_type IS DISTINCT FROM 'configuration' THEN
                    RAISE EXCEPTION 'governance approval is scoped to another resource type';
                END IF;
                IF approval.resource_id IS DISTINCT FROM concat(NEW.group_key, ':', NEW.definition_key) THEN
                    RAISE EXCEPTION 'governance approval is scoped to another configuration definition';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        this.schema.raw(`
            CREATE OR REPLACE FUNCTION calibra_consume_configuration_governance_approval()
            RETURNS trigger AS $$
            BEGIN
                IF NEW.approval_reference IS NOT NULL AND btrim(NEW.approval_reference) <> '' THEN
                    UPDATE governance_approval_requests
                    SET status = 'executed', executed_at = now(), updated_at = now(), row_version = row_version + 1
                    WHERE tenant_id = NEW.tenant_id
                      AND reference = NEW.approval_reference
                      AND status = 'approved';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        this.schema.raw(`
            CREATE TRIGGER configuration_governance_approval_guard
            BEFORE INSERT OR UPDATE OF approval_reference, value, is_deleted, rollout_percent, expires_at
            ON configuration_overrides
            FOR EACH ROW
            EXECUTE FUNCTION calibra_validate_configuration_governance_approval()
        `);
        this.schema.raw(`
            CREATE TRIGGER configuration_governance_approval_consume
            AFTER INSERT OR UPDATE OF approval_reference, value, is_deleted, rollout_percent, expires_at
            ON configuration_overrides
            FOR EACH ROW
            EXECUTE FUNCTION calibra_consume_configuration_governance_approval()
        `);
    }

    async down() {
        this.schema.raw("DROP TRIGGER IF EXISTS configuration_governance_approval_consume ON configuration_overrides");
        this.schema.raw("DROP TRIGGER IF EXISTS configuration_governance_approval_guard ON configuration_overrides");
        this.schema.raw("DROP FUNCTION IF EXISTS calibra_consume_configuration_governance_approval() CASCADE");
        this.schema.raw("DROP FUNCTION IF EXISTS calibra_validate_configuration_governance_approval() CASCADE");
    }
}
