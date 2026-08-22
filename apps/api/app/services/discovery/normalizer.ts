import { normalizeIranText } from "#services/iran_text_normalize";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string): string {
    return value
        .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

/**
 * Search-specific canonicalization layered on top of Calibra's shared Iranian text normalizer.
 * The shared primitive remains the source of truth for Arabic/Persian character folding; this
 * function only adds commerce-search concerns such as digits, measurement units and punctuation.
 */
export function normalizeDiscoveryQuery(input: string | null | undefined): string {
    let value = normalizeDigits(normalizeIranText(input));
    value = value.replace(/٬/g, "").replace(/٫/g, ".").replace(/[″”]/g, '"');
    value = value
        .replace(/\s*(?:میلی\s*متر|millimeters?|mm)(?=\s|$)/gi, " mm")
        .replace(/\s*(?:سانتی\s*متر|centimeters?|cm)(?=\s|$)/gi, " cm")
        .replace(/\s*(?:اینچ(?:ی)?|inches?|inch|in)(?=\s|$)/gi, " in")
        .replace(/(^|[^A-Za-z])\s*(?:متر|meters?|meter|m)(?=\s|$)/gi, "$1 m");
    return value.replace(/\s+/g, " ").trim();
}

/** Redact common high-risk identifiers before any query text is persisted for analytics. */
export function redactDiscoveryQuery(input: string): string {
    return input
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .replace(/\bIR(?:[\s-]*\d){24}\b/gi, "[iban]")
        .replace(/(?:\+?98|0098|0)?[\s-]*9(?:[\s-]*\d){9}/g, "[phone]")
        .replace(/\b\d{10,16}\b/g, "[number]");
}
