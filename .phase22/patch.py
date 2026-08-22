from pathlib import Path
import json

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if new in s: return
    if old not in s: raise SystemExit(f"missing patch anchor in {path}: {old}")
    p.write_text(s.replace(old,new,1))

replace_once('apps/api/start/routes.ts','await import("./routes/admin_agentic_gateway.js");','await import("./routes/admin_agentic_gateway.js");\nawait import("./routes/admin_agent_orchestrator.js");')
p=Path('apps/admin/src/lib/i18n/request.ts'); s=p.read_text()
if 'agentOrchestrator' not in s:
    s=s.replace('    const agenticGateway = (await import(`../../../messages/agentic_gateway/${locale}.json`)).default;', '    const agenticGateway = (await import(`../../../messages/agentic_gateway/${locale}.json`)).default;\n    const agentOrchestrator = (await import(`../../../messages/agent_orchestrator/${locale}.json`)).default;')
    s=s.replace('            ...agenticGateway,','            ...agenticGateway,\n            ...agentOrchestrator,')
    s=s.replace('                ...agenticGateway.Nav,','                ...agenticGateway.Nav,\n                ...agentOrchestrator.Nav,')
    p.write_text(s)
p=Path('apps/admin/src/components/Sidebar.tsx'); s=p.read_text()
if 'orchestratorOverview' not in s:
    anchor='    { href: "/agentic-commerce/conformance", labelKey: "agenticConformance", icon: ShieldCheck },'
    addition='''    { href: "/agentic-commerce/conformance", labelKey: "agenticConformance", icon: ShieldCheck },
    { href: "/agentic-commerce/orchestrator/overview", labelKey: "orchestratorOverview", icon: Bot },
    { href: "/agentic-commerce/orchestrator/agents", labelKey: "orchestratorAgents", icon: Users },
    { href: "/agentic-commerce/orchestrator/tools", labelKey: "orchestratorTools", icon: SlidersHorizontal },
    { href: "/agentic-commerce/orchestrator/plans", labelKey: "orchestratorPlans", icon: ListTree },
    { href: "/agentic-commerce/orchestrator/council", labelKey: "orchestratorCouncil", icon: ShieldCheck },'''
    if anchor not in s: raise SystemExit('sidebar anchor missing')
    p.write_text(s.replace(anchor,addition,1))
p=Path('docs/api/package.json'); d=json.loads(p.read_text()); scripts=d['scripts']
scripts['build:json:admin-agent-orchestrator']='redocly bundle reference/openapi/admin.agent-orchestrator.v1.yaml -o dist/admin.agent-orchestrator.v1.json --ext json'
if 'build:json:admin-agent-orchestrator' not in scripts['build:json:admin']:
    scripts['build:json:admin']=scripts['build:json:admin'].replace('pnpm build:json:admin-agentic-commerce &&','pnpm build:json:admin-agentic-commerce && pnpm build:json:admin-agent-orchestrator &&')
p.write_text(json.dumps(d,ensure_ascii=False,indent=4)+'\n')
p=Path('docs/api/scripts/merge-admin-spec.js'); s=p.read_text()
if 'agentOrchestrator' not in s:
    s=s.replace('const agenticCommerce = JSON.parse(readFileSync(resolve(root, "dist/admin.agentic-commerce.v1.json"), "utf8"));','const agenticCommerce = JSON.parse(readFileSync(resolve(root, "dist/admin.agentic-commerce.v1.json"), "utf8"));\nconst agentOrchestrator = JSON.parse(readFileSync(resolve(root, "dist/admin.agent-orchestrator.v1.json"), "utf8"));')
    s=s.replace('    [agenticCommerce, "AgenticCommerceOverlay"],','    [agenticCommerce, "AgenticCommerceOverlay"],\n    [agentOrchestrator, "AgentOrchestratorOverlay"],')
    p.write_text(s)
p=Path('scripts/verify-phase22-agent-orchestrator.mjs')
lines=p.read_text().splitlines()
if len(lines) >= 3 and lines[0].startswith('import ') and lines[1].startswith('import '):
    while len(lines) > 2 and lines[2] == '':
        lines.pop(2)
    lines.insert(2, '')
p.write_text('\n'.join(lines)+'\n')
