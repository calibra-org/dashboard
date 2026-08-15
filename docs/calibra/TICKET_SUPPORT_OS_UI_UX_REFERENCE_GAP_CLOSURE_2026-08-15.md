# Ticket UI/UX reference gap closure — 2026-08-15

This pass extends the existing Ticket Support OS rather than rebuilding completed backend work.

## Reference-driven gaps closed

- Eight first-class support pages share a consistent in-section navigation strip.
- Overview localizes operational states and keeps every KPI evidence-backed.
- Create ticket has customer/internal modes, visual priority and channel selection, live preview, media attachments, summary and guidance.
- Inbox has responsive mobile ticket cards, desktop table, active-filter chips, saved views, guarded bulk operations, real SLA indicators, current-page tags and CSV export.
- Ticket detail adds a responsive operational summary, workflow-state strip, conversation/internal-note/files/activity tabs, attachment scan state, reply composer, SLA controls and duplicate-merge safeguards.
- Channels replaces JSON-first UX with structured account, hours, fallback, auto-reply, webhook and notification controls while retaining an advanced JSON escape hatch and preserving unknown provider keys.
- Campaigns adds persisted-ledger delivery evidence, channel distribution, delivery funnel, localized lifecycle/template states, recipient management and fail-closed scheduling guidance.
- Settings adds real operational summary cards, localized presence/workflow/automation state, progressive disclosure for JSON rule editors, channel posture and security/governance guidance.
- Reports and internal conversations inherit the shared responsive section navigation and existing real-data widgets.

## UI system constraints preserved

- Persian is RTL and remains on the existing Vazirmatn/Inter typography configured by the Admin shell.
- Existing Calibra Card, Button, Input, Select, Badge, Progress, Switch and Media components are reused.
- No new dependency is introduced.
- No placeholder KPI, fake connection health, fake campaign delivery, fake ticket SLA or sample operational record is introduced.
- Mobile layouts avoid depending on wide desktop tables for primary ticket work.

## Data/architecture constraints preserved

- Existing Ticket APIs, validators, tenant/RLS boundaries, optimistic versions, audit behavior, attachment scan boundary, saved views, bulk operations, presence, channels, routing/automation, campaigns, reports and public portal remain the source of truth.
- Provider secrets continue to be represented only by environment references.
- `connected` remains evidence-driven and is not inferred from a configured toggle.
- Campaign scheduling remains fail-closed behind template approval and verified channel evidence.
