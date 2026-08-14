import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

const URL = "/api/v1/admin/tickets";

async function createAdmin() {
    const token = randomUUID();
    const user = await User.create({
        email: `ticket-table-view-${token}@calibra.dev`,
        passwordHash: token,
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Admin",
        lastName: "Tickets",
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

async function resetTickets() {
    await db.rawQuery(
        "TRUNCATE TABLE support_ticket_events, support_ticket_messages, support_tickets, support_ticket_settings RESTART IDENTITY CASCADE",
    );
    await db.from("tenant_number_counters").where("kind", "ticket").delete();
}

function payload(subject: string, priority: "normal" | "urgent" = "normal") {
    return {
        requester_name: "Queue Customer",
        requester_email: "queue@example.com",
        subject,
        message: "Initial message",
        priority,
        channel: "admin",
    };
}

test.group("GET /api/v1/admin/tickets (TableView grammar)", (group) => {
    group.each.setup(resetTickets);

    test("filters and sorts the queue with the shared grammar", async ({ client, assert }) => {
        const admin = await createAdmin();
        const normal = await client.post(URL).withGuard("api").loginAs(admin).json(payload("Normal ticket"));
        const urgent = await client.post(URL).withGuard("api").loginAs(admin).json(payload("Urgent ticket", "urgent"));
        normal.assertStatus(201);
        urgent.assertStatus(201);

        const response = await client
            .get(URL)
            .qs({ "filter[]": "priority:eq:urgent", "sort[]": "last_message_at:desc" })
            .withGuard("api")
            .loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].id, urgent.body().data.id);
    });

    test("rejects legacy per-facet query keys", async ({ client }) => {
        const admin = await createAdmin();
        const response = await client.get(URL).qs({ status: "open" }).withGuard("api").loginAs(admin);
        response.assertStatus(422);
    });

    test("keeps q and sla as explicit computed extras", async ({ client, assert }) => {
        const admin = await createAdmin();
        await client.post(URL).withGuard("api").loginAs(admin).json(payload("Payment review"));
        await client.post(URL).withGuard("api").loginAs(admin).json(payload("Shipping review"));

        const response = await client.get(URL).qs({ q: "Payment", sla: "healthy" }).withGuard("api").loginAs(admin);
        response.assertStatus(200);
        assert.equal(response.body().meta.total, 1);
        assert.equal(response.body().data[0].subject, "Payment review");
    });
});
