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

/**
 * One row in the Finder list view's flat, ordered VISIBLE list. Folders and
 * assets are interleaved; `depth` drives the Name-cell indent and a collapsing
 * folder removes its descendant slice from the array.
 *
 * The component keeps `nodes: ExplorerNode[]` as the render list and a
 * `childrenCache: Map<folderId, ExplorerNode[]>` so re-expanding a folder is
 * instant (R3's right-click "Refresh" will invalidate a cache entry).
 */
export interface ExplorerNode {
  /** Discriminates folder rows (disclosure + folder icon) from asset rows. */
  kind: 'folder' | 'asset';
  /** Folder id or asset id. */
  id: string;
  /** Display name (folder name / asset name). */
  name: string;
  /** Parent folder id; null at the top level (root). */
  parentId: string | null;
  /** Nesting depth — 0 at root; multiplies the Name-cell indent. */
  depth: number;
  /** Folder rows only: whether currently expanded in place. */
  expanded?: boolean;
  /** Folder rows only: children request in flight. */
  loading?: boolean;
  /** Folder rows only: children have been fetched at least once. */
  loaded?: boolean;
  /** Asset rows only: the raw module row (tags, updatedOn, datasource, …). */
  row?: any;
  /** Asset rows only: the object family, for the per-kind icon / Kind label.
   *  Mirrors the explorer's `objectType` (all rows share one family). */
  objectType?: string;
}
