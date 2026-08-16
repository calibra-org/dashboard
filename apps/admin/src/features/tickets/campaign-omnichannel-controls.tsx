"use client";

import type { Locale } from "@calibra/shared/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import type { FormEvent } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { apiGet, apiMutate } from "#/lib/queries/api-client";

type Envelope<T> = { data: T };
type Campaign = {
    id: number;
    name: string;
    channel: string;
    status: string;
    template_status: string;
    provider_template_key?: string | null;
    provider_template_status?: "not_required" | "pending" | "approved" | "rejected";
    provider_template_config?: Record<string, unknown>;
    scheduled_at: string | null;
};

export function CampaignOmnichannelControls() {
    const locale = useLocale() as Locale;
    const client = useQueryClient();
    const campaigns = useQuery({
        queryKey: ["ticket-omnichannel", "campaign-controls"],
        queryFn: ({ signal }) => apiGet<Envelope<Campaign[]>>("tickets/operations/campaigns", { locale, signal }),
        select: (value) => value.data,
    });
    const verify = useMutation({
        mutationFn: ({ id, body }: { id: number; body: unknown }) =>
            apiMutate("POST", `tickets/omnichannel/campaigns/${id}/provider-template/verify`, { locale, body }),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "campaign-controls"] }),
                client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
            ]);
        },
    });
    const dispatch = useMutation({
        mutationFn: (id: number) =>
            apiMutate("POST", `tickets/omnichannel/campaigns/${id}/dispatch`, { locale, body: { limit: 250 } }),
        onSuccess: async () => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["ticket-omnichannel", "campaign-controls"] }),
                client.invalidateQueries({ queryKey: ["admin", "tickets", "campaigns"] }),
            ]);
        },
    });
    async function verifyTemplate(event: FormEvent<HTMLFormElement>, id: number) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await verify.mutateAsync({
            id,
            body: { name: String(form.get("name") ?? "").trim(), language_code: String(form.get("language_code") ?? "").trim() },
        });
    }
    const relevant = (campaigns.data ?? []).filter((item) =>
        ["whatsapp", "telegram", "instagram", "rubika", "bale", "eitaa", "email", "sms"].includes(item.channel),
    );
    return (
        <Card className="shadow-sm">
            <CardHeader>
                <CardTitle className="text-base">{locale === "en" ? "Provider delivery gate" : "گیت ارسال Provider"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-muted-foreground text-xs leading-6">
                    {locale === "en"
                        ? "Campaign delivery uses the same verified channel adapters as the Inbox. WhatsApp templates are approved only after Meta returns provider evidence; scheduling alone never fabricates delivery."
                        : "ارسال کمپین از همان Adapterهای تأییدشده Inbox استفاده می‌کند. قالب واتساپ فقط وقتی Approved می‌شود که Meta شواهد Provider برگرداند؛ صرف زمان‌بندی هیچ تحویلی را جعلی نمی‌کند."}
                </p>
                {relevant.length ? (
                    relevant.map((campaign) => (
                        <div key={campaign.id} className="rounded-xl border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="font-semibold text-sm">{campaign.name}</div>
                                    <div className="mt-1 text-[0.65rem] text-muted-foreground">
                                        {campaign.channel} · {campaign.status}
                                    </div>
                                </div>
                                <div className="flex gap-1.5">
                                    <Badge variant="outline">{campaign.template_status}</Badge>
                                    {campaign.channel === "whatsapp" ? (
                                        <Badge variant="outline">
                                            Meta: {campaign.provider_template_status ?? "not_verified"}
                                        </Badge>
                                    ) : null}
                                </div>
                            </div>
                            {campaign.channel === "whatsapp" ? (
                                <form
                                    onSubmit={(event) => verifyTemplate(event, campaign.id)}
                                    className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
                                >
                                    <Input
                                        name="name"
                                        required
                                        defaultValue={campaign.provider_template_key ?? ""}
                                        placeholder="order_update"
                                        dir="ltr"
                                    />
                                    <Input
                                        name="language_code"
                                        required
                                        defaultValue={String(campaign.provider_template_config?.language_code ?? "fa")}
                                        placeholder="fa"
                                        dir="ltr"
                                    />
                                    <Button type="submit" variant="outline" disabled={verify.isPending}>
                                        {locale === "en" ? "Verify with Meta" : "تأیید از Meta"}
                                    </Button>
                                </form>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => dispatch.mutate(campaign.id)}
                                    disabled={dispatch.isPending || !["scheduled", "running"].includes(campaign.status)}
                                >
                                    {locale === "en" ? "Dispatch due recipients" : "ارسال مخاطبان موعدرسیده"}
                                </Button>
                                <span className="text-[0.62rem] text-muted-foreground">
                                    {campaign.scheduled_at
                                        ? new Date(campaign.scheduled_at).toLocaleString(locale === "en" ? "en" : "fa-IR")
                                        : locale === "en"
                                          ? "Not scheduled"
                                          : "زمان‌بندی نشده"}
                                </span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-xl border p-6 text-center text-muted-foreground text-xs">
                        {locale === "en" ? "No provider campaign exists yet." : "هنوز کمپین Provider ساخته نشده است."}
                    </div>
                )}
                {verify.isError || dispatch.isError ? (
                    <div className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-danger text-xs">
                        {locale === "en"
                            ? "Provider gate rejected the operation. The campaign was not reported as delivered."
                            : "گیت Provider عملیات را رد کرد؛ کمپین به‌عنوان Delivered ثبت نشد."}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
