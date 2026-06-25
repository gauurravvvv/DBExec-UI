# Per-tab scheduled exports

> Implementation companion to research modules 13 (Export), 15
> (Scheduling), and 08 (Dashboard / multi-tab). Read those first
> if you need the architecture. This doc is for the engineer
> writing the migration + endpoint + scheduler + email template.

**Status:** 🔴 not in product. P1 (multi-tab is P1, scheduling P0).
**Effort:** M (1–2 weeks for one engineer with the multi-tab and
scheduling foundations already shipped).

---

## 0. Problem statement

Today, a `subscription` in DBExec — when we have one — exports the
*whole* dashboard. The customer's actual ask is finer-grained:

- "Email me the **Sales** tab every Monday."
- "Email me **Revenue** and **Pipeline** tabs (PDF) every weekday
  at 7am."
- "Email me the **Exec summary** tab only when the WoW revenue
  drop is > 5%."

Three product requirements emerge:

1. A subscription targets a *set of tabs*, not a whole dashboard.
2. The PDF is rendered for exactly the targeted tabs (in the
   order the user picked), with a cover sheet listing them.
3. CSV/XLSX exports of a tab include only the visuals on that tab
   (each visual → one sheet in XLSX, one CSV file in a zip for
   CSV).

This isn't research — the spec is implied by the multi-tab
research and the scheduling research. This is the implementation
pin-down.

---

## 1. Data model

Two surgical additions to existing tables; one new join table.

### 1.1 `subscription_target_tab` (new)

```sql
CREATE TABLE subscription_target_tab (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
  dashboard_tab_id  UUID NOT NULL REFERENCES dashboard_tab(id) ON DELETE CASCADE,
  display_order     SMALLINT NOT NULL,
  -- snapshot of name at subscribe time, so renaming the tab on the
  -- dashboard doesn't silently change what the email says
  tab_label         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_sub_tab
  ON subscription_target_tab(subscription_id, dashboard_tab_id);
CREATE INDEX idx_sub_tab_sub ON subscription_target_tab(subscription_id);
CREATE INDEX idx_sub_tab_tab ON subscription_target_tab(dashboard_tab_id);
```

### 1.2 `subscription` (existing — additive columns)

```sql
ALTER TABLE subscription
  ADD COLUMN delivery_scope TEXT NOT NULL DEFAULT 'whole_dashboard'
    CHECK (delivery_scope IN ('whole_dashboard', 'tabs')),
  ADD COLUMN cover_sheet BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN tab_per_page BOOLEAN NOT NULL DEFAULT true;
```

`delivery_scope = 'whole_dashboard'` is the existing behaviour —
all tabs. `delivery_scope = 'tabs'` reads `subscription_target_tab`.

### 1.3 `delivery_log` (existing — additive metadata)

We already write a `delivery_log` row per run. Stuff the tab list
into its existing `metadata jsonb` column so we can answer
"which tabs went out in last Monday's send?" without joining
back to subscription_target_tab (which may have been edited since).

```ts
metadata.tabs = [
  { id: '...', label: 'Sales',    rendered_pages: [4, 5, 6] },
  { id: '...', label: 'Pipeline', rendered_pages: [7, 8] },
];
```

---

## 2. API surface

Endpoints are namespaced under the existing scheduling routes.
All follow the standard `AuthMiddleware → VerifyResource →
VerifyDatabase → ZodValidation → controller` chain.

### 2.1 Create / update — multi-tab aware

`POST /scheduling/subscription/add`

```ts
const Body = z.object({
  dashboardId:   z.string().uuid(),
  name:          z.string().min(1).max(120),
  cron:          z.string(),                   // already validated as cron
  format:        z.enum(['pdf', 'xlsx', 'csv', 'png']),
  channelId:     z.string().uuid(),

  deliveryScope: z.enum(['whole_dashboard', 'tabs']).default('whole_dashboard'),
  targetTabs:    z.array(z.object({
                   dashboardTabId: z.string().uuid(),
                   displayOrder:   z.number().int().min(0),
                 })).optional(),               // required iff scope = 'tabs'

  coverSheet:    z.boolean().default(true),
  tabPerPage:    z.boolean().default(true),
});
```

Controller does, in order:

1. Validate the body.
2. Load the dashboard, ensure each `dashboardTabId` belongs to
   that dashboard (reject 400 with `BAD_REQUEST_TAB_MISMATCH`).
3. Insert `subscription` row in a transaction.
4. Insert `subscription_target_tab` rows in the same tx, with
   `tab_label = dashboard_tab.label` snapshot.
5. Register the BullMQ job with idempotent `jobId =
   sub:<id>:<scheduledTimestamp>` (no-op if already scheduled).
6. Audit-log `subscription.create` with `metadata.tabs = [...]`.
7. Respond 201 with the inserted entity + targets.

### 2.2 Read

`GET /scheduling/subscription/get/:orgId/:id` includes
`targetTabs: [{ id, dashboardTabId, displayOrder, tabLabel }]`.

### 2.3 Update tabs (subset)

`PATCH /scheduling/subscription/:id/tabs` accepts the same
`targetTabs[]` shape and replaces the join rows atomically. Order
matters — we re-write all of them.

### 2.4 Send-now (preview)

`POST /scheduling/subscription/:id/send-now` queues an out-of-band
run with the same delivery scope. Used for "preview email" and
for manual replays.

---

## 3. Renderer changes

The renderer lives in module 13 (`export_job` worker). It already
supports multi-tab PDF; we add a tab filter input.

### 3.1 PDF (browser pool render)

```ts
async function renderDashboardPdf(opts: {
  dashboardId: string;
  tabIds?: string[];          // when present, only render these
  tabOrder?: string[];        // same length as tabIds, controls page order
  coverSheet?: boolean;
  tabPerPage?: boolean;
  watermark?: string;
  parameters?: Record<string, unknown>;
  user?: AuthUser;
}): Promise<{ pdfBytes: Uint8Array; tabPages: TabPageMap }>;
```

Implementation notes:

- The Puppeteer page navigates to a special render-mode route
  `/render/dashboard/:id?tabs=<csv>&cover=1` that the FE
  recognises and renders without chrome, applying the tab
  filter to its tab strip.
- Page-break CSS: `.tab-section { break-before: page; }` if
  `tabPerPage`. If a tab is multi-page, the CSS keeps headings
  with their first chart via `break-after: avoid-page`.
- The cover sheet template is a separate Angular component
  rendered first, with: dashboard name, org branding, today's
  date in the org timezone, the list of tabs included, and the
  subscription name (if any).
- The renderer records `tabPages` — a map of tabId → page-range
  in the final PDF. This is what we stuff into `delivery_log.metadata.tabs[].rendered_pages`.

### 3.2 XLSX

One sheet per tab, named after `tab_label` (sanitised to Excel
limits: ≤ 31 chars, no `:\\/?*[]`). Each visual on the tab
becomes a contiguous block inside that sheet, with the visual
title as the H1 row and a blank row between blocks.

### 3.3 CSV

For CSV, "one file per visual" is too noisy. We collapse to
"one file per tab" (concatenated visual data tables with
visual-title separator rows), zipped together as
`<dashboard>-<YYYY-MM-DD>.zip`.

### 3.4 PNG

A single tall PNG of the *first* targeted tab. If multiple tabs
are targeted with PNG format, reject at validation time
(`BAD_REQUEST_PNG_SINGLE_TAB`). PNG is best for "screenshot in
Slack", not for multi-tab digests.

---

## 4. Scheduler (BullMQ worker)

The worker pulls a job, loads the subscription, branches on
`deliveryScope`.

```ts
async function runSubscription(jobData: { subscriptionId: string }) {
  const sub = await sm.subscription.findWithTargets(jobData.subscriptionId);
  if (!sub || sub.status !== 'active') return;

  const tabIds = sub.deliveryScope === 'tabs'
    ? sub.targetTabs.sort((a,b) => a.displayOrder - b.displayOrder).map(t => t.dashboardTabId)
    : undefined;                                  // undefined = all tabs

  const exportJob = await createExportJob({
    dashboardId: sub.dashboardId,
    format:      sub.format,
    tabIds,
    coverSheet:  sub.coverSheet,
    tabPerPage:  sub.tabPerPage,
    parameters:  sub.parameters,
    actor:       { kind: 'subscription', subId: sub.id, userId: sub.ownerUserId },
    correlationId: jobData.correlationId,
  });

  const result = await waitForExportJob(exportJob.id, { timeoutMs: 10 * 60 * 1000 });

  await dispatchToChannel(sub.channelId, {
    sub, result, tabIds,
    tabLabels: sub.deliveryScope === 'tabs'
      ? sub.targetTabs.map(t => t.tabLabel)
      : null,
  });

  await deliveryLog.write({
    subscriptionId: sub.id,
    runAt:          new Date(),
    status:         'ok',
    metadata: {
      tabs: result.tabPages
        ? Object.entries(result.tabPages).map(([id, range]) => ({
            id,
            label: sub.targetTabs.find(t => t.dashboardTabId === id)?.tabLabel,
            rendered_pages: range,
          }))
        : null,
    },
  });
}
```

Idempotency: BullMQ `jobId = sub:<id>:<scheduledTimestamp>`
ensures a paused-then-resumed worker doesn't double-send.

Failure path: a render error doesn't kill the subscription. We
record a `delivery_log` row with `status='failed'`, increment a
consecutive-failure counter, and after 3 consecutive failures
auto-pause the subscription and notify the owner.

---

## 5. Email template

The HTML email body (rendered through MJML for client compatibility)
gets a new "Tabs in this digest" section when `deliveryScope = 'tabs'`:

```
Subject:  [Acme Sales] Monday morning — Sales, Pipeline (PDF attached)

[Acme Sales]                                    Acme Inc.
Generated 7:00 AM AEST, Monday 7 July 2026

Tabs in this digest
  • Sales       (pages 1–3)
  • Pipeline    (pages 4–6)

Open dashboard →  [URL with ?tab=<first-included-tab>]

Manage this subscription →  [URL]
[Unsubscribe link]
```

The subject line lists at most 3 tab labels; beyond that:
`Sales, Pipeline, and 2 more`.

The "Open dashboard" CTA deep-links into the *first* included
tab so the customer lands on what they expect.

---

## 6. FE — subscription create/edit UI

In the existing scheduling sidebar (`scheduling-create.component.ts`):

1. Below the "Format" row, add a **Scope** radio:
   - "Entire dashboard" (default)
   - "Selected tabs"
2. When "Selected tabs" is chosen, render a tab-picker:
   - Vertical list of dashboard tabs.
   - Checkbox + drag handle per row.
   - Reordering by drag updates `displayOrder`.
3. Two checkboxes:
   - **Include cover sheet** (default ON for PDF, hidden for non-PDF).
   - **One tab per page** (default ON for PDF, hidden for non-PDF).
4. Live preview chip: "PDF will contain 2 tabs, 1 cover sheet".

Validation rules in the form:
- At least one tab must be selected if scope = 'tabs'.
- For PNG format, scope must be 'tabs' AND exactly one tab
  selected (the renderer can't produce a meaningful multi-tab
  PNG).
- A tab being deleted from the dashboard invalidates subscriptions
  that target only that tab — they get auto-paused at the BE on
  dashboard tab delete (FK has ON DELETE CASCADE on the join row,
  but we keep the parent `subscription` and surface a warning).

---

## 7. Edge cases

Each gets a test ID in §8.

| # | Scenario | Expected | Handled |
|---|---|---|---|
| E1 | All targeted tabs deleted from dashboard | Subscription auto-pauses; owner notified | `subscription.status='paused'` + notification |
| E2 | One of two targeted tabs deleted | Subscription continues with remaining tab; warning recorded in `delivery_log.metadata.warning` | Yes |
| E3 | User reorders tabs on the dashboard | Subscription emails order unchanged (we use `display_order`, not dashboard order) | Yes |
| E4 | User renames a targeted tab | Subscription email keeps the snapshot label | Yes — `tab_label` is snapshotted |
| E5 | Parameter on dashboard required, none set on subscription | Use parameter default; if no default, fail with `MISSING_REQUIRED_PARAM` | Yes |
| E6 | RLS context for the subscription owner is empty | Send empty-state cover sheet with "No data accessible" | Yes |
| E7 | Render timeout (10 min) | `delivery_log.status='failed'`; retry once after 5 min; then alert | Yes |
| E8 | Same subscription fires twice (clock skew on worker) | `jobId` deduplicates | Yes |
| E9 | Tab has no visuals | Render shows "This tab has no visuals" placeholder, not blank | Yes |
| E10 | XLSX tab label collides after Excel sanitisation | Append ` (2)`, ` (3)`, … | Yes |

---

## 8. Test plan

`docs/qa/per-tab-scheduled-exports.md` (to be written) houses the
full test case IDs `PTSE-001` … `PTSE-040`. Headline tests:

- `PTSE-001` happy path: 2 tabs, PDF, weekly, cover sheet on,
  tab-per-page on — assert PDF page count = 1 (cover) + 2 (one
  per tab); assert `delivery_log.metadata.tabs[].rendered_pages`
  contiguous.
- `PTSE-010` order: targetTabs[1] before targetTabs[0] in
  displayOrder — assert email lists in that order, PDF pages in
  that order.
- `PTSE-020` snapshot: rename a targeted tab between create and
  next send — assert email uses old label.
- `PTSE-030` deletion cascade: delete all targeted tabs — assert
  subscription paused, owner notified, no send fires.
- `PTSE-040` PNG single-tab rule: try to create with PNG + 2
  tabs — assert 400 `BAD_REQUEST_PNG_SINGLE_TAB`.

---

## 9. Migration & rollout

1. **Migration 1** — add `subscription_target_tab` table; add
   `delivery_scope`, `cover_sheet`, `tab_per_page` columns to
   `subscription`. Idempotent if re-run.
2. **Backfill** — for existing subscriptions: `delivery_scope =
   'whole_dashboard'`, no target tabs. Pure default-value back-fill;
   no data motion.
3. **Feature flag** — `feature.per_tab_subscriptions` gates the FE
   UI (the scope radio + tab picker). BE accepts the new fields
   regardless, so API clients can already use it.
4. **Soak** — internal org first, then 5% of orgs, then 100%.
5. **Deprecation** — none. The old "whole dashboard" mode is the
   default for existing subscriptions.

---

## 10. Open questions

1. **Per-tab parameters?** Should each targeted tab carry its own
   parameter overrides? Today the subscription has one parameter
   block applied to all tabs. Defer: most customers want the
   same parameters across the whole dashboard. Add later as a
   `subscription_target_tab.parameter_override` column if
   demanded.
2. **Channel-specific scope?** Today a subscription has one channel.
   Could the same scope be sent to multiple channels (Slack +
   email + S3)? Defer; orthogonal to per-tab targeting.
3. **Per-tab cron?** "Send Sales every Mon, Pipeline every Fri"
   is two subscriptions today. Easier and clearer than per-tab
   cron. Leave it.
4. **Skip empty tabs?** Should an alert-conditioned subscription
   skip tabs whose KPI didn't breach? Belongs to the alert
   subsystem (module 15 alerts), not here.

---

## 11. Controller stub (BE)

`src/controllers/scheduling/addSubscription.ts`. Follows the
DBExec convention: validation already happened in middleware,
the controller is straight-line business logic + audit + close
the master DB connection.

```typescript
import { Request, Response } from 'express';
import sendResponse from '../../utility/response';
import { CODE } from '../../config';
import { SCHED_MSG, GENERIC } from '../../constants/response.messages';
import { auditLogger } from '../../services/auditLogger.service';
import { snapshotEntity, AUDIT_FIELDS } from '../../utility/auditMetadata';
import { AUDIT_MODULES, AUDIT_ACTIONS } from '../../constants/audit.constants';
import { schedulerQueue } from '../../services/scheduler.queue';
import Logger from '../../utility/logger';

const addSubscription = async (req: Request, res: Response) => {
  Logger.info('Add subscription request');
  const {
    dashboardId, name, cron, format, channelId,
    deliveryScope, targetTabs, coverSheet, tabPerPage,
  } = req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;
  const connection = orgData.connection;

  try {
    // 1. Validate tab IDs belong to dashboard
    if (deliveryScope === 'tabs') {
      const tabs = await connection
        .getRepository('DashboardTab')
        .createQueryBuilder('t')
        .where('t.id IN (:...ids) AND t.dashboardId = :dashId', {
          ids: targetTabs.map((t: any) => t.dashboardTabId),
          dashId: dashboardId,
        })
        .getMany();

      if (tabs.length !== targetTabs.length) {
        await master_db_connection.close();
        return sendResponse(res, false, CODE.BAD_REQUEST, SCHED_MSG.TAB_MISMATCH);
      }
    }

    // 2. Insert in one tx
    const sub = await connection.transaction(async (tx: any) => {
      const subscription = await tx.getRepository('Subscription').save({
        dashboardId, name, cron, format, channelId,
        deliveryScope, coverSheet, tabPerPage,
        ownerUserId: loggedInId,
        status: 'active',
        consecutiveFailures: 0,
      });
      if (deliveryScope === 'tabs') {
        const tabRepo = tx.getRepository('SubscriptionTargetTab');
        const tabLookup = await tx.getRepository('DashboardTab')
          .find({ where: { dashboardId } });
        const labelById = new Map(tabLookup.map((t: any) => [t.id, t.label]));
        for (const t of targetTabs) {
          await tabRepo.save({
            subscriptionId: subscription.id,
            dashboardTabId: t.dashboardTabId,
            displayOrder: t.displayOrder,
            tabLabel: labelById.get(t.dashboardTabId),
          });
        }
      }
      return subscription;
    });

    // 3. Schedule the cron in BullMQ
    await schedulerQueue.upsertRepeatable({
      jobId: `sub:${sub.id}`,
      name: 'runSubscription',
      data: { subscriptionId: sub.id },
      repeat: { cron, tz: orgData.timezone ?? 'UTC' },
    });

    // 4. Audit
    await auditLogger.logAuditToOrg({
      connection, req, res,
      module: AUDIT_MODULES.SUBSCRIPTION,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'Subscription',
      entityId: sub.id,
      metadata: {
        entity: snapshotEntity(sub, AUDIT_FIELDS.SUBSCRIPTION),
        deliveryScope,
        tabCount: targetTabs?.length ?? 0,
      },
    });

    await master_db_connection.close();
    sendResponse(res, true, CODE.SUCCESS, SCHED_MSG.SUBSCRIPTION_CREATED, sub);
  } catch (error: any) {
    Logger.error(`Add subscription failed: ${error.message}`);
    await master_db_connection.close().catch(() => undefined);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default addSubscription;
```

## 12. FE component (Angular)

`src/app/modules/scheduling/components/scope-picker/scope-picker.component.ts`.
Talks to `scheduling-create.component` through a `ControlValueAccessor`
so the existing form's validation/dirty-state flows pass through.

```typescript
import { Component, forwardRef, Input, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DashboardTab } from '../../../dashboards/models/dashboard-tab.model';

export interface ScopeValue {
  deliveryScope: 'whole_dashboard' | 'tabs';
  targetTabs: Array<{ dashboardTabId: string; displayOrder: number }>;
  coverSheet: boolean;
  tabPerPage: boolean;
}

@Component({
  selector: 'app-scope-picker',
  templateUrl: './scope-picker.component.html',
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => ScopePickerComponent),
    multi: true,
  }],
})
export class ScopePickerComponent implements ControlValueAccessor, OnInit {
  @Input() dashboardTabs: DashboardTab[] = [];
  @Input() format: 'pdf' | 'xlsx' | 'csv' | 'png' = 'pdf';

  value: ScopeValue = {
    deliveryScope: 'whole_dashboard',
    targetTabs: [],
    coverSheet: true,
    tabPerPage: true,
  };

  selected = new Set<string>();
  orderedTabs: DashboardTab[] = [];

  private onChange: (v: ScopeValue) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngOnInit(): void {
    this.orderedTabs = [...this.dashboardTabs];
  }

  writeValue(v: ScopeValue): void {
    if (v) {
      this.value = v;
      this.selected = new Set(v.targetTabs.map(t => t.dashboardTabId));
    }
  }

  registerOnChange(fn: (v: ScopeValue) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }

  toggleScope(scope: 'whole_dashboard' | 'tabs'): void {
    this.value.deliveryScope = scope;
    this.emit();
  }

  toggleTab(tabId: string): void {
    if (this.selected.has(tabId)) this.selected.delete(tabId);
    else this.selected.add(tabId);
    this.refreshTargetTabs();
  }

  onReorder(ev: CdkDragDrop<DashboardTab[]>): void {
    moveItemInArray(this.orderedTabs, ev.previousIndex, ev.currentIndex);
    this.refreshTargetTabs();
  }

  private refreshTargetTabs(): void {
    this.value.targetTabs = this.orderedTabs
      .filter(t => this.selected.has(t.id))
      .map((t, i) => ({ dashboardTabId: t.id, displayOrder: i }));
    this.emit();
  }

  private emit(): void {
    this.onChange(this.value);
    this.onTouched();
  }

  // Validators consumed by the parent form
  isValid(): boolean {
    if (this.value.deliveryScope === 'whole_dashboard') return true;
    if (this.value.targetTabs.length === 0) return false;
    if (this.format === 'png' && this.value.targetTabs.length !== 1) return false;
    return true;
  }
}
```

Template excerpt (`scope-picker.component.html`) — the drag-drop
list reuses Angular CDK so the existing chart-list reorder code
in DBExec doesn't get a new dependency:

```html
<div class="scope-options">
  <p-radioButton name="scope" value="whole_dashboard"
                 [(ngModel)]="value.deliveryScope"
                 (onClick)="toggleScope('whole_dashboard')"
                 label="Entire dashboard"></p-radioButton>
  <p-radioButton name="scope" value="tabs"
                 [(ngModel)]="value.deliveryScope"
                 (onClick)="toggleScope('tabs')"
                 label="Selected tabs"></p-radioButton>
</div>

<div *ngIf="value.deliveryScope === 'tabs'" class="tab-picker">
  <p class="hint">Pick tabs and drag to reorder. The PDF will follow this order.</p>
  <div cdkDropList (cdkDropListDropped)="onReorder($event)">
    <div *ngFor="let tab of orderedTabs" cdkDrag class="tab-row">
      <p-checkbox [binary]="true"
                  [ngModel]="selected.has(tab.id)"
                  (ngModelChange)="toggleTab(tab.id)"></p-checkbox>
      <span class="tab-label">{{ tab.label }}</span>
      <i class="pi pi-bars drag-handle" cdkDragHandle></i>
    </div>
  </div>

  <div *ngIf="format === 'png' && value.targetTabs.length > 1" class="form-error">
    PNG can only render a single tab. Pick exactly one or switch format.
  </div>
</div>

<div *ngIf="format === 'pdf'" class="pdf-options">
  <p-checkbox [binary]="true" [(ngModel)]="value.coverSheet"
              label="Include cover sheet"></p-checkbox>
  <p-checkbox [binary]="true" [(ngModel)]="value.tabPerPage"
              label="Start each tab on a new page"></p-checkbox>
</div>
```

## 13. Observability

Each subscription run emits a structured log line + metrics + an
OpenTelemetry span. The span hangs off the BullMQ worker's root
span so a single `correlation_id` traces the whole flow.

**Structured log line** — one per run, written when the worker
finishes (success or fail):

```json
{
  "evt": "subscription.run",
  "subscription_id": "sub_abc",
  "org_id": "org_acme",
  "dashboard_id": "dash_xyz",
  "delivery_scope": "tabs",
  "tab_count": 2,
  "format": "pdf",
  "render_ms": 8421,
  "send_ms": 213,
  "total_ms": 8634,
  "rows_queried": 47312,
  "status": "ok",
  "correlation_id": "01HXY..."
}
```

**Prometheus metrics:**

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `dbexec_subscription_run_total` | counter | `org`, `format`, `scope`, `status` | runs by outcome |
| `dbexec_subscription_run_seconds` | histogram | `format`, `scope` | end-to-end latency |
| `dbexec_subscription_render_seconds` | histogram | `format`, `scope` | render-only latency |
| `dbexec_subscription_pdf_pages` | histogram | `org` | PDF page distribution |
| `dbexec_subscription_consecutive_failures` | gauge | `org` | for auto-pause alerting |

**Trace span attributes** on the worker root span:

- `dbexec.subscription_id`, `dbexec.dashboard_id`, `dbexec.org_id`
- `dbexec.tab_count`, `dbexec.delivery_scope`
- Child spans for `render`, `channel.dispatch`, `delivery_log.write`

## 14. Security & threat model

| Threat | Mitigation |
|---|---|
| Subscription owner deactivated → continues to email confidential data | Worker re-resolves user before render; if status ≠ active, auto-pause + audit |
| Subscription targets a tab the *recipient* shouldn't see | Render runs in the *owner*'s RLS context. The system delivers what the owner sees. Documented; warning UI at subscription create when recipient ≠ owner |
| Email channel forwarded externally | Mandatory PDF watermark with owner email + run timestamp (module 13); per-org "allow external recipients" toggle gates non-org email addresses |
| Replay of pause-resume causes double-send | BullMQ `jobId = sub:<id>` (one repeatable per subscription) + `delivery_log` idempotency key `(sub, scheduledAt)` |
| Tab rename swaps in attacker-controlled label | Snapshot `tab_label` at insert; updates require the standard CUD audit trail |
| Slack/webhook channel URL changed to attacker | Channel updates write an audit row + send "channel changed — confirm" email to subscription owner before the *next* send fires |
| SSRF in URL channel webhook | Reuses the platform-wide SSRF guard (RFC1918, link-local, cloud-metadata IPs rejected before fetch) |
| PDF render uses customer fonts → font download from attacker site | Puppeteer runs with `--no-sandbox` disabled + a content-blocked allowlist of fonts; CSS `font-src` set to org's CDN only |

## 15. Operational runbook

**Symptom: subscription not firing.**
1. Check BullMQ admin: is `sub:<id>` registered as repeatable?
   If not, re-save the subscription (re-runs the `upsertRepeatable`).
2. Check worker health: `dbexec_subscription_run_total` counter
   stalled? Worker may be wedged on a previous job — restart.
3. Check `subscription.status` — auto-paused after 3 consecutive
   failures? Inspect `delivery_log` for the last few rows.

**Symptom: subscription firing but email empty.**
1. Inspect `delivery_log.metadata.tabs[*].rendered_pages`. If
   all ranges are empty (`[]`), the renderer thinks the tab has
   no visuals.
2. Open the dashboard as the subscription owner — does RLS empty
   every visual? If yes, that's the documented "empty-state"
   outcome.
3. If visuals show data in-app but renderer shows blank: the
   render route may not be carrying the owner's session. Check
   the worker's auth-as-user step.

**Symptom: too many emails after an outage.**
1. Worker backlog after recovery can fire all the missed
   schedules at once. BullMQ has `removeOnFail` + a guard in the
   worker: if `scheduledAt < now - 6h`, skip the run and write
   `delivery_log.status = 'skipped'` with reason `'stale'`.

**Symptom: PDF render times out at 10 min.**
1. The dashboard probably has a slow visual. Open the dashboard
   directly and time each visual via the existing dev-tools
   network panel.
2. Move the slow visual to its own tab the subscription doesn't
   target, or convert to a cached materialised view (module 05).

## 16. Performance budget

| Operation | Target | Hard ceiling |
|---|---|---|
| Render full dashboard (5 tabs, 20 visuals) | p50 < 8 s, p95 < 20 s | 60 s |
| Render single tab (4 visuals) | p50 < 3 s, p95 < 8 s | 30 s |
| Channel dispatch (email) | p50 < 1 s | 10 s |
| Channel dispatch (Slack) | p50 < 1.5 s | 10 s |
| End-to-end (cron fire → recipient inbox) | p50 < 30 s, p95 < 90 s | 5 min |

If any target slips, the renderer logs a `slow_render` event
with the offending tab/visual and surfaces it on the admin
"slow subscriptions" dashboard.

## 17. References

- [13-export-download.md §4](../research/modules/13-export-download.md)
- [15-scheduling-alerts.md §4](../research/modules/15-scheduling-alerts.md)
- [08-dashboard.md §4](../research/modules/08-dashboard.md)
- [MULTI-TAB-DASHBOARD.md](MULTI-TAB-DASHBOARD.md)
