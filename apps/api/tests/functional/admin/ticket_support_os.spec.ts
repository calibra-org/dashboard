import { randomUUID } from "node:crypto";
import db from "@adonisjs/lucid/services/db";
import { test } from "@japa/runner";

import Customer from "#models/customer";
import User from "#models/user";

const TICKETS_URL = "/api/v1/admin/tickets";
const OPERATIONS_URL = `${TICKETS_URL}/operations`;

async function createAdmin() {
    const token = randomUUID();
    const user = await User.create({
        email: `support-os-${token}@calibra.dev`,
        passwordHash: token,
        role: "admin",
        locale: "fa",
    });
    await Customer.create({
        userId: user.id,
        firstName: "Support",
        lastName: "Operator",
        countryDefault: "IR",
        status: "active",
    });
    return user;
}

async function resetSupportOs() {
    await db.rawQuery(`TRUNCATE TABLE
        support_campaign_recipients,
        support_campaigns,
        support_csat_responses,
        support_automation_rules,
        support_routing_rules,
        support_channel_integrations,
        support_agent_presence,
        support_ticket_merges,
        support_ticket_attachments,
        support_ticket_saved_views,
        support_ticket_workflow_statuses,
        support_ticket_events,
        support_ticket_messages,
        support_tickets,
        support_ticket_settings
        RESTART IDENTITY CASCADE`);
    await db.from("tenant_number_counters").where("kind", "ticket").delete();
}

function ticketPayload(subject: string, channel = "whatsapp") {
    return {
        requester_name: "Unified customer",
        requester_phone: "09120000000",
        subject,
        message: "Channel evidence",
        priority: "normal",
        channel,
    };
}

test.group("Ticket Support OS expansion", (group) => {
    group.each.setup(resetSupportOs);

    test("accepts the extended omnichannel ticket sources", async ({ client, assert }) => {
        const admin = await createAdmin();
        const created = await client.post(TICKETS_URL).withGuard("api").loginAs(admin).json(ticketPayload("WhatsApp intake"));

        created.assertStatus(201);
        assert.equal(created.body().data.channel, "whatsapp");

        const list = await client.get(TICKETS_URL).qs({ "filter[]": "channel:eq:whatsapp" }).withGuard("api").loginAs(admin);
        list.assertStatus(200);
        assert.equal(list.body().meta.total, 1);
    });

    test("keeps scheduled campaign drafts gated and aggregates recipient delivery evidence", async ({ client, assert }) => {
        const admin = await createAdmin();
        const scheduledAt = new Date(Date.now() + 3_600_000).toISOString();
        const created = await client.post(`${OPERATIONS_URL}/campaigns`).withGuard("api").loginAs(admin).json({
            name: "VIP follow-up",
            channel: "whatsapp",
            template_body: "پیام تست",
            scheduled_at: scheduledAt,
            estimated_cost_minor: 1200,
        });

        created.assertStatus(201);
        assert.equal(created.body().data.status, "draft");
        assert.equal(created.body().data.template_status, "draft");

        const recipients = await client
            .post(`${OPERATIONS_URL}/campaigns/${created.body().data.id}/recipients`)
            .withGuard("api")
            .loginAs(admin)
            .json({
                expected_version: created.body().data.version,
                recipients: ["a@example.com", "A@example.com", "b@example.com"],
            });
        recipients.assertStatus(200);
        assert.equal(recipients.body().data.recipients, 2);

        const campaigns = await client.get(`${OPERATIONS_URL}/campaigns`).withGuard("api").loginAs(admin);
        campaigns.assertStatus(200);
        assert.lengthOf(campaigns.body().data, 1);
        assert.equal(campaigns.body().data[0].recipient_summary.total, 2);
        assert.equal(campaigns.body().data[0].recipient_summary.pending, 2);
        assert.equal(campaigns.body().data[0].recipient_summary.delivered, 0);
    });

    test("reports status, channel and first-contact-resolution evidence from persisted ticket history", async ({
        client,
        assert,
    }) => {
        const admin = await createAdmin();
        const first = await client
            .post(TICKETS_URL)
            .withGuard("api")
            .loginAs(admin)
            .json(ticketPayload("Resolved once", "email"));
        const second = await client.post(TICKETS_URL).withGuard("api").loginAs(admin).json(ticketPayload("Reopened", "whatsapp"));

        const firstResolved = await client
            .post(`${TICKETS_URL}/${first.body().data.id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "resolved", expected_version: first.body().data.version });
        firstResolved.assertStatus(200);

        const secondResolved = await client
            .post(`${TICKETS_URL}/${second.body().data.id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "resolved", expected_version: second.body().data.version });
        secondResolved.assertStatus(200);

        const reopened = await client
            .post(`${TICKETS_URL}/${second.body().data.id}/transition`)
            .withGuard("api")
            .loginAs(admin)
            .json({ status: "open", expected_version: secondResolved.body().data.version });
        reopened.assertStatus(200);

        const report = await client.get(`${OPERATIONS_URL}/reports`).withGuard("api").loginAs(admin);
        report.assertStatus(200);
        assert.equal(report.body().data.reopened_tickets, 1);
        assert.equal(report.body().data.fcr_proxy.completed_tickets, 2);
        assert.equal(report.body().data.fcr_proxy.first_contact_resolved, 1);
        assert.equal(report.body().data.fcr_proxy.rate_percent, 50);
        assert.includeDeepMembers(report.body().data.channels, [
            { channel: "email", total: 1 },
            { channel: "whatsapp", total: 1 },
        ]);
        assert.includeDeepMembers(report.body().data.statuses, [
            { status: "open", total: 1 },
            { status: "resolved", total: 1 },
        ]);
    });
});
