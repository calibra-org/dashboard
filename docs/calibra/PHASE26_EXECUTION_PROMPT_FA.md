# Phase 26 — Merchant Memory & Organizational Learning

## مأموریت

دانش تصمیم‌های کسب‌وکار باید از chat history و متن آزاد جدا و به یک لایهٔ durable، evidence-linked و permission-aware تبدیل شود. این فاز «حافظهٔ داستانی مدل» نمی‌سازد؛ هر lesson باید ساختار، منبع، lineage، expiry و اثر قابل اندازه‌گیری داشته باشد.

## مرجع‌های اصلی

- Phase 10: Decision Intelligence و Outcome Ledger برای case/decision/action/outcome truth.
- Phase 11: Governance OS برای approval/policy precedent و سطح دسترسی.
- Phase 17: Experimentation برای causal knowledge و campaign learning.
- Phase 22: Orchestrator برای agent/human retrieval context و action handoff.
- Phase 25: portfolio runs/outcomes/rebalance evidence برای portfolio-level learning.

Phase 26 هیچ‌کدام از این truth storeها را جایگزین نمی‌کند؛ فقط knowledge record مشتق‌شده و source-linked ایجاد می‌کند.

## Memory record

هر رکورد حافظه باید حداقل این اجزا را داشته باشد:

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
- Expiry / relevance

## Memory classes

- operational incident
- supplier lesson
- campaign lesson
- pricing lesson
- customer / segment behavior
- product quality
- architecture / process decision
- policy precedent

## Evidence contract

Memory بدون source قابل انتشار نیست. هر source link شامل domain/kind/id، freshness، optional source version/hash و evidence role است. Snapshot فقط evidence کم‌حساسیت و redacted نگه می‌دارد؛ raw customer-sensitive payload به‌عنوان memory prose ذخیره نمی‌شود.

## Retrieval contract

Retrieval باید source-linked result برگرداند، نه prose hallucinated memory. نتیجه‌ها باید بر اساس tenant، status، expiry، minimum role، sensitivity و requester kind فیلتر شوند. هر retrieval event باید تعداد موارد حذف‌شده به دلیل expiry/permission/supersession را ثبت کند.

## Contradiction و lineage

رکورد قبلی overwrite نمی‌شود. memory جدید می‌تواند predecessor را با یکی از روابط زیر supersede/refine/contradict کند:

- new evidence
- market change
- policy change
- correction
- expiry refresh

نسخهٔ قدیمی برای audit باقی می‌ماند ولی در retrieval active پیش‌فرض حذف می‌شود.

## Privacy / retention

- aggregate learned facts بر raw customer-level memory ترجیح دارد.
- restricted memory فقط admin و فقط با expiry معتبر مجاز است.
- retention class صریح است: short / standard / extended / legal_hold.
- tenant RLS + FORCE RLS روی تمام جداول الزامی است.
- retrieval agent نباید restricted memory دریافت کند.

## Effectiveness

حداقل measurement:

- retrieval usefulness
- applied vs ignored
- repeat-error prevention
- decision-changed signal

این measurement truth کسب‌وکار نیست؛ feedback روی usefulness خود memory است.

## Definition of Done

- structured memory store
- source/evidence references
- supersession/expiry lineage
- permission-aware retrieval
- memory effectiveness measurement
- authenticated Admin/Copilot surface
- OpenAPI + SDK canonical generation
- dedicated Phase 26 verifier/workflow
- migration smoke, typecheck, build, format/lint, frontend tests, API shards سبز

## ممنوع

- ذخیره chain-of-thought یا reasoning خصوصی مدل
- کپی raw customer-sensitive history به memory
- overwrite رکورد قدیمی به جای lineage
- retrieval بدون source links
- cross-tenant memory retrieval
- agent access به restricted memory
- تبدیل Phase 26 به parallel source of truth برای Decision, Governance, Experiment یا Portfolio
