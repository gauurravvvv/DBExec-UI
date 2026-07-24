# notifications
> Update the Progress log on every change.
> Code path: `src/app/modules/notifications` · Status: 🟢 · Last updated: 2026-07-24

## 1. Context
- Responsibility: The full **notifications page** (the "See all" destination behind the bell). The live bell + dropdown panel + the SSE client itself live OUTSIDE this folder (core/shared); this module is just the page view over the same feed.
- Key files:
  - `components/list-notifications/*` — full page: status segmented control (All / Unread), per-type dropdown filter, bulk actions (Mark all read, Clear read), CLIENT-side infinite reveal (PAGE_SIZE 20) over the last-30-days set the service already holds, per-row deep-link click.
  - `notifications-routing.module.ts` / `notifications.module.ts` — lazy module; route `path: 'notifications'` (auth-gated only, NO permission).
  - Shared/core (NOT here): `core/services/notification.service.ts` — the single source of truth (SSE stream + 60s catch-up poll + optimistic mutations + badge); `shared/components/notification-modal/*` — the bell panel; `shared/helpers/notification-grouping.helper.ts` + `notification-presentation.helper.ts` (icon/accent/i18n keys/body params so page + panel render identically); `core/constants/routes.constant.ts` → `notificationRoute()` deep-link map; `core/constants/api.constant.ts` → `NOTIFICATION` (LIST, UNREAD_COUNT, READ_ALL, STREAM, readOne, remove, CLEAR).
- Depends on / depended on by: the shared `NotificationService` (page reads its `items` signal); presentation helpers; `Router` for deep-links. BE counterpart: `Notification` entity + `NotificationHub` in-process SSE singleton + `notifyUsers` helper (see memory `sharing-notifications-shipped`).
- How it works: `NotificationService.start()` fires once on first authed paint — opens the **SSE** stream (`GET /notifications/stream`, JWT via `?token=`, EventSource can't set headers), prepends each pushed row + bumps the badge, and runs a 60s poll as a catch-up safety net (paused when tab hidden). SSE reconnects with exp-backoff (2s→60s). The page reads the same `items` signal, applies status/type facets client-side, and reveals rows in 20-row steps. Read state is per-row (`markOne`) + explicit "Mark all read" — opening the bell does NOT auto-mark-all-read, so unread dots + deep-links survive.
- Decisions: SSE-first with poll fallback (single-node hub; multi-node would need Redis pub/sub — documented, not built); page pages the feed client-side rather than forcing a server adapter onto a whole-window endpoint; bell hidden for system-admin. See memory `sharing-notifications-shipped`; global conventions in ../ARCHITECTURE.md.
- Gotchas / constraints: a stale-guard clock (`lastLocalMutationAt`) discards any poll response older than the most recent local mutation so an in-flight poll can't repaint a stale badge. The SSE reconnect must NOT route through `closeStream()` — that latches the "closed by us" guard and kills every reconnect (this was a real bug, fixed 80ffa4a2); transient errors use `teardownEventSource()` + backoff instead. Heartbeats are SSE comments (`: ping`), never data frames.

## 2. Goals
- Objective: a reliable real-time bell + a full-page feed that render every type identically and keep read/unread honest.
- Current focus: — none active.
- Next up: a two-session live E2E of share→bell→click→land (code+gates-green was the shipping bar; no live SSE test yet per memory).
- Out of scope: multi-node SSE fan-out (needs Redis); server-side pagination of the feed.

## 3. Progress (newest first)
### 2026-07-24 — Current state captured
- Done: SSE client + mark-one/delete/clear + deep-link map in NotificationService (29b07865); bell panel — per-row deep-link click, delete, clear + i18n (920902cd); modernized bell panel + full notifications page (57e392a6); SSE backoff reconnect armed after transient drop (80ffa4a2); bell hidden for system-admin + poll-race fix (c78e4644). On version_261.
- In progress / Known issues: single-node SSE only (multi-node = Redis, not built); no live E2E of the SSE path yet; UI commits reported local-only in memory.
- Next: live SSE round-trip test.
- Files touched: docs/context/modules/notifications.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/notifications`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/notifications.md
