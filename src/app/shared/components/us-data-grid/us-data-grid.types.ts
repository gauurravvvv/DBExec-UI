import type { ColDef, GridOptions } from 'ag-grid-community';

/**
 * Public configuration for `us-data-grid`. Designed to cover every
 * existing listing's needs while keeping the call-site short for the
 * common case (just `columns` + `rows`).
 *
 * Pass an AG Grid `gridOptions` blob to plug in anything we haven't
 * exposed as a typed knob.
 */
export interface UsDataGridConfig {
  /** Header label shown in the toolbar. */
  title?: string;

  /** "+ Add …" button label. Omit to hide the button. */
  addLabel?: string;

  /** Hide the per-column header search row built on top of AG Grid's
   *  floating filters. Defaults to true. */
  showFloatingFilters?: boolean;

  /** Enable the per-column resize handle. Defaults to true. */
  enableColumnResize?: boolean;

  /** Allow drag-reorder of columns. Defaults to true. */
  enableColumnReorder?: boolean;

  /** Pin the first column on the left (matches existing PrimeNG
   *  listings that use pFrozenColumn). Defaults to true. */
  freezeFirstColumn?: boolean;

  /** Show the toolbar "Columns" button (column visibility chooser). */
  enableColumnChooser?: boolean;

  /** Show the toolbar "Add Filter" button. */
  enableAddFilter?: boolean;

  /** Show the toolbar "Auto-fit" button — calls AG Grid's
   *  autoSizeAllColumns so each column shrinks/expands to fit its
   *  widest visible cell. Defaults to true. */
  enableAutoFit?: boolean;

  /** Show the density toggle (Comfortable / Compact). Defaults to
   *  true. The default density is `comfortable`. */
  enableDensityToggle?: boolean;

  /** Show the toolbar "Export CSV" button. Defaults to true. */
  enableCsvExport?: boolean;

  /** Show the toolbar "Export XLSX" button (real Excel, with header
   *  styling). Defaults to true. */
  enableXlsxExport?: boolean;

  /** Show the toolbar "Refresh" button. The host owns the actual
   *  refresh action via the (refresh) output. Defaults to false. */
  enableRefresh?: boolean;

  /** Quick-filter preset chips rendered above the grid. Each preset
   *  carries a filterModel snapshot the grid applies on click. */
  quickFilters?: UsQuickFilterPreset[];

  /** Show the toolbar "Views" overlay — save / restore named
   *  column-state + filter snapshots in localStorage keyed by
   *  `gridKey`. Defaults to true when `gridKey` is set, otherwise
   *  false (no key, no persistence). */
  enableSavedViews?: boolean;

  /** Stable identifier under which saved views + the "last used"
   *  state are persisted in localStorage. Required for the Saved
   *  Views feature to work. Use a hand-picked string per consumer
   *  (e.g. 'alert-runs', 'product-groups'). */
  gridKey?: string;

  /** Show the "showing X of Y" row counter under the toolbar.
   *  Defaults to true. */
  showRowCounter?: boolean;

  /** Show row-selection checkbox column. */
  enableRowSelection?: boolean;
  rowSelectionMode?: 'single' | 'multiple';

  /** Enable client-side pagination + render the AG Grid paginator. */
  enablePagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];

  /** CSS height for the grid wrapper. Defaults to `calc(100vh - 250px)`
   *  matching today's listing pages. */
  height?: string;

  /** dataKey for AG Grid `getRowId` callback. Defaults to `'id'`. */
  rowIdField?: string;

  /** Show the empty-state message when `rows.length === 0`. */
  emptyMessage?: string;

  /** Escape hatch — merge anything else into AG Grid's GridOptions.
   *  Useful for one-off needs (e.g. row class rules, master/detail in
   *  the future). */
  extraGridOptions?: Partial<GridOptions>;
}

/**
 * Default config — every flag the caller didn't override. Kept in a
 * separate constant so the component can spread it without hitting
 * undefined-vs-false footguns. */
export const US_DATA_GRID_DEFAULTS: Required<
  Omit<
    UsDataGridConfig,
    | 'title'
    | 'addLabel'
    | 'extraGridOptions'
    | 'gridKey'
    | 'quickFilters'
  >
> = {
  showFloatingFilters: true,
  enableColumnResize: true,
  enableColumnReorder: true,
  freezeFirstColumn: true,
  enableColumnChooser: true,
  enableAddFilter: true,
  enableAutoFit: true,
  enableDensityToggle: true,
  enableCsvExport: true,
  enableSavedViews: true,
  showRowCounter: true,
  enableXlsxExport: true,
  enableRefresh: false,
  enableRowSelection: false,
  rowSelectionMode: 'single',
  enablePagination: true,
  pageSize: 25,
  pageSizeOptions: [10, 25, 50, 100],
  height: 'calc(100vh - 260px)',
  rowIdField: 'id',
  emptyMessage: 'No records found',
};

/** Lightweight chip rendered for each active filter. */
export interface UsFilterChip {
  colId: string;
  headerLabel: string;
  operator: string;
  value: string;
}

/**
 * Hint shape for one entry in the "Add Filter" picker. The component
 * derives these from the supplied `ColDef[]` so most callers don't
 * touch this — it's exposed in case a host wants to limit / extend
 * the choices via the toolbar template slot.
 */
export interface UsAddFilterColumn {
  colId: string;
  headerLabel: string;
  /** AG Grid's filter type — drives which operator + value control
   *  the picker renders. */
  filter: 'agTextColumnFilter' | 'agNumberColumnFilter' | 'agDateColumnFilter' | 'agSetColumnFilter';
}

export type UsColumnDef<TData = unknown> = ColDef<TData>;

/**
 * One quick-filter preset chip. Clicking the chip applies the
 * snapshot — `filterModel` is the same shape `gridApi.setFilterModel`
 * accepts, so consumers can include any number of column filters in
 * one preset (e.g. `{status: { type: 'equals', filter: 'failed' }}`).
 * The chip is highlighted while its preset is the active match.
 */
export interface UsQuickFilterPreset {
  id: string;
  label: string;
  icon?: string;
  filterModel: Record<string, unknown>;
  /** Optional quick-search text the chip should also stamp. */
  quickFilter?: string;
}
