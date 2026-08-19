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
        s = s.replace(
            'import { recordCacheInvalidate } from "#services/metrics/domain_metrics";',
            'import { recordCacheInvalidate } from "#services/metrics/domain_metrics";\nimport { enqueueProductProjection, enqueueProductsProjection } from "#services/discovery/index_projection";',
        )
    s = s.replace('await syncProduct(Number(productId)).catch(() => undefined);', 'await enqueueProductProjection(Number(productId));')
    s = s.replace('await syncProducts(productIds).catch(() => undefined);', 'await enqueueProductsProjection(productIds);')
    if 'enqueueProductProjection(Number(productId))' not in s:
        s = s.replace(
            'recordCacheInvalidate(tags);\n    },\n\n    /** Batch product write',
            'recordCacheInvalidate(tags);\n        await enqueueProductProjection(Number(productId));\n    },\n\n    /** Batch product write',
            1,
        )
    if 'enqueueProductsProjection(productIds)' not in s:
        s = s.replace(
            'recordCacheInvalidate(tags);\n    },\n\n    /**\n     * Taxonomy write',
            'recordCacheInvalidate(tags);\n        await enqueueProductsProjection(productIds);\n    },\n\n    /**\n     * Taxonomy write',
            1,
        )
    return s


def search_patch(s):
    s = s.replace('.where("policy_id", policy.id)', '.where("policy_id", Number(policy.id))')
    s = s.replace('.where("policy_id",policy.id)', '.where("policy_id",Number(policy.id))')
    s = s.replace('meili.swapIndexes([{ indexes: [canonical, target] }])', 'meili.swapIndexes([{ indexes: [canonical, target], rename: false }])')
    s = s.replace('meili.waitForTask(', 'meili.tasks.waitForTask(')
    s = s.replace('meili.getTask(', 'meili.tasks.getTask(')
    s = s.replace('await meili.tasks.waitForTask(cleanup.taskUid).catch(() => undefined);', 'await meili.tasks.waitForTask(cleanup.taskUid);')
    pattern = r'(async function waitForSuccessfulTask\([^)]*\)\s*\{)[\s\S]*?(\n\})'
    replacement = '''\\1
    await meili.tasks.waitForTask(taskUid);
    const task = (await meili.tasks.getTask(taskUid)) as unknown as { status: string };
    if (task.status !== "succeeded") {
        throw new Error(`Meilisearch task ${taskUid} ended with status ${task.status}`);
    }
    return task;\\2'''
    s, count = re.subn(pattern, replacement, s, count=1)
    if count != 1:
        raise RuntimeError(f'waitForSuccessfulTask normalization matched {count} functions')
    if 'as unknown as { status: string }' not in s:
        raise RuntimeError('task status assertion was not materialized')
    if re.search(r'const\s+task\s*=\s*await\s+.*waitForTask\(taskUid\)', s):
        raise RuntimeError('legacy waitForTask assignment remains')
    return s


def controller_patch(s):
    s = s.replace('.where("policy_id", policy.id)', '.where("policy_id", Number(policy.id))')
    s = s.replace('.where("policy_id",policy.id)', '.where("policy_id",Number(policy.id))')
    s = s.replace('boostFactor: payload.boost_factor ?? null,', 'boostFactor: payload.boost_factor == null ? null : String(payload.boost_factor),')
    s = s.replace('boostFactor:payload.boost_factor??null,', 'boostFactor:payload.boost_factor==null?null:String(payload.boost_factor),')
    s = re.sub(
        r'(meiliTaskUid\s*:\s*)([A-Za-z_$][\w$]*(?:\.taskUid)?)(\s*\?\?\s*null)?',
        lambda m: m.group(1) + f'({m.group(2)} == null ? null : String({m.group(2)}))',
        s,
    )
    return s


edit('apps/api/app/services/cache_invalidation.ts', cache_patch)
edit('apps/api/app/services/discovery/search_service.ts', search_patch)
edit('apps/api/app/controllers/admin/discovery_controller.ts', controller_patch)
edit('apps/api/app/services/discovery/index_projection.ts', lambda s: s.replace('import { currentTenantId } from "#services/tenant_context";\n', ''))
edit('apps/api/app/validators/admin/discovery_validator.ts', lambda s: s.replace('DISCOVERY_EVENT_TYPES, OPPORTUNITY_TYPES, RELATION_STATES, RELATION_TYPES', 'DISCOVERY_EVENT_TYPES, RELATION_STATES, RELATION_TYPES'))
edit('apps/api/app/services/phase14_procurement_service.ts', lambda s: s.replace('type Actor = { id?: number | string };', 'type Actor = { id?: bigint | number | string };'))
edit('apps/api/app/services/phase20_trust_risk_service.ts', lambda s: s.replace('type Actor = { id?: number | string };', 'type Actor = { id?: bigint | number | string };').replace('customerId?: number | string | null;', 'customerId?: bigint | number | string | null;'))
p = Path('apps/api/start/routes/admin_discovery.ts')
s = p.read_text()
if '/index/operations/:id/retry' not in s:
    s = s.replace('router.get("/index/health",[Controller,"indexHealth"]);', 'router.get("/index/health",[Controller,"indexHealth"]); router.post("/index/operations/:id/retry",[Controller,"retryIndex"]).use(adminWriteLimiter);')
    p.write_text(s)
