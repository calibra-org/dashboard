import { createHash } from "node:crypto";
import { Exception } from "@adonisjs/core/exceptions";
import { DateTime } from "luxon";

import { currentTenantId, currentTrx, maybeTenantContext } from "#services/tenant_context";

export const PRODUCT_PASSPORT_ENGINE_VERSION = "product-passport-v1.0.0";

type AdminActor = { id: string | number | bigint };
type PassportRow = Record<string, unknown> & {
    id: number;
    public_id: string;
    product_id: number;
    variation_id: number | null;
    identity_level: "product" | "model" | "batch" | "item";
    batch_code: string | null;
    serial_number: string | null;
    resolver_key: string;
    status: "draft" | "published" | "revoked";
    current_version: number;
    identifiers: Record<string, unknown> | string;
    public_fields: Record<string, unknown> | string;
    private_fields: Record<string, unknown> | string;
    resolver_config: Record<string, unknown> | string;
};

const tenantId = () => Number(currentTenantId());
const json = <T>(value: T | string | null | undefined, fallback: T): T => {
    if (value == null) return fallback;
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
};

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, stable(item)]),
    );
}

function digest(value: unknown) {
    return createHash("sha256")
        .update(JSON.stringify(stable(value)))
        .digest("hex");
}

function notFound(message: string, code: string): never {
    throw new Exception(message, { status: 404, code });
}

const FORBIDDEN_PUBLIC_KEY = /(password|secret|token|credential|private|internal_note|cost_price|supplier_terms|personal_data)/i;

export function assertPublicPayloadSafe(value: unknown, path = "public") {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertPublicPayloadSafe(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (FORBIDDEN_PUBLIC_KEY.test(key)) {
            throw new Exception(`Public payload contains a restricted field at ${path}.${key}`, {
                status: 422,
                code: "E_PRODUCT_PASSPORT_PUBLIC_FIELD_RESTRICTED",
            });
        }
        assertPublicPayloadSafe(item, `${path}.${key}`);
    }
}

function parseOptionalDate(value: string | undefined, field: string) {
    if (!value) return null;
    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) {
        throw new Exception(`${field} must be a valid ISO date`, { status: 422, code: "E_PRODUCT_PASSPORT_DATE_INVALID" });
    }
    return parsed.toUTC().toSQL();
}

async function requirePassport(publicId: string) {
    const row = await currentTrx().from("product_passports").where({ tenant_id: tenantId(), public_id: publicId }).first();
    if (!row) notFound("Product passport not found", "E_PRODUCT_PASSPORT_NOT_FOUND");
    return row as PassportRow;
}

async function requireProduct(productId: number, variationId?: number) {
    const trx = currentTrx();
    const product = await trx.from("products").where({ id: productId }).whereNull("deleted_at").first();
    if (!product) notFound("Product not found", "E_PRODUCT_PASSPORT_PRODUCT_NOT_FOUND");
    if (variationId == null) return { product, variation: null };
    const variation = await trx
        .from("product_variations")
        .where({ id: variationId, product_id: productId })
        .whereNull("deleted_at")
        .first();
    if (!variation) {
        throw new Exception("Variation does not belong to product", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_VARIATION_MISMATCH",
        });
    }
    return { product, variation };
}

function assertIdentityInput(input: {
    identity_level: "product" | "model" | "batch" | "item";
    variation_id?: number;
    batch_code?: string;
    serial_number?: string;
}) {
    if (input.identity_level === "model" && input.variation_id == null) {
        throw new Exception("Model passports require variation_id", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_MODEL_VARIATION_REQUIRED",
        });
    }
    if (input.identity_level === "batch" && !input.batch_code) {
        throw new Exception("Batch passports require batch_code", { status: 422, code: "E_PRODUCT_PASSPORT_BATCH_REQUIRED" });
    }
    if (input.identity_level === "item" && !input.serial_number) {
        throw new Exception("Item passports require serial_number", { status: 422, code: "E_PRODUCT_PASSPORT_SERIAL_REQUIRED" });
    }
}

async function findSupplyReceiptLine(input: {
    productId: number;
    variationId?: number;
    batchCode?: string;
    serialNumber?: string;
}) {
    if (!input.batchCode && !input.serialNumber) return null;
    let query = currentTrx()
        .from("purchase_order_receipt_lines as receipt_line")
        .innerJoin("purchase_order_lines as po_line", "po_line.id", "receipt_line.purchase_order_line_id")
        .where("po_line.tenant_id", tenantId())
        .where("po_line.product_id", input.productId);
    if (input.variationId != null) query = query.where("po_line.variation_id", input.variationId);
    if (input.batchCode) {
        query = query.where((builder) => {
            builder.where("receipt_line.batch_code", input.batchCode).orWhere("receipt_line.lot_code", input.batchCode);
        });
    }
    if (input.serialNumber) {
        query = query.whereRaw("receipt_line.serials @> ?::jsonb", [JSON.stringify([input.serialNumber])]);
    }
    return query
        .select(
            "receipt_line.id",
            "receipt_line.receipt_id",
            "receipt_line.batch_code",
            "receipt_line.lot_code",
            "receipt_line.serials",
        )
        .first();
}

export async function overview() {
    const trx = currentTrx();
    const tenant = tenantId();
    const [all, published, revoked, evidence, verifiedEvidence, mappings] = await Promise.all([
        trx.from("product_passports").where("tenant_id", tenant).count("* as c").first(),
        trx.from("product_passports").where({ tenant_id: tenant, status: "published" }).count("* as c").first(),
        trx.from("product_passports").where({ tenant_id: tenant, status: "revoked" }).count("* as c").first(),
        trx.from("product_passport_evidence").where("tenant_id", tenant).count("* as c").first(),
        trx
            .from("product_passport_evidence")
            .where({ tenant_id: tenant, verification_status: "verified" })
            .count("* as c")
            .first(),
        trx
            .from("product_passport_regulatory_mappings")
            .where({ tenant_id: tenant, status: "active" })
            .count("* as c")
            .first(),
    ]);
    return {
        engine_version: PRODUCT_PASSPORT_ENGINE_VERSION,
        kpis: {
            passports: Number(all?.c ?? 0),
            published: Number(published?.c ?? 0),
            revoked: Number(revoked?.c ?? 0),
            evidence: Number(evidence?.c ?? 0),
            verified_evidence: Number(verifiedEvidence?.c ?? 0),
            active_regulatory_mappings: Number(mappings?.c ?? 0),
        },
        standards_posture: "standards_ready_not_conformance_certified",
    };
}

export async function listPassports() {
    return currentTrx().from("product_passports").where("tenant_id", tenantId()).orderBy("updated_at", "desc").limit(200);
}

export async function passportDetail(publicId: string) {
    const passport = await requirePassport(publicId);
    const trx = currentTrx();
    const [product, variation, versions, evidence, edges, qualityCases] = await Promise.all([
        trx.from("products").where("id", passport.product_id).first(),
        passport.variation_id == null ? Promise.resolve(null) : trx.from("product_variations").where("id", passport.variation_id).first(),
        trx
            .from("product_passport_versions")
            .where({ tenant_id: tenantId(), passport_id: passport.id })
            .orderBy("version", "desc")
            .limit(50),
        trx
            .from("product_passport_evidence")
            .where({ tenant_id: tenantId(), passport_id: passport.id })
            .orderBy("created_at", "desc")
            .limit(200),
        trx
            .from("product_passport_edges")
            .where({ tenant_id: tenantId(), passport_id: passport.id })
            .orderBy("created_at", "desc")
            .limit(200),
        trx
            .from("quality_cases")
            .where({ tenant_id: tenantId(), product_id: passport.product_id })
            .modify((query) => {
                if (passport.variation_id != null) query.where("variation_id", passport.variation_id);
            })
            .orderBy("updated_at", "desc")
            .limit(50),
    ]);
    return { passport, product, variation, versions, evidence, edges, quality_cases: qualityCases };
}

export async function createPassport(
    input: {
        product_id: number;
        variation_id?: number;
        identity_level: "product" | "model" | "batch" | "item";
        batch_code?: string;
        serial_number?: string;
        resolver_key: string;
        identifiers: Record<string, unknown>;
        public_fields: Record<string, unknown>;
        private_fields: Record<string, unknown>;
        resolver_config: Record<string, unknown>;
    },
    actor: AdminActor,
) {
    assertIdentityInput(input);
    assertPublicPayloadSafe(input.public_fields);
    await requireProduct(input.product_id, input.variation_id);
    const trx = currentTrx();
    const tenant = tenantId();
    const duplicate = await trx
        .from("product_passports")
        .where({
            tenant_id: tenant,
            product_id: input.product_id,
            identity_level: input.identity_level,
        })
        .whereRaw("COALESCE(variation_id, 0) = ?", [input.variation_id ?? 0])
        .whereRaw("COALESCE(batch_code, '') = ?", [input.batch_code ?? ""])
        .whereRaw("COALESCE(serial_number, '') = ?", [input.serial_number ?? ""])
        .first();
    if (duplicate) {
        throw new Exception("A passport already exists for this product identity", {
            status: 409,
            code: "E_PRODUCT_PASSPORT_IDENTITY_EXISTS",
        });
    }
    const [passport] = await trx
        .table("product_passports")
        .insert({
            tenant_id: tenant,
            product_id: input.product_id,
            variation_id: input.variation_id ?? null,
            identity_level: input.identity_level,
            batch_code: input.batch_code ?? null,
            serial_number: input.serial_number ?? null,
            resolver_key: input.resolver_key,
            identifiers: input.identifiers,
            public_fields: input.public_fields,
            private_fields: input.private_fields,
            resolver_config: input.resolver_config,
            created_by_user_id: Number(actor.id),
            updated_by_user_id: Number(actor.id),
        })
        .returning("*");

    const receiptLine = await findSupplyReceiptLine({
        productId: input.product_id,
        variationId: input.variation_id,
        batchCode: input.batch_code,
        serialNumber: input.serial_number,
    });
    if (receiptLine) {
        await trx.table("product_passport_edges").insert({
            tenant_id: tenant,
            passport_id: passport.id,
            from_node_type: "passport",
            from_node_ref: passport.public_id,
            relation_type: "received_from",
            to_node_type: "purchase_receipt_line",
            to_node_ref: String(receiptLine.id),
            visibility: "private",
            metadata: { receipt_id: receiptLine.receipt_id },
            created_by_user_id: Number(actor.id),
        });
    }
    return passportDetail(String(passport.public_id));
}

export async function updatePassport(
    publicId: string,
    input: {
        identifiers?: Record<string, unknown>;
        public_fields?: Record<string, unknown>;
        private_fields?: Record<string, unknown>;
        resolver_config?: Record<string, unknown>;
    },
    actor: AdminActor,
) {
    const passport = await requirePassport(publicId);
    if (passport.status === "revoked") {
        throw new Exception("Revoked passports are immutable", { status: 422, code: "E_PRODUCT_PASSPORT_REVOKED_IMMUTABLE" });
    }
    if (input.public_fields) assertPublicPayloadSafe(input.public_fields);
    const patch: Record<string, unknown> = { updated_by_user_id: Number(actor.id), updated_at: new Date() };
    if (input.identifiers !== undefined) patch.identifiers = input.identifiers;
    if (input.public_fields !== undefined) patch.public_fields = input.public_fields;
    if (input.private_fields !== undefined) patch.private_fields = input.private_fields;
    if (input.resolver_config !== undefined) patch.resolver_config = input.resolver_config;
    await currentTrx().from("product_passports").where({ tenant_id: tenantId(), id: passport.id }).update(patch);
    return passportDetail(publicId);
}

function publicSnapshot(passport: PassportRow) {
    return {
        identity_level: passport.identity_level,
        batch_code: passport.batch_code,
        serial_number: passport.serial_number,
        fields: json<Record<string, unknown>>(passport.public_fields, {}),
    };
}

export async function publishPassport(publicId: string, actor: AdminActor) {
    const passport = await requirePassport(publicId);
    if (passport.status === "revoked") {
        throw new Exception("Revoked passports cannot be republished", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_REVOKED_IMMUTABLE",
        });
    }
    const snapshot = publicSnapshot(passport);
    assertPublicPayloadSafe(snapshot);
    const hash = digest(snapshot);
    const trx = currentTrx();
    const latest = await trx
        .from("product_passport_versions")
        .where({ tenant_id: tenantId(), passport_id: passport.id })
        .orderBy("version", "desc")
        .first();
    if (latest && latest.content_hash === hash && passport.status === "published") {
        return { changed: false, passport: await passportDetail(publicId) };
    }
    const nextVersion = Number(latest?.version ?? 0) + 1;
    const [version] = await trx
        .table("product_passport_versions")
        .insert({
            tenant_id: tenantId(),
            passport_id: passport.id,
            version: nextVersion,
            schema_version: "calibra-dpp-v1",
            public_snapshot: snapshot,
            content_hash: hash,
            published_by_user_id: Number(actor.id),
        })
        .returning("*");
    await trx
        .from("product_passports")
        .where({ tenant_id: tenantId(), id: passport.id })
        .update({
            status: "published",
            current_version: nextVersion,
            published_at: new Date(),
            revoked_at: null,
            updated_by_user_id: Number(actor.id),
            updated_at: new Date(),
        });
    return { changed: true, version, passport: await passportDetail(publicId) };
}

export async function revokePassport(publicId: string, actor: AdminActor) {
    const passport = await requirePassport(publicId);
    if (passport.status === "revoked") return { changed: false, passport: await passportDetail(publicId) };
    await currentTrx()
        .from("product_passports")
        .where({ tenant_id: tenantId(), id: passport.id })
        .update({
            status: "revoked",
            revoked_at: new Date(),
            updated_by_user_id: Number(actor.id),
            updated_at: new Date(),
        });
    return { changed: true, passport: await passportDetail(publicId) };
}

export async function addEvidence(
    publicId: string,
    input: {
        evidence_type: string;
        visibility: "public" | "private";
        source_kind: string;
        source_ref?: string;
        issuer?: string;
        summary?: string;
        payload: Record<string, unknown>;
        occurred_at?: string;
    },
    actor: AdminActor,
) {
    const passport = await requirePassport(publicId);
    if (passport.status === "revoked") {
        throw new Exception("Revoked passports cannot accept new evidence", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_REVOKED_IMMUTABLE",
        });
    }
    if (input.visibility === "public") assertPublicPayloadSafe(input.payload);
    const occurredAt = parseOptionalDate(input.occurred_at, "occurred_at");
    const hash = digest({
        evidence_type: input.evidence_type,
        visibility: input.visibility,
        source_kind: input.source_kind,
        source_ref: input.source_ref ?? null,
        issuer: input.issuer ?? null,
        summary: input.summary ?? null,
        payload: input.payload,
        occurred_at: occurredAt,
    });
    const [evidence] = await currentTrx()
        .table("product_passport_evidence")
        .insert({
            tenant_id: tenantId(),
            passport_id: passport.id,
            evidence_type: input.evidence_type,
            visibility: input.visibility,
            source_kind: input.source_kind,
            source_ref: input.source_ref ?? null,
            issuer: input.issuer ?? null,
            summary: input.summary ?? null,
            payload: input.payload,
            content_hash: hash,
            occurred_at: occurredAt,
            created_by_user_id: Number(actor.id),
        })
        .onConflict(["tenant_id", "passport_id", "content_hash"])
        .ignore()
        .returning("*");
    if (evidence) return { changed: true, evidence };
    const existing = await currentTrx()
        .from("product_passport_evidence")
        .where({ tenant_id: tenantId(), passport_id: passport.id, content_hash: hash })
        .first();
    return { changed: false, evidence: existing };
}

export async function setEvidenceStatus(
    passportPublicId: string,
    evidencePublicId: string,
    verificationStatus: "verified" | "rejected" | "expired",
) {
    const passport = await requirePassport(passportPublicId);
    const trx = currentTrx();
    const evidence = await trx
        .from("product_passport_evidence")
        .where({ tenant_id: tenantId(), passport_id: passport.id, public_id: evidencePublicId })
        .first();
    if (!evidence) notFound("Product passport evidence not found", "E_PRODUCT_PASSPORT_EVIDENCE_NOT_FOUND");
    await trx
        .from("product_passport_evidence")
        .where({ tenant_id: tenantId(), id: evidence.id })
        .update({ verification_status: verificationStatus, verified_at: verificationStatus === "verified" ? new Date() : null });
    return trx.from("product_passport_evidence").where({ tenant_id: tenantId(), id: evidence.id }).first();
}

export async function addEdge(
    publicId: string,
    input: {
        from_node_type: string;
        from_node_ref: string;
        relation_type: string;
        to_node_type: string;
        to_node_ref: string;
        visibility: "public" | "private";
        metadata: Record<string, unknown>;
    },
    actor: AdminActor,
) {
    const passport = await requirePassport(publicId);
    if (input.visibility === "public") assertPublicPayloadSafe(input.metadata);
    const [edge] = await currentTrx()
        .table("product_passport_edges")
        .insert({
            tenant_id: tenantId(),
            passport_id: passport.id,
            from_node_type: input.from_node_type,
            from_node_ref: input.from_node_ref,
            relation_type: input.relation_type,
            to_node_type: input.to_node_type,
            to_node_ref: input.to_node_ref,
            visibility: input.visibility,
            metadata: input.metadata,
            created_by_user_id: Number(actor.id),
        })
        .onConflict([
            "tenant_id",
            "passport_id",
            "from_node_type",
            "from_node_ref",
            "relation_type",
            "to_node_type",
            "to_node_ref",
        ])
        .ignore()
        .returning("*");
    return { changed: Boolean(edge), edge: edge ?? null };
}

export async function listRegulatoryMappings() {
    return currentTrx()
        .from("product_passport_regulatory_mappings")
        .where("tenant_id", tenantId())
        .orderBy("updated_at", "desc")
        .limit(200);
}

export async function createRegulatoryMapping(
    input: {
        jurisdiction: string;
        framework: string;
        framework_version: string;
        mapping_version: number;
        field_mapping: Record<string, unknown>;
        conformance_note: string;
        effective_from?: string;
        effective_to?: string;
    },
    actor: AdminActor,
) {
    const effectiveFrom = parseOptionalDate(input.effective_from, "effective_from");
    const effectiveTo = parseOptionalDate(input.effective_to, "effective_to");
    if (effectiveFrom && effectiveTo && DateTime.fromSQL(effectiveTo) <= DateTime.fromSQL(effectiveFrom)) {
        throw new Exception("effective_to must be after effective_from", {
            status: 422,
            code: "E_PRODUCT_PASSPORT_REGULATORY_WINDOW_INVALID",
        });
    }
    const [mapping] = await currentTrx()
        .table("product_passport_regulatory_mappings")
        .insert({
            tenant_id: tenantId(),
            jurisdiction: input.jurisdiction,
            framework: input.framework,
            framework_version: input.framework_version,
            mapping_version: input.mapping_version,
            status: "draft",
            field_mapping: input.field_mapping,
            conformance_note: input.conformance_note,
            effective_from: effectiveFrom,
            effective_to: effectiveTo,
            created_by_user_id: Number(actor.id),
        })
        .returning("*");
    return mapping;
}

export async function setRegulatoryMappingStatus(publicId: string, status: "active" | "retired") {
    const trx = currentTrx();
    const mapping = await trx
        .from("product_passport_regulatory_mappings")
        .where({ tenant_id: tenantId(), public_id: publicId })
        .first();
    if (!mapping) notFound("Regulatory mapping not found", "E_PRODUCT_PASSPORT_REGULATORY_NOT_FOUND");
    if (status === "active") {
        await trx
            .from("product_passport_regulatory_mappings")
            .where({ tenant_id: tenantId(), jurisdiction: mapping.jurisdiction, framework: mapping.framework, status: "active" })
            .whereNot("id", mapping.id)
            .update({ status: "retired", updated_at: new Date() });
    }
    await trx
        .from("product_passport_regulatory_mappings")
        .where({ tenant_id: tenantId(), id: mapping.id })
        .update({ status, updated_at: new Date() });
    return trx.from("product_passport_regulatory_mappings").where({ tenant_id: tenantId(), id: mapping.id }).first();
}

export async function resolvePublicPassport(resolverKey: string) {
    if (!maybeTenantContext()) notFound("Product passport not found", "E_PRODUCT_PASSPORT_PUBLIC_NOT_FOUND");
    const trx = currentTrx();
    const passport = (await trx
        .from("product_passports")
        .where({ tenant_id: tenantId(), resolver_key: resolverKey })
        .whereIn("status", ["published", "revoked"])
        .first()) as PassportRow | undefined;
    if (!passport) notFound("Product passport not found", "E_PRODUCT_PASSPORT_PUBLIC_NOT_FOUND");
    const version = await trx
        .from("product_passport_versions")
        .where({ tenant_id: tenantId(), passport_id: passport.id, version: passport.current_version })
        .first();
    if (!version) notFound("Published passport version not found", "E_PRODUCT_PASSPORT_PUBLIC_VERSION_NOT_FOUND");
    const [evidence, edges] = await Promise.all([
        trx
            .from("product_passport_evidence")
            .where({
                tenant_id: tenantId(),
                passport_id: passport.id,
                visibility: "public",
                verification_status: "verified",
            })
            .select("public_id", "evidence_type", "issuer", "summary", "payload", "occurred_at", "verified_at")
            .orderBy("occurred_at", "desc"),
        trx
            .from("product_passport_edges")
            .where({ tenant_id: tenantId(), passport_id: passport.id, visibility: "public" })
            .select("public_id", "from_node_type", "from_node_ref", "relation_type", "to_node_type", "to_node_ref", "metadata")
            .orderBy("created_at", "asc"),
    ]);
    const authenticityVerified = evidence.some((item) => item.evidence_type === "authenticity");
    return {
        resolver_key: passport.resolver_key,
        status: passport.status,
        version: Number(version.version),
        schema_version: version.schema_version,
        published_at: version.published_at,
        authenticity: passport.status === "revoked" ? "revoked" : authenticityVerified ? "verified" : "not_verified",
        public_snapshot: json<Record<string, unknown>>(version.public_snapshot, {}),
        evidence,
        graph: edges,
        resolver: { path: `/api/v1/product-passports/${passport.resolver_key}` },
        standards_posture: "standards_ready_not_conformance_certified",
    };
}
