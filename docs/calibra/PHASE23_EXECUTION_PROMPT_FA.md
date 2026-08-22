# پرامپت اجرایی فاز ۲۳ — Commerce Digital Twin & Scenario War Room

فاز ۲۳ را به‌عنوان لایه شبیه‌سازی deterministic و non-mutating روی primitiveهای canonical موجود Calibra پیاده کن؛ نه یک planning engine موازی. ورودی‌ها باید از snapshotهای نسخه‌دار Phase 10 economics، Phase 13 demand/supply planning، Phase 17 experimentation، Phase 18 pricing و Phase 22 orchestration مشتق شوند و هر run با `engine_version`، `seed`، `input_hash`، `assumption_hash` و `source_refs` قابل بازتولید باشد.

## قواعد الزام‌آور
- سناریو هرگز order، inventory، price، payment یا procurement را mutate نکند؛ فقط جداول `commerce_twin_*` خودش را بنویسد.
- tenant isolation با `currentTrx()` و RLS fail-closed روی `app.current_tenant` رعایت شود.
- assumptionها typed و bounded باشند: demand, price, cost, lead-time, capacity, capital, campaign lift و service level.
- هر run immutable snapshot داشته باشد؛ تغییر scenario بعد از run فقط version جدید می‌سازد و run قبلی را بازنویسی نمی‌کند.
- خروجی حداقل revenue، gross margin، contribution proxy، demand P10/P50/P90، stockout risk، working-capital exposure و service-level proxy را داشته باشد.
- uncertainty با سه band محافظه‌کارانه P10/P50/P90 نمایش داده شود و هرگز precision جعلی تولید نشود.
- sensitivity باید اثر تغییر assumptionها را رتبه‌بندی کند و decision brief باید trade-off، risk، confidence و evidence refs را نشان دهد.
- UI فارسی RTL در مسیر `/analytics/scenario-war-room`، responsive و متراکم ولی خوانا باشد؛ نمودارها و KPIها فقط از API واقعی بیایند و empty/loading/error state داشته باشند.
- هیچ dependency جدیدی بدون تأیید اضافه نشود؛ موتور deterministic با primitiveهای موجود Node/TypeScript ساخته شود.
- API contract، integration verifier، migration smoke، lint/typecheck/test/build و repository-check باید gate انتشار باشند.

## مرز فاز
این فاز تصمیم را شبیه‌سازی و مقایسه می‌کند، اما execution خودکار تصمیم‌ها متعلق به فازهای بعدی است. هر پیشنهاد اجرایی فقط recommendation/decision brief است و mutation عملیاتی ایجاد نمی‌کند.
