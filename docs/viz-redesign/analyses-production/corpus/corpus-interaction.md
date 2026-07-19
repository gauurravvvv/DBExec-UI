Caveman skill not available in this subagent environment. Proceeding with the task directly. The section requires normal technical writing anyway (tables, requirements).

## interaction

Production-readiness requirements for the DBExec **Analyses** module, interaction domain. Benchmarked against Tableau, Power BI, Metabase, Superset, Sigma, Hex. Every item labeled `[TS]` (table-stakes) or `[ADV]` (advanced). DBExec today is ECharts-based, ~24 chart types, server-side aggregation encoding, flat 67-section config sidebar, filters/parameters/tabs, draft-save + per-tab visuals. No author-wiring action layer exists yet; interactions are largely per-chart defaults.

---

### 1. Requirements checklist

**A. Cross-filter / cross-highlight**
- `[TS]` Click-to-filter — click a mark filters other visuals on the tab.
- `[TS]` Cross-filter with author-controllable per-target behavior (filter / highlight / none) — the "Edit interactions" equivalent.
- `[TS]` Bidirectional / scoped cross-filter — chart emits, dashboard relays to appropriately-scoped charts.
- `[TS]`/`[ADV]` Cross-highlight (dim non-matching marks, keep all visible) — part-to-whole focus, distinct from filter.
- `[TS]` Clear/deselect model — re-click mark or empty space clears the cross-filter/highlight.

**B. Drill**
- `[TS]` Drill-down within a hierarchy in place (Category → Sub-category → Product), drill up/down/expand.
- `[ADV]` Hierarchyless drill-by — right-click any element, pick any column to group by (Superset "Drill By" model).
- `[TS]`/`[ADV]` Drill-through to a detail sheet/analysis carrying clicked context as filter, with a Back affordance.
- `[ADV]` Cross-analysis / cross-report drill-through.
- `[TS]` Drill-to-row-detail — view atomic underlying rows behind an aggregate (modal).
- `[TS]` Time-grain drill ("see this month by day") and zoom-in on binned/histogram/map.

**C. Tooltips**
- `[TS]` Tooltip on hover with author-configurable field list.
- `[ADV]` Hover-sync across charts (shared crosshair on sibling charts).
- `[ADV]` Tooltip-as-mini-chart (report-tooltip pages, PBI signature).

**D. Brush / zoom / pan**
- `[TS]` Brush / marquee / lasso multi-mark select.
- `[TS]`/`[ADV]` Zoom + pan (TS on maps, ADV on cartesian via dataZoom).
- `[ADV]` Range/axis brush → filter (time-range brush).
- `[ADV]` Proportional brushing (set-based part-to-whole).

**E. Legend**
- `[TS]` Legend toggle (show/hide a series).
- `[ADV]` Legend highlight (dim others, keep all).
- `[ADV]` Legend-item drill (act on whole series).

**F. Controls & parameters**
- `[TS]` Single-select control.
- `[TS]` Multi-select control.
- `[TS]` Range / slider control.
- `[TS]` Date + date-range control (incl. relative dates).
- `[TS]` Text input + boolean toggle control.
- `[ADV]` What-if parameter (feeds a calculation, viewers model scenarios).
- `[ADV]` Dynamic measure/dimension swap via parameter (field parameters), with hierarchy-state persistence.

**G. Author-wiring action layer**
- `[TS]` Filter action (author-wired source→target).
- `[ADV]` Highlight action.
- `[TS]` URL action (with field substitution).
- `[TS]` Navigate / go-to-analysis action.
- `[ADV]` Parameter action (click a mark → set a parameter).
- `[ADV]` Set action / set-membership rewrite.
- `[ADV]` Write-back / data-mutation action.
- `[TS]` Action triggers (hover / select / menu) + clearing rules (keep / show-all / exclude).

**H. Saved state**
- `[ADV]` Bookmarks / saved views (capture full filter+slicer+selection+drill state).
- `[ADV]` Personal (per-user) saved state.
- `[TS]` Reset-to-default.
- `[TS]` URL-encoded / shareable filter state (permalink).

**I. Baseline mechanics**
- `[TS]` Multi-select selection model (Ctrl/Cmd additive, Shift/marquee range, empty-click deselect).
- `[TS]` Authoring undo/redo stack.
- `[TS]`/`[ADV]` Keyboard navigation + a11y (tab through visuals, data-point nav, ARIA/screen-reader, high-contrast).
- `[TS]` Reading vs Editing mode split (consumers interact but cannot rewire; authors wire in edit mode).

---

### 2. Requirement → DBExec gap table

| Requirement | DBExec status | Priority | Effort (BE?) |
|---|---|---|---|
| Click-to-filter `[TS]` | partial (per-chart ECharts select exists, not dashboard-wide) | P0 | M (BE: filter propagation to sibling queries) |
| Cross-filter, author-controllable filter/highlight/none per target `[TS]` | missing | P0 | L (BE: yes — scoped query re-run) |
| Bidirectional / scoped cross-filter `[TS]` | missing | P0 | M (BE: scope resolution) |
| Cross-highlight (dim, keep all) `[TS]`/`[ADV]` | missing | P1 | M (FE-only; ECharts dispatchAction highlight) |
| Clear/deselect model `[TS]` | partial (ECharts default) | P0 | S (FE) |
| Drill-down in hierarchy in place `[TS]` | missing (flagged in audit) | P0 | L (BE: yes — hierarchy metadata + regroup query) |
| Hierarchyless drill-by `[ADV]` | missing | P2 | M (BE: yes — dynamic GROUP BY) |
| Drill-through to detail analysis + Back `[TS]`/`[ADV]` | missing | P1 | L (BE: yes — context param passing) |
| Cross-analysis drill-through `[ADV]` | missing | P2 | M (BE: yes) |
| Drill-to-row-detail (raw rows modal) `[TS]` | missing | P0 | M (BE: yes — atomic row fetch w/ applied filters) |
| Time-grain drill / zoom-in binned `[TS]` | partial (histogram exists; no drill) | P1 | M (BE: yes — regrain query) |
| Tooltip on hover, configurable fields `[TS]` | partial (default tooltips; config unclear) | P0 | S (FE) |
| Hover-sync across charts `[ADV]` | missing | P2 | M (FE; ECharts connect/group) |
| Tooltip-as-mini-chart `[ADV]` | missing | P2 | L (FE) |
| Brush / marquee / lasso select `[TS]` | partial (ECharts brush available, not wired) | P1 | S (FE) |
| Zoom + pan (maps / cartesian dataZoom) `[TS]`/`[ADV]` | missing (map/geo flagged missing) | P1 | M (FE; map needs geo layer) |
| Range/axis brush → filter `[ADV]` | missing | P2 | M (BE: yes) |
| Proportional brushing (sets) `[ADV]` | missing | P2 | L (BE: yes — set concept) |
| Legend toggle (hide series) `[TS]` | have (ECharts native) | — | — |
| Legend highlight (dim) `[ADV]` | missing | P2 | S (FE) |
| Legend-item drill `[ADV]` | missing | P2 | M (BE: yes) |
| Single-select control `[TS]` | have (filters/params exist) | — | — |
| Multi-select control `[TS]` | have | — | — |
| Range / slider control `[TS]` | partial (verify slider vs list) | P1 | S |
| Date + date-range control `[TS]` | partial (verify relative-date) | P1 | S (BE: relative-date resolution) |
| Text input + boolean control `[TS]` | partial | P1 | S |
| What-if parameter (recompute) `[ADV]` | missing | P2 | L (BE: yes — calc feeds off param) |
| Dynamic measure/dimension swap via param `[ADV]` | missing | P1 | M (BE: yes — swap encoding) |
| Filter action (author-wired) `[TS]` | missing | P0 | L (BE: yes — action layer core) |
| Highlight action `[ADV]` | missing | P1 | M (FE) |
| URL action w/ field substitution `[TS]` | missing | P1 | S (FE) |
| Navigate / go-to-analysis action `[TS]` | missing | P1 | M (FE + routing) |
| Parameter action (click→set param) `[ADV]` | missing | P2 | M (BE: yes) |
| Set action `[ADV]` | missing | P2 | L (BE: yes — no set primitive today) |
| Write-back / mutation action `[ADV]` | missing | P2 | L (BE: yes — DBExec's DB-exec DNA makes this a natural differentiator) |
| Action triggers + clearing rules `[TS]` | missing | P0 | M (part of action layer) |
| Bookmarks / saved views `[ADV]` | missing (draft-save exists, not view-state) | P1 | M (BE: yes — persist state blob) |
| Personal per-user saved state `[ADV]` | missing | P2 | M (BE: yes) |
| Reset-to-default `[TS]` | partial (verify) | P0 | S (FE) |
| URL-encoded shareable filter state `[TS]` | missing | P1 | S (FE) |
| Multi-select selection model (Ctrl/Shift) `[TS]` | partial (ECharts default) | P0 | S (FE) |
| Authoring undo/redo `[TS]` | missing (draft-save ≠ undo) | P1 | M (FE state history) |
| Keyboard nav + a11y `[TS]`/`[ADV]` | missing | P1 | L (FE) |
| Reading vs Editing mode split `[TS]` | partial (edit/view of analyses likely exists) | P0 | M (gate action-wiring to edit mode) |

---

### 3. Must-have for production (the P0 shortlist)

Without every one of these, DBExec Analyses is not a credible interactive BI dashboard tool:

1. **Click-to-filter** — mark selection filters sibling visuals on the tab.
2. **Cross-filter with author-controllable per-target behavior** (filter / highlight / none) — the wiring layer's minimum viable core; **needs BE** (scoped query re-run).
3. **Bidirectional / scoped cross-filter** — emit + relay to scoped charts.
4. **Clear/deselect model** — re-click or empty-space clears interaction state.
5. **Drill-down within a hierarchy in place** — already flagged in prior audits; **needs BE** (hierarchy metadata + regroup query).
6. **Drill-to-row-detail** — view raw underlying rows behind an aggregate; **needs BE**.
7. **Tooltip on hover with configurable field list.**
8. **Filter action (author-wired source→target)** plus **action triggers + clearing rules** — the foundational author-wiring action layer; **needs BE**.
9. **Multi-select selection model** (Ctrl/Cmd additive, Shift/marquee, empty-click deselect).
10. **Reset-to-default.**
11. **Reading vs Editing mode split** — consumers interact, only authors rewire.

Honest note: DBExec has **no author-wiring action layer at all today** — items 2, 3, 8, and 11 are effectively one architectural build (a source→target action/interaction model with scope resolution and mode gating). That build is the single highest-leverage P0 investment; almost every advanced interaction (highlight action, parameter action, drill-through, navigate) hangs off it. The BE aggregation encoding that already exists (dimension/measure/aggregate/percentile) is the right foundation to extend for cross-filter scope and drill regroup queries. The one differentiator worth flagging early: **write-back actions** map naturally onto DBExec's DB-execution heritage and could be a Sigma-style standout later (P2), but must not precede the P0 core.