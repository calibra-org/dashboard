import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
    if (!signatureHeader?.startsWith("sha256=")) return false;
    const received = signatureHeader.slice("sha256=".length);
    if (!/^[a-f0-9]{64}$/i.test(received)) return false;
    const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
    const left = Buffer.from(received, "hex");
    const right = Buffer.from(expected, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
}
