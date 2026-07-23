# Analyses Module Overhaul — Implementation Plan

> **Scope:** the **Analyses authoring** experience — the "visual box" (config
> panel + chart card), missing chart types, multitab authoring, and more
> configurability. Dashboard consumption is a later pass (visuals are cloned
> into DashboardVisual at publish, so the shared render/theme work here carries
> over). Full-stack where needed (mostly FE; BE touches are additive).
>
> **Source of truth:** `GAP-ANALYSIS.md` (this folder) — the audit + market
> research + P0→P2 gap tables. `visual-box-mockup.html` — the target visual.
>
> **Goal:** bring the Analyses visual box to BI-tool standard (Tableau / Power
> BI / Metabase / Superset), beating current competitors on config UX + polish.
>
> **Execution model:** write plan → user sign-off → fan out agents to build
> **Wave 1**, verify + commit, review, then Wave 2, etc. One integration branch
> per wave off `version_261`; I verify each agent's work; squash to one commit
> per repo per wave. **User pushes. Never commit `.env` / `environment*.ts`.**

## Global constraints (apply to every task)

- **Stack:** Angular 18 (module-based, `OnPush`) + PrimeNG 17/19 + ECharts.
  Reuse shared `app-custom-*` controls; style with design tokens only
  (`--primary-color`, `--fs-*`, `--space-*`), never hard-coded values.
- **i18n:** every user-facing string is a `| translate` key, filled in all 10
  locales (`en de es fr it ja ko nl pt-BR zh-CN`). Reuse existing keys where the
  wording already exists.
- **Verify gate (before "done"):** FE `tsc --noEmit` → `ngc -p tsconfig.app.json
--noEmit` → `ng build --configuration production`. BE `tsc --noEmit` → build.
- **Onboarding-safe DDL:** any new per-org column is additive + nullable,
  auto-named `@Index`, apostrophe-free entity comment.
- **Config is a JSONB blob** on `VisualConfig.config` ("40+ tunables") — new
  keys land without a migration. Prefer adding keys there over new columns.
- **Commit trailer required** (Co-Authored-By + Claude-Session).

## Key files (current, verified)

**FE — `DBExec-UI/src/app/modules/analyses/components/`**

- `visual-config-sidebar/` — the config panel. `.ts` 1610 lines, `.html` 4181
  lines, 67 `config-section`s. **The central file of Wave 1.**
- `visuals-chart-sidebar/` — chart-type picker + role-slot field assignment
  (`getChartRoles`, `getRoleSlots`). ~490 lines.
- `chart-renderer/` — wraps the render. ~163 lines.
- `edit-analyses/` — the authoring shell (hosts tabs + visual box).
- `table-visual/`, `kpi-card/`, `analysis-widget-editor/`, `filter-dialog/`,
  `analysis-filter-bar/`, `analysis-parameter-bar/`.
- `../services/analysis-tabs.service.ts` — **multitab service already exists.**

**FE — shared** `src/app/shared/components/echart-visual/` (ECharts render),
`configurable-card-chart/` (card wrapper).

**BE — `DBExec-API/src/modules/`**

- `analyses/controllers/` — runAnalysisQuery, updateAnalysis, getAnalysis, …
- `analysis-tabs/controllers/` — add/list/update/delete/reorder **(multitab BE
  exists).**
- `../shared/db/shared_entity/visual_config.entity.ts` — `chartType`,
  `xAxisColumn`, `yAxisColumn`, `config` (JSONB), aggregation columns.

---

# WAVE 1 — Presentation (lowest risk, highest perceived impact)

> Pure presentation over the existing DOM + a shared ECharts theme. This is what
> answers "looks below standard" with the least regression risk. **Fan out 4
> agents** (one per task); tasks are independent.

## Task 1.1 — Config panel: sticky header + accordion sections + search

**Files:** `visual-config-sidebar/visual-config-sidebar.component.{html,ts,scss}`

**Interfaces produced:** `openSections: string[]` state on the component;
`sectionSearch: string`; each `config-section` wrapped in a keyed accordion panel.

Steps:

1. Add a **sticky panel header** at the top of the sidebar scroll container:
   focused-visual name + chart-type icon (left), overflow `p-menu` (right) with
   placeholders for "Reset section" / "Reset all" / "Advanced JSON" (wired in
   later waves). `position: sticky; top: 0`, solid bg, bottom border. Retire the
   lone `sidebar-divider`.
2. Convert the 67 `config-section` blocks to **PrimeNG `p-accordion`** panels
   (`[multiple]="true"`), `section-title` → `p-accordionheader`. Drive open state
   from `openSections: string[]` so it survives chart re-render + language change.
   **Default open:** `Data` + the current chart type's primary options only.
3. Each accordion header gets: a leading category icon, a right-aligned
   **"N set" summary chip** (count of non-default keys in that section), and a
   per-section reset icon-button (visible only when the section differs from
   defaults — reset handler stubbed until Task 3.x).
4. Add a **search box** (`p-iconfield`) pinned under the header. Build a static
   `{ sectionKey, controlLabel, keywords[] }` index at init (reuse the already-
   localized label arrays); on input, expand matching panels + dim non-matches.
   Re-index on language change beside the existing localize call.
5. **Verify:** tsc + ngc + prod build green; the panel renders as collapsible
   sections with only Data open, search filters/expands.

## Task 1.2 — Config panel: consistent control layout + typography rhythm

**Files:** `visual-config-sidebar.component.{html,scss}` (+ shared `app-custom-*`
if a `[disabled]`+tooltip forward is needed)

Steps:

1. Apply the **one-layout-per-control-shape rule** mechanically: boolean toggles
   - single dropdowns → `config-row` (label left, control right); anything with a
     sub-control / slider-with-value / multi-line → `config-group` (stacked).
2. Restyle `section-title` as a small-caps tracked label at reduced weight; drop
   inline `<hr>`-style dividers between groups in favour of `--space-*` gaps.
3. Where a control is inapplicable due to a **sibling setting** (not chart type),
   replace vanishing `*ngIf` with `[disabled]` + `pTooltip` ("Enable Smooth curve
   to adjust smoothness"). Keep `*ngIf` for chart-type-irrelevant controls.
4. **Verify:** tsc + ngc + prod build; visual rhythm consistent, no controls
   silently vanish where a tooltip would help.

## Task 1.3 — Register a DBExec ECharts theme (highest-leverage chrome fix)

**Files:** new `src/app/shared/components/echart-visual/dbexec-echarts-theme.ts`;
`echart-visual.component.ts` (register + apply).

**Interfaces produced:** `registerDbexecEchartsTheme()` called once at module
init; `<div echarts [theme]="'dbexec'">` or `echarts.init(el, 'dbexec')`.

Steps:

1. Build a theme object: brand **color palette** (derived from `--primary-color`
   - a categorical ramp), axis + **faint gridline** styling, **tooltip** styling
     (card bg, border, shadow, tabular-nums), legend, `textStyle` (Inter),
     `valueFormatter` defaults. Read tokens via `getComputedStyle` at register time
     so light/dark both work.
2. `echarts.registerTheme('dbexec', theme)` once; apply on every `echarts.init`
   in `echart-visual`. Remove now-redundant per-chart option color tweaks.
3. **Verify:** tsc + ngc + prod build; charts render with the brand palette,
   consistent grid/tooltip across ≥3 chart types.

## Task 1.4 — Chart card chrome: kebab header + framed states

**Files:** `configurable-card-chart/` (card wrapper), `chart-renderer/`,
`echart-visual.component.{html,scss}`

Steps:

1. Collapse the header **icon-soup** (export / duplicate / refresh / …) into a
   single **`p-menu` kebab**; header row keeps title, optional subtitle (period /
   unit), and the kebab.
2. Add **framed states inside the card**: empty / no-data (icon + message),
   error (icon + message + retry), loading (skeleton) — not a blank canvas or a
   global spinner.
3. Normalize card body padding + typography to design tokens.
4. **Verify:** tsc + ngc + prod build; card shows kebab; force each of
   empty/error/loading and confirm it renders inside the frame.

**Wave 1 integration:** branch `feature/analyses-wave1-presentation` off
version_261; I verify each agent's HEAD, reconcile the shared `echart-visual`
touch (Tasks 1.3 + 1.4 both edit it — sequence 1.3 → 1.4 or one agent owns the
file), squash to one FE commit. i18n keys for any new labels in all 10 locales.

---

# WAVE 2 — Structure (the behavioural leap)

## Task 2.1 — Data / Format tabs + re-query flag

**FE:** `visual-config-sidebar` — wrap sections in two `p-tabs` (`Data`,
`Format`), Data first; classify each section `reQueries: boolean`; fold the
`visuals-chart-sidebar` role slots + field tree into the Data tab.
**Contract change:** `configChanged.emit({ config, requiresRequery })`; the
`edit-analyses` host skips the server round-trip for format-only edits and calls
`chart.setOption()` directly. Keep the OnPush + `ngDoCheck` snapshot machinery.

## Task 2.2 — Interactive field pills (inline aggregate)

**FE:** role-slot bound column → `app-chip` opening a `p-popover` sub-editor
(column ▸ aggregate ▸ percentile/date-trunc ▸ alias ▸ remove). Chip label shows
`SUM(Revenue)`. Reuse existing setters (`updateComboMeasure`, `setRoleOnVisual`,
`percentileValue`).

## Task 2.3 — Multitab authoring surface (FE — BE already exists)

**FE:** surface the existing `analysis-tabs.service.ts` + BE `analysis-tabs`
endpoints in `edit-analyses` as a proper tab strip (add / rename / reorder /
delete, chip-styled add control per the earlier analysis-tab work). Each tab
holds its own visuals/layout. **BE:** already built (add/list/update/delete/
reorder) — wire only; verify onboarding-safe.

---

# WAVE 3 — Parity (close P1 feature gaps)

## Task 3.1 — Format live preview + palette swatches

Number/date format group gets a live sample line ("1,234.56 → $1.2K") +
prefix/suffix inputs. `colorScheme` dropdown → swatch-strip picker + custom
palette via `p-colorpicker`; per-series color override → ECharts per-series
`itemStyle.color`.

## Task 3.2 — Missing chart types + per-chart features

**Missing types** (from gap): **map/geo (choropleth)**, **bullet**. **Per-chart
features:** reference lines & bands on all cartesian types; data labels on every
applicable type; consistent number formatting wired across types.
**FE:** extend the chart-type registry (`visuals-chart-sidebar` + `echart-visual`)

- config sections. **BE:** map/geo may need a geo-join data shape on
  `runAnalysisQuery`; per-series formatting persists in the `config` JSONB (no new
  column). Onboarding-safe.

## Task 3.3 — Reset-to-default + typed config foundation

`CHART_CONFIG_DEFAULTS[chartType]` map powers the per-section + global reset
stubbed in Wave 1. Introduce a `VisualConfig` TS interface + single
`patchConfig(path, value)` writer behind the existing getters — foundational for
undo/redo + copy-config (do it without changing the template surface).

---

# WAVE 4 — Polish (differentiators)

- **Advanced ECharts JSON escape hatch** — collapsed panel in the Format tab,
  bound to `config.echartsOverride` deep-merged into the generated option.
- **Field-aware chart picker (Show-Me)** — invert `getChartRoles` to grey out
  chart types whose required roles the current fields can't satisfy.
- **Undo/redo + copy-config-between-visuals** — bounded history stack on the
  typed config writer from Task 3.3.

---

# Files (representative)

**Wave 1 FE:** `visual-config-sidebar/*` (accordion, tabs-prep, layout),
`echart-visual/dbexec-echarts-theme.ts` (new), `echart-visual/*`,
`configurable-card-chart/*`, `chart-renderer/*`, `assets/i18n/*` (+10 locales).
**Wave 2 FE:** `visual-config-sidebar/*`, `visuals-chart-sidebar/*`,
`edit-analyses/*`; **BE:** none new (analysis-tabs exists).
**Wave 3 FE:** config sections + registry; **BE:** `runAnalysisQuery.ts`
(geo shape), no new entity columns (config JSONB).
**Wave 4 FE:** config panel advanced editor + picker + history.

# Verification (each wave, end-to-end)

FE `tsc` → `ngc --noEmit` → `ng build --configuration production` green; BE `tsc`
→ build green where touched. Live-verify on a healthy org: open an analysis,
build a chart, confirm the wave's changes render + behave. Squash per repo per
wave on version_261. **User pushes.**

# Execution shape

Wave 1 = 4 parallel agents (Tasks 1.1–1.4), Task 1.3+1.4 sequenced on the shared
`echart-visual` file. I verify each agent's git HEAD + read the security-neutral
diffs, reconcile shared-file edits, run the full verify gate, squash to one FE
commit on `feature/analyses-wave1-presentation` → version_261. Then present Wave
1 for review before Wave 2.
