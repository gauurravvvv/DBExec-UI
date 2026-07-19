## authoring-ux

This section turns the market research into a production-readiness requirements corpus for the DBExec Analyses build screen. DBExec is a shelf/well + per-tab canvas hybrid on ECharts, so the parity target is the shelf-model tools (Tableau, Power BI, Sigma), with notebook-model tools (Hex, Metabase) as the delighter source.

Tag legend: **[table-stakes]** = absence reads as broken/unfinished; **[advanced]** = differentiator that reads as polished/pro.

---

### 1. Complete requirements checklist

**A. Multi-tab / sheet management**
- A1 `+` add-tab control persistent at end of strip — [table-stakes]
- A2 Double-click inline rename (Enter commit / Esc cancel) — [table-stakes]
- A3 Drag-reorder tabs with insertion caret — [table-stakes]
- A4 Duplicate tab (with all visuals + config) — [table-stakes]
- A5 Delete tab with confirm-if-content — [table-stakes]
- A6 Right-click tab context menu exposing all tab ops in one place — [table-stakes]
- A7 Tab overflow handling (scroll arrows or chevron dropdown listing all tabs) — [table-stakes]
- A8 Hide tab from consumers while keeping for authoring — [table-stakes for consumer-facing]
- A9 Tab color / accent — [advanced]
- A10 Sheet-sorter thumbnail grid for navigating many tabs — [advanced]
- A11 Nested / grouped tabs (folders) — [advanced]
- A12 Move/copy tab to another analysis — [advanced]

**B. Add-a-chart flow**
- B1 `+ Add chart` entry point on canvas AND toolbar — [table-stakes]
- B2 Chart-type gallery (searchable, categorized, thumbnailed, per-type description) — [table-stakes]
- B3 Empty-state placeholder inside under-configured chart naming missing wells — [table-stakes]
- B4 Sane default chart type for returned columns — [table-stakes]
- B5 Field-first: drag field to canvas/chart creates or updates a chart — [table-stakes]
- B6 Field-aware validity in gallery (grey out invalid types, auto-rearrange pills) — [advanced]
- B7 AI / NL "suggest a chart from these fields" / auto-explore — [advanced]

**C. Field shelves / wells + interactive pills**
- C1 Named wells per chart type (X/Y/series/color/size/label/dimension/measure/filter) — [table-stakes]
- C2 Pill: change aggregation (Sum/Avg/Count/CountDistinct/Min/Max/Median/StdDev/Var) — [table-stakes]
- C3 Pill: sort asc/desc (and sort-by-another-field) — [table-stakes]
- C4 Pill: number/date format override (decimals, currency, %, thousands) — [table-stakes]
- C5 Pill: rename display label (per-view alias) — [table-stakes]
- C6 Pill: date granularity / date-part (Year→Quarter→Month→Day) — [table-stakes for time series]
- C7 Pill: create/add filter from field — [table-stakes]
- C8 Pill: remove (hover ✕ / menu / drag-off) — [table-stakes]
- C9 Drag-reorder pills within a well; drag between wells — [table-stakes]
- C10 Pill visual affordances: type icon, inline aggregation text, dropdown caret, filter/format state marker — [table-stakes]
- C11 Role color-coding (dimension vs measure) — [advanced]
- C12 Pill: quick table calc (running total / % of total / difference) — [advanced]
- C13 Pill: convert discrete/continuous or dimension/measure — [advanced]
- C14 Pill: edit-as-calculated-field in place — [advanced]

**D. Drag-and-drop surface + quality**
- D1 Field → well (add/encode) — [table-stakes]
- D2 Field → canvas / field → existing chart — [table-stakes]
- D3 Pill → pill reorder, pill → other well, pill → off — [table-stakes]
- D4 Chart/tile → canvas place & reposition; resize handles (edge+corner) — [table-stakes]
- D5 Live drop-target highlighting (valid glows, invalid dims) — [table-stakes]
- D6 Insertion caret / ghost preview following cursor — [table-stakes]
- D7 Esc cancels in-flight drag — [table-stakes]
- D8 Auto-scroll near container edges during drag — [advanced]

**E. Canvas layout**
- E1 Snap-to-grid (toggleable) — [table-stakes]
- E2 Show gridlines (toggleable, independent of snap) — [table-stakes]
- E3 Align menu (L/C/R, T/M/B) for multi-select — [table-stakes]
- E4 Distribute evenly (H/V) — [table-stakes]
- E5 Multi-select (shift/ctrl-click + rubber-band marquee) — [table-stakes]
- E6 Resize with edge/corner handles + numeric W/H entry — [table-stakes]
- E7 Z-order controls + Selection/Layers pane (list, reorder, show/hide, lock per object) — [table-stakes]
- E8 Group objects (move/resize together) — [table-stakes]
- E9 Lock position (object + whole layout) — [table-stakes]
- E10 Per-object padding / background / border — [table-stakes]
- E11 Zoom / fit-to-window / actual-size — [table-stakes]
- E12 Duplicate object in place (Ctrl-D) — [table-stakes]
- E13 Nudge with arrow keys (+shift larger step) — [table-stakes]
- E14 Smart alignment guides + equal-spacing hints — [advanced]
- E15 Layout containers (auto-arranging H/V) — [advanced]
- E16 Device/responsive preview + per-device layout — [table-stakes for consumer dashboards]

**F. Draft / save / versions**
- F1 Dirty-state indicator (title dot/asterisk, flips on first real edit, clears on save) — [table-stakes]
- F2 Unsaved-changes guard on navigate-away/close (Save/Discard/Cancel) — [table-stakes]
- F3 Deferred atomic save of full draft — [table-stakes]
- F4 No false-positive dirty on no-op interactions — [table-stakes]
- F5 Crash/recovery of unsaved draft — [table-stakes]
- F6 Draft vs Published split (author edits draft, publish promotes) — [table-stakes for consumer-facing]
- F7 Version list (timestamp + author) — [table-stakes for collaborative]
- F8 Restore/revert to prior version — [table-stakes for collaborative]
- F9 Auto-snapshot on publish — [table-stakes for consumer-facing]
- F10 Named/tagged versions — [advanced]
- F11 Version diff / who-changed-what — [advanced]
- F12 Autosave (continuous persist) — [advanced for on-prem; table-stakes for cloud]

**G. Empty states / onboarding / samples**
- G1 Empty-canvas empty-state (centered prompt + suggested actions) — [table-stakes]
- G2 Empty-chart/well placeholder naming missing well — [table-stakes] (= B3)
- G3 Sample/demo dataset on first run — [table-stakes]
- G4 First-run guided tour / coach marks — [advanced]
- G5 Inline tips / "?" affordances on complex controls — [advanced]
- G6 "Start from template/question" launcher — [advanced]

**H. Templates / duplicate**
- H1 Duplicate entire analysis (Save-As) — [table-stakes]
- H2 Duplicate single tab (= A4) — [table-stakes]
- H3 Duplicate single chart / copy chart config — [table-stakes]
- H4 Template gallery (start from prebuilt layout) — [advanced]
- H5 Save chart/analysis as reusable component/block — [advanced]

**I. Comments / annotations**
- I1 Chart-level annotations (text callouts, reference/trend lines) — [table-stakes for BI viz]
- I2 Threaded collaboration comments (@-mention, notify, resolve/reopen) — [table-stakes for collaborative; advanced on-prem]
- I3 Comment anchored to specific data point / cell — [advanced]

**J. Command palette / search**
- J1 Global search for fields/measures/tabs/charts — [table-stakes at scale]
- J2 Cmd/Ctrl-K command palette (fuzzy over actions + "add X") — [advanced, trending table-stakes]

**K. Undo / redo**
- K1 Multi-step undo/redo across ALL authoring actions (fields, format, layout, deletions, tab ops) — [table-stakes]
- K2 Ctrl/Cmd-Z + Ctrl/Cmd-Shift-Z (or Ctrl-Y) — [table-stakes]
- K3 Undo survives whole session (not per-panel reset) — [table-stakes]
- K4 Undo works after autosave (autosave ≠ stack clear) — [table-stakes]
- K5 Toolbar undo/redo buttons with action-name hover — [advanced]

**L. Copy-paste**
- L1 Copy chart/visual & paste to same or another tab — [table-stakes]
- L2 Paste keeps field bindings/data source; graceful degrade + warning — [table-stakes]
- L3 Copy underlying data / crosstab to clipboard — [table-stakes]
- L4 Paste image/text onto canvas — [table-stakes for dashboards]
- L5 Copy formatting / format painter — [advanced]
- L6 Copy pill/field between wells/charts — [advanced]

**M. Presentation / view mode**
- M1 Present/full-screen mode hiding authoring chrome — [table-stakes]
- M2 Clear Edit ↔ View/Present toggle — [table-stakes]
- M3 Focus a single chart (expand tile) & return — [table-stakes]
- M4 Present keeps interactivity (filters still work) — [table-stakes]
- M5 Story / slideshow step-through of tabs — [advanced]

---

### 2. Requirement × DBExec gap table

Status keys on the "prior audits" ground truth: tabs + per-tab visuals + draft-save just implemented; config sidebar is a flat 67-section panel; filters/parameters exist; server-side aggregation encoding exists; annotations/reference-lines shipped (task #1208); `app-chip`/`app-button` foundations exist. "BE" = needs backend work.

| Requirement | DBExec status | Priority | Effort (BE?) |
|---|---|---|---|
| **A1** `+` add tab | have | P0 | S |
| **A2** Double-click inline rename | partial (tabs exist; rename gesture unverified) | P0 | S |
| **A3** Drag-reorder tabs + insertion caret | partial | P0 | S |
| **A4** Duplicate tab (w/ visuals+config) | missing | P0 | M (BE: clone visual rows) |
| **A5** Delete tab + confirm | partial | P0 | S |
| **A6** Right-click tab context menu | missing | P0 | S |
| **A7** Tab overflow (scroll/chevron) | missing | P1 | S |
| **A8** Hide tab from consumers | missing | P2 | S (BE flag) |
| **A9** Tab color/accent | missing | P2 | S (BE field) |
| **A10** Sheet-sorter thumbnails | missing | P2 | L |
| **A11** Nested/grouped tabs | missing | P2 | L (BE) |
| **A12** Move/copy tab across analyses | missing | P2 | M (BE) |
| **B1** `+ Add chart` on canvas + toolbar | have | P0 | S |
| **B2** Chart-type gallery (categorized, thumb, desc) | partial (24 types wired; picker UX unrefined) | P0 | M |
| **B3** Empty-chart placeholder naming missing wells | missing | P0 | S |
| **B4** Sane default chart type | partial | P1 | S |
| **B5** Field-first drag creates/updates chart | partial | P1 | M |
| **B6** Field-aware validity + auto-rearrange | missing | P2 | L |
| **B7** AI/NL suggest chart | missing | P2 | L (BE) |
| **C1** Named wells per chart type | have | P0 | — |
| **C2** Pill: change aggregation | partial (BE aggregation exists; on-pill menu unverified) | P0 | M |
| **C3** Pill: sort asc/desc | partial | P0 | S (BE sort) |
| **C4** Pill: number/date format override | partial (format live-preview flagged as gap) | P0 | M |
| **C5** Pill: rename display label (alias) | missing | P1 | S |
| **C6** Pill: date granularity/date-part | partial (BE encoding exists) | P0 | M (BE) |
| **C7** Pill: create filter from field | partial (filters exist separately) | P1 | S |
| **C8** Pill: remove (✕/menu/drag-off) | partial | P0 | S |
| **C9** Drag pills within/between wells | partial | P0 | S |
| **C10** Pill visual affordances (icon/agg/caret/state) | partial (`app-chip` exists; states incomplete) | P0 | M |
| **C11** Role color-coding dim vs measure | missing | P1 | S |
| **C12** Pill: quick table calc | missing | P2 | L (BE) |
| **C13** Pill: convert discrete/continuous | missing | P2 | M (BE) |
| **C14** Pill: edit-as-calc-field in place | missing | P2 | M (BE) |
| **D1** Field → well | have | P0 | — |
| **D2** Field → canvas / existing chart | partial | P1 | M |
| **D3** Pill reorder/move/off | partial | P0 | S |
| **D4** Chart place/reposition/resize | have | P0 | — |
| **D5** Drop-target highlighting | missing | P0 | S |
| **D6** Insertion caret / ghost preview | missing | P0 | S |
| **D7** Esc cancels drag | missing | P1 | S |
| **D8** Auto-scroll on drag near edge | missing | P2 | S |
| **E1** Snap-to-grid toggle | partial (canvas exists; snap unverified) | P0 | S |
| **E2** Show gridlines toggle | missing | P1 | S |
| **E3** Align menu (multi-select) | missing | P0 | M |
| **E4** Distribute evenly | missing | P1 | S |
| **E5** Multi-select (click + marquee) | missing | P0 | M |
| **E6** Resize + numeric W/H entry | partial (resize likely; numeric entry missing) | P1 | S |
| **E7** Z-order + Selection/Layers pane | missing | P0 | M |
| **E8** Group objects | missing | P1 | M |
| **E9** Lock position | missing | P1 | S |
| **E10** Per-object padding/bg/border | partial | P1 | S |
| **E11** Zoom / fit / actual-size | missing | P1 | S |
| **E12** Duplicate object in place (Ctrl-D) | missing | P0 | S |
| **E13** Nudge with arrow keys | missing | P1 | S |
| **E14** Smart alignment guides | missing | P1 | M |
| **E15** Layout containers | missing | P2 | L |
| **E16** Device/responsive preview | missing | P2 | L |
| **F1** Dirty-state indicator | partial (draft-save just added) | P0 | S |
| **F2** Unsaved-changes navigation guard | missing | P0 | S |
| **F3** Deferred atomic save | have (just implemented) | P0 | — |
| **F4** No false-positive dirty | partial | P0 | S |
| **F5** Crash/recovery of draft | missing | P2 | M (BE/local) |
| **F6** Draft vs Published split | missing | P1 | L (BE) |
| **F7** Version list (time+author) | missing | P1 | L (BE) |
| **F8** Restore/revert version | missing | P1 | M (BE) |
| **F9** Auto-snapshot on publish | missing | P1 | M (BE) |
| **F10** Named/tagged versions | missing | P2 | S (BE) |
| **F11** Version diff | missing | P2 | L (BE) |
| **F12** Autosave continuous | missing | P2 | M (BE) |
| **G1** Empty-canvas empty-state | missing | P0 | S |
| **G2** Empty-chart placeholder | missing | P0 | S (= B3) |
| **G3** Sample/demo dataset | missing | P1 | M (BE) |
| **G4** First-run guided tour | missing | P2 | M |
| **G5** Inline tips / "?" | missing | P2 | S |
| **G6** Template/question launcher | missing | P2 | M |
| **H1** Duplicate entire analysis | partial | P0 | S (BE clone) |
| **H2** Duplicate single tab | missing | P0 | M (= A4) |
| **H3** Duplicate chart / copy config | missing | P0 | S |
| **H4** Template gallery | missing | P2 | L (BE) |
| **H5** Save as reusable component | missing | P2 | L (BE) |
| **I1** Chart annotations + reference lines | have (task #1208) | P0 | — |
| **I2** Threaded collab comments | missing | P2 | L (BE) |
| **I3** Comment anchored to data point | missing | P2 | L (BE) |
| **J1** Global field/tab/chart search | missing | P1 | M |
| **J2** Cmd-K command palette | missing | P2 | M |
| **K1** Multi-step undo/redo all actions | missing | P0 | L |
| **K2** Undo/redo keyboard shortcuts | missing | P0 | S (with K1) |
| **K3** Undo survives session | missing | P0 | (part of K1) |
| **K4** Undo works after save | missing | P0 | (part of K1) |
| **K5** Toolbar undo/redo buttons | missing | P1 | S |
| **L1** Copy chart & paste across tabs | missing | P1 | M |
| **L2** Paste keeps bindings + graceful degrade | missing | P1 | M |
| **L3** Copy data/crosstab to clipboard | missing | P1 | S |
| **L4** Paste image/text on canvas | missing | P2 | M |
| **L5** Format painter | missing | P2 | M |
| **L6** Copy pill between wells | missing | P2 | S |
| **M1** Present/full-screen mode | partial | P0 | S |
| **M2** Edit ↔ View toggle | partial | P0 | S |
| **M3** Focus single chart | missing | P1 | S |
| **M4** Present keeps interactivity | partial | P1 | M |
| **M5** Story/slideshow step-through | missing | P2 | L |

---

### 3. Must-have-for-production shortlist (the P0s)

These are the items whose absence makes the build screen read as broken or unfinished. Grouped by cluster; nothing here is optional for a credible BI authoring surface.

**Tabs (finish what's started):** A1 add, A2 inline rename, A3 drag-reorder, A4 duplicate tab, A5 delete+confirm, A6 right-click menu.

**Add-a-chart:** B1 entry points, B2 categorized type gallery, B3 empty-chart placeholder naming missing wells.

**Interactive pills (the single biggest "is this a real BI tool" signal):** C1 wells, C2 on-pill aggregation, C3 sort, C4 format override, C6 date granularity, C8 remove, C9 drag within/between wells, C10 pill visual states.

**Drag quality:** D1 field→well, D3 pill reorder/move/off, D4 chart place/resize, D5 drop-target highlighting, D6 insertion caret/ghost.

**Canvas:** E1 snap-to-grid, E3 align menu, E5 multi-select, E7 z-order + Selection/Layers pane, E12 duplicate-in-place.

**Save integrity:** F1 dirty indicator, F2 unsaved-navigation guard, F3 atomic draft save (done), F4 no false-positive dirty.

**Empty states:** G1 empty-canvas prompt, G2 empty-chart placeholder.

**Reuse:** H1 duplicate analysis, H2 duplicate tab, H3 duplicate chart.

**Annotations:** I1 (already shipped) — keep as parity anchor.

**Undo/redo (the trust primitive — users only experiment when undo is reliable):** K1 multi-step across all actions, K2 keyboard, K3 session-wide, K4 survives save.

**Present:** M1 full-screen, M2 Edit↔View toggle.

**Honest call on the two heaviest P0s:** **K1 undo/redo** (effort L, touches every mutation path) and **E7 z-order/Selection pane + E5 multi-select** are the ones most likely to be under-scoped. They are still P0 — a shelf/canvas tool without trustworthy undo or without multi-select+layering is perceived as a prototype, not a product. Everything else in the shortlist is S/M. The largest BE dependency in the P0 set is **A4/H2 duplicate-tab** (clone visual rows server-side); the rest of the P0s are predominantly front-end.

**Biggest gap vs research:** DBExec has the *rendering* layer (24 chart types, aggregation encoding, annotations) but is thin on the *authoring interaction* layer — on-pill menus, drag polish, canvas manipulation (multi-select/align/z-order), undo/redo, and save-integrity guards. That interaction layer is exactly what separates "renders charts" from "lets people build analyses," and it is where the P0 effort concentrates.