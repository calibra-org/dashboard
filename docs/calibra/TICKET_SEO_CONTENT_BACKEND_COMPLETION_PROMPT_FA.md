# پرامپت اجرایی تکمیل Backend تیکت، SEO و Content/News کالیبرا

## مأموریت

روی `calibra-org/dashboard` فقط کمبودهای اثبات‌شده سه سامانه Ticket، SEO و Content/News را تکمیل کن. پیاده‌سازی‌های موجود دوباره ساخته نشوند. هر قابلیت باید تا حد ممکن زنجیره واقعی `Admin/Web → API → Vine validation → auth/admin/public boundary → service/domain → PostgreSQL → tenant/RLS → audit/concurrency/idempotency → OpenAPI/SDK → tests` را داشته باشد.

## قواعد قطعی

- `main` مستقیم تغییر نکند؛ کار روی branch مستقل انجام شود.
- هیچ dependency جدیدی بدون تأیید صریح کاربر اضافه نشود.
- هیچ Mock KPI، fake rank، fake crawler status، fake connected state، fake campaign delivery یا fake channel health ساخته نشود.
- RLS خاموش نشود. تمام جدول‌های tenant-aware باید `ENABLE` و `FORCE ROW LEVEL SECURITY` و policy tenant isolation داشته باشند.
- secret/token/provider credential در DB plaintext یا response مرورگر قرار نگیرد؛ فقط env/secret reference نگهداری شود.
- تمام mutationهای حساس version-guarded، transactional، auditable و در صورت امکان idempotent باشند.
- money فقط minor unit.
- OpenAPI منبع contract و SDK generated surface همگام باشد.
- migrationهای قبلی ویرایش نشوند؛ migration افزایشی جدید ساخته شود.
- External provider adapter فقط وقتی connected/healthy اعلام شود که evidence واقعی از provider وجود داشته باشد.

## Ticket — کمبودهای لازم

هسته موجود Queue/Detail/Settings/Reply/Internal Note/SLA/RLS/Version Guard حفظ شود و این قابلیت‌ها افزایشی شوند:

1. Saved Views برای Unified Inbox با filter/sort payload معتبر و tenant ownership.
2. Bulk Operations روی مجموعه ticket idها با row locking، per-row version guard، نتیجه partial-safe و audit trail.
3. Attachment metadata برای message/ticket با اتصال به media موجود، filename/mime/size/checksum، scan status و expiring-download readiness؛ فایل آلوده یا `pending` قابل public delivery نباشد.
4. Duplicate merge: source ticket به target ticket لینک شود، merge loop/cross-tenant/self-merge ممنوع، source immutable/closed شود و event ثبت گردد.
5. Agent presence/capacity snapshot بدون ادعای realtime جعلی؛ heartbeat TTL و capacity limit واقعی.
6. Channel registry برای `web,email,phone,api,whatsapp,telegram,instagram,rubika,bale,eitaa,sms` با status truthful (`disabled/configured/connected/error`) و credential env ref؛ adapter وجود داشتن مساوی connected بودن نیست.
7. Campaign domain: draft/scheduled/running/paused/completed/cancelled، recipient dedupe، opt-out، quiet-hours policy، template status، cost estimate minor units و delivery ledger؛ ارسال واقعی فقط از adapter verified.
8. Support reports: backlog, SLA, first-response, resolution, reopen/FCR proxy, CSAT only from persisted survey responses, per-assignee workload.
9. Routing rules و automation rules با priority/order، conditions/actions JSON validated، enabled flag، dry-run preview و audit.
10. Public support portal: create ticket و token-based tracking با opaque hashed token، rate limit، no admin/internal-note leakage و attachment safe-download boundary.
11. Workflow status catalog قابل توسعه باشد؛ پنج status فعلی شکسته نشوند و statusهای UI مرجع بدون migration ساختاری بعدی قابل تعریف باشند.

## SEO — کمبودهای لازم

۱۶ route فعلی حفظ شوند. هفت search-engine integration فعلی دوباره ساخته نشود. موارد زیر اضافه شوند:

1. Bulk media SEO operations روی media موجود: set/clear ALT، AI suggestion فقط به‌صورت suggestion و نیازمند approval، validation و audit؛ media source-of-truth تکراری ساخته نشود.
2. Crawl runs + crawl queue + crawl observations واقعی: URL, status code, content type, canonical, robots/indexability evidence, response timing, fetched_at و error evidence. Crawl بدون fetch واقعی نباید success ثبت شود.
3. Action queue برای SEO تغییرات: proposed → approved/rejected → applied/failed/rolled_back؛ payload before/after و expected version نگهداری شود.
4. Rollback فقط وقتی current state هنوز با applied payload سازگار است؛ conflict باید 409 بدهد.
5. Content Refresh از SEO باید revision واقعی Content OS بسازد/به workflow review بفرستد، نه مستقیم محتوای منتشرشده را بی‌صدا overwrite کند.
6. Reports export job metadata برای CSV/JSON و audit؛ export داده موجود است نه synthetic.
7. SEO metadata authority روشن شود: Content Post fields و SEO profile با resolver واحد خوانده شوند؛ live editor روی profile authoritative بنویسد و public builder همان resolver را مصرف کند.

## Content / News — کمبودهای لازم

Content OS موجود حفظ و گسترش یابد:

1. News به‌عنوان subtype واقعی `content_posts.type=news` باقی بماند ولی Admin API dedicated filters/summary برای News داشته باشد.
2. Public `/api/v1/content/news` و `/api/v1/content/news/:slug` فقط published/indexable news را expose کنند.
3. Storefront News surface بتواند از endpoint مستقل استفاده کند؛ redirect قدیمی `/news → /mag` بعداً در UI phase قابل حذف است.
4. News sitemap/SEO builder از همان canonical/indexability authority استفاده کند.
5. Scheduler observability: publish/ingest due run ledger با started/finished/status/count/error و lock/idempotency؛ command موجود به ledger متصل شود.
6. Revision/restore و review workflow موجود حفظ شود؛ هیچ publish مستقیم بدون transition rule.

## تست و Definition of Done

- Unit/domain tests برای validation, status transition, merge loop, opt-out/quiet-hours, crawl evidence, rollback conflict, resolver authority.
- Functional tests برای auth/admin/RLS/cross-tenant/public token boundary, concurrency/version conflict, rate limit و public data redaction.
- migration up/down smoke و constraint coverage.
- OpenAPI drift و SDK generation gate.
- `pnpm lint`, `pnpm typecheck`, relevant tests, build و verifierهای موجود/جدید اجرا شوند. هر gate اجرا نشده `PENDING` است نه PASS.
- هیچ ادعای production-ready یا 99/100 بدون evidence واقعی ارائه نشود.
