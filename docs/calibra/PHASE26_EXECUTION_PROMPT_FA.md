# Phase 26 — Merchant Memory & Organizational Learning

## ماموریت

دانش تصمیم‌های کسب‌وکار باید از chat history جدا، ساختاریافته، durable و قابل استناد شود. Phase 26 حافظهٔ آزاد متنی یا hidden reasoning ذخیره نمی‌کند؛ فقط lessonهای evidence-linked را نگه می‌دارد.

## Source authority

Phase 26 منبع حقیقت جدید برای سفارش، قیمت، مشتری، پرداخت، کمپین یا تصمیم نیست. رکوردهای حافظه باید به sourceهای معتبر قبلی لینک شوند؛ از جمله Decision Intelligence، Governance OS، Experimentation، Agent Orchestrator و Growth Portfolio.

Dependencyهای canonical این فاز Phase 11، 17، 22 و 25 هستند و Decision/Outcome authority از Phase 10 مصرف می‌شود. هیچ source reference صرفاً بر اساس نام جدول یا شناسهٔ ارسالی کاربر معتبر تلقی نمی‌شود؛ tenant ownership و allowlist authority باید در سرور تأیید شود.

## Memory record

هر memory شامل Context، Observed signals، Decision، Reason، Alternatives rejected، Actor/approvals، Action، Outcome، Lesson، Confidence/strength و Expiry/relevance است.

## Memory classes

- operational incidents
- supplier lessons
- campaign lessons
- pricing lessons
- customer/segment behavior
- product quality
- architecture/process decisions
- policy precedents

## Retrieval contract

- فقط memoryهای source-linked برگردانده می‌شوند.
- memory منقضی یا superseded به‌صورت پیش‌فرض قابل retrieval نیست.
- retrieval باید permission-aware باشد.
- پاسخ باید source references را همراه lesson برگرداند؛ prose بدون provenance ممنوع است.
- هر retrieval برای effectiveness measurement ثبت می‌شود.
- دسترسی agent از Governance principal و scopeهای سروری مشتق می‌شود و از permission یا restricted flag ارسالی client ارث نمی‌برد.

## Contradiction and lineage

Memory overwrite نمی‌شود. Evidence جدید می‌تواند memory قبلی را supersede، contradict یا refine کند و lineage باید حفظ شود.

## Privacy and retention

- دادهٔ خام حساس customer-level در memory ترجیحاً ذخیره نمی‌شود.
- sensitivity class و required permission صریح هستند.
- aggregated learned facts نسبت به raw sensitive facts ترجیح دارند.
- expiry per-memory اجباری نیست ولی در retrieval enforce می‌شود.

## Effectiveness

حداقل شاخص‌ها:
- retrieval usefulness
- repeat-error reduction
- misleading-memory rate
- source-linked retrieval rate

## Definition of Done

- structured tenant-isolated memory store
- source/evidence references
- supersession/contradiction/refinement lineage
- expiry-aware retrieval
- permission-aware retrieval
- effectiveness measurement
- OpenAPI + SDK + Admin UI
- dedicated verifier/tests/CI
- full repository gates green before merge
