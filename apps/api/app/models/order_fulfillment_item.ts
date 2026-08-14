import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderFulfillmentItemSchema } from "#database/phase5_schema.generated";
import OrderFulfillment from "#models/order_fulfillment";
import OrderLineItem from "#models/order_line_item";

export default class OrderFulfillmentItem extends OrderFulfillmentItemSchema {
    static table = "order_fulfillment_items";

    @belongsTo(() => OrderFulfillment, { foreignKey: "fulfillmentId" })
    declare fulfillment: BelongsTo<typeof OrderFulfillment>;

    @belongsTo(() => OrderLineItem, { foreignKey: "orderLineItemId" })
    declare orderLineItem: BelongsTo<typeof OrderLineItem>;
}
