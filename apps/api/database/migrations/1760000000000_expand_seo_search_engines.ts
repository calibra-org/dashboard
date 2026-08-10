import { BaseSchema } from "@adonisjs/lucid/schema";

/**
 * Expands SEO integrations from the original utility/provider list to seven concrete
 * search engines with real native API/protocol capabilities. Also preserves decimal
 * average positions returned by Search Console/Yandex instead of rounding them into
 * misleading integers and allows ISO alpha-3 country codes returned by webmaster APIs.
 */
export default class extends BaseSchema {
    async up() {
        this.schema.raw(`
            ALTER TABLE seo_integrations
            DROP CONSTRAINT IF EXISTS seo_integrations_provider_check
        `);
        this.schema.raw(`
            ALTER TABLE seo_integrations
            ADD CONSTRAINT seo_integrations_provider_check CHECK (
                provider IN (
                    'google_search_console',
                    'bing_webmaster',
                    'yandex_webmaster',
                    'baidu_search_resource',
                    'brave_search',
                    'naver_search_advisor',
                    'seznam_indexnow',
                    'indexnow',
                    'google_merchant',
                    'openai_searchbot',
                    'manual_import'
                )
            )
        `);

        this.schema.raw(`
            ALTER TABLE seo_keywords
            ALTER COLUMN current_position TYPE numeric(8,2) USING current_position::numeric,
            ALTER COLUMN previous_position TYPE numeric(8,2) USING previous_position::numeric,
            ALTER COLUMN best_position TYPE numeric(8,2) USING best_position::numeric,
            ALTER COLUMN country TYPE varchar(3)
        `);
    }

    async down() {
        /**
         * Remove rows that cannot be represented by the old provider constraint before
         * restoring it. This migration is intended to be rolled back only in development.
         */
        this.schema.raw(`
            DELETE FROM seo_integrations
            WHERE provider IN (
                'yandex_webmaster',
                'baidu_search_resource',
                'brave_search',
                'naver_search_advisor',
                'seznam_indexnow'
            )
        `);
        this.schema.raw(`
            ALTER TABLE seo_integrations
            DROP CONSTRAINT IF EXISTS seo_integrations_provider_check
        `);
        this.schema.raw(`
            ALTER TABLE seo_integrations
            ADD CONSTRAINT seo_integrations_provider_check CHECK (
                provider IN (
                    'google_search_console',
                    'bing_webmaster',
                    'indexnow',
                    'google_merchant',
                    'openai_searchbot',
                    'manual_import'
                )
            )
        `);
        this.schema.raw(`
            ALTER TABLE seo_keywords
            ALTER COLUMN current_position TYPE integer USING round(current_position)::integer,
            ALTER COLUMN previous_position TYPE integer USING round(previous_position)::integer,
            ALTER COLUMN best_position TYPE integer USING round(best_position)::integer,
            ALTER COLUMN country TYPE varchar(2)
        `);
    }
}
