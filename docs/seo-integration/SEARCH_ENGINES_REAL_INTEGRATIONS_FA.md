# یکپارچه‌سازی واقعی ۷ موتور جستجو در Calibra SEO

> وضعیت: پیاده‌سازی اجرایی، بدون داده نمایشی. این سند مرز دقیق «داده رتبه واقعی»، «داده وبمستر» و «ارسال URL» را مشخص می‌کند.

## اصل ضد داده جعلی

Calibra یک Provider را فقط زمانی `connected` ثبت می‌کند که در همان درخواست پیکربندی، یک درخواست واقعی به سرویس رسمی Provider با موفقیت پاسخ بگیرد. ارسال `status: connected` از UI به‌تنهایی هیچ اتصالی ایجاد نمی‌کند.

Secret داخل دیتابیس ذخیره نمی‌شود. فقط نام Environment Variable در `credential_env_ref` ذخیره می‌شود و مقدار Secret در Runtime از `process.env` خوانده می‌شود.

اگر Environment Variable وجود نداشته باشد، وضعیت حداکثر `configured` است. اگر سرویس رسمی خطا برگرداند، وضعیت `error` و `last_error` ثبت می‌شود. `last_synced_at` فقط بعد از درخواست موفق به‌روز می‌شود.

## ۷ موتور واقعی

| موتور | Provider داخلی | منبع واقعی | Rank Tracking | URL Submission | Credential |
|---|---|---|---|---|---|
| Google | `google_search_console` | Search Console API / Search Analytics | بله؛ Average Position | از این Connector خیر | OAuth Access Token |
| Microsoft Bing | `bing_webmaster` | Bing Webmaster API / GetQueryStats | بله؛ AvgImpressionPosition | API رسمی قابلیت Submission دارد | API Key |
| Yandex | `yandex_webmaster` | Yandex Webmaster API / Popular Search Queries | بله؛ AVG_SHOW_POSITION | API/IndexNow قابل پشتیبانی است | OAuth Token |
| Baidu | `baidu_search_resource` | Baidu Search Resource URL Submission | خیر؛ Rank API عمومی معتبر در این Connector ادعا نمی‌شود | بله | Submission Token |
| Brave Search | `brave_search` | Brave Web Search API | بله؛ جایگاه واقعی Domain در پنجره نتایج API | خیر | Subscription Token |
| Naver | `naver_search_advisor` | Naver Search Advisor / IndexNow | خیر؛ Rank جعلی تولید نمی‌شود | بله | IndexNow Key |
| Seznam.cz | `seznam_indexnow` | Seznam IndexNow endpoint | خیر؛ Rank جعلی تولید نمی‌شود | بله | IndexNow Key |

`IndexNow` به‌تنهایی موتور جستجو نیست و در شمارش هفت‌گانه قرار نمی‌گیرد. همین قاعده برای `google_merchant`، `openai_searchbot` و `manual_import` برقرار است.

## رفتار هر Connector

### Google

Endpointهای رسمی استفاده‌شده:

- `GET https://www.googleapis.com/webmasters/v3/sites`
- `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`

اگر `configuration.property` داده نشده باشد، Connector ابتدا Propertyهای واقعی Search Console را می‌خواند، Property تأییدشده منطبق با `seo.base_url` را پیدا می‌کند و سپس Search Analytics را Query می‌کند. Domain Property با فرم `sc-domain:example.com` و URL-prefix Property هر دو پشتیبانی می‌شوند.

`position` یک مقدار Average و اعشاری است. به همین دلیل ستون‌های Position در دیتابیس به `numeric(8,2)` ارتقا یافته‌اند. Search Console همه ردیف‌ها را تضمین نمی‌کند؛ بنابراین داده واردشده به‌عنوان Top Rows سرویس در دوره انتخابی تلقی می‌شود، نه سرشماری کامل همه Queryها.

پیشنهاد Env:

```text
CALIBRA_SEO_GOOGLE_ACCESS_TOKEN
```

### Microsoft Bing

Endpoint رسمی:

```text
GET https://ssl.bing.com/webmaster/api.svc/json/GetQueryStats
```

Connector `Query` و `AvgImpressionPosition` واقعی را می‌خواند. برای هر Query جدیدترین رکورد زمانی نگه داشته و در `seo_keywords` ثبت می‌کند.

پیشنهاد Env:

```text
CALIBRA_SEO_BING_API_KEY
```

### Yandex

Endpointهای رسمی:

- `GET https://api.webmaster.yandex.net/v4/user`
- `GET https://api.webmaster.yandex.net/v4/user/{user-id}/hosts`
- `GET https://api.webmaster.yandex.net/v4/user/{user-id}/hosts/{host-id}/search-queries/popular`

اگر `user_id` و `host_id` به‌صورت دستی داده نشده باشند، Connector آن‌ها را از API رسمی کشف می‌کند و Host تأییدشده منطبق با `seo.base_url` را انتخاب می‌کند. مقدار `AVG_SHOW_POSITION` ذخیره می‌شود.

پیشنهاد Env:

```text
CALIBRA_SEO_YANDEX_OAUTH_TOKEN
```

### Baidu

Endpoint رسمی URL Submission:

```text
POST http://data.zz.baidu.com/urls?site={host}&token={token}
Content-Type: text/plain
```

این Connector عمداً Rank تولید نمی‌کند. موفقیت فقط یعنی سرویس رسمی Baidu درخواست URL را پذیرفته است؛ پذیرش URL معادل تضمین Index یا Rank نیست.

پیشنهاد Env:

```text
CALIBRA_SEO_BAIDU_SUBMISSION_TOKEN
```

### Brave Search

Endpoint رسمی:

```text
GET https://api.search.brave.com/res/v1/web/search
X-Subscription-Token: ...
```

Brave Webmaster Search Console عمومی مشابه Google/Bing ندارد، اما API رسمی نتایج Search دارد. Connector عبارت‌های موجود در `seo_keywords` را با API رسمی Search می‌کند و فقط اگر Domain فروشگاه واقعاً در پنجره نتایج بررسی‌شده پیدا شود Position ثبت می‌کند.

اگر Domain پیدا نشود، عدد ساختگی مانند `100+` یا `0` ذخیره نمی‌شود. نتیجه «پیدا نشد در پنجره بررسی‌شده» باقی می‌ماند.

پیشنهاد Env:

```text
CALIBRA_SEO_BRAVE_SUBSCRIPTION_TOKEN
```

### Naver

Endpoint رسمی IndexNow:

```text
POST https://searchadvisor.naver.com/indexnow
```

Connector یک درخواست واقعی IndexNow ارسال می‌کند. Key باید طبق قواعد Naver روی Domain قابل تأیید باشد. HTTP 200/202 موفق تلقی می‌شود؛ خطاهای 400/403/422/429/5xx اتصال را موفق نشان نمی‌دهند.

پیشنهاد Env:

```text
CALIBRA_SEO_NAVER_INDEXNOW_KEY
```

### Seznam.cz

Endpoint مشارکت‌کننده رسمی IndexNow:

```text
POST https://search.seznam.cz/indexnow
```

Connector یک درخواست واقعی به endpoint خود Seznam می‌فرستد. این عمل URL را برای Discovery/Refresh معرفی می‌کند و تضمین Index یا Rank نیست.

پیشنهاد Env:

```text
CALIBRA_SEO_SEZNAM_INDEXNOW_KEY
```

## State Machine اتصال

```text
disconnected
  └─ credential_env_ref ثبت شده ولی Secret Runtime نیست → configured
       └─ Secret موجود + درخواست رسمی موفق → connected
       └─ Secret موجود + درخواست رسمی ناموفق → error
connected
  └─ درخواست بعدی ناموفق → error
هر وضعیت
  └─ disable صریح → disabled
```

هیچ مسیر UI یا API اجازه ندارد بدون پاسخ واقعی Provider، `connected` را نهایی کند.

## داده Rank

فیلدهای `current_position`، `previous_position` و `best_position` اعشاری هستند تا Average Position سرویس‌هایی مانند Google و Yandex بدون گرد کردن مخرب ذخیره شود.

`source` مشخص می‌کند Observation از کجا آمده است، از جمله:

- `google_search_console`
- `bing_webmaster`
- `yandex_webmaster`
- `brave_search`
- `manual`

برای Baidu/Naver/Seznam Rank Observation ساخته نمی‌شود چون Connector فعلی منبع Rank رسمی قابل اتکایی برای آن‌ها ندارد.

## شواهد Sync

پس از Sync موفق، `configuration.last_sync_evidence` فقط Metadata غیرحساس نتیجه را نگه می‌دارد؛ مانند تعداد Queryهای Import شده، Property/Host انتخاب‌شده، نوع عملیات یا تعداد URLهای ارسال‌شده. Secret، Token و API Key در Evidence ذخیره نمی‌شوند.

## نکات عملیاتی

1. ابتدا `seo.base_url` را روی URL واقعی Storefront تنظیم کنید.
2. Secret هر Provider را به Environment Runtime API اضافه کنید.
3. در SEO Settings فقط نام Environment Variable را در کارت همان Provider ثبت کنید.
4. ثبت پیکربندی در موتورهای هفت‌گانه، همان لحظه درخواست واقعی Provider را اجرا می‌کند.
5. `connected` را فقط وقتی معتبر بدانید که `last_synced_at` موجود و `last_error` خالی باشد.
6. نرخ Sync را متناسب با Quota سرویس‌ها تنظیم کنید؛ Brave به‌ازای Query درخواست Search واقعی مصرف می‌کند.
7. IndexNow/URL Submission فقط Discovery را سریع‌تر می‌کند و نباید به‌عنوان تضمین Indexing یا Ranking گزارش شود.

## تست و کنترل کیفیت

- Registry باید دقیقاً ۷ Engine یکتا داشته باشد.
- Utility Providerها نباید در شمارش Engineها قرار بگیرند.
- فقط Google/Bing/Yandex/Brave دارای `native_rank_tracking=true` هستند.
- Baidu/Naver/Seznam نباید Rank ساختگی بسازند.
- وضعیت `connected` فقط از مسیر Request موفق Provider ایجاد می‌شود.
- CI باید migration، TypeScript، Unit Tests و کل API suite را پاس کند.
