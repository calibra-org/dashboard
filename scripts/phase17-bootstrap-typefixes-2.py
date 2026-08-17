from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "apps/api/app/services/experimentation/experiment_service.ts"
text = path.read_text(encoding="utf-8")

old = '''        const controlVariant = variants.find((item: Row) => item.is_control);
        const treatmentVariant = variants.find((item: Row) => !item.is_control);
        const results: Row[] = [];'''
new = '''        const controlVariant = variants.find((item: Row) => item.is_control);
        const treatmentVariant = variants.find((item: Row) => !item.is_control);
        if (!controlVariant || !treatmentVariant) {
            throw new Exception("Two-arm guardrail design is invalid", { status: 422, code: "E_EXPERIMENT_GUARDRAIL_ARMS" });
        }
        const results: Row[] = [];'''
if old not in text:
    raise SystemExit("Phase17 guardrail narrowing anchor missing")
text = text.replace(old, new, 1)

old = '''        const result = {
            primary_metric: { id: number(metric.id), key: metric.key, version: number(metric.version) },'''
new = '''        const guardrails = await this.evaluateGuardrails(revision, assignments, variants, dataCutoff);
        const guardrailStatus = guardrails.status;
        const result = {
            primary_metric: { id: number(metric.id), key: metric.key, version: number(metric.version) },'''
if old not in text:
    raise SystemExit("Phase17 analysis result anchor missing")
text = text.replace(old, new, 1)

old = '''        const guardrails = await this.evaluateGuardrails(revision, assignments, variants, dataCutoff);
        const guardrailStatus = guardrails.status;
        const [snapshot] = await trx.table("experiment_analysis_snapshots").insert({'''
new = '''        const [snapshot] = await trx.table("experiment_analysis_snapshots").insert({'''
if old not in text:
    raise SystemExit("Phase17 duplicate guardrail declaration anchor missing")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Phase 17 strict type flow fixed for guardrail arms and analysis declaration order")
