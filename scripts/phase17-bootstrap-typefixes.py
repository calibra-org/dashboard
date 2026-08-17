from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "apps/api/app/services/experimentation/experiment_service.ts"
text = path.read_text(encoding="utf-8")
old = '''    async preflight(id: number) {
        const detail = (await this.get(id)).data;
        const { experiment, revision, variants, metric } = detail;'''
new = '''    async preflight(id: number) {
        const detail = (await this.get(id)).data;
        const { revision, variants, metric } = detail;'''
if old not in text:
    raise SystemExit("Phase 17 typefix anchor not found")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Phase 17 strict API typecheck: removed unused preflight binding")
