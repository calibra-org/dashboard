import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";

import { currentTenantId, currentTrx } from "#services/tenant_context";

type JsonRecord = Record<string, unknown>;
type Language = "typescript" | "javascript" | "css" | "html" | "json";
type Runtime = "storefront" | "admin" | "server" | "worker" | "build";
type RiskLevel = "low" | "medium" | "high" | "critical";
type Environment = "preview" | "staging" | "production";
type ExecutionOutcome = "success" | "failure" | "skipped" | "blocked";

type SnippetCreateInput = {
    snippet_key: string;
    name: string;
    description?: string;
    language: Language;
    runtime: Runtime;
    placement: string;
    risk_level: RiskLevel;
    source: string;
    conditions: JsonRecord;
    capabilities: string[];
    reason: string;
};

type SnippetUpdateInput = Partial<Omit<SnippetCreateInput, "snippet_key" | "reason">> & { reason: string };
type PublishInput = { environment: Environment; rollout_percent: number; idempotency_key: string; reason: string };
type RollbackInput = PublishInput & { revision: number };
type ExecutionInput = {
    snippet_public_id: string;
    consumer_key: string;
    outcome: ExecutionOutcome;
    duration_ms?: number;
    request_id?: string;
    evidence: JsonRecord;
};
type SettingsInput = {
    production_publish_requires_step_up?: boolean;
    auto_quarantine_threshold?: number;
    default_environment?: Environment;
    max_rollout_percent?: number;
};

type ValidationFinding = { code: string; message: string };
export type SnippetValidation = {
    valid: boolean;
    publishable: boolean;
    checksum: string;
    errors: ValidationFinding[];
    warnings: ValidationFinding[];
    boundary: string;
    validated_at: string;
};

type ConditionRule = { field: string; op: string; value: unknown };
type ConditionGroup = { operator: "and" | "or"; rules: ConditionRule[] };

const CONDITION_FIELDS = new Set([
    "surface",
    "locale",
    "path",
    "environment",
    "user_role",
    "tenant_channel",
    "product_id",
    "category_id",
    "date_after",
    "date_before",
]);
const CONDITION_OPERATORS = new Set(["eq", "neq", "in", "not_in", "contains", "starts_with", "ends_with"]);

function tenantId(): number {
    return Number(currentTenantId());
}

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function objectValue(value: unknown): JsonRecord {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonRecord;
        } catch {
            return {};
        }
    }
    return {};
}

function arrayValue(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function stringArray(value: unknown): string[] {
    return arrayValue(value).map(String).filter(Boolean);
}

function checksum(source: string): string {
    return createHash("sha256").update(source, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value as JsonRecord)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

function parseConditions(value: JsonRecord): { group: ConditionGroup | null; errors: ValidationFinding[] } {
    const operator = value.operator;
    const rawRules = value.rules;
    const errors: ValidationFinding[] = [];
    if (operator !== "and" && operator !== "or") {
        errors.push({ code: "conditions.operator", message: "Condition operator must be and/or." });
    }
    if (!Array.isArray(rawRules)) {
        errors.push({ code: "conditions.rules", message: "Condition rules must be an array." });
        return { group: null, errors };
    }
    const rules: ConditionRule[] = [];
    for (const [index, rawRule] of rawRules.entries()) {
        if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
            errors.push({ code: `conditions.rule.${index}`, message: "Condition rule must be an object." });
            continue;
        }
        const rule = rawRule as JsonRecord;
        const field = String(rule.field ?? "");
        const op = String(rule.op ?? "");
        if (!CONDITION_FIELDS.has(field)) {
            errors.push({ code: `conditions.field.${index}`, message: `Unsupported condition field: ${field || "empty"}.` });
        }
        if (!CONDITION_OPERATORS.has(op)) {
            errors.push({ code: `conditions.op.${index}`, message: `Unsupported condition operator: ${op || "empty"}.` });
        }
        rules.push({ field, op, value: rule.value });
    }
    if (errors.length > 0 || (operator !== "and" && operator !== "or")) return { group: null, errors };
    return { group: { operator, rules }, errors: [] };
}

function compareRule(rule: ConditionRule, context: JsonRecord): boolean {
    const actual = context[rule.field];
    if (rule.op === "eq") return stableJson(actual) === stableJson(rule.value);
    if (rule.op === "neq") return stableJson(actual) !== stableJson(rule.value);
    if (rule.op === "in") return Array.isArray(rule.value) && rule.value.some((item) => stableJson(item) === stableJson(actual));
    if (rule.op === "not_in")
        return Array.isArray(rule.value) && !rule.value.some((item) => stableJson(item) === stableJson(actual));
    if (rule.op === "contains") {
        if (Array.isArray(actual)) return actual.some((item) => stableJson(item) === stableJson(rule.value));
        return String(actual ?? "").includes(String(rule.value ?? ""));
    }
    if (rule.op === "starts_with") return String(actual ?? "").startsWith(String(rule.value ?? ""));
    if (rule.op === "ends_with") return String(actual ?? "").endsWith(String(rule.value ?? ""));
    return false;
}

export function simulateConditions(conditions: JsonRecord, context: JsonRecord) {
    const parsed = parseConditions(conditions);
    if (!parsed.group) return { matched: false, errors: parsed.errors, checks: [] as Array<{ field: string; matched: boolean }> };
    const checks = parsed.group.rules.map((rule) => ({ field: rule.field, matched: compareRule(rule, context) }));
    const matched = parsed.group.operator === "and" ? checks.every((item) => item.matched) : checks.some((item) => item.matched);
    return { matched, errors: [] as ValidationFinding[], checks };
}

export function validateSource(input: {
    language: Language;
    runtime: Runtime;
    source: string;
    conditions: JsonRecord;
    capabilities: string[];
}): SnippetValidation {
    const source = input.source.trim();
    const errors: ValidationFinding[] = [];
    const warnings: ValidationFinding[] = [];
    const conditions = parseConditions(input.conditions);
    errors.push(...conditions.errors);

    if (source.length === 0) errors.push({ code: "source.empty", message: "Source cannot be empty." });
    if (/\beval\s*\(/.test(source) || /\bnew\s+Function\s*\(/.test(source) || /\bvm\.runIn/.test(source)) {
        errors.push({ code: "source.dynamic_eval", message: "Dynamic code evaluation is forbidden." });
    }
    if (/child_process|execSync\s*\(|spawnSync\s*\(|\bexec\s*\(|\bspawn\s*\(/.test(source)) {
        errors.push({ code: "source.process_spawn", message: "Process and shell execution is forbidden." });
    }
    if (/\b(?:writeFile|appendFile|unlink|rmSync|rmdir|chmod|chown)\s*\(/.test(source)) {
        errors.push({ code: "source.filesystem_mutation", message: "Filesystem mutation is forbidden in managed snippets." });
    }
    if ((input.runtime === "storefront" || input.runtime === "admin") && /\bprocess\.env\b/.test(source)) {
        errors.push({ code: "source.browser_secret_access", message: "Browser-targeted snippets cannot read process.env." });
    }
    if (input.language === "json") {
        try {
            JSON.parse(source);
        } catch {
            errors.push({ code: "source.invalid_json", message: "JSON source is not valid JSON." });
        }
    }
    if (
        (input.language === "typescript" || input.language === "javascript") &&
        (input.runtime === "server" || input.runtime === "worker") &&
        !input.capabilities.includes("trusted_registry")
    ) {
        errors.push({
            code: "source.registry_required",
            message: "Server/worker TypeScript or JavaScript requires the trusted_registry capability and build-gated consumer.",
        });
    }
    if (input.runtime !== "build" && (input.language === "typescript" || input.language === "javascript")) {
        warnings.push({
            code: "source.management_plane_only",
            message:
                "Publishing approves the artifact; the API never evals arbitrary source. A trusted consumer must interpret it.",
        });
    }
    if (/\bfetch\s*\(/.test(source)) {
        warnings.push({
            code: "source.network_call",
            message: "Network calls should be owned by a registered capability adapter.",
        });
    }
    if (source.length > 100_000) {
        warnings.push({
            code: "source.large",
            message: "Source is unusually large for a snippet; prefer a normal application module.",
        });
    }

    return {
        valid: errors.length === 0,
        publishable: errors.length === 0,
        checksum: checksum(input.source),
        errors,
        warnings,
        boundary: "managed_artifact_no_eval",
        validated_at: new Date().toISOString(),
    };
}

async function snippetByPublicId(publicId: string) {
    const row = await currentTrx().from("snippets").where("public_id", publicId).first();
    if (!row) throw new Exception("Snippet not found", { status: 404, code: "E_SNIPPET_NOT_FOUND" });
    return row;
}

async function latestRevision(snippetId: number) {
    return currentTrx().from("snippet_revisions").where("snippet_id", snippetId).orderBy("revision", "desc").first();
}

async function revisionByNumber(snippetId: number, revision: number) {
    const row = await currentTrx().from("snippet_revisions").where("snippet_id", snippetId).where("revision", revision).first();
    if (!row) throw new Exception("Snippet revision not found", { status: 404, code: "E_SNIPPET_REVISION_NOT_FOUND" });
    return row;
}

function serializeSnippet(row: JsonRecord) {
    return {
        ...row,
        conditions: objectValue(row.conditions),
        capabilities: stringArray(row.capabilities),
        last_validation: objectValue(row.last_validation),
    };
}

export async function getSettings() {
    const trx = currentTrx();
    let row = await trx.from("snippet_settings").first();
    if (!row) {
        const [created] = await trx
            .table("snippet_settings")
            .insert({ tenant_id: tenantId() })
            .onConflict("tenant_id")
            .ignore()
            .returning("*");
        row = created ?? (await trx.from("snippet_settings").first());
    }
    return row;
}

export async function overview() {
    const trx = currentTrx();
    const rows = await trx.from("snippets").select("status", "runtime", "risk_level");
    const executions = await trx
        .from("snippet_executions")
        .where("observed_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .select("outcome", "duration_ms", "consumer_key", "observed_at")
        .orderBy("observed_at", "desc")
        .limit(2000);
    const deployments = await trx
        .from("snippet_deployments as deployment")
        .innerJoin("snippets as snippet", "snippet.id", "deployment.snippet_id")
        .select(
            "deployment.public_id",
            "deployment.environment",
            "deployment.action",
            "deployment.status",
            "deployment.rollout_percent",
            "deployment.created_at",
            "snippet.public_id as snippet_public_id",
            "snippet.name as snippet_name",
        )
        .orderBy("deployment.created_at", "desc")
        .limit(12);
    const failures = await trx
        .from("snippet_executions as execution")
        .innerJoin("snippets as snippet", "snippet.id", "execution.snippet_id")
        .where("execution.outcome", "failure")
        .select(
            "execution.id",
            "execution.consumer_key",
            "execution.outcome",
            "execution.duration_ms",
            "execution.evidence",
            "execution.observed_at",
            "snippet.public_id as snippet_public_id",
            "snippet.name as snippet_name",
        )
        .orderBy("execution.observed_at", "desc")
        .limit(12);
    const durations = executions
        .map((row) => (row.duration_ms === null || row.duration_ms === undefined ? null : numberValue(row.duration_ms)))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);
    const p95 = durations.length === 0 ? null : durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)];
    const successful = executions.filter((row) => row.outcome === "success").length;
    return {
        counts: {
            total: rows.length,
            published: rows.filter((row) => row.status === "published").length,
            drafts: rows.filter((row) => row.status === "draft").length,
            paused: rows.filter((row) => row.status === "paused").length,
            quarantined: rows.filter((row) => row.status === "quarantined").length,
            high_risk: rows.filter((row) => row.risk_level === "high" || row.risk_level === "critical").length,
        },
        health: {
            samples_30d: executions.length,
            success_rate: executions.length === 0 ? null : Math.round((successful / executions.length) * 10000) / 100,
            p95_duration_ms: p95,
        },
        runtimes: Object.fromEntries(
            ["storefront", "admin", "server", "worker", "build"].map((runtime) => [
                runtime,
                rows.filter((row) => row.runtime === runtime).length,
            ]),
        ),
        settings: await getSettings(),
        recent_deployments: deployments,
        recent_failures: failures.map((row) => ({ ...row, evidence: objectValue(row.evidence) })),
        boundary: "managed_artifact_no_eval",
    };
}

export async function listSnippets(limit = 150, query = "") {
    const builder = currentTrx()
        .from("snippets")
        .orderBy("updated_at", "desc")
        .limit(Math.min(Math.max(limit, 1), 500));
    if (query.trim()) {
        builder.where((scope) => {
            scope.whereILike("name", `%${query.trim()}%`).orWhereILike("snippet_key", `%${query.trim()}%`);
        });
    }
    const rows = await builder;
    return rows.map((row) => serializeSnippet(row));
}

export async function getSnippet(publicId: string) {
    return serializeSnippet(await snippetByPublicId(publicId));
}

export async function listRevisions(publicId: string) {
    const snippet = await snippetByPublicId(publicId);
    const rows = await currentTrx()
        .from("snippet_revisions")
        .where("snippet_id", snippet.id)
        .orderBy("revision", "desc")
        .limit(200);
    return rows.map((row) => ({
        ...row,
        conditions: objectValue(row.conditions),
        capabilities: stringArray(row.capabilities),
        validation: objectValue(row.validation),
    }));
}

export async function listDeployments(publicId: string) {
    const snippet = await snippetByPublicId(publicId);
    return currentTrx().from("snippet_deployments").where("snippet_id", snippet.id).orderBy("created_at", "desc").limit(200);
}

export async function listExecutions(limit = 200) {
    const rows = await currentTrx()
        .from("snippet_executions as execution")
        .innerJoin("snippets as snippet", "snippet.id", "execution.snippet_id")
        .select(
            "execution.id",
            "execution.consumer_key",
            "execution.outcome",
            "execution.duration_ms",
            "execution.request_id",
            "execution.evidence",
            "execution.observed_at",
            "snippet.public_id as snippet_public_id",
            "snippet.name as snippet_name",
        )
        .orderBy("execution.observed_at", "desc")
        .limit(Math.min(Math.max(limit, 1), 1000));
    return rows.map((row) => ({ ...row, evidence: objectValue(row.evidence) }));
}

export async function createSnippet(input: SnippetCreateInput, userId: number) {
    const validation = validateSource(input);
    const trx = currentTrx();
    const [created] = await trx
        .table("snippets")
        .insert({
            tenant_id: tenantId(),
            snippet_key: input.snippet_key,
            name: input.name,
            description: input.description ?? "",
            language: input.language,
            runtime: input.runtime,
            placement: input.placement,
            status: "draft",
            risk_level: input.risk_level,
            source: input.source,
            conditions: input.conditions,
            capabilities: input.capabilities,
            version: 1,
            last_validation: validation,
            consecutive_failures: 0,
            created_by_user_id: userId,
            updated_by_user_id: userId,
        })
        .returning("*");
    if (!created) throw new Exception("Snippet could not be created", { status: 500, code: "E_SNIPPET_CREATE_FAILED" });
    await trx.table("snippet_revisions").insert({
        tenant_id: tenantId(),
        snippet_id: created.id,
        revision: 1,
        source: input.source,
        conditions: input.conditions,
        capabilities: input.capabilities,
        source_sha256: validation.checksum,
        validation,
        reason: input.reason,
        created_by_user_id: userId,
    });
    return serializeSnippet(created);
}

export async function updateSnippet(publicId: string, input: SnippetUpdateInput, userId: number) {
    const snippet = await snippetByPublicId(publicId);
    const next = {
        name: input.name ?? String(snippet.name),
        description: input.description ?? String(snippet.description ?? ""),
        language: (input.language ?? snippet.language) as Language,
        runtime: (input.runtime ?? snippet.runtime) as Runtime,
        placement: input.placement ?? String(snippet.placement),
        risk_level: (input.risk_level ?? snippet.risk_level) as RiskLevel,
        source: input.source ?? String(snippet.source ?? ""),
        conditions: input.conditions ?? objectValue(snippet.conditions),
        capabilities: input.capabilities ?? stringArray(snippet.capabilities),
    };
    const beforeFingerprint = stableJson({
        name: snippet.name,
        description: snippet.description,
        language: snippet.language,
        runtime: snippet.runtime,
        placement: snippet.placement,
        risk_level: snippet.risk_level,
        source: snippet.source,
        conditions: objectValue(snippet.conditions),
        capabilities: stringArray(snippet.capabilities),
    });
    if (beforeFingerprint === stableJson(next)) return { changed: false, data: serializeSnippet(snippet) };

    const validation = validateSource(next);
    const nextVersion = numberValue(snippet.version) + 1;
    const trx = currentTrx();
    await trx.table("snippet_revisions").insert({
        tenant_id: tenantId(),
        snippet_id: snippet.id,
        revision: nextVersion,
        source: next.source,
        conditions: next.conditions,
        capabilities: next.capabilities,
        source_sha256: validation.checksum,
        validation,
        reason: input.reason,
        created_by_user_id: userId,
    });
    const [updated] = await trx
        .from("snippets")
        .where("id", snippet.id)
        .update({
            ...next,
            version: nextVersion,
            last_validation: validation,
            updated_by_user_id: userId,
            updated_at: new Date(),
        })
        .returning("*");
    return { changed: true, data: serializeSnippet(updated ?? snippet) };
}

export async function validateSnippet(publicId: string) {
    const snippet = await snippetByPublicId(publicId);
    const validation = validateSource({
        language: snippet.language as Language,
        runtime: snippet.runtime as Runtime,
        source: String(snippet.source ?? ""),
        conditions: objectValue(snippet.conditions),
        capabilities: stringArray(snippet.capabilities),
    });
    await currentTrx().from("snippets").where("id", snippet.id).update({ last_validation: validation, updated_at: new Date() });
    return validation;
}

export async function simulateSnippet(publicId: string, context: JsonRecord) {
    const snippet = await snippetByPublicId(publicId);
    const simulation = simulateConditions(objectValue(snippet.conditions), context);
    return {
        snippet_public_id: publicId,
        matched: simulation.matched,
        checks: simulation.checks,
        errors: simulation.errors,
        source_executed: false,
        boundary: "targeting_simulation_only",
    };
}

function validationFromSnippet(snippet: JsonRecord): SnippetValidation {
    return objectValue(snippet.last_validation) as unknown as SnippetValidation;
}

async function assertPublishable(snippet: JsonRecord, environment: Environment, rolloutPercent: number) {
    const settings = await getSettings();
    if (settings.safe_mode) {
        throw new Exception("Safe Mode blocks publishing", { status: 409, code: "E_SNIPPETS_SAFE_MODE" });
    }
    if (rolloutPercent > numberValue(settings.max_rollout_percent)) {
        throw new Exception("Rollout exceeds tenant ceiling", { status: 422, code: "E_SNIPPETS_ROLLOUT_LIMIT" });
    }
    const validation = validationFromSnippet(snippet);
    const currentChecksum = checksum(String(snippet.source ?? ""));
    if (!validation.publishable || validation.checksum !== currentChecksum) {
        throw new Exception("Current source must pass validation before publish", {
            status: 422,
            code: "E_SNIPPET_VALIDATION_REQUIRED",
        });
    }
    if (environment === "production" && snippet.status === "archived") {
        throw new Exception("Archived snippets cannot be published", { status: 409, code: "E_SNIPPET_ARCHIVED" });
    }
    return settings;
}

export async function publicationRequiresStepUp(publicId: string, environment: Environment) {
    const snippet = await snippetByPublicId(publicId);
    const settings = await getSettings();
    return (
        snippet.risk_level === "high" ||
        snippet.risk_level === "critical" ||
        (environment === "production" && Boolean(settings.production_publish_requires_step_up))
    );
}

export async function publishSnippet(publicId: string, input: PublishInput, userId: number) {
    const snippet = await snippetByPublicId(publicId);
    await assertPublishable(snippet, input.environment, input.rollout_percent);
    const trx = currentTrx();
    const existing = await trx.from("snippet_deployments").where("idempotency_key", input.idempotency_key).first();
    if (existing) return existing;
    const revision = await latestRevision(numberValue(snippet.id));
    if (!revision || revision.source_sha256 !== checksum(String(snippet.source ?? ""))) {
        throw new Exception("Current revision does not match source", { status: 409, code: "E_SNIPPET_REVISION_DRIFT" });
    }
    await trx
        .from("snippet_deployments")
        .where("snippet_id", snippet.id)
        .where("environment", input.environment)
        .where("status", "active")
        .update({ status: "superseded", updated_at: new Date() });
    const [deployment] = await trx
        .table("snippet_deployments")
        .insert({
            tenant_id: tenantId(),
            snippet_id: snippet.id,
            revision_id: revision.id,
            environment: input.environment,
            action: "publish",
            status: "active",
            rollout_percent: input.rollout_percent,
            idempotency_key: input.idempotency_key,
            metadata: { reason: input.reason, source_sha256: revision.source_sha256 },
            actor_user_id: userId,
            activated_at: new Date(),
        })
        .returning("*");
    await trx.from("snippets").where("id", snippet.id).update({
        active_revision_id: revision.id,
        status: "published",
        consecutive_failures: 0,
        updated_by_user_id: userId,
        updated_at: new Date(),
    });
    return deployment;
}

async function recordLifecycleDeployment(
    snippet: JsonRecord,
    action: "pause" | "resume" | "quarantine",
    userId: number,
    reason: string,
) {
    const activeRevisionId = snippet.active_revision_id ? numberValue(snippet.active_revision_id) : null;
    const idempotency = `${action}:${snippet.id}:${Date.now()}:${userId}`;
    const [row] = await currentTrx()
        .table("snippet_deployments")
        .insert({
            tenant_id: tenantId(),
            snippet_id: snippet.id,
            revision_id: activeRevisionId,
            environment: "production",
            action,
            status: "active",
            rollout_percent: action === "pause" || action === "quarantine" ? 0 : 100,
            idempotency_key: idempotency,
            metadata: { reason },
            actor_user_id: userId,
            activated_at: new Date(),
        })
        .returning("*");
    return row;
}

export async function pauseSnippet(publicId: string, userId: number, reason: string) {
    const snippet = await snippetByPublicId(publicId);
    if (snippet.status === "paused") return { changed: false, data: serializeSnippet(snippet) };
    await currentTrx()
        .from("snippets")
        .where("id", snippet.id)
        .update({ status: "paused", updated_by_user_id: userId, updated_at: new Date() });
    await recordLifecycleDeployment(snippet, "pause", userId, reason);
    return { changed: true, data: serializeSnippet({ ...snippet, status: "paused" }) };
}

export async function resumeSnippet(publicId: string, userId: number, reason: string) {
    const snippet = await snippetByPublicId(publicId);
    const settings = await getSettings();
    if (settings.safe_mode) throw new Exception("Safe Mode blocks resume", { status: 409, code: "E_SNIPPETS_SAFE_MODE" });
    if (!snippet.active_revision_id)
        throw new Exception("Snippet has no published revision", { status: 409, code: "E_SNIPPET_NO_ACTIVE_REVISION" });
    if (snippet.status === "published") return { changed: false, data: serializeSnippet(snippet) };
    await currentTrx()
        .from("snippets")
        .where("id", snippet.id)
        .update({ status: "published", consecutive_failures: 0, updated_by_user_id: userId, updated_at: new Date() });
    await recordLifecycleDeployment(snippet, "resume", userId, reason);
    return { changed: true, data: serializeSnippet({ ...snippet, status: "published", consecutive_failures: 0 }) };
}

export async function rollbackSnippet(publicId: string, input: RollbackInput, userId: number) {
    const snippet = await snippetByPublicId(publicId);
    await assertPublishable(snippet, input.environment, input.rollout_percent);
    const trx = currentTrx();
    const existing = await trx.from("snippet_deployments").where("idempotency_key", input.idempotency_key).first();
    if (existing) return existing;
    const revision = await revisionByNumber(numberValue(snippet.id), input.revision);
    const validation = objectValue(revision.validation) as unknown as SnippetValidation;
    if (!validation.publishable || validation.checksum !== revision.source_sha256) {
        throw new Exception("Target revision is not publishable", { status: 422, code: "E_SNIPPET_REVISION_INVALID" });
    }
    await trx
        .from("snippet_deployments")
        .where("snippet_id", snippet.id)
        .where("environment", input.environment)
        .where("status", "active")
        .update({ status: "rolled_back", rolled_back_at: new Date(), updated_at: new Date() });
    const [deployment] = await trx
        .table("snippet_deployments")
        .insert({
            tenant_id: tenantId(),
            snippet_id: snippet.id,
            revision_id: revision.id,
            environment: input.environment,
            action: "rollback",
            status: "active",
            rollout_percent: input.rollout_percent,
            idempotency_key: input.idempotency_key,
            metadata: { reason: input.reason, rollback_to_revision: input.revision, source_sha256: revision.source_sha256 },
            actor_user_id: userId,
            activated_at: new Date(),
        })
        .returning("*");
    await trx.from("snippets").where("id", snippet.id).update({
        active_revision_id: revision.id,
        source: revision.source,
        conditions: revision.conditions,
        capabilities: revision.capabilities,
        last_validation: revision.validation,
        status: "published",
        consecutive_failures: 0,
        updated_by_user_id: userId,
        updated_at: new Date(),
    });
    return deployment;
}

export async function observeExecution(input: ExecutionInput, userId: number) {
    const snippet = await snippetByPublicId(input.snippet_public_id);
    const trx = currentTrx();
    const [execution] = await trx
        .table("snippet_executions")
        .insert({
            tenant_id: tenantId(),
            snippet_id: snippet.id,
            revision_id: snippet.active_revision_id ?? null,
            consumer_key: input.consumer_key,
            outcome: input.outcome,
            duration_ms: input.duration_ms ?? null,
            request_id: input.request_id ?? null,
            evidence: input.evidence,
            observed_at: new Date(),
        })
        .returning("*");
    if (input.outcome === "success") {
        if (numberValue(snippet.consecutive_failures) !== 0) {
            await trx.from("snippets").where("id", snippet.id).update({ consecutive_failures: 0, updated_at: new Date() });
        }
        return { execution, quarantined: false };
    }
    if (input.outcome !== "failure") return { execution, quarantined: false };

    const nextFailures = numberValue(snippet.consecutive_failures) + 1;
    const settings = await getSettings();
    const shouldQuarantine = snippet.status === "published" && nextFailures >= numberValue(settings.auto_quarantine_threshold);
    await trx
        .from("snippets")
        .where("id", snippet.id)
        .update({
            consecutive_failures: nextFailures,
            status: shouldQuarantine ? "quarantined" : snippet.status,
            updated_at: new Date(),
        });
    if (shouldQuarantine) {
        await recordLifecycleDeployment(snippet, "quarantine", userId, `auto-quarantine after ${nextFailures} trusted failures`);
    }
    return { execution, quarantined: shouldQuarantine };
}

export async function updateSettings(input: SettingsInput, userId: number) {
    const current = await getSettings();
    const next = {
        production_publish_requires_step_up:
            input.production_publish_requires_step_up ?? Boolean(current.production_publish_requires_step_up),
        auto_quarantine_threshold: input.auto_quarantine_threshold ?? numberValue(current.auto_quarantine_threshold),
        default_environment: input.default_environment ?? (current.default_environment as Environment),
        max_rollout_percent: input.max_rollout_percent ?? numberValue(current.max_rollout_percent),
    };
    const before = stableJson({
        production_publish_requires_step_up: Boolean(current.production_publish_requires_step_up),
        auto_quarantine_threshold: numberValue(current.auto_quarantine_threshold),
        default_environment: current.default_environment,
        max_rollout_percent: numberValue(current.max_rollout_percent),
    });
    if (before === stableJson(next)) return { changed: false, data: current };
    const [updated] = await currentTrx()
        .from("snippet_settings")
        .where("id", current.id)
        .update({ ...next, updated_by_user_id: userId, updated_at: new Date() })
        .returning("*");
    return { changed: true, data: updated ?? current };
}

export async function setSafeMode(enabled: boolean, userId: number) {
    const current = await getSettings();
    if (Boolean(current.safe_mode) === enabled) return { changed: false, data: current };
    const [updated] = await currentTrx()
        .from("snippet_settings")
        .where("id", current.id)
        .update({ safe_mode: enabled, updated_by_user_id: userId, updated_at: new Date() })
        .returning("*");
    return { changed: true, data: updated ?? current };
}

export function library() {
    return [
        {
            key: "product.schema-extension",
            title: "Product schema extension",
            language: "json",
            runtime: "build",
            placement: "product",
            risk_level: "low",
            source: JSON.stringify({ "@type": "Product", additionalProperty: [] }, null, 2),
            conditions: { operator: "and", rules: [{ field: "surface", op: "eq", value: "product" }] },
            capabilities: [],
        },
        {
            key: "storefront.tracking-adapter",
            title: "Storefront tracking adapter",
            language: "typescript",
            runtime: "build",
            placement: "storefront-footer",
            risk_level: "medium",
            source: "export function track(event: string, payload: Record<string, unknown>) {\n    return { event, payload };\n}",
            conditions: { operator: "and", rules: [{ field: "surface", op: "eq", value: "storefront" }] },
            capabilities: ["analytics_event"],
        },
        {
            key: "admin.css-density",
            title: "Admin density CSS",
            language: "css",
            runtime: "admin",
            placement: "admin",
            risk_level: "low",
            source: ".snippet-density { --snippet-row-height: 2.25rem; }",
            conditions: { operator: "and", rules: [{ field: "surface", op: "eq", value: "admin" }] },
            capabilities: [],
        },
        {
            key: "catalog.rule-config",
            title: "Catalog rule configuration",
            language: "json",
            runtime: "build",
            placement: "catalog",
            risk_level: "low",
            source: JSON.stringify({ enabled: true, mode: "advisory" }, null, 2),
            conditions: { operator: "and", rules: [{ field: "surface", op: "eq", value: "catalog" }] },
            capabilities: [],
        },
    ];
}
