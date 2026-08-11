from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# Refund service: make idempotency side effects truthful and restocking quantity-scoped only.
path = Path("apps/api/app/services/refund_service.ts")
text = path.read_text()
text = replace_once(
    text,
    '''        const numericOrderId = Number(orderId);
        if (!Number.isFinite(numericOrderId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
''',
    '''        const numericOrderId = Number(orderId);
        if (!Number.isFinite(numericOrderId)) {
            throw new Exception("Order not found", { status: 404, code: "E_NOT_FOUND" });
        }
        const idempotencyKey = opts.idempotencyKey?.trim() || null;
        if (idempotencyKey && idempotencyKey.length > 64) {
            throw new Exception("Idempotency-Key must be at most 64 characters", {
                status: 422,
                code: "E_REFUND_IDEMPOTENCY_KEY_INVALID",
            });
        }
        const normalizedOpts: RefundCreateOptions = { ...opts, idempotencyKey };
''',
    "normalize refund idempotency key",
)
text = replace_once(
    text,
    '''            .createLock(`order:${numericOrderId}`, "30s")
            .runImmediately(() => this.createInsideLock(numericOrderId, payload, opts));''',
    '''            .createLock(`order:${numericOrderId}`, "30s")
            .runImmediately(() => this.createInsideLock(numericOrderId, payload, normalizedOpts));''',
    "use normalized refund opts",
)
text = replace_once(
    text,
    '''        const { refund, customerId } = value;

        /** Fire after commit so listeners observe persisted state. */
        await emitter.emit("order:refunded", {
            tenantId: Number(refund.tenantId),
            orderId: Number(refund.orderId),
            refundId: Number(refund.id),
            amountMinor: Number(refund.amountMinor),
            customerId,
        });
''',
    '''        const { refund, customerId, created } = value;

        /** Fire only for the first successful booking. Idempotency replays must not duplicate side effects. */
        if (created) {
            await emitter.emit("order:refunded", {
                tenantId: Number(refund.tenantId),
                orderId: Number(refund.orderId),
                refundId: Number(refund.id),
                amountMinor: Number(refund.amountMinor),
                customerId,
            });
        }
''',
    "idempotent post-commit event",
)
text = replace_once(
    text,
    '''): Promise<{ refund: OrderRefund; customerId: number | null }> {''',
    '''): Promise<{ refund: OrderRefund; customerId: number | null; created: boolean }> {''',
    "inner refund created flag type",
)
text = replace_once(
    text,
    '''                    return {
                        refund: existing,
                        customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                    };''',
    '''                    return {
                        refund: existing,
                        customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                        created: false,
                    };''',
    "idempotency replay created false",
)
text = replace_once(
    text,
    '''            if (hasAmount === hasLines) {
                throw new Exception("Refund body must contain either amount_minor or line_items, never both", {
                    status: 422,
                    code: "E_REFUND_INPUT_INVALID",
                });
            }

            const priorTotal''',
    '''            if (hasAmount === hasLines) {
                throw new Exception("Refund body must contain either amount_minor or line_items, never both", {
                    status: 422,
                    code: "E_REFUND_INPUT_INVALID",
                });
            }
            if (payload.restockRequested && !hasLines) {
                throw new Exception("Restocking requires line_items so inventory quantities are explicit", {
                    status: 422,
                    code: "E_REFUND_RESTOCK_REQUIRES_LINES",
                });
            }
            if (hasAmount && !Number.isSafeInteger(payload.amountMinor)) {
                throw new Exception("Refund amount must be an integer minor-unit value", {
                    status: 422,
                    code: "E_REFUND_AMOUNT_INVALID",
                });
            }

            const priorTotal''',
    "refund restock and money guards",
)
text = replace_once(
    text,
    '''            if (refund.restockRequested) {
                await this.restock(refund.id, numericOrderId, lineInputs, hasLines, trx);
            }''',
    '''            if (refund.restockRequested) {
                await this.restock(refund.id, numericOrderId, lineInputs, trx);
            }''',
    "line-scoped restock call",
)
text = replace_once(
    text,
    '''            return {
                refund,
                customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
            };''',
    '''            return {
                refund,
                customerId: order.customerId === null || order.customerId === undefined ? null : Number(order.customerId),
                created: true,
            };''',
    "new refund created true",
)
text = replace_once(
    text,
    '''    private async validateLineQuantities(
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        for (const requested of lines) {
            const sourceId = Number(requested.orderLineItemId);
            const source = await OrderLineItem.query({ client: trx }).where("id", sourceId).where("order_id", orderId).first();''',
    '''    private async validateLineQuantities(
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        const seenLineIds = new Set<number>();
        for (const requested of lines) {
            const sourceId = Number(requested.orderLineItemId);
            if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
                throw new Exception("Refund line item id must be a positive integer", {
                    status: 422,
                    code: "E_REFUND_LINE_INVALID",
                });
            }
            if (seenLineIds.has(sourceId)) {
                throw new Exception(`Line item ${sourceId} appears more than once in the same refund`, {
                    status: 422,
                    code: "E_REFUND_LINE_DUPLICATE",
                });
            }
            seenLineIds.add(sourceId);
            if (!Number.isSafeInteger(requested.quantity) || requested.quantity <= 0) {
                throw new Exception("Refund quantity must be a positive integer", {
                    status: 422,
                    code: "E_REFUND_LINE_QUANTITY_INVALID",
                });
            }
            for (const [field, value] of [
                ["refund_amount_minor", requested.refundAmountMinor],
                ["refund_tax_minor", requested.refundTaxMinor],
            ] as const) {
                if (value !== undefined && value !== null && (!Number.isSafeInteger(value) || value < 0)) {
                    throw new Exception(`${field} must be a non-negative integer minor-unit value`, {
                        status: 422,
                        code: "E_REFUND_LINE_AMOUNT_INVALID",
                    });
                }
            }
            const source = await OrderLineItem.query({ client: trx }).where("id", sourceId).where("order_id", orderId).first();''',
    "refund line integrity guards",
)
text = replace_once(
    text,
    '''    private async restock(
        refundId: bigint | number,
        orderId: number,
        lines: RefundLineItemInput[],
        hasLines: boolean,
        trx: TransactionClientContract,
    ): Promise<void> {
        const sources = hasLines
            ? await Promise.all(
                  lines.map(async (l) => ({
                      line: await OrderLineItem.query({ client: trx })
                          .where("id", Number(l.orderLineItemId))
                          .where("order_id", orderId)
                          .first(),
                      quantity: l.quantity,
                  })),
              )
            : (await OrderLineItem.query({ client: trx }).where("order_id", orderId)).map((line) => ({
                  line,
                  quantity: line.quantity,
              }));

        for (const entry of sources) {''',
    '''    private async restock(
        refundId: bigint | number,
        orderId: number,
        lines: RefundLineItemInput[],
        trx: TransactionClientContract,
    ): Promise<void> {
        const sources = await Promise.all(
            lines.map(async (line) => ({
                line: await OrderLineItem.query({ client: trx })
                    .where("id", Number(line.orderLineItemId))
                    .where("order_id", orderId)
                    .first(),
                quantity: line.quantity,
            })),
        );

        for (const entry of sources) {''',
    "remove amount-only full-order restock",
)
path.write_text(text)


# HTTP validators enforce integer minor units before service/domain validation.
path = Path("apps/api/app/validators/admin/refund_validator.ts")
text = path.read_text()
text = replace_once(text, 'amount_minor: vine.number().positive().optional(),', 'amount_minor: vine.number().withoutDecimals().positive().max(Number.MAX_SAFE_INTEGER).optional(),', "refund amount validator")
text = replace_once(text, 'order_line_item_id: vine.number().positive(),', 'order_line_item_id: vine.number().withoutDecimals().positive(),', "refund line id validator")
text = replace_once(text, 'quantity: vine.number().positive().max(100_000),', 'quantity: vine.number().withoutDecimals().positive().max(100_000),', "refund quantity validator")
text = replace_once(text, 'refund_amount_minor: vine.number().min(0).optional(),', 'refund_amount_minor: vine.number().withoutDecimals().min(0).max(Number.MAX_SAFE_INTEGER).optional(),', "refund line amount validator")
text = replace_once(text, 'refund_tax_minor: vine.number().min(0).optional(),', 'refund_tax_minor: vine.number().withoutDecimals().min(0).max(Number.MAX_SAFE_INTEGER).optional(),', "refund line tax validator")
path.write_text(text)


# Notes are admin writes too; rate-limit POST/DELETE consistently with refunds and other mutations.
path = Path("apps/api/start/routes/admin_notes.ts")
text = path.read_text()
text = replace_once(text, 'import { middleware } from "#start/kernel";\n', 'import { middleware } from "#start/kernel";\nimport { adminWriteLimiter } from "#start/limiter";\n', "admin notes limiter import")
text = replace_once(text, 'router.post("/notes", [NotesController, "store"]).as("admin.orders.notes.store");', 'router.post("/notes", [NotesController, "store"]).as("admin.orders.notes.store").use(adminWriteLimiter);', "admin note create limiter")
text = replace_once(text, 'router.delete("/notes/:id", [NotesController, "destroy"]).as("admin.orders.notes.destroy");', 'router.delete("/notes/:id", [NotesController, "destroy"]).as("admin.orders.notes.destroy").use(adminWriteLimiter);', "admin note delete limiter")
path.write_text(text)


# Regression tests: amount-only restock must never restock the whole order; service inputs stay integral/deduplicated.
path = Path("apps/api/tests/functional/refunds/admin_refund_restock.spec.ts")
text = path.read_text()
needle = '''    test("restock_requested=false leaves inventory untouched", async ({ client, assert }) => {'''
insert = '''    test("amount-only refund cannot request restock without explicit line quantities", async ({ client, assert }) => {
        const admin = await adminUser();
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({
            customerId: null,
            productId: Number(product.id),
            quantity: 2,
            price: 1_000_000,
        });
        await advanceOrderTo(order, OrderStatus.Processing);
        const itemBefore = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        const before = itemBefore.stockQuantity;

        const response = await client
            .post(`/api/v1/admin/orders/${order.id}/refunds`)
            .loginAs(admin)
            .json({ amount_minor: 1_000_000, restock_requested: true });
        response.assertStatus(422);

        const itemAfter = await InventoryItem.query().where("product_id", Number(product.id)).firstOrFail();
        assert.equal(itemAfter.stockQuantity, before);
    });

'''
if needle not in text:
    raise SystemExit("restock test insertion point missing")
text = text.replace(needle, insert + needle, 1)
path.write_text(text)

path = Path("apps/api/tests/unit/refunds/refund_amount_validation.spec.ts")
text = path.read_text()
closing = '''    test("negative amount → 422 (validator catches before service)", async ({ assert }) => {'''
if closing not in text:
    raise SystemExit("refund validation insertion point missing")
extra = '''    test("fractional minor-unit amount → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 1, price: 1_000_000 });
        await advanceOrderTo(order, OrderStatus.Processing);

        let thrown: { status?: number; code?: string } | null = null;
        try {
            await refundService.create(order.id, { amountMinor: 1_000.5 });
        } catch (error) {
            thrown = error as { status?: number; code?: string };
        }
        assert.equal(thrown?.status, 422);
        assert.equal(thrown?.code, "E_REFUND_AMOUNT_INVALID");
    });

    test("duplicate source line in one refund → 422", async ({ assert }) => {
        const product = await createTaxableProduct({ regularPrice: 1_000_000 });
        const order = await makeDraftOrder({ customerId: null, productId: Number(product.id), quantity: 2, price: 1_000_000 });
        await advanceOrderTo(order, OrderStatus.Processing);
        const line = (await order.related("lineItems").query()).at(0)!;

        let thrown: { status?: number; code?: string } | null = null;
        try {
            await refundService.create(order.id, {
                lineItems: [
                    { orderLineItemId: line.id, quantity: 1, refundAmountMinor: 500_000 },
                    { orderLineItemId: line.id, quantity: 1, refundAmountMinor: 500_000 },
                ],
            });
        } catch (error) {
            thrown = error as { status?: number; code?: string };
        }
        assert.equal(thrown?.status, 422);
        assert.equal(thrown?.code, "E_REFUND_LINE_DUPLICATE");
    });

'''
text = text.replace(closing, extra + closing, 1)
path.write_text(text)


# OpenAPI: amount-only refunds have no quantity mapping, therefore cannot request restock.
path = Path("docs/api/reference/openapi/admin/paths/refunds/order-refunds.post.yaml")
text = path.read_text()
text = replace_once(
    text,
    '''    6. Restock requested lines via {@link InventoryService.increment}.''',
    '''    6. Restock requested lines via {@link InventoryService.increment}; `restock_requested=true`
       is accepted only for `line_items[]` refunds so inventory quantities are explicit.''',
    "refund openapi restock description",
)
text = replace_once(
    text,
    '''                          reason: { type: [string, "null"], maxLength: 2000 }
                          restock_requested: { type: boolean, default: false }''',
    '''                          reason: { type: [string, "null"], maxLength: 2000 }''',
    "remove amount refund restock schema",
)
path.write_text(text)
