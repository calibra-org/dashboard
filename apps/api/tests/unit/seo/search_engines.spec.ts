import { test } from "@japa/runner";

import { isSeoSearchEngineProvider, SEO_SEARCH_ENGINES } from "#services/seo/search_engines";

const byEngine = new Map(SEO_SEARCH_ENGINES.map((item) => [item.engine, item]));

test.group("SEO search engine registry", () => {
    test("contains exactly seven concrete search engines", ({ assert }) => {
        assert.deepEqual(
            SEO_SEARCH_ENGINES.map((item) => item.engine),
            ["google", "bing", "yandex", "baidu", "brave", "naver", "seznam"],
        );
        assert.lengthOf(new Set(SEO_SEARCH_ENGINES.map((item) => item.provider)), 7);
    });

    test("keeps utility providers out of the engine registry", ({ assert }) => {
        for (const provider of ["indexnow", "google_merchant", "openai_searchbot", "manual_import"]) {
            assert.isFalse(isSeoSearchEngineProvider(provider));
        }
    });

    test("declares native rank support only where a real rank source exists", ({ assert }) => {
        for (const engine of ["google", "bing", "yandex", "brave"] as const) {
            assert.isTrue(byEngine.get(engine)?.nativeRank, `${engine} must have a real rank source`);
        }
        for (const engine of ["baidu", "naver", "seznam"] as const) {
            assert.isFalse(byEngine.get(engine)?.nativeRank, `${engine} must not fake native ranking data`);
        }
    });

    test("separates webmaster analytics from URL submission capabilities", ({ assert }) => {
        assert.isTrue(byEngine.get("google")?.analytics);
        assert.isTrue(byEngine.get("bing")?.analytics);
        assert.isTrue(byEngine.get("yandex")?.analytics);
        assert.isFalse(byEngine.get("brave")?.analytics);

        assert.isTrue(byEngine.get("baidu")?.submission);
        assert.isTrue(byEngine.get("naver")?.submission);
        assert.isTrue(byEngine.get("seznam")?.submission);
        assert.isFalse(byEngine.get("brave")?.submission);
    });

    test("recognizes every engine provider and nothing is duplicated", ({ assert }) => {
        for (const item of SEO_SEARCH_ENGINES) assert.isTrue(isSeoSearchEngineProvider(item.provider));
        assert.lengthOf(new Set(SEO_SEARCH_ENGINES.map((item) => item.engine)), SEO_SEARCH_ENGINES.length);
    });
});
