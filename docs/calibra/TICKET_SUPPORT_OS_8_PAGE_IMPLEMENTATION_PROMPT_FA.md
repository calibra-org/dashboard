# Master Prompt — Calibra Ticket Support OS / 8-Page Expansion

## مأموریت

بخش Tickets در `calibra-org/dashboard` را از Ticket Operations Center موجود به یک Support OS حرفه‌ای، واقعی و قابل‌ممیزی گسترش بده. مرجع بصری ۳۶ اسکرین‌شات Lolit است، اما خروجی Calibra باید از نظر معماری، صداقت داده، امنیت، دسترس‌پذیری و عملیات روزمره از مرجع کامل‌تر باشد.

هدف، کپی کور UI نیست. هر قابلیت قابل‌کلیک باید تا جای ممکن زنجیره واقعی زیر را داشته باشد:

`Admin UI → same-origin API/BFF → validation → authorization → domain service → PostgreSQL → tenant/RLS → version/audit/rate-limit → error/loading/empty → tests`

## اصل صفر — کار تکراری ممنوع

قبل از هر تغییر:

1. `AGENTS.md` ریشه، `apps/admin/AGENTS.md` و `apps/api/AGENTS.md` را بخوان.
2. آخرین `main`، branch و PR فعال را بررسی کن.
3. Ticket Operations Center موجود را inventory کن.
4. قابلیت‌های موجود را فقط extend کن؛ implementation موازی نساز.
5. root prototype یا screenshot را source-of-truth production تلقی نکن.

قابلیت‌های از قبل موجود که نباید بازسازی شوند: queue/detail/settings پایه، SLA، assignment، version guards، RLS، audit، rate limiting، realtime، OpenAPI/SDK overlay و پاسخ/یادداشت داخلی.

## معماری دقیق ۸ صفحه

فقط این هشت آیتم first-class زیر Tickets در Sidebar قرار می‌گیرند:

1. `/tickets/overview` — داشبورد پشتیبانی
2. `/tickets/create` — ثبت تیکت مشتری/داخلی
3. `/tickets/inbox` — صندوق یکپارچه
4. `/tickets/internal` — گفت‌وگو و هماهنگی داخلی
5. `/tickets/channels` — پیام‌رسان‌ها و کانال‌ها
6. `/tickets/campaigns` — کمپین پیام
7. `/tickets/reports` — گزارش‌های پشتیبانی
8. `/tickets/settings` — تنظیمات، SLA، Routing و Automation

جزئیات تیکت زیر `/tickets/inbox/[id]` است و آیتم نهم Sidebar محسوب نمی‌شود. `/tickets` به overview و `/tickets/[id]` به مسیر detail جدید هدایت شود.

## نگاشت مرجع تصویری به قابلیت واقعی

### 1) Overview
- KPI واقعی: active، waiting customer، resolved 30d، avg first response، persisted CSAT.
- نمودار ۳۰ روزه opened/resolved از داده ذخیره‌شده.
- آخرین تیکت‌ها، حضور کارشناسان با heartbeat، وضعیت کانال‌ها، خلاصه کمپین‌ها و هشدار SLA.
- metric جعلی ممنوع؛ نبود evidence با `—` یا empty state نمایش داده شود.

### 2) Create
- حالت customer/internal.
- جست‌وجوی مشتری، اطلاعات تماس، موضوع، دسته/دپارتمان، اولویت، کانال، مسئول، tags، متن و Media attachment.
- تیکت داخلی فعلاً بر پایه Ticket core + `internal` tag پیاده شود؛ تا وقتی domain جداگانه وجود ندارد، UI ادعای مدل مستقل نکند.

### 3) Inbox
- فیلتر search/status/priority/channel/SLA.
- شمارنده‌های واقعی، جدول dense، pagination و جزئیات nested.
- Saved Views واقعی.
- Bulk Operations با `{id, expected_version}` و partial-safe result.
- CSV فقط با دامنه‌ای که واقعاً export شده برچسب بخورد.

### 4) Internal
- از Ticket core و `internal_note` واقعی استفاده کن.
- حضور تیم از heartbeat.
- تیکت‌های داخلی از tag/domain واقعی استخراج شوند.
- checklist/pin/thread مستقل را تا وجود storage واقعی جعل نکن.

### 5) Channels
- registry کانال‌ها: web/email/phone/api/whatsapp/telegram/instagram/rubika/bale/eitaa/sms.
- status فقط: `disabled/configured/connected/error`.
- adapter/configured بودن ≠ connected بودن.
- credential فقط env-ref؛ plaintext secret هرگز به browser برنگردد.

### 6) Campaigns
- lifecycle: draft/scheduled/running/paused/completed/cancelled.
- template review، recipient dedupe، opt-out، quiet hours، estimated cost minor units و delivery ledger.
- `scheduled_at` به‌تنهایی campaign را scheduled نکند؛ explicit transition بعد از template approval و verified connected channel.
- نرخ conversion/response فقط در صورت evidence واقعی.

### 7) Reports
- backlog by priority، SLA breaches، avg response/resolution، reopened tickets، persisted CSAT، assignee workload، status/channel distribution.
- FCR فقط به‌عنوان proxy قابل‌تعریف و قابل‌ردیابی از persisted status events؛ تعریف دقیق در UI نمایش داده شود.

### 8) Settings
- response policy و defaults.
- workflow status catalog قابل‌گسترش.
- routing rules و automation rules با validated JSON + version guards.
- agent presence/capacity با heartbeat واقعی.
- channel posture و security/governance boundary.
- toggle نمایشی برای قابلیتی که backend ندارد نساز.

## Design System

- Admin design language فعلی Calibra حفظ شود؛ shadcn/ui + Tailwind v4 + semantic tokens.
- فارسی پیش‌فرض، RTL واقعی، logical utilities.
- صفحه‌ها data-dense ولی تنفس‌دار، کارت‌های ظریف، hierarchy مشخص، micro-state دقیق و responsive باشند.
- رنگ hardcode نشود؛ tokenهای `primary/success/warning/danger/info/muted` استفاده شوند.
- Skeleton، retry-able error، empty state و disabled/pending state الزامی.
- accessibility: label، keyboard path و semantic markup معتبر.

## Backend و امنیت

- migration فقط additive؛ migration اجراشده را edit نکن.
- RLS/tenant policy برای هر جدول tenant جدید اجباری و forced باشد.
- version guard روی mutationهای concurrent.
- audit برای action حساس.
- mutation rate limit و admin authorization حفظ شود.
- attachment metadata شامل mime/size/checksum/scan state؛ infected/pending را قابل‌تحویل عمومی جا نزن.
- duplicate merge باید self/cross-tenant/loop را رد کند.
- public support token opaque + hashed باشد و internal note نشت نکند.

## OpenAPI / SDK

- OpenAPI منبع contract است.
- تغییر enum/request/response باید در spec ثبت شود.
- `@calibra/sdk` با codegen بازتولید شود؛ generated file را دستی patch نکن.
- route/spec drift باید قبل merge تعیین تکلیف شود.

## مرحله‌بندی اجرای امن

### Wave A — Gap Matrix
اسکرین‌شات‌ها را با current Ticket implementation مقایسه کن و هر item را `existing / extend / missing / intentionally-not-faked` برچسب بزن.

### Wave B — 8-page shell
Routeها، Sidebar و page composition را بساز؛ `/tickets` compatibility را حفظ کن.

### Wave C — Operations UI wiring
Saved Views، Bulk، attachments، merge، presence، channels، campaigns، reports، routing/automation را به APIهای موجود وصل کن.

### Wave D — Backend gaps only
فقط gapهای واقعی backend را اضافه کن؛ parallel domain نساز.

### Wave E — Detail hardening
Attachment evidence، merge UI، timeline، SLA، controls و customer context را کامل کن.

### Wave F — Verification
به‌ترتیب:
1. format/Biome
2. lint
3. typecheck
4. build
5. ticket verifier
6. API functional tests
7. frontend tests
8. migrations
9. OpenAPI build/drift
10. SDK codegen drift
11. E2E/runtime smoke
12. visual QA در runtime واقعی
13. `git diff --check`

Gate اجرا نشده = `PENDING`. Gate شکست‌خورده = `FAIL`. runner/billing failure با code failure یکی نیست.

### Wave G — Git delivery
- commitهای Conventional Commit با scope package.
- branch را push کن.
- CI واقعی را بخوان و failureهای مربوط را اصلاح کن.
- فقط وقتی merge-readiness واقعی برقرار است PR را از draft خارج/merge کن؛ در غیر این صورت blocker دقیق را گزارش کن.

## تعریف Done

Done یعنی:
- دقیقاً ۸ زیرصفحه Tickets در Sidebar.
- detail nested و legacy redirects سالم.
- هیچ KPI/connected state/delivery state جعلی وجود ندارد.
- frontend و backend برای gapهای واقعی به هم متصل‌اند.
- امنیت tenant/RLS/version/audit/rate-limit حفظ شده.
- OpenAPI/SDK sync است.
- تست‌های دامنه و functional برای قابلیت‌های جدید وجود دارد.
- visual/runtime QA انجام شده یا صریحاً PENDING ثبت شده.
- PR فقط با evidence معتبر merge می‌شود.
