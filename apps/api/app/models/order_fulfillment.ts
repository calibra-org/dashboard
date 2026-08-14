import { hasMany } from "@adonisjs/lucid/orm";
import type { HasMany } from "@adonisjs/lucid/types/relations";

import { OrderFulfillmentSchema } from "#database/phase5_schema.generated";
import OrderFulfillmentItem from "#models/order_fulfillment_item";
import OrderShipment from "#models/order_shipment";

export default class OrderFulfillment extends OrderFulfillmentSchema {
    static table = "order_fulfillments";

    @hasMany(() => OrderFulfillmentItem, { foreignKey: "fulfillmentId" })
    declare items: HasMany<typeof OrderFulfillmentItem>;

    @hasMany(() => OrderShipment, { foreignKey: "fulfillmentId" })
    declare shipments: HasMany<typeof OrderShipment>;
}
