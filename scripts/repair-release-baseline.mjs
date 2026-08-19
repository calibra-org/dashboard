import { readFileSync, writeFileSync } from "node:fs";

function read(path) {
    return readFileSync(path, "utf8");
}

function write(path, content) {
    writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function replaceRequired(content, before, after, label) {
    if (content.includes(after)) return content;
    if (!content.includes(before)) throw new Error(`Missing expected text for ${label}`);
    return content.replace(before, after);
}

function tenantScopeService(path, importBefore, importAfter) {
    let content = read(path);
    content = content.replace('import db from "@adonisjs/lucid/services/db";\n', "");
    content = replaceRequired(content, importBefore, importAfter, `${path} tenant import`);
    if (content.includes("db.")) content = content.replaceAll("db.", "currentTrx().");
    if (content.includes("db.")) throw new Error(`Bare db reference remains in ${path}`);
    write(path, content);
}

tenantScopeService(
    "apps/api/app/services/phase14_procurement_service.ts",
    'import { withTenantTransaction } from "#services/tenant_context";',
    'import { currentTrx, withTenantTransaction } from "#services/tenant_context";',
);

tenantScopeService(
    "apps/api/app/services/phase20_trust_risk_service.ts",
    'import { currentTenantId, withTenantTransaction } from "#services/tenant_context";',
    'import { currentTenantId, currentTrx, withTenantTransaction } from "#services/tenant_context";',
);

write(
    "docs/api/reference/openapi/admin.phase14.v1.yaml",
    String.raw`openapi: 3.1.0
info:
  title: Calibra Admin Phase 14 Procurement API
  version: 1.0.0
paths:
  /api/v1/admin/procurement/overview:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementOverview
      responses:
        "200": { description: Procurement portfolio overview }
  /api/v1/admin/procurement/suppliers:
    get:
      tags: [Phase14Procurement]
      operationId: phase14SupplierList
      responses:
        "200": { description: Supplier registry with score components }
    post:
      tags: [Phase14Procurement]
      operationId: phase14SupplierCreate
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase14SupplierCreate" }
      responses:
        "201": { description: Supplier created }
        "422": { description: Supplier contract validation failed }
  /api/v1/admin/procurement/purchase-orders:
    get:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderList
      responses:
        "200": { description: Purchase order registry }
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderCreate
      parameters:
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 160 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase14PurchaseOrderCreate" }
      responses:
        "200": { description: Idempotent replay }
        "201": { description: Purchase order created }
        "422": { description: Supplier or planning recommendation validation failed }
  /api/v1/admin/procurement/purchase-orders/{id}/transition:
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderTransition
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase14PurchaseOrderTransition" }
      responses:
        "200": { description: Purchase order state changed }
        "403": { description: Separation-of-duties policy rejected the transition }
        "409": { description: Purchase order version changed }
        "422": { description: Invalid purchase order transition }
  /api/v1/admin/procurement/purchase-orders/{id}/receipts:
    post:
      tags: [Phase14Procurement]
      operationId: phase14PurchaseOrderReceive
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 160 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase14PurchaseOrderReceiptCreate" }
      responses:
        "200": { description: Idempotent replay }
        "201": { description: Goods receipt recorded }
        "422": { description: Receipt quantities or purchase order state are invalid }
  /api/v1/admin/procurement/recommendations:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementRecommendations
      responses:
        "200": { description: Replenishment recommendations enriched with supplier economics and reliability }
  /api/v1/admin/procurement/health:
    get:
      tags: [Phase14Procurement]
      operationId: phase14ProcurementHealth
      responses:
        "200": { description: Procurement data-plane readiness }
components:
  schemas:
    Phase14SupplierCreate:
      type: object
      required: [code, legal_name, display_name]
      properties:
        code: { type: string, minLength: 2, maxLength: 64 }
        legal_name: { type: string, minLength: 2, maxLength: 220 }
        display_name: { type: string, minLength: 2, maxLength: 220 }
        email: { type: string, format: email }
        phone: { type: string, maxLength: 64 }
        currency: { type: string, minLength: 3, maxLength: 3 }
        payment_terms: { type: string, maxLength: 120 }
        default_lead_time_days: { type: number, minimum: 0, maximum: 365 }
        criticality: { type: string, enum: [low, normal, high, critical] }
    Phase14PurchaseOrderLine:
      type: object
      required: [product_id, name, quantity, unit_cost]
      properties:
        product_id: { type: integer, minimum: 1 }
        variation_id: { type: integer, minimum: 1 }
        sku: { type: string, maxLength: 190 }
        name: { type: string, minLength: 1, maxLength: 255 }
        quantity: { type: number, exclusiveMinimum: 0 }
        unit_cost: { type: number, minimum: 0 }
        expected_date: { type: string }
    Phase14PurchaseOrderCreate:
      type: object
      required: [supplier_id, lines]
      properties:
        supplier_id: { type: integer, minimum: 1 }
        currency: { type: string, minLength: 3, maxLength: 3 }
        expected_date: { type: string }
        payment_terms: { type: string, maxLength: 120 }
        planning_recommendation_id: { type: integer, minimum: 1 }
        lines:
          type: array
          minItems: 1
          maxItems: 200
          items: { $ref: "#/components/schemas/Phase14PurchaseOrderLine" }
    Phase14PurchaseOrderTransition:
      type: object
      required: [status, expected_version]
      properties:
        status: { type: string, enum: [approval, sent, acknowledged, partially_shipped, closed, cancelled] }
        expected_version: { type: integer, minimum: 1 }
    Phase14ReceiptLine:
      type: object
      required: [purchase_order_line_id, received_quantity, accepted_quantity]
      properties:
        purchase_order_line_id: { type: integer, minimum: 1 }
        received_quantity: { type: number, exclusiveMinimum: 0 }
        accepted_quantity: { type: number, minimum: 0 }
        rejected_quantity: { type: number, minimum: 0 }
        quarantine_quantity: { type: number, minimum: 0 }
        quality_reason: { type: string, maxLength: 240 }
        lot_code: { type: string, maxLength: 120 }
        batch_code: { type: string, maxLength: 120 }
    Phase14PurchaseOrderReceiptCreate:
      type: object
      required: [lines]
      properties:
        notes: { type: string, maxLength: 1000 }
        lines:
          type: array
          minItems: 1
          maxItems: 200
          items: { $ref: "#/components/schemas/Phase14ReceiptLine" }
tags:
  - name: Phase14Procurement
    description: Supplier registry, purchase-order lifecycle, receiving integrity, replenishment recommendations, and procurement readiness.
`,
);

write(
    "docs/api/reference/openapi/admin.phase20.v1.yaml",
    String.raw`openapi: 3.1.0
info:
  title: Calibra Admin Phase 20 Trust Risk API
  version: 1.0.0
paths:
  /api/v1/admin/trust/overview:
    get:
      tags: [Phase20TrustRisk]
      operationId: phase20TrustOverview
      responses:
        "200": { description: Trust and fraud risk overview }
  /api/v1/admin/trust/cases:
    get:
      tags: [Phase20TrustRisk]
      operationId: phase20FraudCaseList
      responses:
        "200": { description: Fraud case registry }
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20FraudCaseCreate
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20FraudCaseCreate" }
      responses:
        "201": { description: Fraud case opened }
  /api/v1/admin/trust/cases/{id}/assign:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20FraudCaseAssign
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20FraudCaseAssign" }
      responses:
        "200": { description: Fraud case assignment updated }
        "404": { description: Fraud case not found }
  /api/v1/admin/trust/cases/{id}/status:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20FraudCaseStatus
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20FraudCaseStatus" }
      responses:
        "200": { description: Fraud case status updated }
        "404": { description: Fraud case not found }
  /api/v1/admin/trust/cases/{id}/notes:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20FraudCaseNote
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20FraudCaseNote" }
      responses:
        "200": { description: Fraud case note added }
        "404": { description: Fraud case not found }
  /api/v1/admin/trust/signals:
    get:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskSignalList
      responses:
        "200": { description: Recent trust and fraud signals }
  /api/v1/admin/trust/models:
    get:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskModelList
      responses:
        "200": { description: Risk model registry and versions }
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskModelCreate
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20RiskModelCreate" }
      responses:
        "201": { description: Risk model created }
  /api/v1/admin/trust/models/{id}/versions:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskModelVersionCreate
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20RiskModelVersionCreate" }
      responses:
        "201": { description: Risk model version created }
        "404": { description: Risk model not found }
  /api/v1/admin/trust/model-versions/{id}/promote:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskModelPromote
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 180 } }
      responses:
        "200": { description: Validated model version promoted to champion or replayed }
        "404": { description: Risk model version not found }
        "422": { description: Risk model version is not validated }
  /api/v1/admin/trust/evaluate:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20RiskEvaluate
      parameters:
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 180 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20RiskEvaluate" }
      responses:
        "200": { description: Idempotent risk evaluation replay }
        "201": { description: Risk score and policy decision recorded }
  /api/v1/admin/trust/controls:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20SubjectControlCreate
      parameters:
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 180 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20SubjectControlCreate" }
      responses:
        "200": { description: Idempotent control replay }
        "201": { description: Subject control created }
  /api/v1/admin/trust/controls/{id}/release:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20SubjectControlRelease
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer, minimum: 1 } }
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 180 } }
      responses:
        "200": { description: Subject control released or replayed }
        "404": { description: Subject control not found }
  /api/v1/admin/trust/controls/block:
    post:
      tags: [Phase20TrustRisk]
      operationId: phase20SubjectBlock
      parameters:
        - { name: Idempotency-Key, in: header, required: false, schema: { type: string, maxLength: 180 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase20SubjectControlCreate" }
      responses:
        "200": { description: Existing block replayed }
        "201": { description: Blocking subject control created }
  /api/v1/admin/trust/health:
    get:
      tags: [Phase20TrustRisk]
      operationId: phase20TrustHealth
      responses:
        "200": { description: Trust and fraud data-plane readiness }
components:
  schemas:
    Phase20RiskSignal:
      type: object
      required: [code]
      properties:
        code: { type: string, minLength: 2, maxLength: 120 }
        severity: { type: string, enum: [low, medium, high, critical] }
        value: { type: number, minimum: 0, maximum: 4 }
        evidence: { type: object, additionalProperties: true }
        dedupe_key: { type: string, maxLength: 180 }
    Phase20RiskEvaluate:
      type: object
      required: [subject_type, subject_id]
      properties:
        subject_type: { type: string, enum: [order, customer, session, payment, coupon, refund, account] }
        subject_id: { type: string, minLength: 1, maxLength: 160 }
        signals:
          type: array
          maxItems: 100
          items: { $ref: "#/components/schemas/Phase20RiskSignal" }
        idempotency_key: { type: string, maxLength: 180 }
    Phase20RiskModelCreate:
      type: object
      required: [model_id]
      properties:
        model_id: { type: string, minLength: 2, maxLength: 120 }
        purpose: { type: string, maxLength: 160 }
        owner: { type: string, maxLength: 160 }
        description: { type: string, maxLength: 2000 }
    Phase20RiskModelVersionCreate:
      type: object
      required: [version]
      properties:
        version: { type: string, minLength: 1, maxLength: 80 }
        deployment_state: { type: string, enum: [draft, shadow, candidate] }
        thresholds: { type: object, additionalProperties: true }
        weights: { type: object, additionalProperties: true }
        validation_metrics: { type: object, additionalProperties: true }
        known_limitations: { type: string, maxLength: 4000 }
        validated: { type: boolean }
    Phase20FraudCaseCreate:
      type: object
      required: [subject_type, subject_id]
      properties:
        subject_type: { type: string, minLength: 1, maxLength: 40 }
        subject_id: { type: string, minLength: 1, maxLength: 160 }
        priority: { type: string, enum: [low, medium, high, critical] }
        summary: { type: string, maxLength: 2000 }
    Phase20FraudCaseAssign:
      type: object
      properties:
        assignee_user_id: { type: integer, minimum: 1 }
    Phase20FraudCaseStatus:
      type: object
      required: [status]
      properties:
        status: { type: string, enum: [open, investigating, waiting, resolved, closed] }
        resolution: { type: string, maxLength: 4000 }
    Phase20FraudCaseNote:
      type: object
      required: [note]
      properties:
        note: { type: string, minLength: 2, maxLength: 4000 }
    Phase20SubjectControlCreate:
      type: object
      required: [subject_type, subject_id, control, reason]
      properties:
        subject_type: { type: string, minLength: 1, maxLength: 40 }
        subject_id: { type: string, minLength: 1, maxLength: 160 }
        control: { type: string, enum: [block, challenge, review, allow_override] }
        reason: { type: string, minLength: 3, maxLength: 2000 }
        expires_at: { type: string }
tags:
  - name: Phase20TrustRisk
    description: Trust signals, risk evaluation, model governance, fraud cases, subject controls, and readiness.
`,
);

write(
    "docs/api/reference/openapi/storefront.phase17.v1.yaml",
    String.raw`openapi: 3.1.0
info:
  title: Calibra Storefront Phase 17 Experimentation API
  version: 1.0.0
paths:
  /api/v1/experiments/assign:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentAssign
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase17AssignmentRequest" }
      responses:
        "200": { description: Deterministic assignment for the active experiment }
        "404": { description: Experiment is not active or eligible }
  /api/v1/experiments/exposures:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentExposure
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase17Exposure" }
      responses:
        "200": { description: Exposure accepted or deduplicated }
  /api/v1/experiments/observations:
    post:
      tags: [Phase17Experimentation]
      operationId: phase17ExperimentObservation
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/Phase17Observation" }
      responses:
        "200": { description: Metric observation accepted or deduplicated }
components:
  schemas:
    Phase17AssignmentRequest:
      type: object
      required: [experiment_key, subject_type, subject_key]
      properties:
        experiment_key: { type: string, maxLength: 120 }
        subject_type: { type: string, enum: [visitor, customer, session, account, order, product, request] }
        subject_key: { type: string, minLength: 1, maxLength: 190 }
    Phase17Exposure:
      type: object
      required: [exposure_id, experiment_key, subject_type, subject_key, surface, occurred_at]
      properties:
        exposure_id: { type: string, format: uuid }
        experiment_key: { type: string, maxLength: 120 }
        subject_type: { type: string, enum: [visitor, customer, session, account, order, product, request] }
        subject_key: { type: string, minLength: 1, maxLength: 190 }
        surface: { type: string, minLength: 1, maxLength: 64 }
        placement: { type: [string, "null"], maxLength: 96 }
        context: { type: object, additionalProperties: true }
        occurred_at: { type: string }
    Phase17Observation:
      type: object
      required: [observation_id, experiment_key, subject_type, subject_key, metric_key, metric_kind, value, occurred_at]
      properties:
        observation_id: { type: string, format: uuid }
        experiment_key: { type: string, maxLength: 120 }
        subject_type: { type: string, enum: [visitor, customer, session, account, order, product, request] }
        subject_key: { type: string, minLength: 1, maxLength: 190 }
        metric_key: { type: string, minLength: 1, maxLength: 120 }
        metric_kind: { type: string, enum: [binary, continuous, count, money] }
        value: { type: number }
        currency: { type: [string, "null"], minLength: 3, maxLength: 3 }
        context: { type: object, additionalProperties: true }
        occurred_at: { type: string }
tags:
  - name: Phase17Experimentation
    description: Deterministic storefront assignment, exposure logging, and outcome observation.
`,
);

const docsPackagePath = "docs/api/package.json";
const docsPackage = JSON.parse(read(docsPackagePath));
docsPackage.scripts["build:json:storefront-phase17"] =
    "redocly bundle reference/openapi/storefront.phase17.v1.yaml -o dist/storefront.phase17.v1.json --ext json";
docsPackage.scripts["build:json:admin-phase14"] =
    "redocly bundle reference/openapi/admin.phase14.v1.yaml -o dist/admin.phase14.v1.json --ext json";
docsPackage.scripts["build:json:admin-phase17"] =
    "redocly bundle reference/openapi/admin.phase17.v1.yaml -o dist/admin.phase17.v1.json --ext json";
docsPackage.scripts["build:json:admin-phase20"] =
    "redocly bundle reference/openapi/admin.phase20.v1.yaml -o dist/admin.phase20.v1.json --ext json";
docsPackage.scripts["build:json:storefront"] =
    "pnpm build:json:storefront-base && pnpm build:json:storefront-completion && pnpm build:json:storefront-identity && pnpm build:json:storefront-phase9 && pnpm build:json:storefront-phase17 && pnpm build:json:storefront-merge";
docsPackage.scripts["build:json:admin"] =
    "pnpm build:json:admin-base && pnpm build:json:admin-tickets && pnpm build:json:admin-ticket-omnichannel && pnpm build:json:admin-phase5 && pnpm build:json:admin-phase6 && pnpm build:json:admin-runtime-sync && pnpm build:json:admin-identity && pnpm build:json:admin-phase9 && pnpm build:json:admin-phase10 && pnpm build:json:admin-phase11 && pnpm build:json:admin-phase12 && pnpm build:json:admin-phase13 && pnpm build:json:admin-phase14 && pnpm build:json:admin-phase17 && pnpm build:json:admin-phase18 && pnpm build:json:admin-phase20 && pnpm build:json:admin-completion && pnpm build:json:admin-merge";
write(docsPackagePath, `${JSON.stringify(docsPackage, null, 4)}\n`);

const mergeAdminPath = "docs/api/scripts/merge-admin-spec.js";
let mergeAdmin = read(mergeAdminPath);
mergeAdmin = replaceRequired(
    mergeAdmin,
    'const phase13 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase13.v1.json"), "utf8"));\nconst phase18 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase18.v1.json"), "utf8"));',
    'const phase13 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase13.v1.json"), "utf8"));\nconst phase14 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase14.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase17.v1.json"), "utf8"));\nconst phase18 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase18.v1.json"), "utf8"));\nconst phase20 = JSON.parse(readFileSync(resolve(root, "dist/admin.phase20.v1.json"), "utf8"));',
    "admin overlay imports",
);
mergeAdmin = replaceRequired(
    mergeAdmin,
    '    [phase13, "Phase13PlanningOverlay"],\n    [phase18, "Phase18PricingOverlay"],',
    '    [phase13, "Phase13PlanningOverlay"],\n    [phase14, "Phase14ProcurementOverlay"],\n    [phase17, "Phase17ExperimentationOverlay"],\n    [phase18, "Phase18PricingOverlay"],\n    [phase20, "Phase20TrustRiskOverlay"],',
    "admin overlay registry",
);
write(mergeAdminPath, mergeAdmin);

const mergeStorefrontPath = "docs/api/scripts/merge-storefront-spec.js";
let mergeStorefront = read(mergeStorefrontPath);
mergeStorefront = replaceRequired(
    mergeStorefront,
    'const phase9 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase9.v1.json"), "utf8"));',
    'const phase9 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase9.v1.json"), "utf8"));\nconst phase17 = JSON.parse(readFileSync(resolve(root, "dist/storefront.phase17.v1.json"), "utf8"));',
    "storefront phase17 import",
);
mergeStorefront = replaceRequired(
    mergeStorefront,
    "for (const overlay of [completion, identity, phase9]) {",
    "for (const overlay of [completion, identity, phase9, phase17]) {",
    "storefront overlay registry",
);
write(mergeStorefrontPath, mergeStorefront);

console.log("Release baseline repair sources prepared.");
