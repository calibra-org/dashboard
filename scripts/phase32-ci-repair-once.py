from pathlib import Path

service = Path("apps/api/app/services/reliability_guardian/reliability_guardian_service.ts")
text = service.read_text()
replacements = {
    '.where("invariant_id", invariant.id)': '.where("invariant_id", numberValue(invariant.id))',
    '.where("policy_id", policy.id)': '.where("policy_id", numberValue(policy.id))',
    '.where("incident_id", incident.id)': '.where("incident_id", numberValue(incident.id))',
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"expected repair target missing: {old}")
    text = text.replace(old, new)
service.write_text(text)

fulfillment = Path("apps/admin/src/features/fulfillment-promise/FulfillmentPromiseWorkspace.tsx")
text = fulfillment.read_text()
ui_replacements = {
    'onValueChange={(v) => setForm({ ...form, node_type: v })}': 'onValueChange={(v) => setForm({ ...form, node_type: String(v) })}',
    'onValueChange={setNode}': 'onValueChange={(value) => setNode(String(value))}',
}
for old, new in ui_replacements.items():
    if old not in text:
        raise SystemExit(f"expected fulfillment UI repair target missing: {old}")
    text = text.replace(old, new)
fulfillment.write_text(text)

guardian = Path("apps/admin/src/features/reliability-guardian/ReliabilityGuardianWorkspace.tsx")
text = guardian.read_text()
old = 'onValueChange={setSource}'
new = 'onValueChange={(value) => setSource(String(value))}'
if old not in text:
    raise SystemExit(f"expected guardian UI repair target missing: {old}")
guardian.write_text(text.replace(old, new))

for filename in ["docs/api/package.json", "docs/api/scripts/merge-admin-spec.js"]:
    path = Path(filename)
    path.write_text(path.read_text().rstrip() + "\n")
