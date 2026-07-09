/**
 * Public types for `app-custom-table` — the app's unified, SIMPLE data table
 * (PrimeNG p-table under the hood). Grid-agnostic: consumers describe columns
 * with `CustomTableColumn` and never import a table library type.
 */

/** One column. `colId` matches the cell-template key AND the server adapter's
 *  sortFieldMap/filter key. */
export interface CustomTableColumn {
  /** Stable id — matches `<ng-template usGridCell="…">` and the adapter's
   *  sortFieldMap / filter slice key. */
  colId: string;

  /** Row property used for DEFAULT rendering (when no cell template) and as
   *  the sort field sent to the server. Defaults to `colId`. */
  field?: string;

  /** Header label — already translated by the caller. */
  header: string;

  /** Sortable header (single-column). Default true; set false for an
   *  actions column. */
  sortable?: boolean;

  /** Per-column filter control shown when the table's Filter toggle is on.
   *  `false` (default) = not filterable. */
  filter?: 'text' | 'numeric' | false;

  /** Text alignment. Default 'left'. Numbers should use 'right'. */
  align?: 'left' | 'right' | 'center';

  /** Optional CSS width / min-width for the column. */
  width?: string;

  /** Pin the column to the left (typically the first/name column). */
  frozen?: boolean;

  /** Convenience: monospace + right-align for numeric columns. */
  numeric?: boolean;
}

/** Table-level configuration — a small, opinionated set (vs the old grid's
 *  26 options). Core features are always on; secondary ones are opt-in so the
 *  default surface stays clean. */
export interface CustomTableConfig {
  /** Optional caption/title on the toolbar's left. */
  title?: string;

  /**
   * How rows are consumed:
   *  - 'scroll' (default): infinite virtual scroll — rows accumulate as the
   *    user scrolls; no page controls (cleanest, least chrome).
   *  - 'paginate': classic page + page-size selector footer.
   */
  mode?: 'scroll' | 'paginate';

  /** Rows fetched per server request (both modes). Default 50 for scroll,
   *  10 for paginate if unset. */
  pageSize?: number;
  /** Page-size choices (paginate mode only). Default [10, 25, 50, 100]. */
  pageSizeOptions?: number[];

  /** Fixed row height (px) for the virtual scroller (scroll mode). Default 44. */
  rowHeight?: number;

  /** Global search box (the one always-on search). Default true. */
  globalSearch?: boolean;
  /** Placeholder for the global search box. */
  globalSearchPlaceholder?: string;

  /** Per-column filter row, revealed by an on-demand Filter toggle. Default
   *  false (hidden). */
  showColumnFilters?: boolean;

  /** Export action (CSV + Excel). Default false. */
  enableExport?: boolean;

  /** Density switch (Compact / Comfortable). Default true. */
  enableDensity?: boolean;

  /** Column show/hide chooser. Default false. */
  enableColumnToggle?: boolean;

  /** Starting density. Default 'comfortable'. */
  density?: 'compact' | 'comfortable';

  /** Row identity field for trackBy. Default 'id'. */
  rowIdField?: string;

  /** Empty-state message. */
  emptyMessage?: string;

  /** Scroll height of the table body. Default 'calc(100vh - 260px)'. */
  height?: string;

  /** localStorage key to persist density + column visibility per consumer. */
  gridKey?: string;
}

/** Defaults applied for any option the caller didn't set. Kept separate so
 *  the component can spread without undefined-vs-false footguns. */
export const CUSTOM_TABLE_DEFAULTS: Required<
  Omit<
    CustomTableConfig,
    'title' | 'globalSearchPlaceholder' | 'gridKey' | 'emptyMessage'
  >
> = {
  mode: 'scroll',
  pageSize: 50,
  pageSizeOptions: [10, 25, 50, 100],
  rowHeight: 44,
  globalSearch: true,
  showColumnFilters: false,
  enableExport: false,
  enableDensity: true,
  enableColumnToggle: false,
  density: 'comfortable',
  rowIdField: 'id',
  height: 'calc(100vh - 260px)',
};
