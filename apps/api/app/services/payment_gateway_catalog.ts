export type GatewayImplementationStatus = "stub" | "implemented" | "live";
export type GatewayCategory = "bank" | "psp" | "bnpl" | "offline";

export interface GatewayCredentialField {
    key: string;
    required: boolean;
}

export interface PaymentGatewayDefinition {
    code: string;
    category: GatewayCategory;
    implementationStatus: GatewayImplementationStatus;
    credentialFields: readonly GatewayCredentialField[];
    defaultSettings: Readonly<Record<string, unknown>>;
    supports: Readonly<Record<string, boolean>>;
    ordering: number;
    defaultEnabled: boolean;
    adminVisible: boolean;
}

/**
 * Operator-facing catalog for the payment surface approved for Calibra.
 *
 * `implemented` means concrete request/callback/verify code exists, but the installation still
 * needs its own merchant credentials and a successful provider round-trip before the UI reports a
 * healthy connection. `stub` is deliberately non-enableable until an official merchant contract
 * and provider documentation are available. `live` is reserved for methods that need no remote PSP
 * protocol (COD/card-to-card) or have completed provider verification.
 */
export const PAYMENT_GATEWAY_CATALOG: readonly PaymentGatewayDefinition[] = [
    {
        code: "mellat",
        category: "bank",
        implementationStatus: "implemented",
        credentialFields: [
            { key: "terminal_id", required: true },
            { key: "username", required: true },
            { key: "password", required: true },
        ],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 10,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "sadad",
        category: "bank",
        implementationStatus: "stub",
        credentialFields: [
            { key: "merchant_id", required: true },
            { key: "terminal_id", required: true },
            { key: "terminal_key", required: true },
        ],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 20,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "parsian",
        category: "bank",
        implementationStatus: "implemented",
        credentialFields: [{ key: "login_account", required: true }],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 30,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "zarinpal",
        category: "psp",
        implementationStatus: "implemented",
        credentialFields: [{ key: "merchant_id", required: true }],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 40,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "bitpay",
        category: "psp",
        implementationStatus: "stub",
        credentialFields: [{ key: "api_key", required: true }],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 50,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "digipay",
        category: "bnpl",
        implementationStatus: "stub",
        credentialFields: [],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 60,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "snapppay",
        category: "bnpl",
        implementationStatus: "stub",
        credentialFields: [],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 70,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "azkivam",
        category: "bnpl",
        implementationStatus: "stub",
        credentialFields: [],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 80,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "card_to_card",
        category: "offline",
        implementationStatus: "live",
        credentialFields: [
            { key: "card_number", required: true },
            { key: "card_holder", required: true },
            { key: "iban", required: false },
        ],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 90,
        defaultEnabled: false,
        adminVisible: true,
    },
    {
        code: "cod",
        category: "offline",
        implementationStatus: "live",
        credentialFields: [],
        defaultSettings: {},
        supports: { refunds: false, partial_refunds: false },
        ordering: 100,
        defaultEnabled: true,
        adminVisible: true,
    },
] as const;

const BY_CODE = new Map(PAYMENT_GATEWAY_CATALOG.map((definition) => [definition.code, definition]));

export function gatewayDefinition(code: string): PaymentGatewayDefinition | null {
    return BY_CODE.get(code) ?? null;
}

export function gatewayCredentialKeys(code: string): readonly string[] {
    return gatewayDefinition(code)?.credentialFields.map((field) => field.key) ?? [];
}

export function requiredGatewayCredentialKeys(code: string): readonly string[] {
    return (
        gatewayDefinition(code)
            ?.credentialFields.filter((field) => field.required)
            .map((field) => field.key) ?? []
    );
}

export function gatewaySeedRows() {
    return PAYMENT_GATEWAY_CATALOG.map((definition) => ({
        code: definition.code,
        enabled: definition.defaultEnabled,
        ordering: definition.ordering,
        settings: { ...definition.defaultSettings },
        supports: { ...definition.supports },
        attributes: {
            implementation_status: definition.implementationStatus,
            admin_visible: definition.adminVisible,
            category: definition.category,
        },
    }));
}
