import { Exception } from "@adonisjs/core/exceptions";

import { currentTrx } from "#services/tenant_context";

interface ShippingLocationInput {
    type: "continent" | "country" | "state" | "postcode";
    code: string;
}

interface ShippingZoneInput {
    name?: string;
    is_fallback?: boolean;
}

interface ShippingZoneMethodInput {
    method_id?: number;
    title_override?: string | null;
    enabled?: boolean;
    ordering?: number;
    settings?: Record<string, unknown>;
}

interface TaxRateInput {
    tax_class_id?: number;
    country?: string | null;
    region_id?: number | null;
    postcodes?: string[];
    cities?: string[];
    rate?: number;
    label?: string;
    priority?: number;
    compound?: boolean;
    applies_to_shipping?: boolean;
    ordering?: number;
}

type DbRow = Record<string, unknown>;

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown): number {
    return numberOrNull(value) ?? 0;
}

function zoneRow(row: DbRow) {
    return { ...row, id: numberValue(row.id), tenant_id: numberValue(row.tenant_id), is_fallback: Boolean(row.is_fallback) };
}

function methodDefinitionRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        tenant_id: numberValue(row.tenant_id),
        settings_schema: typeof row.settings_schema === "object" && row.settings_schema !== null ? row.settings_schema : {},
    };
}

function zoneMethodRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        tenant_id: numberValue(row.tenant_id),
        zone_id: numberValue(row.zone_id),
        method_id: numberValue(row.method_id),
        enabled: Boolean(row.enabled),
        ordering: numberValue(row.ordering),
        settings: typeof row.settings === "object" && row.settings !== null ? row.settings : {},
    };
}

function taxRateRow(row: DbRow) {
    return {
        ...row,
        id: numberValue(row.id),
        tenant_id: numberValue(row.tenant_id),
        tax_class_id: numberValue(row.tax_class_id),
        region_id: numberOrNull(row.region_id),
        rate: Number(row.rate ?? 0),
        priority: numberValue(row.priority),
        ordering: numberValue(row.ordering),
        compound: Boolean(row.compound),
        applies_to_shipping: Boolean(row.applies_to_shipping),
        postcodes: Array.isArray(row.postcodes) ? row.postcodes : [],
        cities: Array.isArray(row.cities) ? row.cities : [],
    };
}

async function zoneOrFail(id: number): Promise<DbRow> {
    const row = await currentTrx().from("shipping_zones").where("id", id).first();
    if (!row) throw new Exception("Shipping zone not found", { status: 404, code: "E_SHIPPING_ZONE_NOT_FOUND" });
    return row;
}

async function methodOrFail(id: number): Promise<DbRow> {
    const row = await currentTrx().from("shipping_methods").where("id", id).first();
    if (!row) throw new Exception("Shipping method not found", { status: 422, code: "E_SHIPPING_METHOD_NOT_FOUND" });
    return row;
}

function normalizeCountry(country: string | null | undefined): string | null {
    const value = country?.trim().toUpperCase() || null;
    if (value !== null && value.length !== 2) {
        throw new Exception("Tax country must be a two-letter ISO code or blank", {
            status: 422,
            code: "E_TAX_COUNTRY_INVALID",
        });
    }
    return value;
}

function validateMethodSettings(method: DbRow, settings: Record<string, unknown>): void {
    const schema =
        typeof method.settings_schema === "object" && method.settings_schema !== null
            ? (method.settings_schema as Record<string, { type?: string; required?: boolean }>)
            : {};
    const allowed = new Set(Object.keys(schema));
    for (const key of Object.keys(settings)) {
        if (!allowed.has(key)) {
            throw new Exception(`Unsupported shipping method setting: ${key}`, {
                status: 422,
                code: "E_SHIPPING_METHOD_SETTING_UNSUPPORTED",
            });
        }
    }
    for (const [key, rule] of Object.entries(schema)) {
        const value = settings[key];
        if (rule.required === true && (value === undefined || value === null || value === "")) {
            throw new Exception(`Missing shipping method setting: ${key}`, {
                status: 422,
                code: "E_SHIPPING_METHOD_SETTING_REQUIRED",
            });
        }
        if (
            value !== undefined &&
            value !== null &&
            rule.type === "number" &&
            (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        ) {
            throw new Exception(`Invalid shipping method setting: ${key}`, {
                status: 422,
                code: "E_SHIPPING_METHOD_SETTING_INVALID",
            });
        }
    }
}

export class StoreOperationsConfigService {
    async shippingZones() {
        const trx = currentTrx();
        const zones = await trx.from("shipping_zones").orderBy("is_fallback", "asc").orderBy("id", "asc");
        const zoneIds = zones.map((row) => Number(row.id));
        const locations =
            zoneIds.length > 0 ? await trx.from("shipping_zone_locations").whereIn("zone_id", zoneIds).orderBy("id", "asc") : [];
        const assignments =
            zoneIds.length > 0
                ? await trx
                      .from("shipping_zone_methods as zsm")
                      .join("shipping_methods as sm", "sm.id", "zsm.method_id")
                      .whereIn("zsm.zone_id", zoneIds)
                      .select(
                          "zsm.*",
                          "sm.code as method_code",
                          "sm.title_default as method_title_default",
                          "sm.description_default as method_description_default",
                          "sm.settings_schema",
                      )
                      .orderBy("zsm.ordering", "asc")
                : [];
        return {
            data: zones.map((zone) => ({
                ...zoneRow(zone),
                locations: locations
                    .filter((location) => Number(location.zone_id) === Number(zone.id))
                    .map((location) => ({
                        ...location,
                        id: numberValue(location.id),
                        zone_id: numberValue(location.zone_id),
                    })),
                methods: assignments.filter((method) => Number(method.zone_id) === Number(zone.id)).map(zoneMethodRow),
            })),
        };
    }

    async shippingMethods() {
        const rows = await currentTrx().from("shipping_methods").orderBy("title_default", "asc");
        return { data: rows.map(methodDefinitionRow) };
    }

    async createShippingZone(input: ShippingZoneInput & { name: string; locations?: ShippingLocationInput[] }) {
        const trx = currentTrx();
        if (input.is_fallback === true) await this.assertFallbackAvailable();
        const [row] = await trx
            .table("shipping_zones")
            .insert({ name: input.name, is_fallback: input.is_fallback ?? false })
            .returning("*");
        if (input.locations?.length) {
            await trx.table("shipping_zone_locations").insert(
                input.locations.map((location) => ({ zone_id: row.id, type: location.type, code: location.code.toUpperCase() })),
            );
        }
        return this.shippingZone(Number(row.id));
    }

    async shippingZone(id: number) {
        await zoneOrFail(id);
        const all = await this.shippingZones();
        const row = all.data.find((zone) => zone.id === id);
        if (!row) throw new Exception("Shipping zone not found", { status: 404, code: "E_SHIPPING_ZONE_NOT_FOUND" });
        return { data: row };
    }

    async updateShippingZone(id: number, input: ShippingZoneInput) {
        await zoneOrFail(id);
        if (input.is_fallback === true) await this.assertFallbackAvailable(id);
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (input.name !== undefined) patch.name = input.name;
        if (input.is_fallback !== undefined) patch.is_fallback = input.is_fallback;
        await currentTrx().from("shipping_zones").where("id", id).update(patch);
        return this.shippingZone(id);
    }

    async replaceShippingZoneLocations(id: number, locations: ShippingLocationInput[]) {
        await zoneOrFail(id);
        const normalized = locations.map((location) => ({ ...location, code: location.code.toUpperCase() }));
        const uniqueKeys = new Set(normalized.map((location) => `${location.type}:${location.code}`));
        if (uniqueKeys.size !== normalized.length) {
            throw new Exception("Duplicate shipping-zone location", { status: 422, code: "E_SHIPPING_ZONE_LOCATION_DUPLICATE" });
        }
        const trx = currentTrx();
        await trx.from("shipping_zone_locations").where("zone_id", id).delete();
        if (normalized.length > 0) {
            await trx.table("shipping_zone_locations").insert(
                normalized.map((location) => ({ zone_id: id, type: location.type, code: location.code })),
            );
        }
        return this.shippingZone(id);
    }

    async deleteShippingZone(id: number) {
        const zone = await zoneOrFail(id);
        if (Boolean(zone.is_fallback)) {
            throw new Exception("Fallback shipping zone cannot be deleted", { status: 409, code: "E_SHIPPING_FALLBACK_DELETE" });
        }
        await currentTrx().from("shipping_zones").where("id", id).delete();
    }

    async addShippingZoneMethod(zoneId: number, input: ShippingZoneMethodInput & { method_id: number }) {
        await zoneOrFail(zoneId);
        const method = await methodOrFail(input.method_id);
        const trx = currentTrx();
        const duplicate = await trx
            .from("shipping_zone_methods")
            .where("zone_id", zoneId)
            .where("method_id", input.method_id)
            .first();
        if (duplicate) {
            throw new Exception("Shipping method is already configured for this zone", {
                status: 409,
                code: "E_SHIPPING_ZONE_METHOD_DUPLICATE",
            });
        }
        const settings = input.settings ?? {};
        validateMethodSettings(method, settings);
        const [row] = await trx
            .table("shipping_zone_methods")
            .insert({
                zone_id: zoneId,
                method_id: input.method_id,
                title_override: input.title_override ?? null,
                enabled: input.enabled ?? true,
                ordering: input.ordering ?? 0,
                settings: JSON.stringify(settings),
            })
            .returning("*");
        return { data: zoneMethodRow(row) };
    }

    async updateShippingZoneMethod(zoneId: number, id: number, input: ShippingZoneMethodInput) {
        await zoneOrFail(zoneId);
        const trx = currentTrx();
        const existing = await trx.from("shipping_zone_methods").where("id", id).where("zone_id", zoneId).first();
        if (!existing) {
            throw new Exception("Shipping zone method not found", { status: 404, code: "E_SHIPPING_ZONE_METHOD_NOT_FOUND" });
        }
        const method = await methodOrFail(Number(existing.method_id));
        const nextSettings =
            input.settings ?? (typeof existing.settings === "object" && existing.settings !== null ? existing.settings : {});
        validateMethodSettings(method, nextSettings as Record<string, unknown>);
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (input.title_override !== undefined) patch.title_override = input.title_override;
        if (input.enabled !== undefined) patch.enabled = input.enabled;
        if (input.ordering !== undefined) patch.ordering = input.ordering;
        if (input.settings !== undefined) patch.settings = JSON.stringify(input.settings);
        const [row] = await trx
            .from("shipping_zone_methods")
            .where("id", id)
            .where("zone_id", zoneId)
            .update(patch)
            .returning("*");
        return { data: zoneMethodRow(row) };
    }

    async deleteShippingZoneMethod(zoneId: number, id: number) {
        const count = await currentTrx().from("shipping_zone_methods").where("id", id).where("zone_id", zoneId).delete();
        if (!count) {
            throw new Exception("Shipping zone method not found", { status: 404, code: "E_SHIPPING_ZONE_METHOD_NOT_FOUND" });
        }
    }

    async taxRates() {
        const rows = await currentTrx()
            .from("tax_rates as tr")
            .join("tax_classes as tc", "tc.id", "tr.tax_class_id")
            .select("tr.*", "tc.slug as tax_class_slug", "tc.name as tax_class_name")
            .orderBy("tr.ordering", "asc")
            .orderBy("tr.priority", "asc")
            .orderBy("tr.id", "asc");
        return { data: rows.map(taxRateRow) };
    }

    async createTaxRate(input: Required<Pick<TaxRateInput, "tax_class_id" | "rate" | "label">> & TaxRateInput) {
        await this.assertTaxClass(input.tax_class_id);
        const [row] = await currentTrx().table("tax_rates").insert(this.taxRateInsert(input)).returning("*");
        return { data: taxRateRow(row) };
    }

    async updateTaxRate(id: number, input: TaxRateInput) {
        const trx = currentTrx();
        const existing = await trx.from("tax_rates").where("id", id).first();
        if (!existing) throw new Exception("Tax rate not found", { status: 404, code: "E_TAX_RATE_NOT_FOUND" });
        if (input.tax_class_id !== undefined) await this.assertTaxClass(input.tax_class_id);
        const patch = this.taxRatePatch(input);
        const [row] = await trx.from("tax_rates").where("id", id).update({ ...patch, updated_at: new Date() }).returning("*");
        return { data: taxRateRow(row) };
    }

    async deleteTaxRate(id: number) {
        const count = await currentTrx().from("tax_rates").where("id", id).delete();
        if (!count) throw new Exception("Tax rate not found", { status: 404, code: "E_TAX_RATE_NOT_FOUND" });
    }

    private async assertFallbackAvailable(exceptId?: number) {
        let query = currentTrx().from("shipping_zones").where("is_fallback", true);
        if (exceptId !== undefined) query = query.whereNot("id", exceptId);
        if (await query.first()) {
            throw new Exception("Only one fallback shipping zone is allowed", {
                status: 409,
                code: "E_SHIPPING_FALLBACK_EXISTS",
            });
        }
    }

    private async assertTaxClass(id: number) {
        const row = await currentTrx().from("tax_classes").where("id", id).first();
        if (!row) throw new Exception("Tax class not found", { status: 422, code: "E_TAX_CLASS_NOT_FOUND" });
    }

    private taxRateInsert(input: Required<Pick<TaxRateInput, "tax_class_id" | "rate" | "label">> & TaxRateInput) {
        return {
            tax_class_id: input.tax_class_id,
            country: normalizeCountry(input.country),
            region_id: input.region_id ?? null,
            postcodes: input.postcodes ?? [],
            cities: input.cities ?? [],
            rate: input.rate,
            label: input.label,
            priority: input.priority ?? 1,
            compound: input.compound ?? false,
            applies_to_shipping: input.applies_to_shipping ?? true,
            ordering: input.ordering ?? 0,
        };
    }

    private taxRatePatch(input: TaxRateInput) {
        const patch: Record<string, unknown> = {};
        if (input.tax_class_id !== undefined) patch.tax_class_id = input.tax_class_id;
        if (input.country !== undefined) patch.country = normalizeCountry(input.country);
        if (input.region_id !== undefined) patch.region_id = input.region_id;
        if (input.postcodes !== undefined) patch.postcodes = input.postcodes;
        if (input.cities !== undefined) patch.cities = input.cities;
        if (input.rate !== undefined) patch.rate = input.rate;
        if (input.label !== undefined) patch.label = input.label;
        if (input.priority !== undefined) patch.priority = input.priority;
        if (input.compound !== undefined) patch.compound = input.compound;
        if (input.applies_to_shipping !== undefined) patch.applies_to_shipping = input.applies_to_shipping;
        if (input.ordering !== undefined) patch.ordering = input.ordering;
        return patch;
    }
}

export const storeOperationsConfigService = new StoreOperationsConfigService();
