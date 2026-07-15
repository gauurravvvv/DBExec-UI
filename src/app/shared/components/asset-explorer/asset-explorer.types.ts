/**
 * Public types for `app-asset-explorer` — the shared Finder / SharePoint-style
 * asset explorer shell (Track F). The shell renders a folder/tag left rail plus
 * the app's `<app-custom-table>` in LIST view, and emits row actions for the
 * host module to handle (navigation, module-specific duplicate, etc.).
 */
import { CustomTableColumn } from '../custom-table/custom-table.types';

/**
 * A column in the explorer list. Re-uses {@link CustomTableColumn} so the
 * shell can pass it straight to `<app-custom-table>`, with an extra `cell`
 * render hint the shell uses to pick a built-in cell template (type icon,
 * datasource badge, tag chips, updated timestamp, favourite star) when the
 * host doesn't project its own `usGridCell` template for that column.
 */
export interface ExplorerColumn extends CustomTableColumn {
  /** Which built-in cell renderer the shell should use for this column.
   *  Omit for a plain text cell (row[field]). */
  cell?: 'type' | 'datasource' | 'tags' | 'updated' | 'favourite' | 'text';
}

/** The row-level actions the explorer's kebab menu can surface. */
export interface ExplorerRowAction {
  id:
    | 'open'
    | 'edit'
    | 'rename'
    | 'move'
    | 'copy'
    | 'favourite'
    | 'delete';
}

/** Generic explorer action payload emitted to the host (kebab, star, etc.). */
export interface ExplorerAction {
  action: string;
  row: any;
}

/** The base-filter slice the shell owns and passes to `<app-custom-table>`.
 *  `folderId` is a real id, `'root'` for the top level, or undefined for "all";
 *  `tags` scopes to one or more tags. Folder + tag selection are mutually
 *  exclusive in the rail. */
export interface ExplorerBaseFilter {
  folderId?: string | 'root';
  tags?: string[];
  /** Allow module-specific base-filter keys (e.g. datasourceId). */
  [key: string]: unknown;
}
