from pathlib import Path

root = Path(__file__).resolve().parents[1]

admin = root / "docs/api/reference/openapi/admin.phase17.v1.yaml"
admin.write_text(r'''openapi: 3.1.0
info:
  title: Calibra Admin Phase 17 API
  version: 1.0.0
  description: Tenant-scoped experiment registry, trust gates, immutable analysis and causal evidence.
tags:
  - name: Admin / Experiments
    description: Experiment control plane and causal-learning administration.
paths:
  /api/v1/admin/experiments/overview:
    get:
      tags: [Admin / Experiments]
      summary: Get experimentation overview
      operationId: getExperimentOverview
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment health overview } }
  /api/v1/admin/experiments:
    get:
      tags: [Admin / Experiments]
      summary: List experiments
      operationId: listExperiments
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment registry } }
    post:
      tags: [Admin / Experiments]
      summary: Create experiment draft
      operationId: createExperiment
      security: [{ bearerAuth: [] }]
      responses: { "201": { description: Experiment draft created } }
  /api/v1/admin/experiments/metrics:
    get:
      tags: [Admin / Experiments]
      summary: List versioned experiment metrics
      operationId: listExperimentMetrics
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Metric registry } }
    post:
      tags: [Admin / Experiments]
      summary: Create metric version
      operationId: createExperimentMetric
      security: [{ bearerAuth: [] }]
      responses: { "201": { description: Metric version created } }
  /api/v1/admin/experiments/layers:
    get:
      tags: [Admin / Experiments]
      summary: List experiment layers
      operationId: listExperimentLayers
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment layers } }
  /api/v1/admin/experiments/holdouts:
    get:
      tags: [Admin / Experiments]
      summary: List experiment holdouts
      operationId: listExperimentHoldouts
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment holdouts } }
  /api/v1/admin/experiments/evidence:
    get:
      tags: [Admin / Experiments]
      summary: List causal evidence
      operationId: listCausalEvidence
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Causal evidence library } }
  /api/v1/admin/experiments/diagnostics:
    get:
      tags: [Admin / Experiments]
      summary: List experiment diagnostics
      operationId: listExperimentDiagnostics
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Trust diagnostics } }
  /api/v1/admin/experiments/{id}:
    parameters:
      - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
    get:
      tags: [Admin / Experiments]
      summary: Get experiment detail
      operationId: getExperiment
      security: [{ bearerAuth: [] }]
      responses: { "200": { description: Experiment detail } }
  /api/v1/admin/experiments/{id}/preflight:
    post:
      tags: [Admin / Experiments]
      summary: Validate experiment preflight
      operationId: preflightExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Preflight result } }
  /api/v1/admin/experiments/{id}/submit:
    post:
      tags: [Admin / Experiments]
      summary: Submit experiment for review
      operationId: submitExperimentReview
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment submitted for review } }
  /api/v1/admin/experiments/{id}/approve:
    post:
      tags: [Admin / Experiments]
      summary: Approve experiment design
      operationId: approveExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment approved } }
  /api/v1/admin/experiments/{id}/start:
    post:
      tags: [Admin / Experiments]
      summary: Start approved experiment
      operationId: startExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment started } }
  /api/v1/admin/experiments/{id}/pause:
    post:
      tags: [Admin / Experiments]
      summary: Pause running experiment
      operationId: pauseExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment paused } }
  /api/v1/admin/experiments/{id}/resume:
    post:
      tags: [Admin / Experiments]
      summary: Resume paused experiment
      operationId: resumeExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment resumed } }
  /api/v1/admin/experiments/{id}/stop:
    post:
      tags: [Admin / Experiments]
      summary: Stop experiment normally
      operationId: stopExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment stopped } }
  /api/v1/admin/experiments/{id}/kill:
    post:
      tags: [Admin / Experiments]
      summary: Emergency-kill experiment
      operationId: killExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment killed } }
  /api/v1/admin/experiments/{id}/analyze:
    post:
      tags: [Admin / Experiments]
      summary: Create immutable analysis snapshot
      operationId: analyzeExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Analysis snapshot created } }
  /api/v1/admin/experiments/{id}/decision:
    post:
      tags: [Admin / Experiments]
      summary: Record actual experiment decision
      operationId: recordExperimentDecision
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Decision recorded } }
  /api/v1/admin/experiments/{id}/archive:
    post:
      tags: [Admin / Experiments]
      summary: Archive decided experiment
      operationId: archiveExperiment
      security: [{ bearerAuth: [] }]
      parameters: [{ name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }]
      responses: { "200": { description: Experiment archived } }
''', encoding="utf-8")

storefront = root / "docs/api/reference/openapi/storefront.phase17.v1.yaml"
storefront.write_text(r'''openapi: 3.1.0
info:
  title: Calibra Experiment Runtime API
  version: 1.0.0
  description: Deterministic assignment and signed real-exposure logging. Outcome writes are server-side only.
tags:
  - name: Experimentation Runtime
    description: Runtime assignment and verified exposure endpoints.
paths:
  /api/v1/experimentation/evaluate:
    post:
      tags: [Experimentation Runtime]
      summary: Evaluate deterministic experiment assignment
      operationId: evaluateExperimentAssignment
      responses: { "200": { description: Assignment or ineligible result } }
  /api/v1/experimentation/exposures:
    post:
      tags: [Experimentation Runtime]
      summary: Log verified experiment exposure
      operationId: logExperimentExposure
      responses: { "200": { description: Idempotent exposure accepted } }
''', encoding="utf-8")

print("Phase 17 OpenAPI overlays rewritten with explicit summaries and path parameters")
