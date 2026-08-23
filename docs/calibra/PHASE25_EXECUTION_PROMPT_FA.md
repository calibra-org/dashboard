# پرامپت اجرایی فاز ۲۵ — Autonomous Growth Portfolio Engine

## مأموریت

Calibra باید از «لیست recommendationها» به «بهترین سبد اقدام با منابع محدود» برسد. Phase 25 نباید opportunity truth موازی بسازد؛ منبع opportunity همان `intelligence_cases` و outcome همان `intelligence_outcome_records` فاز ۱۰ باقی می‌ماند.

## ورودی هر candidate

- expected incremental contribution
- confidence
- required cash
- team time
- warehouse capacity
- supplier capacity
- risk
- reversibility
- time-to-value
- customer impact
- strategic alignment
- dependencies / exclusivity
- channel requirements

## Hard constraints

- cash budget
- team hours
- warehouse capacity
- supplier capacity
- max acceptable risk
- channel limits
- policy constraints
- dependency satisfaction
- mutual exclusivity

Hard constraint هرگز برای افزایش score شکسته نشود. Candidate ناسازگار باید `infeasible` شود و دلیل binding constraint ثبت گردد.

## Optimization

- portfolio-level evaluation، نه ranking تک‌اقدام
- deterministic solver version + input hash
- exact bounded branch-and-bound برای candidate set قابل کنترل
- expected P10/P50/P90
- selected / deferred / infeasible
- explainable why-not-selected
- resource utilization
- dependency execution plan

## Source freshness

هر candidate snapshot باید `intelligence_case_id + stable_key + version` داشته باشد. اگر source case بسته، حذف یا version آن تغییر کرده باشد Run با stale-source conflict متوقف شود و operator مجبور به refresh شود.

## Dynamic rebalancing

تغییر stockout، campaign outcome، settlement delay یا supplier incident باید باعث ساخت Run جدید شود. Run قبلی immutable است. اقدام high-risk فعال بدون approval خودکار cancel نشود.

## Outcome loop

Portfolio outcome باید به `intelligence_outcome_records` tenant جاری لینک شود و expected vs realized portfolio value، realization ratio و attribution confidence را ثبت کند تا solver calibration در iterationهای بعد ممکن باشد.

## Admin UX

مسیر authenticated زیر Analytics → Growth Portfolio. فارسی RTL، responsive، premium، با نمای constraint budget، expected distribution، portfolio plans، selected/deferred explanation، resource utilization، dependency plan و outcome ledger.

## Definition of Done

- explicit objective and constraints
- portfolio vs single-action evaluation
- deterministic/explainable solver
- stale-source protection
- selected/deferred/infeasible reason
- resource utilization + dependency plan
- realized portfolio outcome measurement
- RLS + FORCE RLS
- OpenAPI/SDK sync
- typecheck/lint/tests/build/CI سبز
