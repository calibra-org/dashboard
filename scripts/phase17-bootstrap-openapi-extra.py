from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "docs/api/reference/openapi/admin.phase17.v1.yaml"
text = path.read_text(encoding="utf-8")

text = text.replace(
'''  /api/v1/admin/experiments/layers:
    get:
      tags: [Admin / Experiments]
      summary: List experiment layers
      operationId: listExperimentLayers
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment layers } }
''',
'''  /api/v1/admin/experiments/layers:
    get:
      tags: [Admin / Experiments]
      summary: List experiment layers
      operationId: listExperimentLayers
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment layers } }
    post:
      tags: [Admin / Experiments]
      summary: Create hard-isolation experiment layer
      operationId: createExperimentLayer
      security: [{ bearerAuth: [] }]
      responses: { "201": { description: Experiment layer created } }
''')
text = text.replace(
'''  /api/v1/admin/experiments/holdouts:
    get:
      tags: [Admin / Experiments]
      summary: List experiment holdouts
      operationId: listExperimentHoldouts
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment holdouts } }
''',
'''  /api/v1/admin/experiments/holdouts:
    get:
      tags: [Admin / Experiments]
      summary: List experiment holdouts
      operationId: listExperimentHoldouts
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment holdouts } }
    post:
      tags: [Admin / Experiments]
      summary: Create persistent experiment holdout
      operationId: createExperimentHoldout
      security: [{ bearerAuth: [] }]
      responses: { "201": { description: Experiment holdout created } }
''')
needle = '''  /api/v1/admin/experiments/{id}/submit:
'''
insert = '''  /api/v1/admin/experiments/{id}/revision:
    post:
      tags: [Admin / Experiments]
      summary: Create a new immutable experiment revision
      operationId: createExperimentRevision
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: New draft revision created } }
  /api/v1/admin/experiments/{id}/guardrails/check:
    post:
      tags: [Admin / Experiments]
      summary: Evaluate live experiment guardrails
      operationId: checkExperimentGuardrails
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Guardrail evaluation result } }
'''
if needle not in text:
    raise SystemExit("Phase 17 extra OpenAPI anchor missing")
text = text.replace(needle, insert + needle, 1)
path.write_text(text, encoding="utf-8")

service = root / "apps/api/app/services/experimentation/experiment_service.ts"
code = service.read_text(encoding="utf-8")
old = '''        const controlVariant = variants.find((item: Row) => item.is_control);
        const treatmentVariant = variants.find((item: Row) => !item.is_control);
        const results: Row[] = [];'''
new = '''        const controlVariant = variants.find((item: Row) => item.is_control);
        const treatmentVariant = variants.find((item: Row) => !item.is_control);
        if (!controlVariant || !treatmentVariant) {
            throw new Exception("Two-arm guardrail design is invalid", { status: 422, code: "E_EXPERIMENT_GUARDRAIL_ARMS" });
        }
        const results: Row[] = [];'''
if old not in code:
    raise SystemExit("Phase 17 guardrail narrowing anchor missing")
code = code.replace(old, new, 1)

old = '''        const result = {
            primary_metric: { id: number(metric.id), key: metric.key, version: number(metric.version) },'''
new = '''        const guardrails = await this.evaluateGuardrails(revision, assignments, variants, dataCutoff);
        const guardrailStatus = guardrails.status;
        const result = {
            primary_metric: { id: number(metric.id), key: metric.key, version: number(metric.version) },'''
if old not in code:
    raise SystemExit("Phase 17 analysis result anchor missing")
code = code.replace(old, new, 1)

old = '''        const guardrails = await this.evaluateGuardrails(revision, assignments, variants, dataCutoff);
        const guardrailStatus = guardrails.status;
        const [snapshot] = await trx.table("experiment_analysis_snapshots").insert({'''
new = '''        const [snapshot] = await trx.table("experiment_analysis_snapshots").insert({'''
if old not in code:
    raise SystemExit("Phase 17 duplicate guardrail declaration anchor missing")
code = code.replace(old, new, 1)
service.write_text(code, encoding="utf-8")

print("Phase 17 OpenAPI extras and strict guardrail type flow applied")
