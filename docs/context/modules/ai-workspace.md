# ai-workspace
> Update the Progress log on every change.
> Code path: `src/app/modules/ai-workspace` · Status: 🟡 · Last updated: 2026-08-11

## 1. Context
- Responsibility: Front-end for **Dex**, the in-app AI assistant — a chat transport + provider-config layer. NO page components live here; Dex is surfaced entirely through the shared `app-ai-launcher` bubble mounted in the home shell.
- Key files:
  - `services/ai-chat.service.ts` — owns the transcript + a persistent **WebSocket** to `/ai/ws`; a reducer builds a nested step tree (tool steps + dormant delegate/sub-agent nodes) keyed by `toolCallId`; auto-reconnect with exp-backoff (cap 15s); `send`/`cancel`/`disconnect`; conversation history via plain REST.
  - `services/ai-config.service.ts` — reads/writes the org AI provider config (`GET/PUT /ai/config`, key masked) + a cached `health` signal (`/ai/health`) that gates the launcher; seeds health synchronously from the `AI_CONFIGURED` login flag so the bubble can gate on first paint.
  - Shared (NOT in this folder): `shared/components/ai-launcher/*` (FAB + panel/overlay slide-over + inline card renderer), `ai-tool-step/*`, `ai-subagents/*`, `shared/services/ai-launcher.service.ts` (open/close + persisted panel|overlay mode), `shared/validators/ai-cards.ts` (Zod card union, mirrored byte-for-byte with the BE).
  - `core/constants/api.constant.ts` → `AI_WORKSPACE` (WS, CHAT SSE fallback, CONFIG, CONFIRM, HEALTH, CONVERSATIONS).
- Depends on / depended on by: `HttpClientService`, `StorageService`, `permission.service` (aiWorkspace/aiFeatures leaves); BE counterpart is `DBExec-API/src/modules/ai-workspace` (single Dex agent, 64-tool catalog, guarded `/ai/confirm`).
- How it works: launcher FAB (gated by perm + AI health) opens the panel → `AiChatService.send()` lazily opens the WS (JWT via `?token=`), queues the message, streams `AgentEvent`s back → reducer patches the assistant bubble immutably (OnPush-safe deep-clone of the step tree) so it paints incrementally. Write proposals arrive as `confirm` cards; the user clicks Confirm → the card `confirm()` calls **`POST /ai/confirm`** (never the target endpoint) which re-validates + re-checks RBAC + dispatches the real guarded endpoint in-process. Read/draft cards (sql/result_grid/schema/dataset_draft/visual_preview) apply through existing endpoints.
- Decisions: BYO OpenAI-compatible provider (key DEK-encrypted in OrgPolicy); read+propose autonomy (agent has no direct write tool — all writes go through `/ai/confirm`); transport = WebSocket, SSE `/ai/chat` is the fallback; NO screen-context (agents pull domain context via tools — the outbound frame carries only message + conversationId). Multi-agent supervisor/delegate was collapsed to ONE Dex agent (delegate/sub-agent event types kept but dormant). See memory `dex-full-app-control`, `ai-workspace-plan`; global auth/token in ../ARCHITECTURE.md.
- Gotchas / constraints:
  - **Full-page workspace route is NOT wired.** No `AiWorkspaceModule`/page components exist; `/app/ai-workspace` is not in `app-routing.module.ts`. The launcher's "Open full workspace" link + the sidebar comment about the route are STALE — module is launcher-only today.
  - `screen-context.service` was removed; the frame never carries a screen snapshot.
  - `confirm()` MUST hit `AI_WORKSPACE.CONFIRM`, never the target write endpoint.
  - Local llama3.2 (3B) will NOT reliably drive tool-calls no matter the code — point AI Features at a FRONTIER model to see real full-app control.
  - Health is seeded from a stored flag then confirmed over the network; a probe failure keeps the seeded value (launcher doesn't blink out on a blip).

## 2. Goals
- Objective: a stable chat/config surface that lets Dex read the app and propose guarded writes, gated by perms + health.
- Current focus: — none active (feature committed on version_261; UI commits are local-only per memory).
- Next up: decide whether to restore the full-page workspace or formally drop it (route + link are currently dead); revisit once a frontier provider is the default.
- Out of scope: the multi-agent delegation UI (dormant), SQL federation, direct-write tools.

## 3. Progress (newest first)
### 2026-08-11 — DBExecAI rebrand + per-screen scoping + live agent/API telemetry (Users)
- Done (FE): "Dex" → **DBExecAI**, reframed as an agentic "a plan the agent works for me" surface (not a chatbot). New `shared/services/ai-screen-context.service.ts` — maps `router.url` → `{module, view, recordId, label, scoped}` (mirror of the BE `engine/screen.ts`; users/groups/role are `scoped`). `ai-chat.service.ts` now sends the `screen` in the chat frame, exposes an `activity()` computed (agent + apiLabel + live elapsed), and carries `apiLabel` on each `ToolStep`.
- New shared components/pipe (registered in `shared.module.ts`): **`ai-activity-line`** — the compact real-time line "⚙ Access agent → GET /users · 0.4s" with a live timer, expandable to the full step tree; **`ai-markdown` pipe** — dependency-free, XSS-safe markdown subset for assistant messages (escapes first, closed tag set, DomSanitizer belt-and-braces).
- Launcher (`shared/components/ai-launcher`): rebranded header with a **module chip** (current screen) + **scoped hint**; a dismissible **AI disclaimer** footer ("DBExecAI can make mistakes…"); a **reconnecting** banner; auto-grow composer (160px cap); **module-aware starters** (Users starters on the access screens); assistant text rendered via `aiMarkdown`; live activity line under the streaming message. New SCSS for all of the above (tokens only). `DBEXEC_AI.*` i18n block added to ALL 10 locales (parity verified).
- Verification: `tsc --noEmit` + `ngc -p tsconfig.app.json --noEmit` + `ng build --configuration production` all clean. NOT live-tested this pass (user request). version_261, not pushed.

### 2026-07-24 — Current state captured
- Done: Dex FE is **services-only** (`ai-chat.service` WS reducer + `ai-config.service` health/config); UI lives in shared `app-ai-launcher`/`ai-tool-step`/`ai-subagents`. Full-app-control rework shipped — guarded `/ai/confirm` execute + nested step UI (commit 6ece88d4); initial in-app AI assistant + Settings/SSO polish (dd76b9d7). Card contract mirrored in `shared/validators/ai-cards.ts`. Committed on version_261.
- In progress / Known issues: full-page `/app/ai-workspace` route + "Open full workspace" link are DEAD (no page module) — sidebar comment is stale. Needs a frontier model to actually act (llama3.2 won't). UI commits reported local-only in memory.
- Next: reconcile the dead full-page route (restore or remove).
- Files touched: docs/context/modules/ai-workspace.md

### 2026-07-24 — Initialized from repo audit
- Done: Context + Goals seeded from the actual code (module folder `src/app/modules/ai-workspace`).
- In progress: —
- Next: Enrich with specifics as work touches this module.
- Blockers: —
- Files touched: docs/context/modules/ai-workspace.md
