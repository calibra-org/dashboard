# Phase 26 — Merchant Memory & Organizational Learning

## مأموریت

دانش تصمیم‌های کسب‌وکار باید از chat history و context موقت جدا و به یک لایهٔ durable، evidence-linked و tenant-isolated تبدیل شود.

این فاز یک منبع حقیقت جدید برای Decision/Outcome/Policy/Experiment/Agent/Portfolio نمی‌سازد. Memory فقط از منابع authoritative موجود snapshot و lesson می‌سازد و همیشه lineage و evidence آن را نگه می‌دارد.

## Source authorities

- Phase 10 — Decision Intelligence: تصمیم‌ها، actionها و outcomeهای canonical.
- Phase 11 — Governance OS: policy/approval precedent.
- Phase 17 — Experimentation: experiment evidence و نتیجهٔ آزمایش.
- Phase 22 — Multi-Agent Orchestrator: agent/orchestration context و execution evidence.
- Phase 25 — Growth Portfolio: selected/deferred/infeasible portfolio decisions، rebalance و realized portfolio outcomes.

## Memory record

هر record باید در حد امکان این بخش‌ها را داشته باشد:

- Context
- Observed signals
- Decision
- Reason
- Alternatives rejected
- Actor/approvals
- Action
- Outcome
- Lesson
- Confidence/strength
- Expiry/relevance

## Memory classes

- operational incident
- supplier lesson
- campaign lesson
- pricing lesson
- customer/segment behavior
- product quality
- architecture/process decision
- policy precedent

## Retrieval contract

Retrieval باید source-linked باشد. UI/Agent حق ندارد یک متن prose بدون evidence را به‌عنوان memory معتبر نمایش دهد.

هر نتیجه باید حداقل public memory id، class، lesson، confidence/strength، freshness/status و evidence refs داشته باشد.

## Contradiction and lineage

Memory overwrite نمی‌شود. روابط lineage:

- supersedes
- contradicts
- refines
- supports

وقتی evidence جدید rule یا lesson قبلی را عوض می‌کند، record جدید ساخته می‌شود و record قبلی از طریق lineage superseded می‌شود.

## Privacy / retention

- raw customer-level sensitive memory پیش‌فرض ممنوع است؛ aggregate/segment lesson ترجیح دارد.
- privacy level و retention class روی هر memory صریح است.
- expired/revoked/superseded memory در retrieval معمولی وارد نمی‌شود مگر با filter صریح و مجوز مناسب.
- هیچ secret یا raw credential داخل memory/evidence ذخیره نمی‌شود.

## Effectiveness

فاز ۲۶ باید قابل‌اندازه‌گیری باشد:

- retrieval usefulness
- applied memories
- irrelevant/incorrect memories
- repeat-error prevention
- outcome delta when attributable

## Definition of Done

- structured tenant-scoped memory store با RLS + FORCE RLS
- source/evidence references
- supersession/expiry/retention
- permission-aware retrieval
- effectiveness measurement
- authenticated Persian RTL operator surface
- OpenAPI + SDK canonical
- migration smoke + phase verifier + API/admin typecheck + build + repository Check سبز

## Safety boundary

Merchant Memory hidden chain-of-thought یا reasoning داخلی مدل را ذخیره نمی‌کند. فقط business-visible facts, decisions, evidence, outcomes و lessons قابل‌ممیزی ذخیره می‌شوند.
