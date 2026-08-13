# alerts
> Update the Progress log on every change.
> Code path: `src/app/modules/alerts` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: author alert rules (a condition on a dataset/analysis field or formula crossing a threshold, evaluated on a cron schedule) and view their immutable evaluation history. Delivery is email + in-app bell.
- Key files:
  - `components/{add-alert,edit-alert}` — the **5-step wizard** (Source → Condition → Schedule → Delivery → Review), thin components sharing `alert-form.helpers.ts` for option lists + `buildAlertPayload`.
  - `components/alert-condition-builder` — guided typed builder (field/operator/value; dataType→control) with a free-text expression escape hatch.
  - `components/typed-value-input` — value control driven by field dataType (date→calendar, etc.).
  - `components/alert-history` — server-paged read-only `alert_event` timeline.
  - `components/list-alert` / `view-alert` — app-custom-table list (sourceType chip is the source column, no DS filter — org-scoped) + read-only detail with toggle/snooze/test.
  - `components/shared/email-chips-input` — Gmail-style recipient chips.
  - `services/alert.service.ts` — list/view/CUD + lifecycle (toggle/snooze/test) + events history.
- Depends on / depended on by: datasets + analyses (alert source fields); shared app-custom-* + email-chips; notifications module (in-app bell receives ALERT_FIRED via SSE). BE counterpart: dbexec-api `modules/alerts` (alert_rule + alert_event entities, condition compiler, node-cron scheduler + evaluator + dispatcher, `alertManagement` permission).
- How it works: wizard collects source/condition/schedule/delivery → `buildAlertPayload` composes the shape the mirrored `addAlertSchema`/`updateAlertSchema` (Zod) expects → BE persists rule. Scheduler runs each rule's cron on a LIVE query with cooldown + consecutive-breach gating; on fire it logs `alert_event`, emails recipients, and pushes an in-app SSE notification. `test` evaluates now without persisting. Cron presets + IANA timezone shortlist live in `alert-form.helpers.ts`.
- Decisions: add/edit is a custom `currentStep` stepper (NOT p-steps), mirroring Add-Organisation ([[list-pattern-and-alert-wizard]]). Alert authoring = guided builder default + advanced free-text expression. Evaluation = scheduled node-cron + Postgres `FOR UPDATE SKIP LOCKED` (no Redis/BullMQ — must run in the packaged app). See ../ARCHITECTURE.md for tenancy/auth.
- Gotchas / constraints:
  - The `alertManagement` permission only seeds on a FRESH DB onboarding — existing dev/prod orgs need `npm run backfill:perms` (BE) or the alerts routes 403 ([[viz-alerts-program]]).
  - No live E2E has run against alerts (build/typecheck was the gate); wizard i18n beyond PAGE_TITLES should be spot-checked.
  - BE alertScheduler holds a `FOR UPDATE` lock across external queries (deferred review finding [8]) — should mirror the subscription scheduler's short-claim pattern.

## 2. Goals
- Objective: authors can reliably define a threshold alert that fires on schedule and delivers to email + bell, with a queryable history.
- Current focus: — none active (wizard + FE polish landed).
- Next up: live E2E (needs running app + DB + login on the user's machine); tighten scheduler lock (BE).
- Out of scope: the alert engine itself (BE); dashboard scheduled delivery (in `dashboard`).

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: alerts module built greenfield in the viz-alerts program (FE fc32bf85: list/add/edit/view + condition-builder + typed-value-input + history + service + mirrored validator + lazy route gated `PERMISSIONS.ALERTS='alertManagement'`). Rebuilt add/edit into the 5-step wizard (b20a4d8c merge, `ALERT_WIZARD_STEPS` + STEP_/WIZARD_/REVIEW_ i18n ×10). FE polish: view/list/i18n + shared buttons + editable email-chips (78fe4966, 6c0cecbb); flat form-section restyle + one-control-per-row (4a9a32ef, 15e3fcc7). In-app + SSE ALERT_FIRED delivery wired via notifications (BE d8c275e).
- In progress / Known issues: no live E2E yet; `alertManagement` needs backfill on existing orgs or routes 403; version_261 FE commits are **local-only, not pushed** (user pushes).
- Next: live E2E of author→fire→email+bell.
- Files touched: docs/context/modules/alerts.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/alerts`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/alerts.md
