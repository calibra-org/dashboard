from pathlib import Path
import re


def edit(path, fn):
    p = Path(path)
    s = p.read_text()
    out = fn(s)
    if out != s:
        p.write_text(out)


def cache_patch(s):
    s = s.replace('import { syncProduct, syncProducts } from "#services/discovery/search_service";\n', '')
    if '#services/discovery/index_projection' not in s:
        s = s.replace('import { recordCacheInvalidate } from "#services/metrics/domain_metrics";', 'import { recordCacheInvalidate } from "#services/metrics/domain_metrics";\nimport { enqueueProductProjection, enqueueProductsProjection } from "#services/discovery/index_projection";')
    s = s.replace('await syncProduct(Number(productId)).catch(() => undefined);', 'await enqueueProductProjection(Number(productId));')
    s = s.replace('await syncProducts(productIds).catch(() => undefined);', 'await enqueueProductsProjection(productIds);')
    if 'enqueueProductProjection(Number(productId))' not in s:
        s = s.replace('recordCacheInvalidate(tags);\n    },\n\n    /** Batch product write', 'recordCacheInvalidate(tags);\n        await enqueueProductProjection(Number(productId));\n    },\n\n    /** Batch product write', 1)
    if 'enqueueProductsProjection(productIds)' not in s:
        s = s.replace('recordCacheInvalidate(tags);\n    },\n\n    /**\n     * Taxonomy write', 'recordCacheInvalidate(tags);\n        await enqueueProductsProjection(productIds);\n    },\n\n    /**\n     * Taxonomy write', 1)
    return s


def replace_function(s, name, replacement):
    start = s.find(f'async function {name}(')
    if start < 0:
        return s, False
    brace = s.find('{', start)
    if brace < 0:
        raise RuntimeError(f'{name} opening brace missing')
    depth = 0
    end = None
    for i in range(brace, len(s)):
        if s[i] == '{':
            depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise RuntimeError(f'{name} closing brace missing')
    return s[:start] + replacement.strip('\n') + s[end:], True


def search_patch(s):
    s = s.replace('.where("policy_id", policy.id)', '.where("policy_id", Number(policy.id))')
    s = s.replace('.where("policy_id",policy.id)', '.where("policy_id",Number(policy.id))')
    s = s.replace('meili.swapIndexes([{ indexes: [canonical, target] }])', 'meili.swapIndexes([{ indexes: [canonical, target], rename: false }])')
    s = s.replace('meili.waitForTask(', 'meili.tasks.waitForTask(')
    s = s.replace('meili.getTask(', 'meili.tasks.getTask(')
    s = s.replace('await meili.tasks.waitForTask(cleanup.taskUid).catch(() => undefined);', 'await waitForSuccessfulTask(meili, cleanup.taskUid);')

    helper = '''
async function waitForSuccessfulTask(
    meili: NonNullable<ReturnType<typeof getMeilisearch>>,
    taskUid: number,
) {
    await meili.tasks.waitForTask(taskUid);
    const task = (await meili.tasks.getTask(taskUid)) as unknown as { status: string };
    if (task.status !== "succeeded") {
        throw new Error(`Meilisearch task ${taskUid} ended with status ${task.status}`);
    }
    return task;
}
'''

    s, existed = replace_function(s, 'waitForSuccessfulTask', helper)
    if not existed:
        s, wait_count = re.subn(r'await\s+meili\.tasks\.waitForTask\(([^;]+)\);', r'await waitForSuccessfulTask(meili, \1);', s)
        if wait_count < 1:
            raise RuntimeError('neither existing task helper nor direct task waits found')
        anchor = 'function indexName(locale: string): string {'
        idx = s.find(anchor)
        if idx < 0:
            raise RuntimeError('indexName anchor not found')
        end = s.find('\n}\n', idx)
        if end < 0:
            raise RuntimeError('indexName closing brace not found')
        end += 3
        s = s[:end] + '\n' + helper.strip('\n') + '\n' + s[end:]

    hs = s.find('async function waitForSuccessfulTask(')
    hb = s.find('{', hs)
    depth = 0
    he = None
    for i in range(hb, len(s)):
        if s[i] == '{': depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0:
                he = i + 1
                break
    if hs < 0 or he is None:
        raise RuntimeError('strict helper not materialized')
    before, helper_text, after = s[:hs], s[hs:he], s[he:]
    before = re.sub(r'await\s+meili\.tasks\.waitForTask\(([^;]+)\);', r'await waitForSuccessfulTask(meili, \1);', before)
    after = re.sub(r'await\s+meili\.tasks\.waitForTask\(([^;]+)\);', r'await waitForSuccessfulTask(meili, \1);', after)
    s = before + helper_text + after

    if 'const task = (await meili.tasks.getTask(taskUid)) as unknown as { status: string };' not in s:
        raise RuntimeError('strict task status helper missing')
    if 'await meili.waitForTask(' in s:
        raise RuntimeError('legacy meili.waitForTask remains')
    if 'catch(() => undefined)' in s:
        raise RuntimeError('silent task failure remains')
    return s


def controller_patch(s):
    s = s.replace('.where("policy_id", policy.id)', '.where("policy_id", Number(policy.id))')
    s = s.replace('.where("policy_id",policy.id)', '.where("policy_id",Number(policy.id))')
    s = s.replace('boostFactor: payload.boost_factor ?? null,', 'boostFactor: payload.boost_factor == null ? null : String(payload.boost_factor),')
    s = s.replace('boostFactor:payload.boost_factor??null,', 'boostFactor:payload.boost_factor==null?null:String(payload.boost_factor),')
    s = re.sub(r'(meiliTaskUid\s*:\s*)([A-Za-z_$][\w$]*(?:\.taskUid)?)(\s*\?\?\s*null)?', lambda m: m.group(1) + f'({m.group(2)} == null ? null : String({m.group(2)}))', s)
    return s


def normalizer_patch(s):
    old = '.replace(/\\s*(?:متر|meters?|meter|m)(?=\\s|$)/gi, " m");'
    new = '.replace(/(^|[^A-Za-z])\\s*(?:متر|meters?|meter|m)(?=\\s|$)/gi, "$1 m");'
    if old not in s and new not in s:
        raise RuntimeError('discovery meter normalization anchor missing')
    return s.replace(old, new)


def namespace_route_names(s, namespace):
    def repl_double(match):
        name = match.group(1)
        if name.startswith(f'{namespace}.'):
            return match.group(0)
        return f'.as("{namespace}.{name}")'

    def repl_single(match):
        name = match.group(1)
        if name.startswith(f'{namespace}.'):
            return match.group(0)
        return f".as('{namespace}.{name}')"

    s = re.sub(r'\.as\("([^"]+)"\)', repl_double, s)
    s = re.sub(r"\.as\('([^']+)'\)", repl_single, s)
    return s


edit('apps/api/app/services/cache_invalidation.ts', cache_patch)
edit('apps/api/app/services/discovery/search_service.ts', search_patch)
edit('apps/api/app/services/discovery/normalizer.ts', normalizer_patch)
edit('apps/api/app/controllers/admin/discovery_controller.ts', controller_patch)
edit('apps/api/app/services/discovery/index_projection.ts', lambda s: s.replace('import { currentTenantId } from "#services/tenant_context";\n', ''))
edit('apps/api/app/validators/admin/discovery_validator.ts', lambda s: s.replace('DISCOVERY_EVENT_TYPES, OPPORTUNITY_TYPES, RELATION_STATES, RELATION_TYPES', 'DISCOVERY_EVENT_TYPES, RELATION_STATES, RELATION_TYPES'))
edit('apps/api/app/services/phase14_procurement_service.ts', lambda s: s.replace('type Actor = { id?: number | string };', 'type Actor = { id?: bigint | number | string };'))
edit('apps/api/app/services/phase20_trust_risk_service.ts', lambda s: s.replace('type Actor = { id?: number | string };', 'type Actor = { id?: bigint | number | string };').replace('customerId?: number | string | null;', 'customerId?: bigint | number | string | null;'))
edit('scripts/verify-phase16-discovery-integration.mjs', lambda s: s.replace('import { readFileSync, existsSync } from "node:fs";', 'import { existsSync, readFileSync } from "node:fs";'))
edit('apps/api/start/routes/admin_discovery.ts', lambda s: namespace_route_names(s, 'discovery.admin'))
edit('apps/api/start/routes/discovery_storefront.ts', lambda s: namespace_route_names(s, 'discovery.storefront'))

p = Path('apps/api/start/routes/admin_discovery.ts')
s = p.read_text()
if '/index/operations/:id/retry' not in s:
    s = s.replace('router.get("/index/health",[Controller,"indexHealth"]);', 'router.get("/index/health",[Controller,"indexHealth"]); router.post("/index/operations/:id/retry",[Controller,"retryIndex"]).use(adminWriteLimiter);')
    p.write_text(s)
