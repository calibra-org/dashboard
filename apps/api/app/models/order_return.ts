import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { OrderReturnSchema } from "#database/phase5_schema.generated";
import OrderReturnItem from "#models/order_return_item";

export default class OrderReturn extends OrderReturnSchema {
    static table = "order_returns";

    @hasMany(() => OrderReturnItem, { foreignKey: "returnId" })
    declare items: HasMany<typeof OrderReturnItem>;
}
