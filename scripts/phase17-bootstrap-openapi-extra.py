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
print("Phase 17 OpenAPI includes layer/holdout management, revisions and guardrail checks")
