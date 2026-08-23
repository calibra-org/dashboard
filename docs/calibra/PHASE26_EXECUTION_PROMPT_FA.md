# Phase 26 — Merchant Memory & Organizational Learning

## مأموریت

دانش تصمیم‌ها و درس‌های کسب‌وکار باید از chat history و متن آزاد جدا شود و به یک حافظهٔ ساختاریافته، durable، قابل‌ردیابی و permission-aware تبدیل شود.

Phase 26 منبع حقیقت دامنه‌های قبلی نیست. این فاز فقط learned memory را با reference به sourceهای canonical نگه می‌دارد.

## Canonical authorities

- Phase 10: decision/action/outcome truth
- Phase 11: policy/approval precedent truth
- Phase 17: experiment evidence and lessons
- Phase 22: agent/orchestration context
- Phase 25: portfolio decisions and realized portfolio outcomes

Memory بدون evidence معتبر نباید به‌عنوان learned fact قابل‌استفاده توسط Agent یا Human منتشر شود.

## Memory record

هر Memory حداقل شامل این اجزاست:

- Context
- Observed signals
- Decision
- Reason
- Alternatives rejected
- Actor / approvals
- Action
- Outcome
- Lesson
- Confidence / strength
- Effective time
- Expiry / relevance
- Sensitivity / access scope
- Source/evidence links

`Reason` در این مدل rationale قابل‌نمایش و business-facing است، نه hidden chain-of-thought.

## Memory classes

- operational_incident
- supplier_lesson
- campaign_lesson
- pricing_lesson
- customer_segment_behavior
- product_quality
- architecture_process_decision
- policy_precedent

## Evidence contract

هر evidence link باید source domain/type/stable key داشته باشد و در صورت موجود بودن version/hash را نیز نگه دارد.

Phase 26 raw truth را کپی نمی‌کند. `evidence_summary` فقط خلاصهٔ redacted و قابل‌نمایش است و source authority باید قابل‌بازیابی باقی بماند.

## Retrieval contract

Retrieval باید:

- tenant-scoped باشد
- permission-aware باشد
- expired/superseded memory را به‌طور پیش‌فرض حذف کند
- source-linked result برگرداند
- query fingerprint و retrieval telemetry را ثبت کند
- history را فقط در صورت درخواست و مجوز نشان دهد

Agent نباید از prose آزاد بدون source-link به‌عنوان institutional memory استفاده کند.

## Contradiction and lineage

Memory overwrite نمی‌شود. تغییر دانش با lineage ثبت می‌شود:

- supersedes
- contradicts
- refines
- reaffirms

Cycle در supersession/lineage مجاز نیست.

## Privacy and retention

- raw customer-level sensitive memory حداقل‌سازی شود
- learned aggregate facts بر raw individual memory ترجیح دارد
- customer-level raw facts نمی‌توانند با sensitivity عادی `internal` ذخیره شوند
- access scope و retention class الزامی است
- expiry و relevance باید در retrieval enforce شوند

## Effectiveness measurement

Phase 26 باید بتواند اندازه‌گیری کند:

- retrieval usefulness
- acceptance / actual use
- repeat-error reduction
- stale-memory avoidance
- supersession quality

## Admin surface

یک workspace فارسی RTL در Decision/Intelligence surface اضافه شود که شامل:

- Memory ledger
- class / sensitivity / status filters
- source evidence drawer
- lineage timeline
- expiry and stale indicators
- superseded/contradicted relationships
- retrieval telemetry
- effectiveness metrics

## Release gates

قبل از merge:

- یک migration canonical و بدون timestamp collision
- RLS + FORCE RLS روی همهٔ جداول Phase 26
- evidence validation برای authorityهای Phase 10/11/17/22/25
- supersession cycle prevention
- permission-aware retrieval tests
- expiry/supersession filtering tests
- tenant isolation tests
- privacy guard tests
- effectiveness telemetry tests
- OpenAPI + SDK بدون drift
- admin typecheck/build
- API typecheck/tests
- Migration Smoke
- dedicated Phase 26 integrity verifier
- full repository Check سبز

Phase 27 خارج از scope این PR است.
