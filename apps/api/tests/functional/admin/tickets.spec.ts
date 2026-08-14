import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

const URL = "/api/v1/admin/tickets";

async function createUser(role: "admin" | "customer") {
    const token = randomUUID();
    const user = await User.create({
        email: `tickets-${role}-${token}@calibra.dev`,
        passwordHash: token,
        role,
        locale: "fa",
    });
    const customer = await Customer.create({
        userId: user.id,
        firstName: role === "admin" ? "مدیر" : "مشتری",
        lastName: "تیکت",
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

function payload(overrides: Record<string, unknown> = {}) {
    return {
        requester_name: "رضا رضایی",
        requester_email: "reza.ticket@example.com",
        requester_phone: "09120000000",
        subject: "پیگیری وضعیت سفارش و پرداخت",
        message: "لطفاً وضعیت درخواست را بررسی کنید.",
        priority: "normal",
        channel: "admin",
        ...overrides,
    };
}

test.group("Calibra ticket operations", (group) => {
    group.each.setup(resetTickets);

    test("rejects unauthenticated and non-admin requests", async ({ client }) => {
        const unauthenticated = await client.get(URL);
        unauthenticated.assertStatus(401);

        const { user } = await createUser("customer");
        const forbidden = await client.get(URL).withGuard("api").loginAs(user);
        forbidden.assertStatus(403);
    });

    test("creates, lists, searches, and reads a ticket", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client.post(URL).withGuard("api").loginAs(user).json(payload());
        created.assertStatus(201);
        assert.equal(created.body().data.reference, "TKT-1000");
        assert.equal(created.body().data.status, "open");
        assert.isNull(created.body().data.first_response_at);
        assert.lengthOf(created.body().data.messages, 1);
        assert.equal(created.body().data.messages[0].kind, "requester_message");
        assert.isNull(created.body().data.messages[0].author_user_id);

        const list = await client.get(URL).qs({ q: "پرداخت" }).withGuard("api").loginAs(user);
        list.assertStatus(200);
        assert.equal(list.body().meta.total, 1);

        const detail = await client.get(`${URL}/${created.body().data.id}`).withGuard("api").loginAs(user);
        detail.assertStatus(200);
        assert.equal(detail.body().data.subject, "پیگیری وضعیت سفارش و پرداخت");
    });

    test("links valid customers and attributes the requester message", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const { customer } = await createUser("customer");
        const linked = await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(payload({ customer_id: Number(customer.id) }));
        linked.assertStatus(201);
        assert.equal(linked.body().data.customer_id, Number(customer.id));
        assert.equal(linked.body().data.messages[0].author_customer_id, Number(customer.id));

        const invalid = await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(payload({ customer_id: 999999999 }));
        invalid.assertStatus(422);
    });

    test("validates assignees and applies assignment", async ({ client, assert }) => {
        const { user: admin } = await createUser("admin");
        const { user: customerUser } = await createUser("customer");

        const assigned = await client
            .post(URL)
            .withGuard("api")
            .loginAs(admin)
            .json(payload({ assigned_user_id: Number(admin.id) }));
        assigned.assertStatus(201);
        assert.equal(assigned.body().data.assigned_user_id, Number(admin.id));

        const invalid = await client
            .post(URL)
            .withGuard("api")
            .loginAs(admin)
            .json(payload({ assigned_user_id: Number(customerUser.id) }));
        invalid.assertStatus(422);
    });

    test("transitions workflow and enforces optimistic versions", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client.post(URL).withGuard("api").loginAs(user).json(payload());
        const id = Number(created.body().data.id);

        const transitioned = await client
            .post(`${URL}/${id}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ status: "pending", expected_version: 1 });
        transitioned.assertStatus(200);
        assert.equal(transitioned.body().data.status, "pending");
        assert.equal(transitioned.body().data.version, 2);

        const stale = await client
            .patch(`${URL}/${id}`)
            .withGuard("api")
            .loginAs(user)
            .json({ priority: "high", expected_version: 1 });
        stale.assertStatus(409);
    });

    test("rejects invalid status transitions", async ({ client }) => {
        const { user } = await createUser("admin");
        const created = await client.post(URL).withGuard("api").loginAs(user).json(payload());
        const id = Number(created.body().data.id);

        const closed = await client
            .post(`${URL}/${id}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ status: "closed", expected_version: 1 });
        closed.assertStatus(200);

        const invalid = await client
            .post(`${URL}/${id}/transition`)
            .withGuard("api")
            .loginAs(user)
            .json({ status: "resolved", expected_version: 2 });
        invalid.assertStatus(422);
    });

    test("does not create audit noise for same-value updates", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const created = await client.post(URL).withGuard("api").loginAs(user).json(payload());
        const id = Number(created.body().data.id);

        const unchanged = await client
            .patch(`${URL}/${id}`)
            .withGuard("api")
            .loginAs(user)
            .json({ priority: "normal", expected_version: 1 });
        unchanged.assertStatus(200);
        assert.isFalse(unchanged.body().changed);
        assert.equal(unchanged.body().data.version, 1);
    });

    test("distinguishes public replies from internal notes for SLA", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const first = await client.post(URL).withGuard("api").loginAs(user).json(payload());
        const firstId = Number(first.body().data.id);

        const note = await client
            .post(`${URL}/${firstId}/messages`)
            .withGuard("api")
            .loginAs(user)
            .json({ kind: "internal_note", body: "ارجاع داخلی", expected_version: 1 });
        note.assertStatus(201);
        assert.isNull(note.body().ticket.first_response_at);

        const second = await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(payload({ subject: "درخواست دوم" }));
        const secondId = Number(second.body().data.id);
        const reply = await client
            .post(`${URL}/${secondId}/messages`)
            .withGuard("api")
            .loginAs(user)
            .json({ kind: "reply", body: "پاسخ ثبت شد", expected_version: 1 });
        reply.assertStatus(201);
        assert.isNotNull(reply.body().ticket.first_response_at);
    });

    test("updates settings and applies defaults to new tickets", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        const initial = await client.get(`${URL}/settings`).withGuard("api").loginAs(user);
        initial.assertStatus(200);
        assert.equal(initial.body().data.first_response_minutes, 60);

        const updated = await client
            .patch(`${URL}/settings`)
            .withGuard("api")
            .loginAs(user)
            .json({
                reference_prefix: "SUP",
                first_response_minutes: 30,
                resolution_minutes: 720,
                default_priority: "high",
                default_assignee_user_id: Number(user.id),
            });
        updated.assertStatus(200);
        assert.equal(updated.body().data.default_assignee_user_id, Number(user.id));

        const created = await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(payload({ priority: undefined }));
        created.assertStatus(201);
        assert.equal(created.body().data.reference, "SUP-1000");
        assert.equal(created.body().data.priority, "high");
        assert.equal(created.body().data.assigned_user_id, Number(user.id));
    });

    test("returns operational summary, trends, and resources", async ({ client, assert }) => {
        const { user } = await createUser("admin");
        await client
            .post(URL)
            .withGuard("api")
            .loginAs(user)
            .json(payload({ priority: "urgent" }));

        const summary = await client.get(`${URL}/summary`).withGuard("api").loginAs(user);
        summary.assertStatus(200);
        assert.equal(summary.body().data.active, 1);

        const trends = await client.get(`${URL}/trends`).withGuard("api").loginAs(user);
        trends.assertStatus(200);
        assert.lengthOf(trends.body().data, 30);

        const resources = await client
            .get(`${URL}/resources`)
            .qs({ kind: "assignees", limit: 10 })
            .withGuard("api")
            .loginAs(user);
        resources.assertStatus(200);
        assert.isAbove(resources.body().data.length, 0);
    });
});
