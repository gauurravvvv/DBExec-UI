# Multi-tab dashboards with scoped filtering — BE-first implementation

> Build a dashboard that holds multiple tabs (think Excel sheets), where
> a filter can be declared at dashboard / tab / visual scope and the
> filter's "applies to" set can be tightened on any of those.
>
> This doc is BE-first. FE notes appear where the contract matters.
> The shape follows the same conventions as
> `docs/be-implementation/DBEXEC-BE-IMPLEMENTATION.md` (the
> implementation reference that lives on the docs branch).

---

## Table of contents

0. [Decisions you'll see throughout](#0-decisions-youll-see-throughout)
1. [What "multi-tab" actually is — the model](#1-what-multi-tab-actually-is--the-model)
2. [Filter scope and resolution semantics](#2-filter-scope-and-resolution-semantics)
3. [Database schema](#3-database-schema)
4. [TypeORM entities](#4-typeorm-entities)
5. [Zod validators (mirrored to FE)](#5-zod-validators-mirrored-to-fe)
6. [Snapshot model — what gets frozen at publish](#6-snapshot-model--what-gets-frozen-at-publish)
7. [Controllers — full BE code](#7-controllers--full-be-code)
8. [Filter resolver service — how scopes compose](#8-filter-resolver-service--how-scopes-compose)
9. [Render flow — request to response](#9-render-flow--request-to-response)
10. [Soft-delete & cascade](#10-soft-delete--cascade)
11. [Audit, observability, perf](#11-audit-observability-perf)
12. [Backwards compatibility & migration](#12-backwards-compatibility--migration)
13. [FE contract & router state](#13-fe-contract--router-state)
14. [Test plan](#14-test-plan)
15. [Rollout & feature flag](#15-rollout--feature-flag)
16. [Out of scope (explicit)](#16-out-of-scope-explicit)

---

## 0. Decisions you'll see throughout

A few decisions shape every section below. State them up front so you
can disagree before reading 2000 lines of code based on them.

- **Snapshot stays the source of truth.** DBExec dashboards are
  snapshot-based today (`dashboard.snapshotVersion` exists, RLS is
  the only thing resolved live). We preserve that. Adding tabs
  doesn't make dashboards live; it just adds another nesting level
  in the snapshot.
- **Filter scope is a *declaration*, not a *target*.** A filter says
  "I want to participate in queries at scope X with these
  optional exclusions." It does not directly list visuals. This
  matches Tableau / Power BI semantics and lets us add visuals to
  a tab later without re-touching filter definitions.
- **Scopes compose by intersection at the visual level.** The set
  of filters that hit a given visual is computed at render time as
  the intersection of (dashboard-global ∪ tab-scope ∪ visual-scope)
  minus per-filter exclusions. The visual never sees a filter
  *added* by a child scope that conflicts with what the parent
  declared — that path is explicitly forbidden, see §2.
- **No new visualisation work.** This doc focuses on *containment*
  and *filter routing*. Charts already render. Tabs are containers.
- **One commit per moving piece.** The migration plus the
  contract change is enough to get wrong; the implementation lands
  behind a feature flag so the old single-page dashboard keeps
  working until every track flips it on per-org.

## 1. What "multi-tab" actually is — the model

Today:

```
Dashboard
└─ Visual[]   (snapshotted)
└─ Filter[]   (snapshotted)
```

After:

```
Dashboard
├─ DashboardTab[]
│   ├─ Visual[]                     (snapshotted in DashboardVisual)
│   └─ TabScopedFilter ← tabId      (FilterScope = 'tab')
├─ DashboardFilter[]                (FilterScope = 'dashboard')
└─ DashboardVisual ─ VisualScopedFilter ← visualId
                     (FilterScope = 'visual')
```

The contract:

- A **Dashboard** owns 1..N **DashboardTab** rows.
- Every **DashboardVisual** belongs to exactly one tab. A dashboard
  with no tab on disk is a "single-tab" dashboard rendered with one
  invisible default tab — that's the backwards-compat boundary.
- A **DashboardFilter** row carries a `scope` discriminator
  (`'dashboard' | 'tab' | 'visual'`), a `scopeRef` (the id of the
  tab or visual when scope ≠ dashboard), and an `excludeRefs` array
  for "applies to this scope EXCEPT these targets".
- A visual that opts out of a dashboard-global filter does so via
  `dashboard_filter.exclude_refs` (carrying the visual's id) — never
  by writing a visual-scoped row that "overrides" it. The
  resolver builds the per-visual set once; there is no override
  protocol.

### 1.1 Why a `scope` discriminator, not three tables

Three reasons:

1. **Filter resolver builds a single composite set** at render time.
   Having one table means one query, one `ORDER BY sequence`, one
   place to enforce uniqueness within a scope.
2. **Filter definition is identical across scopes** — `columnName`,
   `filterType`, `controlType`, `config`, `nullOption`, `defaultValue`.
   Only the *targeting* differs. Three tables would carry identical
   columns and accrete drift over time (we've already seen
   `analysis_filter` and the old `dashboard_filter` diverge despite
   wanting to be the same thing).
3. **Per-scope migrations stay surgical.** Adding a new scope later
   (e.g. `'section'` for grouped visuals) is one new enum value plus
   a backfill of `scopeRef`, not a new table.

The cost is the slightly bigger `scope` enum check in queries — a
fixed three-element lookup, no perf concern.

---

## 2. Filter scope and resolution semantics

The semantics that the resolver implements:

| Scope | Default reach | excludeRefs meaning |
|---|---|---|
| `dashboard` | every visual on every tab | visual ids to *exclude* |
| `tab` | every visual on the named tab | visual ids to exclude within that tab |
| `visual` | exactly one visual | always empty; the visualId is in `scopeRef` |

### 2.1 Composition rules

Given a target visual `v` on tab `t`, the **resolved filter set** is
the disjoint union of three subsets:

```
F(v) =  F_dashboard(v)  ∪  F_tab(v, t)  ∪  F_visual(v)

F_dashboard(v) = { f : f.scope = 'dashboard'
                       AND f.is_enabled
                       AND v.id NOT IN f.exclude_refs }

F_tab(v, t)   = { f : f.scope = 'tab'
                       AND f.scope_ref = t.id
                       AND f.is_enabled
                       AND v.id NOT IN f.exclude_refs }

F_visual(v)   = { f : f.scope = 'visual'
                       AND f.scope_ref = v.id
                       AND f.is_enabled }
```

These three subsets are **unioned**, not merged. Two filters on the
same column from different scopes are independent — they both run
in the WHERE chain, AND-composed. This is deliberate: a
dashboard-global "year = 2026" combined with a tab-level
"region = APAC" should compose; a tab-level "year = 2025" should
*not* silently override the dashboard-global "year = 2026".

### 2.2 Mandatory filters

A filter row carries `is_mandatory`. The current `dashboard_filter`
table already supports this. Multi-tab keeps the same semantics:

- `is_mandatory = true` at `dashboard` scope: every visual on every
  tab must have a value for this filter before the dashboard can be
  rendered. The render endpoint returns `400` with
  `requiredFilters: string[]` until the FE supplies values.
- `is_mandatory = true` at `tab` scope: visuals on that tab require
  a value; visuals on other tabs are unaffected.
- `is_mandatory = true` at `visual` scope: that one visual requires
  a value; the rest of the dashboard renders without it.

The mandatory-filter resolver is unchanged — it just needs to know
which scope each filter sits at. See §8.

### 2.3 What we explicitly disallow

These are not features; they're prevented at the validator + DB
layer:

- A visual-scoped filter that names the same column as a
  dashboard-scoped filter without explicit ack. The validator
  warns; the resolver still runs both (intersection). Listed here
  so it doesn't surprise reviewers later.
- A tab-scoped filter on a visual that's not on that tab. The
  resolver simply doesn't include it.
- A filter with `scope = 'visual'` and `excludeRefs.length > 0`.
  Visual scope reaches one visual by definition; the exclusion
  list is meaningless. Validator rejects.
- A filter with `scope = 'dashboard'` and `scopeRef != null`. The
  validator rejects — dashboard scope reaches the whole dashboard,
  there's no target id.

---

## 3. Database schema

```sql
-- migration: 2026-07-XX_multi_tab_dashboard.sql
-- All changes are additive. The single-tab dashboards that exist
-- today are backfilled with one default tab in §12.

------------------------------------------------------------------
-- 3.1 Dashboard tab — the new container
------------------------------------------------------------------
CREATE TABLE dashboard_tab (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id     uuid NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  organisation_id  uuid NOT NULL,
  name             varchar(100) NOT NULL,
  description      varchar(500),
  layout           jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence         int NOT NULL DEFAULT 0,
  is_default       boolean NOT NULL DEFAULT false,
  is_hidden        boolean NOT NULL DEFAULT false,
  icon             varchar(32),
  status           smallint NOT NULL DEFAULT 1,
  created_by       uuid,
  updated_by       uuid,
  deleted_by       uuid,
  created_on       timestamptz NOT NULL DEFAULT now(),
  updated_on       timestamptz NOT NULL DEFAULT now(),
  deleted_on       timestamptz,
  CONSTRAINT dashboard_tab_name_uniq UNIQUE (dashboard_id, name, deleted_on)
);
CREATE INDEX dashboard_tab_dashboard_seq
  ON dashboard_tab (dashboard_id, sequence)
  WHERE deleted_on IS NULL;
CREATE INDEX dashboard_tab_org
  ON dashboard_tab (organisation_id);

------------------------------------------------------------------
-- 3.2 Existing DashboardVisual gets a tab pointer.
--     Backfill in §12 places every existing visual on the
--     dashboard's default tab.
------------------------------------------------------------------
ALTER TABLE dashboard_visual
  ADD COLUMN tab_id uuid REFERENCES dashboard_tab(id) ON DELETE CASCADE;
CREATE INDEX dashboard_visual_tab ON dashboard_visual (tab_id);

------------------------------------------------------------------
-- 3.3 Existing dashboard_filter gets a scope + scopeRef + exclude.
--     The default value 'dashboard' is byte-identical to current
--     semantics so existing rows still apply globally.
------------------------------------------------------------------
ALTER TABLE dashboard_filter
  ADD COLUMN scope        varchar(16) NOT NULL DEFAULT 'dashboard'
    CHECK (scope IN ('dashboard', 'tab', 'visual')),
  ADD COLUMN scope_ref    uuid,
  ADD COLUMN exclude_refs uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- A scope_ref is required when scope is 'tab' or 'visual', and
-- forbidden when scope is 'dashboard'. The constraint is named
-- so a migration that has to drop it later can do so cleanly.
ALTER TABLE dashboard_filter
  ADD CONSTRAINT dashboard_filter_scope_ref_chk CHECK (
    (scope = 'dashboard' AND scope_ref IS NULL)
    OR (scope IN ('tab', 'visual') AND scope_ref IS NOT NULL)
  );

-- exclude_refs only makes sense on dashboard and tab scopes.
ALTER TABLE dashboard_filter
  ADD CONSTRAINT dashboard_filter_exclude_chk CHECK (
    scope <> 'visual' OR cardinality(exclude_refs) = 0
  );

CREATE INDEX dashboard_filter_scope_ref
  ON dashboard_filter (dashboard_id, scope, scope_ref)
  WHERE deleted_on IS NULL AND is_enabled = true;

------------------------------------------------------------------
-- 3.4 (Optional, see §6) snapshot_payload column on dashboard.
--     If the existing dashboard.snapshot column already holds the
--     full tree, no change. If it doesn't, we add it now.
------------------------------------------------------------------
ALTER TABLE dashboard
  ADD COLUMN IF NOT EXISTS active_tab_id uuid REFERENCES dashboard_tab(id);
```

### Notes on the constraints

- **`dashboard_tab_name_uniq`** includes `deleted_on` so a soft-
  deleted tab named "Sales" doesn't block a new tab also called
  "Sales". Postgres treats nulls as distinct in unique constraints
  by default — handy here.
- **`dashboard_filter_scope_ref_chk`** is a DB-level enforcement of
  the rule that the Zod validator also checks. Defense in depth: a
  future controller bug can't write a malformed row.
- **No FK from `dashboard_filter.scope_ref` to `dashboard_tab.id`
  or `dashboard_visual.id`** because the column is polymorphic — it
  points at one or the other depending on `scope`. We enforce
  referential integrity in the resolver instead, by treating
  unresolved refs as "filter inactive" rather than blowing up. See
  §8 for the rationale.

---

## 4. TypeORM entities

```ts
// src/shared/db/shared_entity/dashboardTab.entity.ts
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Dashboard } from './dashboard.entity';
import { DashboardVisual } from './dashboardVisual.entity';

@Entity('dashboard_tab')
@Index(['dashboardId', 'sequence'])
@Index(['organisationId'])
export class DashboardTab {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid', { nullable: false })
  dashboardId!: string;

  @ManyToOne(() => Dashboard, dashboard => dashboard.tabs, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dashboardId' })
  dashboard!: Dashboard;

  @Column('uuid', { nullable: false })
  organisationId!: string;

  @Column({ length: 100, nullable: false })
  name!: string;

  @Column({ length: 500, nullable: true })
  description?: string;

  /**
   * Per-tab layout snapshot — independent of the dashboard-level
   * layout. Same shape as `dashboard.layout`: rows / cols / grid.
   * When a dashboard renders, the active tab's layout is applied
   * to the visuals that belong to that tab.
   */
  @Column({ type: 'jsonb', nullable: false, default: () => "'{}'::jsonb" })
  layout!: Record<string, unknown>;

  @Column({ type: 'int', nullable: false, default: 0 })
  sequence!: number;

  /**
   * The backfill creates one default tab per existing dashboard
   * and marks it `is_default = true`. The default tab is the
   * fallback when the request doesn't specify a tab — typically
   * because the FE is an older client that doesn't know tabs
   * exist.
   */
  @Column({ default: false })
  isDefault!: boolean;

  @Column({ default: false })
  isHidden!: boolean;

  @Column({ length: 32, nullable: true })
  icon?: string;

  @Column({
    type: 'enum',
    enum: [0, 1],
    default: 1,
  })
  status!: number;

  @OneToMany(() => DashboardVisual, visual => visual.tab)
  visuals?: DashboardVisual[];

  @Column({ nullable: true, select: false })
  createdBy?: string;

  @Column({ nullable: true, select: false })
  updatedBy?: string;

  @Column({ nullable: true, select: false })
  deletedBy?: string;

  @CreateDateColumn({ type: 'timestamptz', nullable: true })
  createdOn?: Date;

  @UpdateDateColumn({ type: 'timestamptz', nullable: true, select: false })
  updatedOn?: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true, select: false })
  deletedOn?: Date;
}
```

```ts
// src/shared/db/shared_entity/dashboardVisual.entity.ts — additions
@Column('uuid', { nullable: true })
tabId?: string;

@ManyToOne(() => DashboardTab, tab => tab.visuals, {
  nullable: true,
  onDelete: 'CASCADE',
})
@JoinColumn({ name: 'tabId' })
tab?: DashboardTab;
```

```ts
// src/shared/db/shared_entity/dashboardFilter.entity.ts — additions
export type DashboardFilterScope = 'dashboard' | 'tab' | 'visual';

@Column({
  type: 'enum',
  enum: ['dashboard', 'tab', 'visual'],
  default: 'dashboard',
})
scope!: DashboardFilterScope;

/**
 * Polymorphic — points at a `dashboard_tab.id` when scope is
 * 'tab', a `dashboard_visual.id` when scope is 'visual', and
 * null when scope is 'dashboard'. No FK because the column is
 * polymorphic; referential integrity is enforced in the
 * resolver (unresolved refs are silently skipped, see §8).
 */
@Column('uuid', { nullable: true })
scopeRef?: string;

/**
 * Visual ids to exclude. Only meaningful when scope is
 * 'dashboard' or 'tab'. The DB check constraint forces this to
 * an empty array on scope='visual'.
 */
@Column('uuid', { array: true, nullable: false, default: () => "ARRAY[]::uuid[]" })
excludeRefs!: string[];
```

```ts
// src/shared/db/shared_entity/dashboard.entity.ts — additions
@OneToMany(() => DashboardTab, tab => tab.dashboard)
tabs?: DashboardTab[];

@Column('uuid', { nullable: true })
activeTabId?: string;   // soft pointer; used by `view-dashboard` to
                         // restore "last tab the user was on".
                         // Optional — the FE can ignore this and
                         // pick its own default.
```

---

## 5. Zod validators (mirrored to FE)

Adding to the existing `src/shared/validators/analyses.ts` (the
mirrored file). Two new schemas plus refinements on the existing
filter shape.

```ts
// src/shared/validators/analyses.ts — additions

// ── Tab schemas ────────────────────────────────────────────────────

export const TAB_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
export const TAB_LIMITS = {
  NAME_MIN: 1,
  NAME_MAX: 100,
  DESCRIPTION_MAX: 500,
  ICON_MAX: 32,
} as const;

export const dashboardTabNameSchema = z.preprocess(
  trimOrUndefined,
  z
    .string({ message: 'validation.dashboard.tab.name.required' })
    .min(TAB_LIMITS.NAME_MIN, {
      message: 'validation.dashboard.tab.name.required',
    })
    .max(TAB_LIMITS.NAME_MAX, {
      message: 'validation.dashboard.tab.name.tooLong',
    })
    .regex(TAB_NAME_PATTERN, {
      message: 'validation.dashboard.tab.name.invalid',
    }),
);

export const dashboardTabDescriptionSchema = z
  .preprocess(
    blankToUndefined,
    z.string().max(TAB_LIMITS.DESCRIPTION_MAX, {
      message: 'validation.dashboard.tab.description.tooLong',
    }),
  )
  .optional();

export const addDashboardTabSchema = z.object({
  dashboardId: idSchema('validation.dashboard.id.required'),
  name: dashboardTabNameSchema,
  description: dashboardTabDescriptionSchema,
  icon: z
    .preprocess(
      blankToUndefined,
      z.string().max(TAB_LIMITS.ICON_MAX, {
        message: 'validation.dashboard.tab.icon.tooLong',
      }),
    )
    .optional(),
  sequence: z
    .number()
    .int({ message: 'validation.dashboard.tab.sequence.invalid' })
    .min(0, { message: 'validation.dashboard.tab.sequence.invalid' })
    .optional()
    .default(0),
  isHidden: z.boolean().optional().default(false),
});
export type AddDashboardTabInput = z.infer<typeof addDashboardTabSchema>;

export const updateDashboardTabSchema = z.object({
  id: idSchema('validation.dashboard.tab.id.required'),
  name: dashboardTabNameSchema.optional(),
  description: dashboardTabDescriptionSchema,
  icon: z
    .preprocess(blankToUndefined, z.string().max(TAB_LIMITS.ICON_MAX))
    .optional(),
  sequence: z.number().int().min(0).optional(),
  isHidden: z.boolean().optional(),
  justification: analysisJustificationSchema,
});
export type UpdateDashboardTabInput = z.infer<typeof updateDashboardTabSchema>;

/**
 * Reorder a list of tabs in one shot. The dashboard view drag-
 * drops tabs into a new order; the FE collects the resulting
 * id sequence and posts it. Single transaction on the BE.
 */
export const reorderDashboardTabsSchema = z.object({
  dashboardId: idSchema('validation.dashboard.id.required'),
  tabIds: z
    .array(idSchema('validation.dashboard.tab.id.required'))
    .min(1, { message: 'validation.dashboard.tab.reorder.empty' }),
});
export type ReorderDashboardTabsInput = z.infer<typeof reorderDashboardTabsSchema>;

// ── Filter scope refinements on the existing dashboard_filter ─────

export const DASHBOARD_FILTER_SCOPES = ['dashboard', 'tab', 'visual'] as const;
export type DashboardFilterScope = (typeof DASHBOARD_FILTER_SCOPES)[number];

const scopeAndRefRule = (
  data: { scope?: string; scopeRef?: string | null; excludeRefs?: string[] },
  ctx: z.RefinementCtx,
): void => {
  const scope = data.scope ?? 'dashboard';
  if (scope === 'dashboard' && data.scopeRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeRef'],
      message: 'validation.dashboard.filter.scope.dashboardNoRef',
    });
  }
  if ((scope === 'tab' || scope === 'visual') && !data.scopeRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeRef'],
      message: 'validation.dashboard.filter.scope.refRequired',
    });
  }
  if (scope === 'visual' && data.excludeRefs && data.excludeRefs.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['excludeRefs'],
      message: 'validation.dashboard.filter.scope.visualNoExclude',
    });
  }
};

// addDashboardFilterSchema — base shape already exists; add fields:
export const addDashboardFilterSchema = z
  .object({
    dashboardId: idSchema('validation.dashboard.id.required'),
    name: filterNameSchema,
    filterType: z.preprocess(
      trimOrUndefined,
      z.enum(FILTER_TYPE_VALUES, {
        message: 'validation.analyses.filter.type.invalid',
      }),
    ),
    controlType: z.preprocess(
      trimOrUndefined,
      z.enum(FILTER_CONTROL_VALUES, {
        message: 'validation.analyses.filter.control.invalid',
      }),
    ),
    columnName: filterColumnSchema,
    defaultValue: z.any().optional(),
    config: z.record(z.string(), z.any()).optional(),
    nullOption: z
      .preprocess(
        blankToUndefined,
        z.enum(FILTER_NULL_OPTION_VALUES, {
          message: 'validation.analyses.filter.null.invalid',
        }),
      )
      .optional(),
    sequence: z.number().int().min(0).optional().default(0),
    isMandatory: z.boolean().optional().default(false),
    isEnabled: z.boolean().optional().default(true),
    // NEW —
    scope: z
      .enum(DASHBOARD_FILTER_SCOPES)
      .optional()
      .default('dashboard'),
    scopeRef: z.string().uuid().optional(),
    excludeRefs: z.array(z.string().uuid()).optional().default([]),
  })
  .superRefine(scopeAndRefRule);
export type AddDashboardFilterInput = z.infer<typeof addDashboardFilterSchema>;

export const updateDashboardFilterSchema = z
  .object({
    id: idSchema('validation.analyses.filter.id.required'),
    name: filterNameSchema.optional(),
    filterType: z
      .preprocess(
        trimOrUndefined,
        z.enum(FILTER_TYPE_VALUES, {
          message: 'validation.analyses.filter.type.invalid',
        }),
      )
      .optional(),
    controlType: z
      .preprocess(
        trimOrUndefined,
        z.enum(FILTER_CONTROL_VALUES, {
          message: 'validation.analyses.filter.control.invalid',
        }),
      )
      .optional(),
    columnName: filterColumnSchema.optional(),
    defaultValue: z.any().optional(),
    config: z.record(z.string(), z.any()).optional(),
    nullOption: z
      .preprocess(
        blankToUndefined,
        z.enum(FILTER_NULL_OPTION_VALUES, {
          message: 'validation.analyses.filter.null.invalid',
        }),
      )
      .optional(),
    sequence: z.number().int().min(0).optional(),
    isMandatory: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    scope: z.enum(DASHBOARD_FILTER_SCOPES).optional(),
    scopeRef: z.string().uuid().optional(),
    excludeRefs: z.array(z.string().uuid()).optional(),
    justification: analysisJustificationSchema,
  })
  .superRefine(scopeAndRefRule);
export type UpdateDashboardFilterInput = z.infer<typeof updateDashboardFilterSchema>;

/**
 * Render request shape — used by GET /:dashboardId/render and the
 * runQuery dispatcher. The FE supplies filter VALUES keyed by
 * filter id; the BE resolves which filters apply to which visuals
 * and composes them at render time.
 */
export const dashboardRenderRequestSchema = z.object({
  dashboardId: idSchema('validation.dashboard.id.required'),
  /**
   * Optional. When set, the renderer can pre-select the active
   * tab in the snapshot — useful for sharing a deep link to a
   * specific tab. The FE may override this client-side.
   */
  tabId: z.string().uuid().optional(),
  /**
   * Filter-id → user-supplied value(s). Mandatory filters that
   * are missing from this map will fail the render with 400.
   */
  filterValues: z.record(z.string().uuid(), z.any()).optional(),
});
export type DashboardRenderRequest = z.infer<typeof dashboardRenderRequestSchema>;
```

### 5.1 i18n keys (add to `src/assets/i18n/*.json`)

```
validation.dashboard.id.required
validation.dashboard.tab.id.required
validation.dashboard.tab.name.required
validation.dashboard.tab.name.tooLong
validation.dashboard.tab.name.invalid
validation.dashboard.tab.description.tooLong
validation.dashboard.tab.icon.tooLong
validation.dashboard.tab.sequence.invalid
validation.dashboard.tab.reorder.empty
validation.dashboard.filter.scope.dashboardNoRef
validation.dashboard.filter.scope.refRequired
validation.dashboard.filter.scope.visualNoExclude
```

---

## 6. Snapshot model — what gets frozen at publish

Today `publishDashboard` creates `DashboardVisual` + `DashboardVisualConfig`
rows that mirror the analysis state at publish time. Multi-tab
extends this with three changes — none invasive:

1. **Tabs are NOT snapshotted into a frozen JSON**. They live as
   first-class rows under the dashboard. A publish/republish edits
   them (adds, renames, reorders); the snapshot lives in those
   rows, not in `dashboard.snapshot`.
   - Why: tabs are admin-curated containers, and their lifecycle is
     decoupled from the underlying analysis state. The visual
     options inside *are* frozen at publish; the tab itself is just
     where they live.
2. **Visuals on publish get assigned to a tab.** The publish
   payload now requires a `visualToTabMap` (visualId → tabId). If
   the user is republishing and didn't change the tab assignment,
   the existing rows already have it.
3. **Filters on publish carry their scope/scopeRef/excludeRefs**
   straight from the payload. The existing snapshot helper
   (`snapshotAnalysisIntoDashboard.helper.ts`) is extended to
   pass these through; no transformation.

The snapshot column on `dashboard` is unchanged in shape — it's
still the layout-level cache. Tab membership is queried live
against `dashboard_visual.tab_id`.

### 6.1 Snapshot helper — the surgical extension

```ts
// src/shared/helpers/analyses/snapshotAnalysisIntoDashboard.helper.ts
// Existing helper, two changes:

interface PublishOptions {
  // ... existing fields ...
  /**
   * Optional. When omitted (e.g. an older FE publish payload), all
   * visuals are placed on the dashboard's default tab — which
   * itself is created if it doesn't exist yet (e.g. for a brand-
   * new dashboard or a dashboard that was published before the
   * multi-tab feature flag was on for this org).
   */
  visualToTabMap?: Record<string, string>;
  /**
   * Optional list of tabs to create / update for this publish.
   * Each tab is keyed by client-side temp id when new; the helper
   * resolves temp ids into the persisted ids and rewrites the
   * `visualToTabMap` to use real ids.
   */
  tabs?: Array<{
    tempId?: string;        // FE-supplied placeholder for new tabs
    id?: string;            // existing tab id (republish case)
    name: string;
    description?: string;
    icon?: string;
    sequence: number;
    isHidden: boolean;
  }>;
}

// Inside the publish helper transaction, two new steps run before
// the existing visual cloning:
//
//   1. Reconcile tabs (insert / update / soft-delete).
//   2. Resolve visualToTabMap temp ids → real ids.
//
// The existing visual cloning then writes `tabId` onto each new
// DashboardVisual using the resolved map.
```

---

## 7. Controllers — full BE code

Six new + two modified controllers. Filenames follow the
`src/modules/dashboards/controllers/<action>.ts` convention.

### 7.1 `addDashboardTab.ts`

```ts
/**
 * addDashboardTab — create a new tab inside an existing dashboard.
 *
 * Sequence handling:
 *   - If sequence is omitted, the new tab is appended (max seq + 1).
 *   - If sequence is supplied, tabs with sequence >= n are bumped
 *     by 1 inside the same transaction so the new tab slots in.
 *   - All sequence rewrites happen on rows that share dashboardId
 *     so concurrent dashboards don't lock each other.
 */
import { Request, Response } from 'express';
import { EntityManager } from 'typeorm';
import { CODE } from '../../../../config/config';
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
} from '../../../shared/constants/audit.constants';
import {
  DASHBOARD as DASHBOARD_MSG,
  GENERIC,
} from '../../../shared/constants/response.messages';
import { Dashboard } from '../../../shared/db/shared_entity/dashboard.entity';
import { DashboardTab } from '../../../shared/db/shared_entity/dashboardTab.entity';
import { auditLogger } from '../../../shared/services/auditLogger.service';
import {
  AUDIT_FIELDS,
  snapshotEntity,
} from '../../../shared/utility/auditMetadata';
import { getErrorMessage } from '../../../shared/utility/getErrorMessage';
import Logger from '../../../shared/utility/logger/logger';
import sendResponse from '../../../shared/utility/response';

const addDashboardTab = async (req: Request, res: Response) => {
  Logger.info('Add Dashboard Tab request');
  const { dashboardId, name, description, icon, sequence, isHidden } =
    req.body;
  const { loggedInId, orgData, master_db_connection } = res.locals;

  try {
    // Confirm parent dashboard exists in this org. The router-level
    // middleware does this for us when the dashboardId is in the
    // path; here we re-check because the id arrived in the body.
    const dashboard = await master_db_connection
      .getRepository(Dashboard)
      .findOne({
        where: { id: dashboardId, organisationId: orgData.id },
      });
    if (!dashboard) {
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.NOT_FOUND);
    }

    // Unique-name pre-check inside the dashboard scope. The DB
    // constraint will also catch this, but the early friendly
    // error avoids a generic 500 from the constraint violation.
    const existing = await master_db_connection
      .getRepository(DashboardTab)
      .findOne({
        where: { dashboardId, name },
      });
    if (existing) {
      return sendResponse(
        res,
        false,
        CODE.ALREADY_EXISTS,
        DASHBOARD_MSG.TAB_ALREADY_EXISTS,
      );
    }

    let saved!: DashboardTab;

    await master_db_connection.manager.transaction(
      async (manager: EntityManager) => {
        const tabRepo = manager.getRepository(DashboardTab);

        // Resolve sequence. If caller specified one, shift the
        // tail; otherwise append.
        let targetSeq: number;
        if (typeof sequence === 'number') {
          await manager.query(
            `UPDATE dashboard_tab
               SET sequence = sequence + 1
               WHERE dashboard_id = $1
                 AND deleted_on IS NULL
                 AND sequence >= $2`,
            [dashboardId, sequence],
          );
          targetSeq = sequence;
        } else {
          const max = await tabRepo
            .createQueryBuilder('t')
            .select('COALESCE(MAX(t.sequence), -1)', 'maxSeq')
            .where('t.dashboardId = :dashboardId', { dashboardId })
            .getRawOne<{ maxSeq: string }>();
          targetSeq = (Number(max?.maxSeq ?? -1) + 1) || 0;
        }

        const tab = tabRepo.create({
          dashboardId,
          organisationId: orgData.id,
          name,
          description,
          icon,
          sequence: targetSeq,
          isHidden: !!isHidden,
          isDefault: false,
          createdBy: loggedInId,
        });
        saved = await tabRepo.save(tab);
      },
    );

    await auditLogger.logAuditToOrg({
      connection: master_db_connection,
      req,
      res,
      module: AUDIT_MODULES.DASHBOARD,
      action: AUDIT_ACTIONS.CREATE,
      entityName: 'DashboardTab',
      entityId: saved.id,
      responseCode: CODE.SUCCESS,
      responseSuccess: true,
      metadata: {
        entity: snapshotEntity(saved, AUDIT_FIELDS.DASHBOARD_TAB),
      },
    });

    return sendResponse(res, true, CODE.SUCCESS, DASHBOARD_MSG.TAB_CREATED, {
      tab: saved,
    });
  } catch (error) {
    Logger.error(`addDashboardTab error: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};

export default addDashboardTab;
```

### 7.2 `updateDashboardTab.ts`

```ts
/**
 * updateDashboardTab — rename / reicon / hide-show / re-sequence
 * a single tab. Reorder of MANY tabs uses reorderDashboardTabs
 * because it's transactional across siblings.
 */
const updateDashboardTab = async (req: Request, res: Response) => {
  // ... boilerplate ...
  try {
    const tab = await master_db_connection
      .getRepository(DashboardTab)
      .findOne({ where: { id, organisationId: orgData.id } });
    if (!tab)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.TAB_NOT_FOUND);

    if (tab.isDefault && req.body.name && req.body.name !== tab.name) {
      // The default tab can be renamed, but the rename is audited
      // with extra metadata so we can spot drift later.
    }

    const oldSnapshot = snapshotEntity(tab, AUDIT_FIELDS.DASHBOARD_TAB);

    // Sequence change inline? Reject — use reorderDashboardTabs.
    if (typeof req.body.sequence === 'number' && req.body.sequence !== tab.sequence) {
      return sendResponse(
        res,
        false,
        CODE.BAD_REQUEST,
        DASHBOARD_MSG.TAB_REORDER_USE_DEDICATED_ENDPOINT,
      );
    }

    if (req.body.name) tab.name = req.body.name;
    if ('description' in req.body) tab.description = req.body.description;
    if ('icon' in req.body) tab.icon = req.body.icon;
    if (typeof req.body.isHidden === 'boolean') tab.isHidden = req.body.isHidden;
    tab.updatedBy = loggedInId;

    await master_db_connection.getRepository(DashboardTab).save(tab);

    await auditLogger.logAuditToOrg({
      connection: master_db_connection,
      req, res,
      module: AUDIT_MODULES.DASHBOARD,
      action: AUDIT_ACTIONS.UPDATE,
      entityName: 'DashboardTab',
      entityId: tab.id,
      metadata: {
        oldValues: oldSnapshot,
        newValues: snapshotEntity(tab, AUDIT_FIELDS.DASHBOARD_TAB),
        justification: req.body.justification ?? null,
      },
    });

    return sendResponse(res, true, CODE.SUCCESS, DASHBOARD_MSG.TAB_UPDATED, { tab });
  } catch (error) {
    Logger.error(`updateDashboardTab error: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default updateDashboardTab;
```

### 7.3 `deleteDashboardTab.ts`

```ts
/**
 * deleteDashboardTab — soft-delete a tab and cascade to its
 * visuals + visual-scoped filters + tab-scoped filters.
 *
 * Refused if the tab is the LAST visible tab on the dashboard —
 * a dashboard always needs at least one navigable surface.
 *
 * The default tab CAN be deleted, but only if another tab on the
 * dashboard is marked isDefault. Otherwise the request is
 * refused and the FE prompts the user to mark another tab as
 * default first.
 */
const deleteDashboardTab = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { orgData, master_db_connection, loggedInId } = res.locals;
  try {
    const tab = await master_db_connection.getRepository(DashboardTab).findOne({
      where: { id, organisationId: orgData.id },
    });
    if (!tab)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.TAB_NOT_FOUND);

    const visibleSiblings = await master_db_connection
      .getRepository(DashboardTab)
      .count({
        where: {
          dashboardId: tab.dashboardId,
          isHidden: false,
        },
      });
    if (visibleSiblings <= 1) {
      return sendResponse(
        res,
        false,
        CODE.BAD_REQUEST,
        DASHBOARD_MSG.TAB_LAST_VISIBLE_REFUSED,
      );
    }

    if (tab.isDefault) {
      const otherDefault = await master_db_connection
        .getRepository(DashboardTab)
        .findOne({
          where: { dashboardId: tab.dashboardId, isDefault: true },
        });
      if (!otherDefault || otherDefault.id === tab.id) {
        return sendResponse(
          res,
          false,
          CODE.BAD_REQUEST,
          DASHBOARD_MSG.TAB_DEFAULT_REASSIGN_FIRST,
        );
      }
    }

    await master_db_connection.manager.transaction(async (manager) => {
      // Cascade visuals on this tab — soft-delete each.
      await manager.query(
        `UPDATE dashboard_visual
            SET deleted_on = now(), deleted_by = $1
          WHERE tab_id = $2 AND deleted_on IS NULL`,
        [loggedInId, tab.id],
      );
      // Cascade tab-scoped filters.
      await manager.query(
        `UPDATE dashboard_filter
            SET deleted_on = now(), deleted_by = $1
          WHERE scope = 'tab' AND scope_ref = $2 AND deleted_on IS NULL`,
        [loggedInId, tab.id],
      );
      // Remove this tab id from exclude_refs of any dashboard / tab
      // scoped filter that excluded it — keeps the array consistent.
      await manager.query(
        `UPDATE dashboard_filter
            SET exclude_refs = array_remove(exclude_refs, $1::uuid)
          WHERE $1 = ANY(exclude_refs)`,
        [tab.id],
      );

      tab.deletedBy = loggedInId;
      await manager.getRepository(DashboardTab).save(tab);
      await manager.getRepository(DashboardTab).softRemove(tab);
    });

    await auditLogger.logAuditToOrg({
      connection: master_db_connection,
      req, res,
      module: AUDIT_MODULES.DASHBOARD,
      action: AUDIT_ACTIONS.DELETE,
      entityName: 'DashboardTab',
      entityId: tab.id,
      metadata: { entity: snapshotEntity(tab, AUDIT_FIELDS.DASHBOARD_TAB) },
    });

    return sendResponse(res, true, CODE.SUCCESS, DASHBOARD_MSG.TAB_DELETED);
  } catch (error) {
    Logger.error(`deleteDashboardTab error: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default deleteDashboardTab;
```

### 7.4 `listDashboardTabs.ts`

```ts
/**
 * listDashboardTabs — returns every visible tab on a dashboard,
 * ordered by sequence ASC. Hidden tabs are still returned but
 * flagged `isHidden = true` so admin UI can show them; the
 * view-mode UI hides them.
 */
const listDashboardTabs = async (req: Request, res: Response) => {
  const { dashboardId } = req.params;
  const { orgData, master_db_connection } = res.locals;

  try {
    const dashboard = await master_db_connection
      .getRepository(Dashboard)
      .findOne({ where: { id: dashboardId, organisationId: orgData.id } });
    if (!dashboard)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.NOT_FOUND);

    const tabs = await master_db_connection
      .getRepository(DashboardTab)
      .find({
        where: { dashboardId, organisationId: orgData.id },
        order: { sequence: 'ASC' },
      });

    return sendResponse(res, true, CODE.SUCCESS, '', { tabs });
  } catch (error) {
    Logger.error(`listDashboardTabs: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default listDashboardTabs;
```

### 7.5 `reorderDashboardTabs.ts`

```ts
/**
 * reorderDashboardTabs — atomically rewrites the sequence column
 * across every tab on a dashboard.
 *
 * The body carries an ordered list of tab ids. The endpoint
 * validates that EVERY tab on the dashboard appears in the list
 * exactly once — partial reorders are refused because that
 * pattern produces ambiguous results when concurrent reorders
 * race.
 */
const reorderDashboardTabs = async (req: Request, res: Response) => {
  const { dashboardId, tabIds } = req.body;
  const { orgData, master_db_connection, loggedInId } = res.locals;

  try {
    const dashboard = await master_db_connection
      .getRepository(Dashboard)
      .findOne({ where: { id: dashboardId, organisationId: orgData.id } });
    if (!dashboard)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.NOT_FOUND);

    const existing = await master_db_connection
      .getRepository(DashboardTab)
      .find({ where: { dashboardId } });

    if (existing.length !== tabIds.length)
      return sendResponse(res, false, CODE.BAD_REQUEST, DASHBOARD_MSG.TAB_REORDER_PARTIAL);

    const existingSet = new Set(existing.map(t => t.id));
    const requestedSet = new Set(tabIds);
    if (
      tabIds.some((id: string) => !existingSet.has(id)) ||
      [...existingSet].some(id => !requestedSet.has(id))
    ) {
      return sendResponse(res, false, CODE.BAD_REQUEST, DASHBOARD_MSG.TAB_REORDER_MISMATCH);
    }

    // Two-phase rewrite — first move everything to a high offset
    // so the upcoming sets don't collide with the unique
    // (dashboard_id, sequence) values we might add later. Then
    // assign final sequences. Cheap because each tab gets touched
    // twice in a single tx.
    await master_db_connection.manager.transaction(async (manager) => {
      await manager.query(
        `UPDATE dashboard_tab
            SET sequence = sequence + 100000
          WHERE dashboard_id = $1 AND deleted_on IS NULL`,
        [dashboardId],
      );
      let n = 0;
      for (const id of tabIds) {
        await manager.query(
          `UPDATE dashboard_tab
              SET sequence = $1, updated_by = $2
            WHERE id = $3`,
          [n++, loggedInId, id],
        );
      }
    });

    await auditLogger.logAuditToOrg({
      connection: master_db_connection, req, res,
      module: AUDIT_MODULES.DASHBOARD,
      action: AUDIT_ACTIONS.UPDATE,
      entityName: 'DashboardTabs (reorder)',
      entityId: dashboardId,
      metadata: { tabIds },
    });

    return sendResponse(res, true, CODE.SUCCESS, DASHBOARD_MSG.TAB_REORDERED);
  } catch (error) {
    Logger.error(`reorderDashboardTabs: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default reorderDashboardTabs;
```

### 7.6 `setDefaultDashboardTab.ts`

```ts
/**
 * setDefaultDashboardTab — promote one tab to the default. The
 * previous default (if any) is demoted in the same transaction.
 */
const setDefaultDashboardTab = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { orgData, master_db_connection, loggedInId } = res.locals;

  try {
    const tab = await master_db_connection
      .getRepository(DashboardTab)
      .findOne({ where: { id, organisationId: orgData.id } });
    if (!tab)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.TAB_NOT_FOUND);

    await master_db_connection.manager.transaction(async (manager) => {
      await manager.query(
        `UPDATE dashboard_tab
            SET is_default = false
          WHERE dashboard_id = $1 AND is_default = true`,
        [tab.dashboardId],
      );
      await manager.query(
        `UPDATE dashboard_tab
            SET is_default = true, updated_by = $1
          WHERE id = $2`,
        [loggedInId, tab.id],
      );
    });

    return sendResponse(res, true, CODE.SUCCESS, DASHBOARD_MSG.TAB_DEFAULT_SET);
  } catch (error) {
    Logger.error(`setDefaultDashboardTab: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default setDefaultDashboardTab;
```

### 7.7 Modified `renderDashboard.ts`

```ts
/**
 * renderDashboard (multi-tab) — returns
 *
 *   {
 *     dashboard: {...},
 *     tabs: DashboardTab[],
 *     activeTabId: string,
 *     visuals: DashboardVisual[],   // every visual on every tab
 *     filters: DashboardFilter[],   // every filter at any scope
 *     resolvedFiltersByVisual: Record<visualId, filterId[]>,
 *   }
 *
 * The FE can render the active tab immediately and lazy-fetch
 * sibling tab data as the user clicks across.
 *
 * `resolvedFiltersByVisual` is the per-visual filter set
 * computed by the resolver — the FE does not recompute scope.
 */
const renderDashboard = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { orgData, master_db_connection, loggedInId } = res.locals;

  try {
    const dashboard = await master_db_connection
      .getRepository(Dashboard)
      .findOne({ where: { id, organisationId: orgData.id } });
    if (!dashboard)
      return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.NOT_FOUND);

    const tabs = await master_db_connection
      .getRepository(DashboardTab)
      .find({
        where: { dashboardId: id },
        order: { sequence: 'ASC' },
      });

    // Tabs is always non-empty after the backfill in §12. Belt-
    // and-suspenders: if it somehow is (data corruption), surface
    // a clear error instead of returning a half-broken render.
    if (tabs.length === 0)
      return sendResponse(res, false, CODE.SERVER_ERROR,
        DASHBOARD_MSG.TABS_MISSING);

    const visuals = await master_db_connection
      .getRepository(DashboardVisual)
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.visualConfig', 'vc')
      .where('v.dashboardId = :id', { id })
      .andWhere('v.deletedOn IS NULL')
      .orderBy('v.sequence', 'ASC')
      .getMany();

    const filters = await master_db_connection
      .getRepository(DashboardFilter)
      .find({
        where: { dashboardId: id, isEnabled: true },
        order: { sequence: 'ASC' },
      });

    const resolvedFiltersByVisual = resolveFiltersByVisual(filters, visuals);

    const activeTabId =
      tabs.find(t => t.id === req.query.tabId)?.id ??
      tabs.find(t => t.isDefault)?.id ??
      tabs[0].id;

    return sendResponse(res, true, CODE.SUCCESS, '', {
      dashboard,
      tabs,
      activeTabId,
      visuals,
      filters,
      resolvedFiltersByVisual,
    });
  } catch (error) {
    Logger.error(`renderDashboard: ${getErrorMessage(error)}`);
    return sendResponse(res, false, CODE.SERVER_ERROR, GENERIC.SERVER_ERROR);
  }
};
export default renderDashboard;
```

### 7.8 Modified `runDashboardQuery.ts`

```ts
/**
 * runDashboardQuery (multi-tab) — execute the SQL for ONE
 * visual on a dashboard. The caller supplies the visualId and
 * a map of filter values; the resolver picks the filters that
 * apply at this visual's scope and the existing filterEngine
 * builds the WHERE clause.
 *
 * The earlier single-tab implementation accepted a flat filter
 * array. The new shape is a `filterValues` map (filterId →
 * value) because the FE no longer knows which filters apply to
 * which visual — that's the BE's job.
 */
const runDashboardQuery = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { visualId, filterValues, limit } = req.body;
  const { orgData, master_db_connection, loggedInId } = res.locals;

  // ... existing dashboard / dataset load preserved ...

  const visual = await master_db_connection
    .getRepository(DashboardVisual)
    .findOne({ where: { id: visualId, dashboardId: id } });
  if (!visual)
    return sendResponse(res, false, CODE.NOT_FOUND, DASHBOARD_MSG.VISUAL_NOT_FOUND);

  const allFilters = await master_db_connection
    .getRepository(DashboardFilter)
    .find({
      where: { dashboardId: id, isEnabled: true },
    });

  const applicableFilterIds = resolveFiltersForVisual(allFilters, visual);

  const applied: AppliedFilter[] = [];
  for (const id of applicableFilterIds) {
    const f = allFilters.find(x => x.id === id)!;
    const value = filterValues?.[id] ?? f.defaultValue;
    if (value === undefined) {
      if (f.isMandatory) {
        return sendResponse(res, false, CODE.BAD_REQUEST,
          DASHBOARD_MSG.FILTER_VALUE_MISSING,
          { filterId: id, name: f.name });
      }
      continue;
    }
    applied.push(toAppliedFilter(f, value));
  }

  // RLS continues to apply unchanged.
  const rls = await resolveRlsFilters(
    master_db_connection,
    loggedInId,
    dashboard.datasetId,
  );
  if (rls.denyAll) {
    return sendResponse(res, true, CODE.SUCCESS, QUERY_MSG.EXECUTED, []);
  }
  applied.unshift(...rls.filters);

  // ... existing SQL compose + execute path unchanged ...
};
```

The two helper functions `resolveFiltersByVisual` and
`resolveFiltersForVisual` are in `dashboardFilterScope.service.ts`
— see §8.

---

## 8. Filter resolver service — how scopes compose

```ts
// src/shared/services/dashboardFilterScope.service.ts

import { DashboardFilter } from '../db/shared_entity/dashboardFilter.entity';
import { DashboardVisual } from '../db/shared_entity/dashboardVisual.entity';

/**
 * For a single visual, return the IDs of the filters that apply.
 * See §2 for the formal rule. This is the hot path called by
 * `runDashboardQuery`; keep it O(n_filters) with no IO.
 */
export function resolveFiltersForVisual(
  filters: DashboardFilter[],
  visual: DashboardVisual,
): string[] {
  const out: string[] = [];
  for (const f of filters) {
    if (!f.isEnabled) continue;

    if (f.scope === 'dashboard') {
      if (f.excludeRefs.includes(visual.id)) continue;
      out.push(f.id);
      continue;
    }

    if (f.scope === 'tab') {
      if (!visual.tabId) continue;          // visual not on a tab
      if (f.scopeRef !== visual.tabId) continue;
      if (f.excludeRefs.includes(visual.id)) continue;
      out.push(f.id);
      continue;
    }

    if (f.scope === 'visual') {
      if (f.scopeRef !== visual.id) continue;
      out.push(f.id);
      continue;
    }
  }
  return out;
}

/**
 * Compute the per-visual filter map for a render response. Same
 * logic as `resolveFiltersForVisual` but folded over every visual
 * on the dashboard. Returns `{ visualId: filterId[] }`.
 */
export function resolveFiltersByVisual(
  filters: DashboardFilter[],
  visuals: DashboardVisual[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const v of visuals) {
    out[v.id] = resolveFiltersForVisual(filters, v);
  }
  return out;
}

/**
 * For an admin UI showing "which visuals does this filter touch?",
 * the inverse function. Useful in the dashboard-edit screen so the
 * filter pill can show a tooltip "applies to 7 visuals on 3 tabs".
 */
export function visualsTouchedByFilter(
  filter: DashboardFilter,
  visuals: DashboardVisual[],
): string[] {
  switch (filter.scope) {
    case 'dashboard':
      return visuals
        .filter(v => !filter.excludeRefs.includes(v.id))
        .map(v => v.id);
    case 'tab':
      return visuals
        .filter(v => v.tabId === filter.scopeRef && !filter.excludeRefs.includes(v.id))
        .map(v => v.id);
    case 'visual':
      return visuals.find(v => v.id === filter.scopeRef) ? [filter.scopeRef!] : [];
  }
}
```

### 8.1 Unresolved scopeRef policy

If a filter row has `scope = 'tab'` and `scopeRef` points at a tab
that's been soft-deleted, the resolver silently skips that filter
(no visual matches). The DB cascade in §7.3 cleans these up at tab
delete time, so this should never happen in practice — but defence
in depth: silently dropping a stale filter is safer than crashing
the render or accidentally applying it to no visuals (which is the
same effect as silent drop). The same logic applies to a
visual-scoped filter pointing at a deleted visual.

---

## 9. Render flow — request to response

```
┌──────────────────────────────────────────────────────────────────┐
│ GET /api/v1/dashboards/:id/render?tabId=<optional>               │
└──────┬───────────────────────────────────────────────────────────┘
       │
       ▼
   Load Dashboard (org-scoped)        ──► 404 if not found
       │
       ▼
   Load DashboardTab[] (order seq)    ──► 500 if none (backfill broke)
       │
       ▼
   Load DashboardVisual[] (with config)
       │
       ▼
   Load DashboardFilter[] (enabled, all scopes)
       │
       ▼
   resolveFiltersByVisual(filters, visuals)
       │
       ▼
   Pick activeTabId = req.query.tabId || isDefault tab || tabs[0]
       │
       ▼
   sendResponse({ dashboard, tabs, activeTabId,
                  visuals, filters, resolvedFiltersByVisual })

       ─── then per-visual, the FE calls ─────────────────────────

┌──────────────────────────────────────────────────────────────────┐
│ POST /api/v1/dashboards/:id/run                                  │
│   body: { visualId, filterValues: { filterId: value, ... }, limit }
└──────┬───────────────────────────────────────────────────────────┘
       │
       ▼
   Load Dashboard, DashboardVisual (org-scoped)
       │
       ▼
   Load DashboardFilter[] (enabled, all scopes)
       │
       ▼
   resolveFiltersForVisual(filters, visual)  → applicableFilterIds
       │
       ▼
   Compose AppliedFilter[] from filterValues + defaults
       │   (return 400 if mandatory missing)
       ▼
   resolveRlsFilters(...) → either denyAll (return []) or rls.filters
       │
       ▼
   Compile SQL, run on datasource pool (with statement_timeout),
   enrich custom fields, return rows.
```

### 9.1 N visuals × 1 dashboard — performance

Each visual is one POST `/run`. That means N round-trips for N
visuals, which is exactly how the single-tab dashboard works
today. We are NOT introducing a new performance issue.

The optimisation is straightforward — a `/dashboards/:id/runAll`
endpoint that fans out the per-visual queries with
`Promise.allSettled` server-side and returns a unified response.
We can build this once usage data shows the round-trip cost matters.
It's listed in §16 as deferred.

---

## 10. Soft-delete & cascade

Deletion semantics matrix:

| Action | Tab visuals | Tab filters | Dashboard filters that excluded this tab |
|---|---|---|---|
| Soft-delete tab | Soft-deleted (cascade) | Soft-deleted (cascade) | `excludeRefs` array updated to drop the deleted tab's id |
| Soft-delete a visual on a tab | n/a | Visual-scoped filters pointing at it soft-deleted (cascade); `excludeRefs` arrays cleaned up | same |
| Soft-delete dashboard | All tabs soft-deleted | All filters at any scope soft-deleted | n/a |

The cascade helper is centralised in `cascadeSoftDelete.ts` already
— add three new functions:

```ts
// src/shared/utility/cascadeSoftDelete.ts — additions

export async function cascadeDashboardTabChildren(
  manager: EntityManager,
  tabId: string,
  loggedInId: string,
) {
  await manager.query(
    `UPDATE dashboard_visual
        SET deleted_on = now(), deleted_by = $1
      WHERE tab_id = $2 AND deleted_on IS NULL`,
    [loggedInId, tabId],
  );
  await manager.query(
    `UPDATE dashboard_filter
        SET deleted_on = now(), deleted_by = $1
      WHERE scope = 'tab' AND scope_ref = $2 AND deleted_on IS NULL`,
    [loggedInId, tabId],
  );
  await manager.query(
    `UPDATE dashboard_filter
        SET exclude_refs = array_remove(exclude_refs, $1::uuid)
      WHERE $1 = ANY(exclude_refs)`,
    [tabId],
  );
}

export async function cascadeDashboardVisualChildren(
  manager: EntityManager,
  visualId: string,
  loggedInId: string,
) {
  await manager.query(
    `UPDATE dashboard_visual_config
        SET deleted_on = now(), deleted_by = $1
      WHERE dashboard_visual_id = $2 AND deleted_on IS NULL`,
    [loggedInId, visualId],
  );
  await manager.query(
    `UPDATE dashboard_filter
        SET deleted_on = now(), deleted_by = $1
      WHERE scope = 'visual' AND scope_ref = $2 AND deleted_on IS NULL`,
    [loggedInId, visualId],
  );
  await manager.query(
    `UPDATE dashboard_filter
        SET exclude_refs = array_remove(exclude_refs, $1::uuid)
      WHERE $1 = ANY(exclude_refs)`,
    [visualId],
  );
}

// Existing cascadeDashboardChildren is extended to call
// cascadeDashboardTabChildren for every tab on the dashboard.
```

---

## 11. Audit, observability, perf

### 11.1 Audit fields

```ts
// src/shared/utility/auditMetadata.ts — additions

export const AUDIT_FIELDS = {
  // ... existing ...
  DASHBOARD_TAB: [
    'id', 'dashboardId', 'name', 'description', 'icon',
    'sequence', 'isDefault', 'isHidden', 'status',
    'createdOn', 'updatedOn',
  ],
  DASHBOARD_FILTER: [
    'id', 'dashboardId', 'name', 'columnName', 'filterType',
    'controlType', 'config', 'defaultValue', 'nullOption',
    'sequence', 'isMandatory', 'isEnabled',
    'scope', 'scopeRef', 'excludeRefs',
    'createdOn', 'updatedOn',
  ],
};
```

### 11.2 Audit actions

Tab CUD audits with module = `'dashboard'`, entityName =
`'DashboardTab'`. Filter audits keep `'dashboard'` module and
`'DashboardFilter'` entity name. Reorder + setDefault are audited
as `UPDATE` actions on the parent dashboard with the tab id list
in metadata, not on individual tabs.

### 11.3 Observability

Counters worth adding (BullMQ / Prom / your stack of choice):

- `dashboard.tab.created`, `.updated`, `.deleted`, `.reordered`
- `dashboard.filter.created` tagged by `scope` (label values:
  `dashboard | tab | visual`)
- `dashboard.render.duration_ms` (P50, P95) tagged by tab count
- `dashboard.render.tabs_count` (gauge per request)
- `dashboard.render.filter_resolution_ms` (P95) — the hot path
  the resolver lives on

### 11.4 Indices

The new indices in §3 give the resolver an indexed path for the
single query it makes. The hot path is:

```sql
SELECT * FROM dashboard_filter
WHERE dashboard_id = $1
  AND is_enabled = true
  AND deleted_on IS NULL;
```

The partial index `dashboard_filter_scope_ref` covers it. No
sequential scan even on dashboards with hundreds of filters.

For the visual lookup:

```sql
SELECT * FROM dashboard_visual
WHERE dashboard_id = $1
  AND deleted_on IS NULL
ORDER BY sequence ASC;
```

The existing `dashboard_visual_dashboard` index covers it. Adding
`tab_id` is fine; the resolver iterates the result set in-memory.

---

## 12. Backwards compatibility & migration

### 12.1 Backfill

Run after the schema migration:

```sql
-- 1. Create one default tab per existing dashboard.
INSERT INTO dashboard_tab (
  id, dashboard_id, organisation_id, name, sequence,
  is_default, is_hidden, status, created_by, created_on, updated_on
)
SELECT
  gen_random_uuid(),
  d.id,
  d.organisation_id,
  'Overview',          -- friendly default name
  0,
  true,
  false,
  1,
  d.created_by,
  now(),
  now()
FROM dashboard d
WHERE d.deleted_on IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dashboard_tab dt
    WHERE dt.dashboard_id = d.id
  );

-- 2. Assign every existing visual to its dashboard's default tab.
UPDATE dashboard_visual dv
SET tab_id = dt.id
FROM dashboard_tab dt
WHERE dv.dashboard_id = dt.dashboard_id
  AND dt.is_default = true
  AND dv.tab_id IS NULL;

-- 3. Existing dashboard_filter rows already default scope to
--    'dashboard' and excludeRefs to []. No backfill needed.
```

The backfill is idempotent — re-running won't double-create.

### 12.2 Old client compatibility

The render response is a strict superset of the old one. The old
FE that reads `{ dashboard, visuals, filters }` and ignores
`tabs`, `activeTabId`, `resolvedFiltersByVisual` will still work
— it just won't render tab navigation.

The old run-query body shape is rejected by the new
`runDashboardQuery` because the resolver needs the visualId.
Two ways to handle this:

- **Strict cutover** — bump the API path to `/api/v2/...` for the
  new shape. Old FE keeps hitting v1. Cost: maintaining two paths.
- **Lenient mode** (chosen) — `runDashboardQuery` accepts BOTH
  shapes. If `visualId` is missing, behaviour falls back to the
  pre-multi-tab semantics (treat the dashboard as a single
  invisible-tab board, apply filters globally). The feature flag
  `enableMultiTabDashboards` per org controls whether new filter
  scopes can be saved; reads handle either shape regardless.

### 12.3 Migration ordering

```
1. Deploy BE with the feature OFF — schema + entities + new
   controllers exist but the flag is off everywhere. Old behaviour
   exactly preserved.
2. Run the backfill migration.
3. Deploy FE with tab UI gated by the flag.
4. Enable per org. Smoke-test. Roll forward.
5. After 2 weeks of stable usage, remove the flag and the
   compatibility branch.
```

---

## 13. FE contract & router state

### 13.1 URL state

```
/app/dashboards/<id>?tab=<tabId>&f.<filterName>=<value>...
```

- `tab=` selects the active tab. Persisted in `dashboard.activeTabId`
  via a PATCH the FE fires when the user navigates (debounced).
- `f.<name>=value` is the user-supplied filter value pattern. The
  filter-name key (not id) keeps URLs human-readable; FE looks up
  the matching filter by name within the active dashboard.

### 13.2 FE filter-bar grouping

The filter bar groups by scope when both dashboard-global and
tab-specific filters exist:

```
┌──────────────────────────────────────────────────────────────┐
│ [Region: APAC ▾] [Period: MTD ▾]   ← dashboard-global       │
├──────────────────────────────────────────────────────────────┤
│ [Sales] [Marketing] [Finance]   ← tab strip                  │
├──────────────────────────────────────────────────────────────┤
│ [Product: All ▾] [Channel: Online ▾]   ← Sales-tab only     │
│ ┌──────────────────────────────┐ ┌────────────────────────┐ │
│ │ Visual 1 [⨯ Period excluded] │ │ Visual 2               │ │
│ │ <revenue trend>              │ │ <conversion funnel>    │ │
│ │ ⚙ filter exclusion chip      │ │                        │ │
│ └──────────────────────────────┘ └────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

The exclusion chip on Visual 1 is rendered when the user, in edit
mode, clicked "this visual doesn't follow the Period filter" — the
FE adds the visual id to `excludeRefs` and re-saves the filter.

### 13.3 Filter scope picker (edit mode)

When adding or editing a filter, the picker shows three radios:

```
○ Apply to entire dashboard
○ Apply to this tab only
○ Apply to selected visuals only        (list multi-select)
```

The third radio is implemented via `scope = 'visual'` plus N
separate rows (one per visual). For >5 visuals the FE batches them
into a single transaction call `/dashboard-filter/bulk-create`
which the BE serves by wrapping a `BEGIN ... COMMIT` around N
saves.

---

## 14. Test plan

### 14.1 BE — controller-level

```
DSH-TAB-H-01   add tab on existing dashboard → 200 + tab in list
DSH-TAB-H-02   add tab when name already exists → 405
DSH-TAB-H-03   add tab with sequence in middle → others bumped
DSH-TAB-H-04   update tab name → audit metadata captures diff
DSH-TAB-H-05   update tab sequence → 400, asks for reorder endpoint
DSH-TAB-H-06   delete last visible tab → 400
DSH-TAB-H-07   delete default tab when no other default → 400
DSH-TAB-H-08   delete tab → visuals cascade soft-deleted
DSH-TAB-H-09   delete tab → tab-scoped filters cascade
DSH-TAB-H-10   delete tab → excludeRefs of dashboard filters
               drop the deleted tab's id
DSH-TAB-H-11   reorder tabs → partial list rejected
DSH-TAB-H-12   reorder tabs → exact id-set required
DSH-TAB-H-13   setDefault tab → previous default demoted
```

### 14.2 Filter-scope resolver — unit

```
DSH-FLT-H-01   dashboard-scope filter applies to all visuals
DSH-FLT-H-02   dashboard-scope w/ excludeRefs → that visual skipped
DSH-FLT-H-03   tab-scope filter applies only to that tab's visuals
DSH-FLT-H-04   tab-scope w/ excludeRefs → that visual skipped
DSH-FLT-H-05   visual-scope filter applies to exactly one visual
DSH-FLT-H-06   visual-scope with excludeRefs → schema rejects
DSH-FLT-H-07   tab-scope with no scopeRef → schema rejects
DSH-FLT-H-08   dashboard-scope with scopeRef → schema rejects
DSH-FLT-H-09   disabled filter (is_enabled=false) → never applies
DSH-FLT-H-10   deleted tab → tab-scope filter silently inactive
DSH-FLT-H-11   deleted visual → visual-scope filter silently inactive
DSH-FLT-H-12   two filters same column different scope → both apply
                (AND-composed in SQL)
```

### 14.3 Render — integration

```
DSH-RND-H-01   render dashboard → tabs sorted by sequence
DSH-RND-H-02   tabId query param → that tab is activeTabId
DSH-RND-H-03   no tabId → default tab is activeTabId
DSH-RND-H-04   resolvedFiltersByVisual contract matches
                resolveFiltersForVisual unit logic
DSH-RND-H-05   render w/ all filters disabled → empty
                resolvedFiltersByVisual.values()
DSH-RND-H-06   render w/ dashboard having no tabs → 500 + clear
                error (backfill failed)
```

### 14.4 Run-query — integration

```
DSH-RUN-H-01   run visual on tab A → only filters at dashboard,
                tab=A, visual=this-id apply
DSH-RUN-H-02   run visual on tab A with a tab=B filter set →
                tab=B filter NOT applied
DSH-RUN-H-03   mandatory dashboard filter with no value → 400 +
                filterId in response
DSH-RUN-H-04   mandatory tab filter on different tab → not
                blocking for visuals off that tab
DSH-RUN-H-05   RLS still applies on top of resolved filters
DSH-RUN-H-06   RLS denyAll → empty success, no SQL executed
```

### 14.5 Cascade

```
DSH-CSC-H-01   soft-delete dashboard → tabs + filters + visuals
                all soft-deleted
DSH-CSC-H-02   soft-delete tab → visuals + tab-filters cascade
DSH-CSC-H-03   soft-delete visual → visual-filters cascade,
                excludeRefs cleaned
```

### 14.6 Migration / backfill

```
DSH-MIG-H-01   pre-migration dashboard renders the same after
                migration (same visuals, same filters, default tab
                created)
DSH-MIG-H-02   backfill idempotent — running twice doesn't
                duplicate default tabs
DSH-MIG-H-03   old FE hitting /render gets a strict-superset
                response and ignores new fields
```

---

## 15. Rollout & feature flag

```ts
// src/shared/services/featureFlags.singleton.ts already exists
// (see DBEXEC-BE-IMPLEMENTATION.md §0.1). Add one flag:

const MULTI_TAB = 'enableMultiTabDashboards';

// Gating:
//
// - All NEW filter-scope writes (tab, visual scopes) require the
//   flag ON for the caller's org. Off-flag callers can only write
//   scope = 'dashboard'.
// - The new tab CRUD endpoints (add/update/delete/reorder/
//   setDefault) return 403 with FEATURE_NOT_ENABLED when the flag
//   is off.
// - READ paths (render, list-tabs, run-query) always work — they
//   transparently handle the single-tab fallback so we don't have
//   to keep two render code paths.
```

The flag is org-scoped because some customers will roll out
multi-tab to specific tenants first while keeping the rest on the
single-page flow.

---

## 16. Out of scope (explicit)

Listed so reviewers can defend against scope creep:

- **`POST /:id/runAll`** — server-side fan-out of per-visual
  queries. Build only when usage data shows the round-trip
  matters.
- **Tab-level scheduled exports** ("email me the Sales tab every
  Monday"). Subscriptions exist at dashboard level today; tab
  granularity is a follow-up.
- **Per-tab access control** ("Bob can see the Sales tab but not
  Finance"). The current model is dashboard-level access; tab-
  scoping access is a permission-system change.
- **Cross-tab parameters / linked filters** ("clicking a row on
  Sales filters the Finance tab"). Cross-filter / drill is its
  own feature, tracked separately.
- **Tab templates** ("make this layout reusable across
  dashboards"). Template management is a different surface.
- **Per-tab theme override**. Theme override exists at dashboard
  level only.

If any of these come up during review, push back: this doc is
about the multi-tab container + scoped filter resolution, not a
dashboard rewrite.

---

## Closing checklist

When this lands:

1. Migration committed under `src/shared/db/migrations/`.
2. Entities added in `src/shared/db/shared_entity/`.
3. Validators in `src/shared/validators/analyses.ts` (mirrored
   to FE) — superrefine added for scope validity.
4. Controllers in `src/modules/dashboards/controllers/` —
   `addDashboardTab.ts`, `updateDashboardTab.ts`,
   `deleteDashboardTab.ts`, `listDashboardTabs.ts`,
   `reorderDashboardTabs.ts`, `setDefaultDashboardTab.ts`. Plus
   modifications to `renderDashboard.ts` and `runDashboardQuery.ts`.
5. Resolver in `src/shared/services/dashboardFilterScope.service.ts`.
6. Routes mounted in `dashboards.routes.ts` — five new endpoints
   plus the two modified existing ones.
7. Audit fields registered in `auditMetadata.ts`.
8. Cascade helpers in `cascadeSoftDelete.ts`.
9. Feature flag wired.
10. i18n keys added to all 10 locale JSONs.
11. Tests authored.
12. Backwards-compat verified — single-tab dashboards still
    render byte-identical under the off-flag path.

This is the BE-side blueprint for multi-tab + scoped filters.
Pair it with §13's FE notes and you have an end-to-end plan.
