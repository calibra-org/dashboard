import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

const URL = "/api/v1/admin/tickets";

async function createUser(role: "admin" | "customer") {
    const token = randomUUID();
    const user = await User.create({
        email: `ticket-workflow-${role}-${token}@calibra.dev`,
        passwordHash: token,
        role,
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: role === "admin" ? "Admin" : "Customer",
        lastName: "Ticket",
        countryDefault: "IR",
        status: "active",
    });
    return { user, customer };
}

async function resetTickets() {
    await db.rawQuery(
        "TRUNCATE TABLE support_ticket_events, support_ticket_messages, support_tickets, support_ticket_settings RESTART IDENTITY CASCADE",
    );
    await db.from("tenant_number_counters").where("kind", "ticket").delete();
}

function ticketPayload(overrides: Record<string, unknown> = {}) {
    return {
        requester_name: "Requester",
        requester_email: "requester@example.com",
        subject: "Payment follow-up",
        message: "Please review this request.",
        priority: "normal",
        channel: "admin",
        ...overrides,
    };
}

test.group("Ticket workflow invariants", (group) => {
    group.each.setup(resetTickets);

    test("initial content is a requester message and does not satisfy first-response SLA", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const response = await client.post(URL).withGuard("api").loginAs(user).json(ticketPayload());
        response.assertStatus(201);
        assert.isNull(response.body().data.first_response_at);
        assert.equal(response.body().data.messages[0].kind, "requester_message");
        assert.isNull(response.body().data.messages[0].author_user_id);
    });

    test("linked requester message retains customer attribution", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const { customer } = await createUser("customer");
        const response = await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(ticketPayload({ customer_id: Number(customer.id) }));
        response.assertStatus(201);
        assert.equal(response.body().data.messages[0].author_customer_id, Number(customer.id));
    });

    test("same-value ticket patch is a no-op", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client.post(URL).withGuard("api").loginAs(user).json(ticketPayload());
        const id = Number(created.body().data.id);
        const eventCount = created.body().data.events.length;
        const response = await client
            .patch(`${URL}/${id}`)
            .withGuard("api")
            .loginAs(user)
            .json({ priority: "normal", expected_version: 1 });
        response.assertStatus(200);
        assert.isFalse(response.body().changed);
        assert.equal(response.body().data.version, 1);
        assert.equal(response.body().data.events.length, eventCount);
    });

    test("default assignee must be an admin and is applied unless explicitly cleared", async ({ client, assert }) => {
        const { user: admin } = await createUser("admin");
        const { user: customerUser } = await createUser("customer");
        const invalid = await client
            .patch(`${URL}/settings`)
            .withGuard("api")
            .loginAs(admin)
            .json({ default_assignee_user_id: Number(customerUser.id) });
        invalid.assertStatus(422);

        const saved = await client
            .patch(`${URL}/settings`)
            .withGuard("api")
            .loginAs(admin)
            .json({ default_assignee_user_id: Number(admin.id) });
        saved.assertStatus(200);

        const defaulted = await client.post(URL).withGuard("api").loginAs(admin).json(ticketPayload());
        defaulted.assertStatus(201);
        assert.equal(defaulted.body().data.assigned_user_id, Number(admin.id));

        const explicitUnassigned = await client
            .post(URL)
            .withGuard("api")
            .loginAs(admin)
            .json(ticketPayload({ subject: "Explicitly unassigned", assigned_user_id: null }));
        explicitUnassigned.assertStatus(201);
        assert.isNull(explicitUnassigned.body().data.assigned_user_id);
    });
});
