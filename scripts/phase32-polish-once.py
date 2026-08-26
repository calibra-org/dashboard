from pathlib import Path

service = Path("apps/api/app/services/reliability_guardian/reliability_guardian_service.ts")
text = service.read_text()
old = '''        const recentFailures = await trx
            .from("reliability_evaluations")
            .where("invariant_id", invariant.id)
            .where("passed", false)
            .orderBy("evaluated_at", "desc")
            .limit(Math.max(1, numberValue(invariant.min_consecutive_failures) - 1));
        const consecutive = previousPassed === false ? recentFailures.length + 1 : 1;'''
new = '''        const recentEvaluations = await trx
            .from("reliability_evaluations")
            .where("invariant_id", invariant.id)
            .orderBy("evaluated_at", "desc")
            .limit(Math.max(1, numberValue(invariant.min_consecutive_failures) - 1));
        let consecutive = 1;
        if (previousPassed === false) {
            for (const evaluation of recentEvaluations) {
                if (Boolean(evaluation.passed)) break;
                consecutive += 1;
            }
        }'''
if old not in text:
    raise SystemExit("consecutive-failure patch target not found")
text = text.replace(old, new)
old = '''        const passed = passes(invariant.operator as Operator, observation.value, numberValue(invariant.threshold));
        const incident = await updateIncident(invariant, observation, passed, now);
        await finalizeMonitoringRuns(invariant, incident, passed, now);'''
new = '''        const passed = passes(invariant.operator as Operator, observation.value, numberValue(invariant.threshold));
        const priorIncident = await latestOpenIncident(numberValue(invariant.id));
        const incident = await updateIncident(invariant, observation, passed, now);
        await finalizeMonitoringRuns(invariant, incident ?? (passed ? priorIncident : null), passed, now);'''
if old not in text:
    raise SystemExit("cycle verification patch target not found")
text = text.replace(old, new, 1)
old = '''    const reliabilityBps = evaluations.length ? Math.round((passing / evaluations.length) * 10000) : 10000;
    const [row] = await trx.table("reliability_scorecards").insert({'''
new = '''    if (!evaluations.length) return null;
    const reliabilityBps = Math.round((passing / evaluations.length) * 10000);
    const [row] = await trx.table("reliability_scorecards").insert({'''
if old not in text:
    raise SystemExit("no-evidence scorecard patch target not found")
text = text.replace(old, new)
old = '''    const passed = passes(invariant.operator as Operator, value, numberValue(invariant.threshold));
    const incident = await updateIncident(invariant, observation, passed, now);
    await finalizeMonitoringRuns(invariant, incident, passed, now);'''
new = '''    const passed = passes(invariant.operator as Operator, value, numberValue(invariant.threshold));
    const priorIncident = await latestOpenIncident(numberValue(invariant.id));
    const incident = await updateIncident(invariant, observation, passed, now);
    await finalizeMonitoringRuns(invariant, incident ?? (passed ? priorIncident : null), passed, now);'''
if old not in text:
    raise SystemExit("manual verification patch target not found")
text = text.replace(old, new)
service.write_text(text)

verify = Path("scripts/verify-phase32-reliability-guardian.mjs")
v = verify.read_text()
marker = 'must(service.includes("no_evidence"), "Phase32 service boundary missing no_evidence");'
if "scorecards must not invent perfect reliability" not in v:
    if marker not in v:
        raise SystemExit("verify marker not found")
    v = v.replace(marker, marker + '\nmust(service.includes("if (!evaluations.length) return null"), "Phase32 scorecards must not invent perfect reliability when evidence is absent");')
verify.write_text(v)

sidebar = Path("apps/admin/src/components/Sidebar.tsx")
s = sidebar.read_text()
anchor = '{ href: "/analytics/fulfillment-promise", label: "وعده تحویل و شبکه محلی", icon: Boxes },'
addition = anchor + '\n\t\t\t{ href: "/analytics/reliability-guardian", label: "پایداری و Self-Healing", icon: ShieldCheck },'
if "/analytics/reliability-guardian" not in s:
    if anchor not in s:
        raise SystemExit("sidebar anchor not found")
    s = s.replace(anchor, addition)
sidebar.write_text(s)
