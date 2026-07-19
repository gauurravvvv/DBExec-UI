I have enough ground truth across all seven benchmark tools plus the extras. The task (#1303/#1304/#1309) is a research deliverable. I'll synthesize the exhaustive markdown report now.

Given the depth requested and that my output is the return value, I'll write the complete report directly as my final response.

---

# The Complete Authoring / Exploration UX of Production BI Tools

**Scope:** the *build* screen — where a user assembles an analysis/report/workbook. Benchmarked against **Tableau**, **Power BI**, **Metabase**, **Apache Superset (Explore)**, **Hex**, **Sigma**, and **Looker (+ Looker Studio)**. Each capability is tagged **[table-stakes]** (users expect it; its absence reads as broken/unfinished) or **[delighter]** (differentiator; presence reads as polished/pro).

A note on the two dominant authoring paradigms, because every feature below behaves differently across them:

- **Shelf/well model** (Tableau, Power BI, Superset, Looker Studio field wells, Sigma element editor): you build *one chart at a time* by dropping fields into named drop-zones (Rows/Columns/Marks, Values/Axis/Legend, X/Y/Series). The chart is the primary object; the canvas is where charts get arranged later.
- **Query-first / notebook model** (Metabase question editor, Hex cells, Superset SQL Lab → Explore, Looker Explore): you build a *query/result* first (via query builder or SQL), then pick a visualization for that result. The result is the primary object; visualization is a view onto it.

DBExec's Analyses module is a shelf/well + canvas hybrid (visuals dropped onto a per-tab canvas), so the shelf-model benchmarks are the closest parity target, with the notebook-model tools as the source of "delighter" ideas.

---

## 1. Multi-sheet / tab / page management

The unit of "another surface to build on" is called a **worksheet** (Tableau), **page** (Power BI, Sigma, Superset dashboard), **tab** (Metabase dashboard, DBExec analysis), **cell/section** (Hex), or **Explore** (Looker). The management affordances are near-identical across all of them and form a tight table-stakes bundle.

| Affordance | Table-stakes / delighter | Who does it well | Notes |
|---|---|---|---|
| **Add new sheet/tab** via a persistent `+` at the end of the tab strip | [table-stakes] | All | Tableau also has "New Worksheet / New Dashboard / New Story" as distinct add types from the same control. |
| **Inline rename** — double-click the tab label, edit in place, Enter/blur to commit, Esc to cancel | [table-stakes] | Tableau, Power BI, Sigma, Metabase | The double-click-to-rename gesture is a hard expectation. Renaming via a separate dialog reads as dated. |
| **Reorder** by dragging the tab left/right along the strip | [table-stakes] | All | Power BI and Sigma animate neighbors sliding aside; Tableau shows an insertion caret. |
| **Duplicate sheet** (with all its content) | [table-stakes] | Tableau ("Duplicate"), Power BI ("Duplicate page"), Metabase, Sigma, Superset | Tableau additionally offers **"Duplicate as Crosstab"** — a semantic duplicate that converts a chart into a text table [delighter]. |
| **Delete** with confirm if the sheet has content | [table-stakes] | All | |
| **Right-click context menu** on the tab exposing all of the above in one place | [table-stakes] | Tableau, Power BI, Sigma | This is the discoverability backbone — every sheet operation should be reachable from the tab's right-click menu, not scattered. |
| **Tab color / accent** | [delighter] | Sigma (page colors), Power BI (via themes, weaker), Tableau (color-code sheets in the sheet-sorter) | Purely organizational; helps navigate large workbooks. |
| **Hide sheet** from consumers while keeping it for authoring | [table-stakes for dashboards] | Power BI ("Hide page"), Tableau (hide sheet used in dashboard/story), Metabase (no) | Distinct from delete: scaffolding/working sheets that shouldn't ship. |
| **Tab overflow** handling when there are more tabs than fit — scroll arrows, a chevron/"…" dropdown listing all sheets, or a filmstrip | [table-stakes] | Power BI (page pane list), Tableau (**sheet sorter** thumbnail grid + tab scroll), Sigma (page list panel) | Tableau's sheet sorter (a grid of live thumbnails of every sheet) is the gold standard for navigating a big workbook [delighter]. |
| **Nested / grouped pages** (folders of pages, or sub-tabs) | [delighter] | Sigma (page folders), Hex (sections/collapsible), Looker (dashboards-of-tiles) | Rare; only needed at scale. |
| **Move sheet to another workbook / duplicate across files** | [delighter] | Tableau, Sigma (copy page → paste in another workbook) | |
| **Jump/select sheet without clicking the strip** — a searchable sheet list | [delighter] | Tableau sheet sorter, Power BI page pane | |

**Design takeaways for DBExec:** the right-click-on-tab menu (rename/duplicate/delete/color/reorder-anchor) + double-click inline rename + drag-reorder + `+` add + overflow chevron is the complete table-stakes set. This is exactly what tasks #1301 (tab-strip upgrade) targets. Tab thumbnails and folders are the delighters to defer.

---

## 2. The "add a chart" flow

Two competing entry points, and the best tools offer both:

### 2a. Type-first: pick a chart type from a gallery, then feed it fields
- **Tableau "Show Me"** — a pop-out grid of ~24 chart-type thumbnails. Crucially it is **field-aware**: it *highlights the chart types that are valid* for the fields you've currently selected/placed, greys out the rest, and shows a tooltip stating "for X, try N dimensions and M measures." Clicking a type **rearranges the existing pills** into the correct shelves for that type. This is the single most-imitated feature in BI. **[table-stakes]** to have a type gallery; **[delighter]** to make it field-aware and auto-rearrange.
- **Power BI "Visualizations" pane** — a fixed palette of icon buttons; click to drop an empty visual of that type onto the canvas, then fill its field wells. No validity-highlighting; you can create nonsensical empty visuals. **[table-stakes]**.
- **Superset viz-type picker** — a searchable modal gallery with categories (Popular, Correlation, Distribution, etc.), thumbnails, and per-type descriptions; deprecated types hidden. **[table-stakes]** + the category+description treatment is a mild **[delighter]**.
- **Metabase** — visualization sidebar with a grid of chart icons; "sensible" options surfaced, others under **"More charts."** **[table-stakes]**.
- **Hex chart cell** — add a chart cell, then choose chart type inside it. **[table-stakes]**.
- **Sigma** — "Add element" → element-type gallery (chart types + tables + inputs + text). **[table-stakes]**.

### 2b. Field-first: drop/select fields, tool suggests the chart
- **Tableau** — double-clicking or dragging fields auto-builds a best-guess viz; Show Me then refines. **[delighter]** (the auto-guess) built on table-stakes drag.
- **Power BI auto-create / "Suggest a visual" (Copilot)** and legacy **Q&A** ("show sales by region") generate a visual from natural language or from checked fields. **[delighter]**.
- **Metabase / Superset** pick a default chart type appropriate to the returned columns after you run the query. **[table-stakes]** (a sane default) verging on delighter.
- **Sigma** — drag a column onto the canvas and it proposes a chart. **[delighter]**.

### 2c. Auto-suggest / "explain"/ explore-from-here
- **Power BI "Get insights" / "Analyze"**, **Tableau "Explain Data"**, **Metabase "X-ray"**, **Sigma "Explore" / Ask Sigma**, **Hex/Sigma AI** all generate candidate charts or narratives from a dataset with zero manual field placement. **[delighter]** — increasingly expected in 2025-26 as an AI on-ramp but not yet table-stakes.

**Complete "add a chart" spec (what a polished flow contains):**
1. A **`+ Add chart`** entry point on the canvas *and* in the toolbar.
2. A **type gallery** (searchable, categorized, thumbnailed, with per-type descriptions and a "recommended for your data" section). — table-stakes gallery; categorization is the polish.
3. **Field-aware validity** (grey out / annotate types that can't render with current fields). — delighter.
4. **Empty-state placeholder** on the new chart telling you which wells still need fields ("Add a measure to Y-axis"). — table-stakes.
5. **Field-first path**: dragging a field onto an empty canvas or an existing chart creates/updates a chart. — table-stakes drag; auto-type-guess is delighter.
6. **AI/NL suggest** ("describe the chart you want"). — delighter.

---

## 3. Field shelves / wells + interactive pills

This is the heart of the shelf model and the area with the richest micro-interactions. A **field placed in a well** becomes a **pill / chip / tag / token** that is itself an interactive control.

### 3a. The shelves/wells themselves
- **Tableau**: Columns, Rows, and the **Marks card** (Color, Size, Label/Text, Detail, Tooltip, Shape, Angle, Path — the sub-shelves vary by mark type), plus Filters and Pages shelves. Distinct **blue pills (dimensions/discrete)** vs **green pills (measures/continuous)** — a color language users internalize. **[table-stakes]** to have named wells; the discrete/continuous color coding is a **[delighter]** that pays off enormously in learnability.
- **Power BI**: field wells that change per visual type — X-axis, Y-axis, Legend, Small multiples, Values, Tooltips, Filters. **[table-stakes]**.
- **Superset**: control panel with Dimensions, Metrics, Filters, Group by, Series limit, Row limit, Sort. **[table-stakes]**.
- **Sigma**: per-element editor panels for X-axis, Y-axis, Color, and (for tables) grouping/pivot. **[table-stakes]**.
- **Looker Explore**: Dimensions/Measures selected via checkboxes in a field browser → columns in a data table → visualization; less "well-like," more query-result-like. **[table-stakes]** for the query model.
- **Metabase**: Summarize (metrics) + Group by (dimensions) rows in the query builder; visualization settings separate. **[table-stakes]**.

### 3b. The interactive pill — actions available *on the pill itself*
The defining pro affordance: click a pill (or its dropdown caret) and get a menu to reconfigure that field **without leaving the shelf**. The union of what Tableau/Power BI/Sigma expose on a pill:

| On-pill action | Table-stakes / delighter | Seen in |
|---|---|---|
| **Change aggregation** (Sum → Avg → Count → Count Distinct → Min → Max → Median → StdDev → Var) | [table-stakes] | Tableau (measure pill menu), Power BI ("Summarize by"), Sigma, Superset (per-metric), Metabase |
| **Sort** by this field asc/desc (and "sort by another field") | [table-stakes] | All |
| **Set/override number & date formatting** (decimals, currency, %, thousands, date granularity) | [table-stakes] | Tableau, Power BI, Sigma; Metabase/Superset in settings |
| **Rename the field's display label** (alias for this view only) | [table-stakes] | Tableau ("Edit Alias"), Power BI (rename in well), Sigma |
| **Date granularity / date part vs date value** (Year → Quarter → Month → Day; discrete vs continuous) | [table-stakes for time-series tools] | Tableau (huge menu), Power BI (date hierarchy drill), Sigma (truncate) |
| **Filter** using this field (converts/adds to Filters shelf) | [table-stakes] | Tableau, Sigma |
| **Quick table calc / running total / % of total / difference** | [delighter] | Tableau (Quick Table Calculations), Sigma, Power BI (quick measures) |
| **Convert to discrete/continuous or dimension/measure** | [delighter] | Tableau |
| **Edit as calculated field in place** | [delighter] | Tableau ("Edit in Shelf"), Sigma |
| **Remove** (drag-off, or ✕ on hover, or menu Remove) | [table-stakes] | All |
| **Drag to reorder within a well** (changes column/series order) | [table-stakes] | All |
| **Drag between wells** (move a field from Rows to Columns, X to Legend) | [table-stakes] | All |

**Visual affordances of a good pill:** a type icon (abc / # / calendar / geo), the aggregation shown inline (`SUM(Sales)`), a hover ✕, a dropdown caret, and a distinct visual state when it carries a filter or a custom format. Color-coding by role (dim vs measure) is the delighter.

**Design takeaway:** DBExec's `app-chip` foundation (task #1249) is the right primitive. The gap most BI clones under-build is the **on-pill action menu** — aggregation + sort + format + rename + remove reachable from the chip is table-stakes, and users will perceive the tool as "not a real BI tool" without it.

---

## 4. Drag-and-drop everywhere

Drag is the connective tissue of the whole authoring UX. The complete expected drag surface:

- **Field → shelf/well** (add/encode). [table-stakes]
- **Field → canvas** (create a chart, or add to hovered chart). [table-stakes in Tableau/Sigma; delighter elsewhere]
- **Field → chart** to add a series/dimension to an existing chart. [table-stakes]
- **Pill → pill** reordering within a well; **pill → other well** moving encodings. [table-stakes]
- **Pill → off** (drag out to remove). [table-stakes]
- **Chart/tile → canvas** to place and reposition. [table-stakes]
- **Tab → tab strip** reordering (§1). [table-stakes]
- **Cell → cell** reordering (notebook tools: Hex drag-handle in the cell's top-left). [table-stakes for notebook model]
- **Element → header/sidebar/container** (Sigma: drop a chart into a page header or a container element). [delighter]
- **Field → filter shelf** to create a filter directly. [table-stakes]
- **Resize handles** on charts (edge + corner). [table-stakes]

**Quality signals that separate pro from clone:**
- **Live drop-target highlighting** — the valid well/zone glows; invalid zones dim. [table-stakes]
- **Insertion caret** showing exactly where a pill/tab/cell will land. [table-stakes]
- **Ghost/preview** of the dragged item following the cursor. [table-stakes]
- **Auto-scroll** when dragging near a container edge. [delighter but expected in long canvases]
- **Snap + smart guides** during drag (see §5). [table-stakes for freeform canvas]
- **Escape cancels an in-flight drag**, returning the item home. [table-stakes]

CDK DragDrop (Angular) covers the mechanics; the polish is drop-zone highlighting, insertion carets, and cancel-on-Esc. This is precisely task #1301's remit.

---

## 5. The canvas: layout, snapping, alignment, z-order, grouping

Two canvas philosophies — **grid** vs **freeform** — and the leading tools split on this:

- **Grid / responsive tile** (Metabase, Superset dashboards, Looker, Sigma default, Hex app builder): objects snap to a column grid; moving/resizing reflows to grid cells. Simpler, always-aligned, mobile-friendly. **[table-stakes]** as *an* option.
- **Freeform / pixel** (Power BI report canvas, Tableau dashboard floating mode, Sigma "freeform" pages): objects positioned by x/y; full control, easy to misalign. **[table-stakes]** for pixel-perfect layouts.

The mature tools offer **both** — Power BI's fixed canvas + snap-to-grid, Tableau's **tiled vs floating** dashboard objects, Sigma's grid-with-freeform-drag.

| Canvas capability | Table-stakes / delighter | Reference implementations |
|---|---|---|
| **Snap to grid** (toggleable) | [table-stakes] | Power BI ("Snap objects to grid"), Sigma, Metabase (grid), Superset |
| **Show gridlines** (toggleable, independent of snapping) | [table-stakes] | Power BI (View menu) |
| **Smart alignment guides** — dynamic guide lines + equal-spacing hints when an object aligns with neighbors | [delighter, fast-becoming table-stakes] | Power BI, Tableau, Sigma |
| **Align menu** — left/center/right/top/middle/bottom for multi-selected objects | [table-stakes] | Power BI (Format ribbon → Align), Tableau |
| **Distribute** — evenly space horizontally/vertically | [table-stakes] | Power BI, Tableau |
| **Multi-select** — shift/ctrl-click or rubber-band marquee | [table-stakes] | Power BI, Sigma, Tableau |
| **Resize** — edge/corner handles, with numeric W/H entry in a format pane | [table-stakes] | All; numeric entry is Power BI/Tableau |
| **Z-order / layering** — bring-to-front/send-to-back + a **Selection/Layers pane** listing all objects, drag to reorder, with per-object show/hide + lock | [table-stakes] | Power BI (**Selection pane**, gold standard), Tableau (layout order) |
| **Group** objects so they move/resize together | [table-stakes] | Power BI ("Group"), Sigma (containers), Tableau (layout containers) |
| **Lock position** of an object / lock the whole layout | [table-stakes] | Power BI ("Lock objects"), Tableau |
| **Containers** — horizontal/vertical layout containers that auto-arrange children | [delighter → table-stakes for responsive] | Tableau (layout containers), Sigma (containers), Power BI (weaker) |
| **Padding / spacing / background / border** per object | [table-stakes] | Tableau (item padding), Power BI, Sigma |
| **Snap to object edges / equal margins** | [delighter] | Power BI smart guides |
| **Device/responsive preview + per-device layout** (desktop/tablet/phone) | [table-stakes for dashboards] | Power BI (Mobile layout), Sigma, Looker Studio, Superset (limited) |
| **Zoom / fit-to-window / actual-size** | [table-stakes] | Power BI, Tableau, Sigma |
| **Duplicate object in place** (Ctrl-D) | [table-stakes] | All |
| **Nudge with arrow keys** (+ shift for larger step) | [table-stakes] | Power BI, Sigma |

**The Selection/Layers pane (Power BI) is the reference model** for z-order + visibility + lock + reorder in one panel, and is the thing most BI clones omit. Alignment + distribute + group + multi-select + snap is the irreducible table-stakes canvas kit.

---

## 6. Draft/save model, autosave, version history, unsaved-changes guard

This is where "feels like a real product" is won or lost, and where the tools diverge sharply by hosting model.

### 6a. Save models
- **Explicit save + draft** (Tableau, Power BI Desktop, DBExec target): edits are local/in-memory until the user saves. Requires an **unsaved-changes indicator** (dot/asterisk in the title, "Edited" badge) and an **unsaved guard** on navigate-away/close ("You have unsaved changes — Save / Discard / Cancel"). **[table-stakes]** for this model.
- **Autosave** (Power BI Service, Looker Studio, Google-docs-style): changes persist continuously; no explicit save button, or save is a no-op safety net. **[table-stakes]** for cloud tools; users now *expect* not to lose work.
- **Draft vs Published split** (Superset, Sigma, Looker, Metabase to a degree): you edit a **draft**; **Publish** promotes it to what consumers see. Sigma's Draft/Published/version model is the cleanest — every publish is a version, drafts are private to the editor. **[table-stakes]** for anything with a viewer/consumer audience (which DBExec dashboards/analyses have).

DBExec's tasks #1299/#1300 explicitly move to a **draft model with deferred atomic save** — that's the correct choice for the shelf/canvas paradigm, and it *requires* the unsaved indicator + navigation guard to feel finished.

### 6b. Version history
| Capability | Table-stakes / delighter | Reference |
|---|---|---|
| **Version list** with timestamp + author | [table-stakes for collaborative cloud tools] | Sigma, Hex, Looker Studio, Metabase (revision history), Power BI Service |
| **Restore/revert** to a prior version | [table-stakes] | Sigma, Hex, Metabase, Looker Studio |
| **Named/tagged versions** ("v2 — before redesign") | [delighter] | Sigma (tag a version), Hex |
| **Diff / who-changed-what** | [delighter] | Hex (scroll back through history, see who changed the query), Git-backed tools |
| **Auto-snapshots on publish** | [table-stakes] | Sigma, Superset |
| **Named autosave recovery** ("recovered draft") after a crash | [table-stakes] | Power BI Desktop, Tableau |

Metabase's per-question/dashboard **revision history with one-click revert** and Sigma's **version tagging** are the models to emulate. Full diffing is a delighter.

### 6c. Unsaved guard specifics (table-stakes)
- Dirty-state tracking that flips on the *first* real edit and clears on save.
- Title/tab shows an unsaved marker.
- `beforeunload` / router-guard interception on close/navigate with Save / Discard / Cancel.
- Doesn't false-positive on no-op interactions (opening a menu, hovering) — a common bug.

---

## 7. Empty states, first-run onboarding, sample data

- **Empty canvas empty-state** — instead of a blank void, a centered prompt: "Drag a field here" / "+ Add your first chart" / a couple of suggested actions. **[table-stakes]** — the difference between "broken" and "inviting." Metabase, Sigma, Superset, Power BI all do this.
- **Empty chart/well empty-state** — a placeholder inside an under-configured chart naming the missing well ("Add a measure to the Y-axis"). **[table-stakes]**.
- **Sample / demo dataset** available on first run so a new user can build *something* immediately (Metabase's Sample Database, Superset's example dashboards, Power BI sample reports, Tableau's Superstore, Looker's demo). **[table-stakes]** for adoption; hugely reduces first-value time.
- **First-run guided tour / coach marks / interactive checklist** highlighting the shelves, the type gallery, save. **[delighter]** (Metabase and Power BI have light versions; most tools rely on empty-state hints instead).
- **Inline tips / "?" affordances** on complex controls. **[delighter]**.
- **"Start from a question/template" launcher** as the first screen rather than a blank editor. **[delighter]** (Hex, Metabase).

---

## 8. Templates + duplicate analysis

- **Duplicate an entire analysis/report/workbook** as a starting point (Save-As / Duplicate). **[table-stakes]** — every tool has it; it's the poor-man's template and the most-used reuse path.
- **Template gallery** — start a new analysis from a pre-built layout (Power BI report templates `.pbit`, Sigma templates, Looker Studio template gallery, Metabase less so). **[delighter]**.
- **Duplicate a single sheet/tab/chart** within an analysis (§1). **[table-stakes]**.
- **Copy a chart's config to a new chart** ("Duplicate visual"). **[table-stakes]**.
- **Save a chart/analysis as reusable component / add to a "blocks" library**. **[delighter]** (Sigma, Looker LookML, Hex components).

---

## 9. Comments / annotations

Two distinct things, both expected in collaborative tools:

- **Chart-level / data annotations** — text callouts, reference lines, trend lines, drawn on the viz itself. **[table-stakes for a BI viz tool]** (Tableau annotations + reference lines, Power BI, Sigma). DBExec already shipped reference lines + annotations (task #1208).
- **Collaboration comments** — threaded, @-mention, pinned to an object or a data point, with notifications and resolve. **[table-stakes for cloud/collaborative tools]** — Hex (threaded comments beside a chart, @-mention in cells), Sigma, Power BI Service, Looker, Metabase. Hex is the reference: Google-Docs-style multiplayer + comments + versioning as one coherent story.
- **@-mention + notify** and **resolve/reopen** threads. **[table-stakes]** within the comment feature.
- **Comment on a specific data point / cell** (context-anchored). **[delighter]**.

For an on-prem/single-tenant tool without live multiplayer, chart annotations are table-stakes; full threaded collab comments are a delighter you can stage.

---

## 10. Command palette

- **Cmd/Ctrl-K command palette** — fuzzy search over actions, sheets, fields, charts, and "add X" commands. **[delighter, trending toward table-stakes]**. Hex and Sigma have strong palettes; newer/modern-feeling tools (and anything positioned as "developer-adjacent," which DBExec is) get graded up for having one. Tableau/Power BI Desktop lean on menus/ribbons instead and are perceived as heavier because of it.
- **Global search** for fields/measures/sheets even without a full palette. **[table-stakes]** at scale (Tableau data-pane search, Power BI field search, Looker field search).

---

## 11. Undo / redo

- **Multi-step undo/redo** across *all* authoring actions — field placement, formatting, layout moves, deletions, sheet ops. **[table-stakes]**, and the depth matters: Tableau and Power BI maintain long, reliable undo stacks; a shallow or lossy undo stack is one of the most damaging polish failures because users experiment fearlessly only when undo is trustworthy.
- **Keyboard: Ctrl/Cmd-Z and Ctrl/Cmd-Shift-Z (or Ctrl-Y)**. **[table-stakes]**.
- **Undo survives across the whole session**, not reset per-panel. **[table-stakes]**.
- **Toolbar undo/redo buttons** with hover showing the action name. **[delighter]**.
- **Interplay with autosave**: undo should work *after* an autosave (autosave ≠ commit point that clears the undo stack). **[table-stakes]** — a frequent bug.

---

## 12. Copy-paste (within and between sheets/analyses)

- **Copy a chart/visual and paste** onto the same or another sheet/tab. **[table-stakes]** — Power BI (copy visual across pages/reports), Sigma (**copy & paste elements within a workbook or between workbooks**), Tableau (duplicate/copy worksheet).
- **Copy formatting** from one visual to another. **[delighter]** (Power BI "Copy → Paste special / format painter").
- **Paste keeps the field bindings / data source** where possible; degrades gracefully with a warning when the target lacks the source. **[table-stakes]** — Sigma explicitly copies dependent sources with the element.
- **Copy a pill/field between wells/charts**. **[delighter]**.
- **Copy underlying data / crosstab to clipboard** for export. **[table-stakes]**.
- **Paste an image/text onto the canvas**. **[table-stakes]** for dashboards.

---

## 13. Presentation / full-screen / view mode

- **Presentation / full-screen mode** that hides the authoring chrome (shelves, panes, ribbon) and shows just the analysis. **[table-stakes]** — Tableau **Presentation Mode** (F7), Power BI **Focus/Full-screen**, Metabase full-screen, Looker Studio "View," Sigma view mode, Superset dashboard view.
- **Toggle between Edit and View/Present** clearly. **[table-stakes]** — the Edit/View split (draft vs published-look) is a hard expectation.
- **Focus a single chart** (expand one tile to full canvas) then return. **[table-stakes]** — Power BI **Focus mode**, Metabase, Sigma.
- **Tableau Story mode** — sequenced caption-driven "slides" of worksheets for narrative presentation. **[delighter]**.
- **Slideshow / step-through** across sheets. **[delighter]**.
- **Present + keep interactivity** (filters still work in present mode). **[table-stakes]**.

---

## Cross-tool quick benchmark matrix (the build screen at a glance)

| Capability cluster | Tableau | Power BI | Metabase | Superset (Explore) | Hex | Sigma | Looker (+Studio) |
|---|---|---|---|---|---|---|---|
| Tab/sheet mgmt (rename/reorder/dup/right-click) | ★★★ (sheet sorter) | ★★★ (page pane) | ★★ (dash tabs) | ★★ | ★★ (cells/sections) | ★★★ (pages+folders+color) | ★★ |
| Type gallery / Show-Me | ★★★ (field-aware) | ★★ (viz pane) | ★★ (More charts) | ★★★ (categorized modal) | ★★ | ★★ | ★★ |
| Interactive pills (agg/sort/format on pill) | ★★★ | ★★★ | ★★ | ★★ | ★ | ★★★ | ★★ |
| Drag-drop everywhere | ★★★ | ★★★ | ★★ | ★★ | ★★ (cell reorder) | ★★★ | ★ (checkbox model) |
| Canvas snap/align/z-order/group | ★★★ (tiled+floating) | ★★★ (Selection pane) | ★★ (grid) | ★★ (grid) | ★★ (app grid) | ★★★ (grid+freeform) | ★★ (grid) |
| Draft/save + autosave + versions | ★★ (desktop file) | ★★★ (service autosave+versions) | ★★ (revision history) | ★★ (draft/publish) | ★★★ (multiplayer+versions) | ★★★ (draft/publish/tag) | ★★ |
| Empty state + sample data + onboarding | ★★ | ★★★ | ★★★ (Sample DB) | ★★ (examples) | ★★★ (templates) | ★★★ | ★★ |
| Templates + duplicate | ★★ | ★★★ (.pbit) | ★★ | ★★ | ★★★ | ★★★ | ★★★ (LookML) |
| Comments/annotations | ★★ (annotations) | ★★ (service comments) | ★★ | ★ | ★★★ (threaded multiplayer) | ★★★ | ★★ |
| Command palette | ✗ | ✗ | ★ | ✗ | ★★★ | ★★ | ✗ |
| Undo/redo depth | ★★★ | ★★★ | ★★ | ★★ | ★★ | ★★★ | ★★ |
| Copy-paste across sheets | ★★ | ★★★ (+format painter) | ★ | ★ | ★★ | ★★★ (cross-workbook) | ★ |
| Present/full-screen mode | ★★★ (+Story) | ★★★ (Focus) | ★★ | ★★ | ★★ (app mode) | ★★ | ★★ |

(★★★ = best-in-class reference, ★★ = solid, ★ = minimal/absent.)

---

## Priority read for a shelf+canvas BI authoring screen (DBExec Analyses context)

**Non-negotiable table-stakes** (absence reads as broken): tab right-click menu + inline rename + drag-reorder + `+`; a chart-type gallery + empty-state placeholders; on-pill aggregation/sort/format/rename/remove; drag with drop-highlighting + insertion caret + Esc-cancel; canvas snap + align + distribute + multi-select + z-order (a Selection-pane-style layer list) + group; dirty indicator + unsaved-navigation guard (or autosave); duplicate analysis + duplicate tab/chart; multi-step undo/redo with keyboard; copy-paste chart across tabs; empty-state on blank canvas; edit/present toggle + full-screen.

**High-leverage delighters** (make it feel *pro*): field-aware Show-Me that auto-arranges pills; role-colored pills (dim vs measure); smart alignment guides; version history with revert + named versions; Cmd-K command palette; AI "suggest a chart from these fields"; threaded comments + @-mention; templates gallery; Tableau-style sheet-sorter thumbnails; format painter.

**Sources:** [Tableau — Shelves and Cards](https://help.tableau.com/current/pro/desktop/en-us/buildmanual_shelves.htm), [Tableau — The Workspace](https://help.tableau.com/current/pro/desktop/en-us/environment_workspace.htm), [Tableau — Workbooks and Sheets](https://help.tableau.com/current/pro/desktop/en-us/environ_workbooksandsheets.htm), [Tableau — Web Authoring](https://help.tableau.com/current/pro/desktop/en-us/getstarted_web_authoring.htm), [Power BI — Gridlines and Snap-to-Grid](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-gridlines-snap-to-grid), [Power BI — Z-order / Selection pane](https://go.christiansteven.com/bi-blog/power-bi/what-is-z-order-in-power-bi), [Power BI — Report display settings](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-report-display-settings), [Metabase — Visualizations](https://www.metabase.com/docs/latest/questions/visualizations/visualizing-results), [Metabase — Query builder editor](https://www.metabase.com/docs/latest/questions/query-builder/editor), [Metabase — Dashboards](https://www.metabase.com/docs/latest/dashboards/introduction), [Superset — Exploring Data](https://superset.apache.org/user-docs/using-superset/exploring-data/), [Superset — Creating Dashboards](https://superset.apache.org/user-docs/using-superset/creating-your-first-dashboard/), [Hex — Chart cells](https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells), [Hex — Develop your notebook](https://learn.hex.tech/docs/explore-data/notebook-view/develop-your-notebook), [Hex — Notebooks product](https://hex.tech/product/notebooks/), [Sigma — Design workbook layouts](https://help.sigmacomputing.com/docs/design-workbook-layouts), [Sigma — Intro to UI elements](https://help.sigmacomputing.com/docs/intro-to-ui-elements), [Sigma — Copy and paste elements](https://help.sigmacomputing.com/docs/copy-and-paste-elements), [Sigma — Copy workbook pages](https://help.sigmacomputing.com/docs/copy-and-paste-workbook-pages), [Sigma — Custom page panels](https://help.sigmacomputing.com/docs/add-custom-page-panels-to-a-workbook), [phData — Sigma layout options](https://www.phdata.io/blog/what-are-sigma-dashboard-layout-options/).