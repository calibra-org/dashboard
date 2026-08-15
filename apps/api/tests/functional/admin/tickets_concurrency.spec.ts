import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

const URL = "/api/v1/admin/tickets";

async function createAdmin() {
    const token = randomUUID();
    const user = await User.create({
        email: `tickets-${token}@calibra.dev`,
        passwordHash: token,
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Admin",
        lastName: "Ticket",
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

const payload = {
    requester_name: "Test Customer",
    requester_email: "customer@example.com",
    subject: "Concurrency check",
    message: "Initial message",
    priority: "normal",
    channel: "admin",
};

test.group("ticket optimistic concurrency", (group) => {
    group.each.setup(resetTickets);

    test("rejects stale no-op metadata update", async ({ client }) => {
        const admin = await createAdmin();
        const created = await client.post(URL).withGuard("api").loginAs(admin).json(payload);
        const id = Number(created.body().data.id);
        const changed = await client
            .patch(`${URL}/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 1, priority: "high" });
        changed.assertStatus(200);
        const stale = await client
            .patch(`${URL}/${id}`)
            .withGuard("api")
            .loginAs(admin)
            .json({ expected_version: 1, priority: "high" });
        stale.assertStatus(409);
    });

    test("rejects stale same-status transition", async ({ client }) => {
        const admin = await createAdmin();
        const created = await client.post(URL).withGuard("api").loginAs(admin).json(payload);
        const id = Number(created.body().data.id);
        const changed = await client
            .post(`${URL}/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "pending", expected_version: 1 });
        changed.assertStatus(200);
        const stale = await client
            .post(`${URL}/${id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "pending", expected_version: 1 });
        stale.assertStatus(409);
    });
});
