from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


service_path = Path("apps/api/app/services/seo/search_engines.ts")
service = service_path.read_text()

service = replace_once(
    service,
    '''    const rows = await braveKeywordSeeds(keywordLimit);

    let checked = 0;''',
    '''    const rows = await braveKeywordSeeds(keywordLimit);

    /** A newly configured Brave connector may not have tracked keywords yet. */
    if (rows.length === 0) {
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", `site:${targetHost}`);
        url.searchParams.set("count", "1");
        url.searchParams.set("country", country);
        url.searchParams.set("search_lang", searchLang);
        await jsonRequest(url.toString(), {
            headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        });
        return {
            mode: "credential_probe",
            checked: 0,
            found: 0,
            target_host: targetHost,
            note: "Brave API credentials were verified; add tracked keywords before rank probing.",
        };
    }

    let checked = 0;''',
    "brave credential probe",
)

service = replace_once(
    service,
    '''    const result = await textRequest(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: `${siteUrl}/`,
    });
    return { mode: "url_submission", submitted: 1, status_code: result.status, target: "baidu" };''',
    '''    const result = await textRequest(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: `${siteUrl}/`,
    });
    let payload: { success?: number; remain?: number; not_same_site?: string[]; not_valid?: string[] };
    try {
        payload = JSON.parse(result.body) as typeof payload;
    } catch {
        throw new Error("Baidu URL submission returned a non-JSON response");
    }
    const success = numberValue(payload.success) ?? 0;
    if (success < 1) {
        const rejected = [...(payload.not_same_site ?? []), ...(payload.not_valid ?? [])].length;
        throw new Error(`Baidu accepted zero URLs${rejected ? `; rejected=${rejected}` : ""}`);
    }
    return {
        mode: "url_submission",
        submitted: success,
        remain: numberValue(payload.remain),
        status_code: result.status,
        target: "baidu",
    };''',
    "baidu accepted-count verification",
)

service = replace_once(
    service,
    '''async function submitIndexNowTarget(configuration: JsonObject, key: string, endpoint: string, target: string) {
    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;
    const payload = {
        host: siteHostname,
        key,
        keyLocation,
        urlList: [`${siteUrl}/`],
    };
    const response = await textRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
    });
    return { mode: "indexnow_submission", submitted: 1, status_code: response.status, target };
}''',
    '''async function submitIndexNowTarget(configuration: JsonObject, key: string, endpoint: string, target: string) {
    if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
        throw new Error("IndexNow key must be 8-128 letters, digits, or hyphens");
    }
    const siteUrl = await resolveSiteUrl(configuration);
    const siteHostname = hostname(siteUrl);
    const keyLocation = stringValue(configuration.key_location) ?? `${siteUrl}/${key}.txt`;

    /** Fail before submission when the public proof file cannot validate this key. */
    const proof = await textRequest(keyLocation);
    if (proof.body.replace(/^\\uFEFF/, "").trim() !== key) {
        throw new Error("IndexNow key file does not exactly match the configured runtime key");
    }

    const payload = {
        host: siteHostname,
        key,
        keyLocation,
        urlList: [`${siteUrl}/`],
    };
    const response = await textRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
    });
    return {
        mode: "indexnow_submission",
        submitted: 1,
        status_code: response.status,
        target,
        verification_pending: response.status === 202,
    };
}''',
    "indexnow key proof and pending status",
)

service = replace_once(
    service,
    '''        const current = await findIntegration(input.provider);
        const configuration = input.configuration ?? (current ? asJson(current.configuration) : {});
        const credentialEnvRef =''',
    '''        const current = await findIntegration(input.provider);
        const rawConfiguration = input.configuration ?? (current ? asJson(current.configuration) : {});
        const { last_sync_evidence: _previousEvidence, ...configuration } = rawConfiguration;
        const credentialEnvRef =''',
    "drop stale sync evidence",
)

service = replace_once(
    service,
    '''            const evidence = await runSync(input.provider, configuration, secret);
            const syncedAt = DateTime.utc().toISO();
            await persistIntegration({
                provider: input.provider,
                status: "connected",
                configuration: { ...configuration, last_sync_evidence: evidence },
                credentialEnvRef,
                lastSyncedAt: syncedAt,
                lastError: null,
            });''',
    '''            const evidence = await runSync(input.provider, configuration, secret);
            const verificationPending =
                Boolean(evidence) &&
                typeof evidence === "object" &&
                "verification_pending" in evidence &&
                evidence.verification_pending === true;
            const syncedAt = DateTime.utc().toISO();
            await persistIntegration({
                provider: input.provider,
                status: verificationPending ? "configured" : "connected",
                configuration: { ...configuration, last_sync_evidence: evidence },
                credentialEnvRef,
                lastSyncedAt: verificationPending ? (current ? iso(current.last_synced_at) : null) : syncedAt,
                lastError: null,
            });''',
    "verified connection state",
)

service = replace_once(
    service,
    '''        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await persistIntegration({
                provider: input.provider,
                status: "error",
                configuration,
                credentialEnvRef,
                lastSyncedAt: current ? iso(current.last_synced_at) : null,
                lastError: message.slice(0, 2_000),
            });
        }''',
    '''        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const safeMessage = message.split(secret).join("[REDACTED]");
            await persistIntegration({
                provider: input.provider,
                status: "error",
                configuration,
                credentialEnvRef,
                lastSyncedAt: current ? iso(current.last_synced_at) : null,
                lastError: safeMessage.slice(0, 2_000),
            });
        }''',
    "secret redaction",
)

service_path.write_text(service)

ui_path = Path("apps/admin/src/features/seo/workspace.tsx")
ui = ui_path.read_text()
ui = replace_once(
    ui,
    '''                <CardDescription>
                    برای سرویس‌هایی که Token می‌خواهند فقط نام متغیر محیطی ذخیره می‌شود، نه مقدار Secret.
                </CardDescription>''',
    '''                <CardDescription>
                    هفت موتور واقعی فقط پس از پاسخ موفق سرویس مبدا «متصل» می‌شوند؛ Secret ذخیره نمی‌شود و فقط نام متغیر
                    محیطی نگه‌داری می‌شود.
                </CardDescription>''',
    "integration truth description",
)
ui = replace_once(
    ui,
    '<p className="font-medium text-sm">{providerLabel(item.provider)}</p>',
    '<p className="font-medium text-sm">{item.label ?? providerLabel(item.provider)}</p>',
    "provider label",
)
ui = replace_once(
    ui,
    '''            <Input
                dir="ltr"
                className="mt-3 h-8 text-xs"
                value={envRef}
                onChange={(event) => setEnvRef(event.target.value)}
                placeholder="ENV_VARIABLE_NAME"
            />
            <Button''',
    '''            {item.capabilities ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.capabilities.native_rank_tracking ? <Badge variant="secondary">رتبه واقعی</Badge> : null}
                    {item.capabilities.webmaster_analytics ? <Badge variant="secondary">داده وبمستر</Badge> : null}
                    {item.capabilities.url_submission ? <Badge variant="secondary">ارسال URL واقعی</Badge> : null}
                    {!item.capabilities.native_rank_tracking ? <Badge variant="outline">بدون رتبه ساختگی</Badge> : null}
                </div>
            ) : null}
            <Input
                dir="ltr"
                className="mt-3 h-8 text-xs"
                value={envRef}
                onChange={(event) => setEnvRef(event.target.value)}
                placeholder="ENV_VARIABLE_NAME"
            />
            {item.last_synced_at ? (
                <p className="mt-2 text-muted-foreground text-xs">
                    آخرین پاسخ موفق: {new Date(item.last_synced_at).toLocaleString("fa-IR")}
                </p>
            ) : null}
            {item.last_error ? (
                <p dir="ltr" className="mt-2 break-words rounded-md bg-danger/10 p-2 text-danger text-xs">
                    {item.last_error}
                </p>
            ) : null}
            <Button''',
    "integration evidence",
)
ui = replace_once(
    ui,
    '''            >
                ثبت پیکربندی
            </Button>''',
    '''            >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                {item.capabilities ? "ذخیره و بررسی اتصال واقعی" : "ثبت پیکربندی"}
            </Button>''',
    "real sync button",
)
ui = replace_once(
    ui,
    '''function ConnectionBadge({ status }: { status: string }) {
    const connected = status === "connected";
    const configured = status === "configured";
    return (
        <Badge
            variant="outline"
            className={
                connected
                    ? "border-success/25 bg-success/10 text-success-foreground"
                    : configured
                      ? "border-info/25 bg-info/10 text-info-foreground"
                      : "text-muted-foreground"
            }
        >
            {connected ? "متصل" : configured ? "پیکربندی‌شده" : status === "disabled" ? "غیرفعال" : "قطع"}
        </Badge>
    );
}''',
    '''function ConnectionBadge({ status }: { status: string }) {
    const connected = status === "connected";
    const configured = status === "configured";
    const failed = status === "error";
    return (
        <Badge
            variant="outline"
            className={
                connected
                    ? "border-success/25 bg-success/10 text-success-foreground"
                    : failed
                      ? "border-danger/25 bg-danger/10 text-danger"
                      : configured
                        ? "border-info/25 bg-info/10 text-info-foreground"
                        : "text-muted-foreground"
            }
        >
            {connected ? "متصل واقعی" : failed ? "خطای اتصال" : configured ? "پیکربندی‌شده" : status === "disabled" ? "غیرفعال" : "قطع"}
        </Badge>
    );
}''',
    "connection badge",
)
ui = replace_once(
    ui,
    '''        google_search_console: "Google Search Console",
        bing_webmaster: "Bing Webmaster",
        indexnow: "IndexNow",''',
    '''        google_search_console: "Google Search Console",
        bing_webmaster: "Microsoft Bing Webmaster",
        yandex_webmaster: "Yandex Webmaster",
        baidu_search_resource: "Baidu Search Resource",
        brave_search: "Brave Search",
        naver_search_advisor: "Naver Search Advisor",
        seznam_indexnow: "Seznam.cz",
        indexnow: "IndexNow",''',
    "provider labels",
)
ui_path.write_text(ui)
