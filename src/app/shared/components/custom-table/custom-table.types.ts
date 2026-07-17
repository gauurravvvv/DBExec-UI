/**
 * Public types for `app-custom-table` — the app's unified, SIMPLE data table
 * (PrimeNG p-table under the hood). Grid-agnostic: consumers describe columns
 * with `CustomTableColumn` and never import a table library type.
 */
import { DEFAULT_PAGE_SIZE } from 'src/app/core/constants/global.constant';

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

  /** Rows fetched per infinite-scroll batch (server request). Default 50
   *  (DEFAULT_PAGE_SIZE). The table is always infinite-scroll — there is no
   *  page-number paginator. */
  pageSize?: number;

  /** Fixed row height (px) used by the infinite-scroll near-bottom trigger.
   *  Default 44. */
  rowHeight?: number;

  /** Global search box (the one always-on search). Default true. */
  globalSearch?: boolean;
  /** Placeholder for the global search box. */
  globalSearchPlaceholder?: string;
  /** Filter key the global search maps to server-side. Default 'search'
   *  (some endpoints expect a specific field, e.g. 'name' for db roles). */
  globalSearchKey?: string;

  /** Per-column filter row, revealed by an on-demand Filter toggle. Default
   *  false (hidden). */
  showColumnFilters?: boolean;

  /** Export action (CSV + Excel). Default false. */
  enableExport?: boolean;

  /** Column show/hide chooser. Default false. */
  enableColumnToggle?: boolean;

  /** Row identity field for trackBy. Default 'id'. */
  rowIdField?: string;

  /** Empty-state message. */
  emptyMessage?: string;

  /** Scroll-body height. `'flex'` (default) fills the bounded flex parent —
   *  adapts to any screen; or pass a fixed CSS length like '480px'. */
  height?: string;

  /** localStorage key to persist column visibility per consumer. */
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
  pageSize: DEFAULT_PAGE_SIZE,
  rowHeight: 44,
  globalSearch: true,
  globalSearchKey: 'search',
  showColumnFilters: false,
  enableExport: false,
  enableColumnToggle: false,
  rowIdField: 'id',
  height: 'flex',
};
