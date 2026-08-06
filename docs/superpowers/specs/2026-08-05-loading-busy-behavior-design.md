# Loading & busy behavior — one standard across all modules

Date: 2026-08-05 · Repo: DBExec-UI

## Problem

Two problems, one root cause.

1. **Double-submit.** A user clicks Save, the API is in flight, they change a
   field and click Save again → two writes race on the same record.
2. **Inconsistent "busy" UX.** Some screens (Announcement) still throw up the
   full-screen global spinner during a write; most screens skip it and show a
   button spinner. Split personality across the app.

## Ground truth (from the code, not assumptions)

- `app-button` **already** has `[loading]` + `[disabled]` and already guards
  `onClick` (`if (this.disabled || this.loading) return;`). The button
  primitive needs nothing new for the common case.
- `LoadingService` counts in-flight requests; `app.component.html` renders one
  global `spinner-container` when `loading() > 0`. That IS the global overlay.
- The request interceptor blocks (shows the global loader) for **every**
  request **unless** the request carries an `X-Skip-Loader` header. It is
  **method-agnostic** today — a POST and a GET are treated the same.
- `HttpClientService` verbs take `{ skipLoader: true }`, which sets that header.
- **36 of 37 write-services already pass `skipLoader`** and hold a `_saving`
  signal. The app is ~95% already on the modern pattern.
- The Announcement service is the visible straggler: it has `_saving` but its
  ADD/UPDATE/DELETE calls (announcement.service.ts:119/129/139) **forgot**
  `skipLoader`, so those three writes still trigger the global overlay. A bug
  of omission — not a missing pattern.
- One component does an inline write instead of going through a service:
  `app-settings/components/ai-features/ai-features.component.ts`.

## Decision (what modern apps do, adapted to us)

Standardize on **button-level busy**, and make it the DEFAULT so nothing can
regress:

1. **Writes never show the global overlay.** Flip the interceptor to be
   **method-aware**: POST / PUT / PATCH / DELETE skip the global loader by
   default. GET keeps the global loader (page/section loads still block, which
   is correct). This makes `skipLoader: true` on writes redundant — a service
   physically *cannot* forget anymore. The Announcement bug fixes itself.
2. **The button that fired the write spins + disables.** Uses the existing
   `app-button [loading]`.
3. **On a multi-button screen, all _write_ buttons disable while any write is
   in flight; only the one that fired spins.** Read-only buttons (Cancel, Back,
   Preview, tab switches) never disable — the user can always bail.
4. **Inputs stay editable.** No screen freeze, no disabling 10 fields. The
   payload is snapshotted at click, so a later keystroke just feeds the *next*
   save.
5. **A guard clause backstops the visual disable.** Submit handlers start with
   `if (this.busy()) return;` so a same-frame double-fire (Enter + click) is
   dropped even before the disabled state paints.

Idempotency keys on writes are noted as a future backstop (survives network
retries) but are **out of scope** here — the button guard + method-aware
interceptor solve the reported problem.

## The convention (what every form adopts)

A tiny, uniform state shape on the component (signals, matches the codebase):

```ts
readonly busy = signal(false);                 // any write in flight
readonly activeAction = signal<string | null>(null);  // which button fired

private async run(action: string, work: () => Promise<void>) {
  if (this.busy()) return;                      // guard: drop double-fire
  this.busy.set(true); this.activeAction.set(action);
  try { await work(); }
  finally { this.busy.set(false); this.activeAction.set(null); }
}
```

Template (multi-button footer):

```html
<app-button variant="primary" [loading]="activeAction()==='save'" [disabled]="busy()"
            (clicked)="onSave()">{{ 'COMMON.SAVE' | translate }}</app-button>
<app-button variant="secondary" [loading]="activeAction()==='saveNew'" [disabled]="busy()"
            (clicked)="onSaveNew()">{{ 'COMMON.SAVE_NEW' | translate }}</app-button>
<!-- read-only escape: NOT disabled by busy -->
<app-button variant="ghost" (clicked)="onCancel()">{{ 'COMMON.CANCEL' | translate }}</app-button>
```

Single-button forms can keep using the service's `_saving` signal directly for
`[loading]`/`[disabled]` — `busy`/`activeAction` is only needed where a screen
has more than one write action.

## Components / data flow

```
[app-button] --(clicked)--> component.run(action)
      |                            |
   [loading]/[disabled] <--- busy() / activeAction() signals
                                   |
                          service.save() (holds _saving)
                                   |
                        HttpClientService.apiPut(...)   // no skipLoader needed
                                   |
                     interceptor: method is a write -> DO NOT show global loader
```

Reads unchanged: GET still shows the global overlay (page/section load).

## Error handling

- On error the `finally` clears `busy`/`activeAction`, so the button re-enables
  and the user can retry. The existing `http-error.interceptor` still toasts.
- 440 session-expiry redirect path is unaffected (it runs on the response, and
  the write no longer holds the global loader anyway).

## Testing / verification

- Type gates: `tsc --noEmit` → `ngc -p tsconfig.app.json --noEmit` →
  `ng build --configuration production` (the CLAUDE.md gate).
- Headless Playwright (headless: true, no visible UI): on a representative
  form (Announcement add/edit, a multi-button screen) — click Save, assert the
  button shows a spinner + is disabled, assert NO global `.spinner-container`
  appears for the write, assert a second click while in flight fires only one
  network request. Screenshots saved to the screenshots folder.
- Manual reasoning check: GET-heavy screens still show the global overlay
  (unchanged), writes never do.

## Rollout scope

- **Interceptor** (1 file): method-aware skip for writes.
- **Announcement service** + any other straggler: remove now-redundant work /
  ensure `_saving` set (behavior already correct once interceptor flips).
- **ai-features component**: move its inline write busy-state onto the
  button (or leave the write in place — the interceptor flip already stops its
  overlay; just wire button `[loading]`).
- **Multi-button forms**: adopt `busy`/`activeAction` where a screen has >1
  write action. Single-write forms already work via `_saving`.
- **Global overlay retained** for GET/page-load and any explicit destructive
  long-op that opts in.

## Verification results (2026-08-05)

Static gates (the CLAUDE.md gate) — all green after the full sweep:
- `tsc --noEmit` → 0 errors
- `ngc -p tsconfig.app.json --noEmit` (AOT, compiles every template binding) → 0 errors
- `ng build --configuration production` → success

Live headless (Playwright, headless:true) against the running Docker stack
(FE :8755 / BE :9058, org UltraIntake). To reach the forms the test authenticates
via the API and seeds `access-token` + `permission-tree` into localStorage
(the normal UI login routes through a /relay + first-login gate that pins the
only available user to /home). A freshly-built bundle was swapped into the
nginx container for the run, then the container was restored to its image
baseline afterward.

- 10/10 reachable add forms render the primary Save as `<app-button>` with
  **zero** legacy `btn-save`/`p-button-primary` (users, groups, roles,
  datasource, prompt, query-builder, rls-rule, connection, announcement,
  db-role). organisation + system-admin were correctly SKIPPED — the org user
  lacks `orgManagement`/`systemAdmin`.
- On a write in flight: the Save button is **disabled** (double-submit
  prevented) and the global `.spinner-container` overlay does **NOT** appear —
  both asserted PASS.

Not exercised live: the spinner *animation during* a real POST. The CVA-guarded
reactive forms could not be driven to a valid submit headlessly (synthetic input
events don't always propagate through the custom controls), and the prod bundle
strips Angular's `ng` debug API so the component `loading` couldn't be forced.
The spinner is the same `[loading]="saving()"` binding on the same `app-button`
whose render is confirmed above and whose `pi-spin pi-spinner` markup is present
in the shipped bundle — it is covered by the AOT compile and the button
component's own template.

## Risks

- A write that genuinely *relied* on the global block to prevent interaction
  (rare) would lose it. Mitigation: those become button-busy; none found in the
  write-service audit that needs a full block.
- A read that abuses POST (search-as-POST) would stop blocking. `queryPostNoLoader`
  already exists for that; and search should not block anyway. Acceptable.
- Long writes with no button feedback (fire-and-forget service calls not tied
  to a button) would show nothing. Mitigation: those are few; add a toast or
  keep an explicit `skipLoader:false` opt-in for the rare "block me" write.
