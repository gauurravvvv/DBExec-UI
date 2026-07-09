# Unified Simple Table (`us-table`) — shared PrimeNG table

## Context

The app's shared grid `us-data-grid` (an AG Grid wrapper) exposes **26 config
options** and renders **~20–30 visual elements** when its (default-on) features
are enabled: a title + ~11 toolbar buttons (search, Columns, Add Filter,
Auto-fit, Density, CSV, Excel, Refresh, Views, Clear, Add), quick-filter chips,
active-filter chips, a per-column floating-filter row, a row counter, a
bulk-action bar, and a paginator. Users find the tables **cluttered and busy**.
14 modules consume it.

We're building a NEW **unified, simple** shared table on **PrimeNG p-table 17**
(already in the app — no new dependency; lets us drop AG Grid once every screen
migrates). It will be piloted in **Database Users & Roles** (`list-db-roles`),
then rolled to the other 13 lists in a later pass.

### Decisions locked with the user

- **Engine:** PrimeNG p-table (drop AG Grid over time).
- **Features:** keep all four capability groups but present them by weight —
  **core always-on** (global search, click-header sort, server pagination) and
  **secondary on-demand / tucked** (per-column Filter toggle, Export CSV/Excel,
  Density, Column show/hide). The default view is clean; extras appear only when
  asked for.
- **Pilot:** `list-db-roles`.
- Build as a **shared component**; consumers adopt it screen by screen.

### Research basis (real-world data-table UX)

From Pencil & Paper's enterprise data-table pattern analysis + corroborating
sources ([pencilandpaper.io](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables),
[uiprep.com](https://www.uiprep.com/blog/the-ultimate-guide-to-designing-data-tables)):
- **Density:** condensed 40px / regular 48px / relaxed 56px rows; default
  comfortable, let the user switch.
- **Alignment/type:** left-align text, right-align numbers, monospace for
  numeric columns; sticky header; subtle 1px row dividers; **no zebra stripes**
  (they fight hover/selection states).
- **Sort:** single-column, small chevron that doesn't disturb header alignment.
- **Search/filter:** one global search box for discovery; per-column filters
  only on demand — not an always-visible row.
- **Chrome:** "don't overcharge the UI with buttons everywhere — show the right
  interaction only when and where it's needed." Bulk actions on selection;
  density switch as a small control, not dominating the header.

## Design

### Component: `us-table` (`shared/components/us-table/`)

A thin, opinionated p-table wrapper. **Mirrors the `us-data-grid` call-site API**
so migration is minimal:

```html
<us-table [columns]="cols" [serverAdapter]="adapter" [config]="tableConfig"
          (refresh)="refreshList()">
  <ng-template usGridCell="name" let-row> … </ng-template>
  <ng-template usGridCell="actions" let-row> … </ng-template>
</us-table>
```

- **Reuses the existing `UsGridCellDirective`** (`usGridCell="colId"`) verbatim
  — it's already grid-agnostic. Every consumer's cell templates carry over
  unchanged; the component renders each column's `<td>` via its matching
  template (falling back to `row[field]` when none is supplied).
- **Reuses `UsServerListAdapter` unchanged** — same `{page,limit,sort,filter}`
  → `{rows,total}` contract. `us-table` binds p-table's `[lazy]` +
  `(onLazyLoad)` to the adapter: `first/rows` → page/limit, `sortField/sortOrder`
  → `setSort`, and the global search + per-column filters → `setFilter`.
  `[totalRecords]="adapter.total()"`, `[loading]="adapter.loading()"`,
  `[value]="adapter.rows()"`.

### New column type (grid-agnostic) — `UsTableColumn`

Consumers stop importing AG Grid's `ColDef`. A small own type:

```ts
interface UsTableColumn {
  colId: string;          // matches usGridCell key + adapter sortFieldMap key
  field?: string;         // row property for default rendering + default sort field
  header: string;         // column header label (already translated by caller)
  sortable?: boolean;     // default true (false for actions)
  filter?: 'text' | 'numeric' | false;  // per-column filter type; default false
  align?: 'left' | 'right' | 'center';  // default left; numbers → right
  width?: string;         // optional fixed/min width
  frozen?: boolean;       // pin left (first column typically)
  numeric?: boolean;      // monospace + right-align convenience
}
```

### Config — `UsTableConfig` (small, sensible defaults)

Only the knobs a simple table needs (vs. 26):

```ts
interface UsTableConfig {
  title?: string;                 // optional caption
  pageSize?: number;              // default 10
  pageSizeOptions?: number[];     // default [10, 25, 50, 100]
  globalSearch?: boolean;         // default true — the one search box
  globalSearchPlaceholder?: string;
  showColumnFilters?: boolean;    // default false — the on-demand Filter toggle
  enableExport?: boolean;         // default false — CSV/Excel action
  enableDensity?: boolean;        // default true — compact/comfortable switch
  enableColumnToggle?: boolean;   // default false — column show/hide
  density?: 'compact' | 'comfortable';  // default comfortable
  rowIdField?: string;            // default 'id'
  emptyMessage?: string;
  height?: string;                // scroll height; default calc(100vh - 260px)
  gridKey?: string;               // localStorage key for density/columns prefs
}
```

### Layout & chrome (the "simple" part)

- **Toolbar (single slim row):** left = optional title; right = the global
  search box, then a compact cluster of icon buttons for the *enabled*
  secondary actions only — Filter (toggles the per-column filter row), Export,
  Density, Columns. Anything disabled in config renders nothing. No chips rows,
  no always-on floating filters, no Views. A projected `toolbarActions` slot
  lets the host drop page-level buttons (e.g. Create) if desired — but the
  pilot keeps those in the page header as today.
- **Table:** sticky header; single-column sort with a chevron; subtle 1px
  bottom borders; hover row highlight; **no zebra**. Density switch sets row
  padding to the researched 40 / 48px. Numeric columns right-aligned + mono.
- **Per-column filters:** hidden until the Filter toggle is on; then p-table
  `pTemplate="filter"` inputs appear in a second header row. Each maps to a
  `{colId: value}` slice via the adapter's filter path.
- **Footer:** p-table paginator (`[paginator]="true"`, current-page report
  "{first}–{last} of {totalRecords}"), page-size selector from
  `pageSizeOptions`. Server-driven via `onLazyLoad`.
- **States:** loading (skeleton/`loadingbody`), empty (`emptymessage`).
- **Styling:** app tokens only, in `us-table.component.scss` (with the needed
  `::ng-deep .p-datatable-*` overrides scoped to `us-table`), matching the
  canonical list look (list-user).

### Migration shape (pilot: list-db-roles)

- Swap `<us-data-grid …>` → `<us-table …>`; keep every `<ng-template
  usGridCell>` as-is.
- Replace `cols: ColDef[]` (AG Grid) with `cols: UsTableColumn[]` (same colIds:
  name/type/status/validUntil/connectionLimit/flags/memberOf/actions).
- Replace `gridConfig: UsDataGridConfig` with `tableConfig: UsTableConfig`
  (globalSearch on; showColumnFilters off; export off or on per taste; density
  on). The Type segmented control + name box stay in the page toolbar and keep
  feeding `adapter.setFilter(serverFilter())` exactly as now.
- The `UsServerListAdapter` wiring, BE endpoints, and the sort-format fix from
  the prior slice are untouched.

### Out of scope (this slice)

- Migrating the other 13 lists (later pass, one per screen).
- Deleting AG Grid / `us-data-grid` (only after all consumers migrate).
- Saved Views (dropped from the simple table; density + column prefs persist
  via `gridKey` if set).

## Files

- **New:** `shared/components/us-table/us-table.component.{ts,html,scss}`,
  `us-table.types.ts` (`UsTableColumn`, `UsTableConfig`, defaults). Reuses
  `us-data-grid/us-grid-cell.directive.ts` and
  `us-data-grid/us-server-list-adapter.ts` (imported, not copied).
- **Pilot:** `db-access/roles/list-db-roles/list-db-roles.component.{ts,html}`
  (+ scss tweaks if needed) switched to `us-table`.
- i18n: any new table-chrome strings (Filter / Export / Density / Columns /
  page report) across all 10 locales.
- No BE change.

## Verification

- `npx tsc --noEmit` + `ng build --configuration production` green.
- Live (once dev server restarts / hard refresh) on `/app/db-roles`:
  default view is clean (search + table + pager, no floating-filter row, no
  chip rows); server calls fire on page change, page-size change, header sort,
  global search, Type/name/status filter; Filter toggle reveals per-column
  inputs that also hit the server; density switch changes row height; export
  (if enabled) downloads the current view; empty + loading states read well.
- Compare density/clutter to the old grid side by side.
- Commit as one FE slice on `version_261`, not pushed, standard trailer,
  excluding `environment*.ts`.

## Constraints (standing)

- FE :4210 ↔ BE :3010; never commit `environment.ts` / `environment.dev.ts`.
- Never push; user pushes. App tokens only; PrimeNG only (no new dep). Reuse
  the shared adapter + cell directive. Don't touch sidebar styling.
