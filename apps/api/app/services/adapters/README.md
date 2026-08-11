# Payment Adapters

Every remote payment method implements the narrow `PaymentAdapter` contract from
[`base_redirect_gateway.ts`](./base_redirect_gateway.ts). The registry in
[`payment_adapter_registry.ts`](../payment_adapter_registry.ts) is the only resolver used by the
checkout/payment service.

## Phase 08 posture

Calibra separates **protocol implementation** from **tenant/provider verification**:

- `implemented` — concrete request/callback/verify code exists, but a tenant still needs its own
  merchant credentials and a real provider round-trip before the connection can be called healthy.
- `live` — an offline method that needs no remote PSP protocol, or a provider integration that has
  completed the deployment verification gate.
- `stub` — deliberately non-routable. The admin UI can show the planned method, but both UI and API
  refuse activation until official merchant documentation and sandbox/merchant validation exist.

Current adapters:

| code | posture | notes |
|---|---|---|
| `mellat` | `implemented` | Behpardakht Mellat SOAP request → callback → verify → settle. Requires terminal id, username, password. |
| `parsian` | `implemented` | Parsian New IPG Sale/Confirm SOAP flow. Requires LoginAccount. |
| `zarinpal` | `implemented` | ZarinPal v4 request/verify flow. Requires merchant id. |
| `card_to_card` | `live` | Offline instructions; PAN is masked in payment-attempt payloads. |
| `cod` | `live` | Offline cash-on-delivery flow. |
| `sadad` | `stub` | Credential shape is known to the UI, but no provider protocol is invented without official merchant docs. |
| `bitpay` | `stub` | Public start-payment material is insufficient for a safe complete verify/callback adapter. |
| `digipay` | `stub` | Awaiting official merchant API contract/sandbox. |
| `snapppay` | `stub` | Awaiting official merchant API contract/sandbox. |
| `azkivam` | `stub` | Awaiting official merchant API contract/sandbox. |

Legacy `idpay`, `nextpay`, `payir`, `zibal`, and `bank_transfer` rows remain routable or explicitly
stubbed for backwards compatibility with existing orders, but the new catalog marks them
`admin_visible=false`.

## Merchant-secret boundary

Provider credentials never belong in logs, API responses, payment-attempt payloads, or source code.
`payment_gateway_credentials_service.ts` encrypts credential dictionaries using Adonis' configured
ChaCha20-Poly1305 manager with a purpose bound to the gateway code. The stored settings JSON contains
only a reserved ciphertext field; the admin transformer returns `***` masks. Concrete adapters are
the only layer that decrypts those settings for the outbound provider call.

The mask sentinel has write-only semantics:

- missing credential key → preserve existing secret;
- `***` → preserve existing secret;
- empty string → clear it;
- new non-empty value → replace and re-encrypt the credential dictionary.

## Adding or promoting a gateway

1. Obtain the provider's **official merchant documentation** and a merchant/sandbox account.
2. Implement the provider in a dedicated adapter. Use `timeoutFetch`; keep provider-specific
   currency/unit conversions inside the adapter.
3. Add protocol-level unit tests for init, callback parsing, verify, negative codes, timeout and
   replay-sensitive values. Add a functional checkout callback test through `PaymentService`.
4. Register the adapter and change its catalog posture from `stub` to `implemented`.
5. Run a real provider round-trip in the target deployment. Only after that evidence exists should
   operational health become `healthy`/the provider be described as verified.

A green mock suite proves Calibra speaks its own adapter contract; it is **not** evidence that a bank
has accepted the deployment credentials, callback URL, source IP or merchant contract. The product
must keep that distinction visible.
