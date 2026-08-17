from pathlib import Path

service_path = Path("apps/api/app/services/governance_service.ts")
source = service_path.read_text()

old_append = '''        const entryHash = sha256(ledgerHashMaterial(record));
        const rows = await trx
            .table("governance_action_ledger")
            .insert({ ...record, entry_hash: entryHash })
            .returning("*");
'''
new_append = '''        const hashPayload = canonical(ledgerHashMaterial(record));
        const entryHash = sha256(hashPayload);
        const rows = await trx
            .table("governance_action_ledger")
            .insert({ ...record, hash_payload: hashPayload, entry_hash: entryHash })
            .returning("*");
'''
if source.count(old_append) != 1:
    raise SystemExit("append hash block not found exactly once")
source = source.replace(old_append, new_append, 1)

old_verify = '''            const hash = sha256(ledgerHashMaterial(row));
            if (hash !== String(row.entry_hash)) {
                return { ok: false, checked, reason: "entry_hash_mismatch", sequence: Number(row.sequence) };
            }
'''
new_verify = '''            const hashPayload = String(row.hash_payload ?? "");
            if (!hashPayload || sha256(hashPayload) !== String(row.entry_hash)) {
                return { ok: false, checked, reason: "entry_hash_mismatch", sequence: Number(row.sequence) };
            }
'''
if source.count(old_verify) != 1:
    raise SystemExit("verify hash block not found exactly once")
source = source.replace(old_verify, new_verify, 1)
service_path.write_text(source)

for temporary in [
    Path(".github/workflows/phase11-hash-payload-finalize.yml"),
    Path(".github/scripts/phase11_hash_payload_finalize.py"),
]:
    if temporary.exists():
        temporary.unlink()
