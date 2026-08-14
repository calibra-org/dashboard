import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderReturnItemSchema } from "#database/phase5_schema.generated";
import OrderLineItem from "#models/order_line_item";
import OrderReturn from "#models/order_return";

export default class OrderReturnItem extends OrderReturnItemSchema {
    static table = "order_return_items";

    @belongsTo(() => OrderReturn, { foreignKey: "returnId" })
    declare returnRecord: BelongsTo<typeof OrderReturn>;

    @belongsTo(() => OrderLineItem, { foreignKey: "orderLineItemId" })
    declare orderLineItem: BelongsTo<typeof OrderLineItem>;
}
