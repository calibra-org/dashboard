import { belongsTo } from "@adonisjs/lucid/orm";
import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import { OrderShipmentEventSchema } from "#database/phase5_schema.generated";
import OrderShipment from "#models/order_shipment";

export default class OrderShipmentEvent extends OrderShipmentEventSchema {
    static table = "order_shipment_events";

    @belongsTo(() => OrderShipment, { foreignKey: "shipmentId" })
    declare shipment: BelongsTo<typeof OrderShipment>;
}
