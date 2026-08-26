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

for filename in ["docs/api/package.json", "docs/api/scripts/merge-admin-spec.js"]:
    path = Path(filename)
    path.write_text(path.read_text().rstrip() + "\n")
