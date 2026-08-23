# پرامپت اجرایی فاز ۲۴ — Synthetic Shopper & Pre-Production Commerce Simulator

فاز ۲۴ را به‌عنوان لایه QA/Release برای آزمون journey واقعی تجارت با actor مصنوعی و fixture deterministic پیاده کن؛ نه یک سیستم سفارش/پرداخت موازی و نه یک AI demo. هر Run باید فقط داخل namespace مصنوعی tenant اجرا شود، providerها stubbed باشند و analytics ایزوله بماند. هیچ Run اجازه ندارد order، payment، refund، inventory یا fulfillment production را mutate کند.

## قواعد الزام‌آور
- هفت truth-table افزوده و tenant-scoped: environment، persona، seed version، scenario، run، gate result، artifact؛ همه با RLS + FORCE RLS.
- Environment فقط وقتی معتبر است که `is_synthetic=true`، `provider_mode=stubbed`، `analytics_mode=isolated` و namespace آن با tenant جاری منطبق باشد.
- Seed version باید deterministic، hash‌شده و قبل از Run فریز شده باشد؛ Run بدون Seed فریز‌شده fail-closed است.
- Personaها باید buyer جدید، loyal، technical، price-sensitive، urgent، B2B-like، mobile low-bandwidth، Persian typo-heavy، accessibility، suspicious bot و legitimate AI shopping agent را پوشش دهند و امکان persona سفارشی باقی بماند.
- journey بحرانی حداقل homepage → search → PDP → cart → checkout → payment → fulfillment promise → support را پوشش دهد و قابلیت گسترش به no-results/filter/coupon/OTP/return را داشته باشد.
- Gateها semantic باشند: broken critical flow، duplicate payment/refund attempt، inaccessible CTA، ranking regression، zero-result spike، impossible delivery promise، policy bypass، personalization leakage و experiment assignment error.
- Run completed immutable است. runner فقط evidence واقعی را به Run queued/running report می‌کند.
- failure artifact شامل screenshot/trace/log/network/snapshot واقعی با checksum و namespace محدود به همان Run است؛ artifact جعلی یا URL آزاد پذیرفته نشود.
- Metricهای مدیریتی: journey coverage، regressions caught، false alarms و gate pass rate. AI shopper/simulation هرگز ground truth مشتری معرفی نشود.
- Admin UI فارسی RTL زیر Analytics → Pre-Production Lab، responsive، dense-but-readable، با semantic token، HelperTooltip، loading/empty/error state و CTAهای واقعی باشد.
- OpenAPI، static verifier، migration smoke، typecheck، frontend/API tests، build و CI gate انتشار باشند.

## Definition of Done
Scenario library، stable seeded fixtures، synthetic isolation، CI/release hook، evidence-backed failure artifacts و trace/screenshot contract وجود داشته باشد و هیچ production commerce truth table توسط فاز ۲۴ نوشته نشود.
