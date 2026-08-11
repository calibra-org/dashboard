# یکپارچه‌سازی واقعی ۷ موتور جستجو در Calibra SEO

> وضعیت: پیاده‌سازی اجرایی با مرزبندی صریح قابلیت‌ها. هیچ موتور جستجویی صرفاً برای نمایش «متصل» نمی‌شود و هیچ رتبه‌ای برای موتوری که منبع Rank معتبر ندارد ساخته نمی‌شود.

## تعریف «واقعی» در این ماژول

برای هفت موتور جستجو سه نوع قابلیت از هم جدا شده است:

1. **Webmaster average position**: داده Position مستقیماً از API رسمی ابزار وبمستر موتور جستجو می‌آید.
2. **API SERP observation**: جایگاه Domain از ترتیب واقعی نتایج API رسمی Search مشاهده می‌شود؛ این مقدار معادل معیار Webmaster نیست.
3. **URL submission**: URL واقعاً به Endpoint رسمی موتور ارسال می‌شود، اما این عملیات Rank یا Index شدن را تضمین نمی‌کند.

`connected` فقط بعد از پاسخ موفق و قابل‌اعتبار Provider ثبت می‌شود. مقدار `status: connected` که Client بفرستد نادیده گرفته می‌شود.

Secret در دیتابیس ذخیره نمی‌شود. دیتابیس فقط نام Environment Variable را در `credential_env_ref` نگه می‌دارد و Secret در Runtime از `process.env` خوانده می‌شود. خطاهای Provider با حذف Secret در `last_error` ذخیره می‌شوند.

## ماتریس هفت موتور

| موتور | Provider داخلی | Rank/Position واقعی در Calibra | Analytics | Submission در این Connector | Credential |
|---|---|---|---|---|---|
| Google | `google_search_console` | `webmaster_average` از Search Console | بله | خیر | OAuth access token یا JSON refresh bundle |
| Microsoft Bing | `bing_webmaster` | `webmaster_average` از Webmaster API | بله | خیر | API Key |
| Yandex | `yandex_webmaster` | `webmaster_average` از Webmaster API | بله | خیر | OAuth Token |
| Baidu | `baidu_search_resource` | ندارد | خیر | بله؛ URL submission | Submission Token |
| Brave Search | `brave_search` | `api_serp_observation` از Web Search API | خیر | خیر | Subscription Token |
| Naver | `naver_search_advisor` | ندارد | خیر | بله؛ IndexNow | IndexNow Key |
| Seznam.cz | `seznam_indexnow` | ندارد | خیر | بله؛ IndexNow | IndexNow Key |

`IndexNow` عمومی، `google_merchant`، `openai_searchbot` و `manual_import` ابزار/Integration هستند و در شمارش «۷ موتور» قرار نمی‌گیرند.

## Google Search Console

Connector از API رسمی Search Console استفاده می‌کند:

- لیست Propertyهای قابل دسترسی را می‌خواند.
- اگر `configuration.property` مشخص نشده باشد، Property تأییدشده منطبق با `seo.base_url` را پیدا می‌کند؛ URL-prefix و `sc-domain:` هر دو پشتیبانی می‌شوند.
- Search Analytics را با ابعاد `query`, `device`, `country` و بازه تاریخ بر اساس Pacific Time می‌خواند.
- `position` را به‌عنوان **Average Position** اعشاری ذخیره می‌کند.
- Country سه‌حرفی Provider حفظ می‌شود؛ Device نیز در صورت وجود Provider حفظ می‌شود.
- داده Search Analytics الزاماً سرشماری همه Queryها نیست و Connector آن را به‌عنوان Top Rows دوره انتخابی گزارش می‌کند.

### Credential

دو شکل Runtime پشتیبانی می‌شود:

- مقدار Env یک OAuth Access Token آماده باشد؛ یا
- مقدار Env یک JSON شامل `client_id`, `client_secret`, `refresh_token` باشد. در این حالت API در Runtime با OAuth Token Endpoint یک Access Token تازه می‌گیرد.

نمونه نام Env:

```text
CALIBRA_SEO_GOOGLE_CREDENTIAL
```

نمونه شکل مقدار JSON، بدون Secret واقعی:

```json
{"client_id":"...","client_secret":"...","refresh_token":"..."}
```

## Microsoft Bing Webmaster

Connector از `GetQueryStats` در Bing Webmaster API استفاده می‌کند و `Query` و `AvgImpressionPosition` واقعی را می‌خواند. برای یک Query، جدیدترین رکورد زمانی Provider انتخاب می‌شود.

چون این Endpoint Dimension دستگاه را در این مسیر به Calibra تحویل نمی‌دهد، رکورد واردشده با `device=all` ثبت می‌شود؛ به‌جای اینکه به‌اشتباه Desktop فرض شود.

نمونه Env:

```text
CALIBRA_SEO_BING_API_KEY
```

## Yandex Webmaster

Connector:

- در صورت نبود `user_id` آن را از API رسمی کاربر کشف می‌کند.
- در صورت نبود `host_id` Hostهای Webmaster را می‌خواند و Host تأییدشده منطبق با `seo.base_url` را انتخاب می‌کند.
- Popular Search Queries را می‌خواند.
- `AVG_SHOW_POSITION` را به‌صورت اعشاری ذخیره می‌کند.
- چون درخواست فعلی با `device_type_indicator=ALL` اجرا می‌شود، داده با `device=all` ذخیره می‌شود.

نمونه Env:

```text
CALIBRA_SEO_YANDEX_OAUTH_TOKEN
```

## Brave Search

Brave در این معماری به‌عنوان Search Console معرفی نشده است. Connector از **Web Search API رسمی Brave** استفاده می‌کند:

- عبارت‌های Track‌شده را Search می‌کند.
- نتایج واقعی API را به‌ترتیب بررسی می‌کند.
- فقط اگر Host فروشگاه واقعاً در پنجره نتایج بررسی‌شده وجود داشته باشد Position ثبت می‌کند.
- اگر Host پیدا نشود عدد ساختگی مانند `0` یا `100+` ذخیره نمی‌شود.
- اگر هنوز Keyword برای Track وجود نداشته باشد، یک Query واقعی `site:domain` برای اعتبارسنجی Credential اجرا می‌شود و هیچ Rank ساخته نمی‌شود.

Position Brave از نوع `api_serp_observation` است و نباید با Average Position سرویس‌های Webmaster مقایسه مستقیم شود.

نمونه Env:

```text
CALIBRA_SEO_BRAVE_SUBSCRIPTION_TOKEN
```

## Baidu Search Resource

Connector درخواست واقعی URL Submission را به سرویس Baidu می‌فرستد و صرفاً HTTP 200 را کافی نمی‌داند؛ Response JSON را Parse می‌کند و `success >= 1` را برای موفقیت لازم می‌داند.

اگر Baidu صفر URL بپذیرد وضعیت `connected` ثبت نمی‌شود. Submission صرفاً Discovery/Crawl را تسریع می‌کند و تضمین Index یا Rank نیست.

نمونه Env:

```text
CALIBRA_SEO_BAIDU_SUBMISSION_TOKEN
```

## Naver Search Advisor / IndexNow

Connector از Endpoint رسمی Naver IndexNow استفاده می‌کند.

قبل از Submission:

- Key باید ۸ تا ۱۲۸ کاراکتر و مطابق قاعده Naver از حروف Hex، عدد و `-` باشد.
- `keyLocation` عمومی Fetch می‌شود و برای جلوگیری از SSRF/Scope اشتباه باید روی همان Host و در Root سایت باشد.
- محتوای فایل باید دقیقاً برابر Key Runtime باشد.

بعد از Submission:

- HTTP 200 => پاسخ موفق Provider و امکان `connected`.
- HTTP 202 => درخواست دریافت شده اما Validation Key هنوز Pending است؛ Calibra وضعیت را `configured` نگه می‌دارد، نه `connected`.
- 4xx/5xx => `error` با `last_error` قابل مشاهده.

در UI می‌توان `configuration.key_location` را تنظیم کرد. خود Calibra فایل Proof را به‌صورت جادویی ایجاد نمی‌کند؛ فایل باید روی Host واقعی فروشگاه در URL عمومی تعیین‌شده وجود داشته باشد.

نمونه Env:

```text
CALIBRA_SEO_NAVER_INDEXNOW_KEY
```

## Seznam.cz / IndexNow

Connector درخواست واقعی را به Endpoint اختصاصی Seznam.cz می‌فرستد. همان Proof File عمومی و State Machine مربوط به 200/202 اعمال می‌شود.

Seznam نیز از این Connector Rank دریافت نمی‌کند؛ فقط URL Submission واقعی دارد. Submission به IndexNow تضمین Index شدن نیست.

نمونه Env:

```text
CALIBRA_SEO_SEZNAM_INDEXNOW_KEY
```

## State Machine اتصال

```text
disconnected
  ├─ نام Env ثبت نشده → disconnected
  └─ نام Env ثبت شده ولی Secret در Runtime نیست → configured

configured / connected / error
  ├─ Provider request + verification موفق → connected
  ├─ Provider response = IndexNow 202 → configured (validation pending)
  └─ Provider request/validation ناموفق → error

هر وضعیت
  └─ disable صریح → disabled
```

`last_synced_at` فقط پس از Verification موفق به‌روز می‌شود. Evidence غیرحساس آخرین Sync در `configuration.last_sync_evidence` ثبت می‌شود و Secret داخل Evidence قرار نمی‌گیرد.

## مدل داده Rank

فیلدهای زیر `numeric(8,2)` هستند تا Average Position Providerها بدون گرد کردن مخرب ذخیره شود:

- `current_position`
- `previous_position`
- `best_position`

`country` تا سه کاراکتر نگه‌داری می‌شود تا Country Codeهای Search Console جا شوند.

Deviceهای معتبر:

- `all`
- `desktop`
- `mobile`
- `tablet`

برای Bing/Yandex که داده فعلی Aggregate است، `all` ثبت می‌شود؛ هیچ داده Aggregate به‌طور مصنوعی Desktop نام‌گذاری نمی‌شود.

APIهای Webmaster فعلی Dimension زبان محتوا ارائه نمی‌کنند؛ Calibra برای Queryهای فارسی/عربی از وجود حروف Unicode فارسی/عربی جهت انتخاب Locale `fa` استفاده می‌کند و بقیه را `en` می‌گذارد. این یک Metadata inference داخلی است، نه ادعای Provider درباره زبان Query.

## همگام‌سازی دوره‌ای

فرمان زیر برای Cron خارجی اضافه شده است:

```text
node ace seo:sync-search-engines
```

این فرمان تمام Tenantها را بررسی می‌کند و فقط Connectorهای Rank/Analytics را Sync می‌کند:

- Google
- Bing
- Yandex
- Brave

Baidu/Naver/Seznam عمداً در Cron Analytics دوباره Submit نمی‌شوند؛ URL Submission باید در اثر تغییر URL/Content انجام شود، نه صرفاً برای اینکه Integration «فعال» به نظر برسد.

این فرمان Scheduler داخلی ایجاد نمی‌کند. زیرساخت Deployment باید آن را با Cadence مناسب، مثلاً روزانه، فراخوانی کند.

## کنترل ضد نمایش الکی

CI مستقل `SEO Engines` و دستور زیر دائماً Invariantهای هفت موتور را بررسی می‌کنند:

```text
pnpm run verify:seo-engines
```

Verifier موارد زیر را Fail می‌کند:

- تعداد موتور غیر از دقیقاً ۷ باشد.
- Utility Providerها به‌عنوان Search Engine شمرده شوند.
- Endpointهای Runtime واقعی حذف شوند.
- Google/Bing/Yandex/Brave Semantics رتبه اشتباه شوند.
- Baidu/Naver/Seznam به‌صورت جعلی Rank Source معرفی شوند.
- Decimal Position یا Country سه‌حرفی از Schema حذف شود.
- UI Evidence/Error یا تفاوت Rank Semantics را پنهان کند.
- Cron Analytics شروع به Re-submit کردن موتورهای Submission-only کند.

Unit Test رجیستری نیز مستقل از Verifier وجود دارد.

## راه‌اندازی عملیاتی

1. `seo.base_url` را روی URL واقعی Storefront همان Tenant قرار دهید.
2. Property/Domain را در سرویس Provider واقعاً Verify کنید.
3. Secret هر Provider را در Environment Runtime API قرار دهید.
4. در کارت Integration فقط **نام** Env Variable را وارد کنید.
5. برای Naver/Seznam فایل Key را در Host عمومی قرار دهید و `key_location` را در صورت نیاز تنظیم کنید.
6. دکمه «ذخیره و بررسی اتصال واقعی» را اجرا کنید.
7. فقط وضعیت `متصل واقعی` همراه با `last_synced_at` را اتصال موفق تلقی کنید.
8. `last_error` را برای خطای Credential، Property، Quota یا Provider بررسی کنید.
9. Cron Rank/Analytics را در زیرساخت Deployment فعال کنید.

## محدودیت Live Verification

کد و CI می‌توانند تضمین کنند که مسیر Runtime واقعی است و Status جعلی ساخته نمی‌شود، اما Live Handshake با Propertyهای واقعی Google/Bing/Yandex/Baidu/Brave/Naver/Seznam فقط زمانی قابل انجام است که Credential و Ownership واقعی همان سایت در Environment Deployment موجود باشد. بدون Credential واقعی، رفتار صحیح Integration باقی‌ماندن در `disconnected/configured/error` است، نه نمایش سبز ساختگی.
