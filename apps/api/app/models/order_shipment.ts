import { belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";

import { OrderShipmentSchema } from "#database/phase5_schema.generated";
import OrderFulfillment from "#models/order_fulfillment";
import OrderShipmentEvent from "#models/order_shipment_event";

export default class OrderShipment extends OrderShipmentSchema {
    static table = "order_shipments";

    @belongsTo(() => OrderFulfillment, { foreignKey: "fulfillmentId" })
    declare fulfillment: BelongsTo<typeof OrderFulfillment>;

    @hasMany(() => OrderShipmentEvent, { foreignKey: "shipmentId" })
    declare events: HasMany<typeof OrderShipmentEvent>;
}
