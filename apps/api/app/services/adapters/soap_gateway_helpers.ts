import { timeoutFetch } from "#services/adapters/base_redirect_gateway";

/** Minimal XML escaping for PSP SOAP bodies; never interpolate merchant input without this. */
export function xmlEscape(value: unknown): string {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

export function soapEnvelope(namespace: string, method: string, body: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${method} xmlns="${xmlEscape(namespace)}">${body}</${method}></soap:Body></soap:Envelope>`;
}

/** Extracts a tag ignoring an optional namespace prefix. PSP SOAP responses are small and flat. */
export function xmlTag(xml: string, name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = xml.match(new RegExp(`<(?:(?:[A-Za-z0-9_-]+):)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_-]+):)?${escaped}>`, "i"));
    if (!match) return null;
    return match[1]
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&amp;", "&")
        .trim();
}

export async function postSoap(args: {
    url: string;
    namespace: string;
    method: string;
    body: string;
    soapAction?: string;
    timeoutMs?: number;
}): Promise<string> {
    const response = await timeoutFetch(args.url, {
        method: "POST",
        timeoutMs: args.timeoutMs ?? 10_000,
        headers: {
            "content-type": "text/xml; charset=utf-8",
            accept: "text/xml, application/xml",
            ...(args.soapAction ? { SOAPAction: `"${args.soapAction}"` } : {}),
        },
        body: soapEnvelope(args.namespace, args.method, args.body),
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`PSP SOAP HTTP ${response.status}`);
    if (typeof response.body !== "string") throw new Error("PSP SOAP returned a non-XML response");
    return response.body;
}
