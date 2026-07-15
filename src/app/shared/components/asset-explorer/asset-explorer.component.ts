import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MenuItem, TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { Menu } from 'primeng/menu';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { TooltipModule } from 'primeng/tooltip';
import { TreeModule } from 'primeng/tree';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  ASSET_ICON,
  ExplorerObjectType,
  KIND_EXTENSION,
  KIND_LABEL,
} from 'src/app/shared/helpers/asset-icon.helper';
import { CustomTableColumn } from 'src/app/shared/components/custom-table/custom-table.types';
import { CustomTableConfig } from 'src/app/shared/components/custom-table/custom-table.types';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import {
  FolderChildrenResult,
  FolderNode,
  FoldersService,
} from 'src/app/shared/services/folders.service';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import { ExplorerBaseFilter, ExplorerNode } from './asset-explorer.types';

/** Left-sidebar "Library" section rows (Finder-style). */
type LibraryView = 'all' | 'favourites' | 'recents';

/**
 * `app-asset-explorer` — the shared macOS-Finder LIST view for the four asset
 * families (dataset / analysis / dashboard / alert). R2 = core layout.
 *
 * The body is ONE interleaved tree table (Name / Kind / Modified / Tags). Folder
 * rows carry a ▸/▾ disclosure and expand IN PLACE to show indented children
 * (nested folders + assets); asset rows show a per-kind coloured icon, a muted
 * faux extension (.dset / .analysis / …) and a favourite star. A slim left
 * sidebar hosts a Library section (All items / Favourites / Recents) and a Tags
 * section; a status bar summarises counts + a breadcrumb.
 *
 * Data loads via FoldersService.listChildren (lazy, per folder) — NOT through
 * app-custom-table, whose row model can't express a variable-indent tree. The
 * `serverAdapter` / `rows` / `extraColumns` / `tableConfig` inputs are kept for
 * API compatibility (4 modules bind them) but are not the row source here.
 *
 * PRESERVED: every @Input / @Output name, the move/copy p-overlayPanel (via
 * FoldersService.moveObject + copy emit), favourites wiring, and the hover ⋮
 * kebab p-menu (openKebab / buildKebabItems).
 *
 * SEAMS LEFT OPEN:
 *   • R3 (right-click context menu): asset rows will reuse buildKebabItems();
 *     folder / empty-space menus (New folder · New tag · Refresh) hook off
 *     onRowContextMenu / childrenCache invalidation. TODO markers below.
 *   • R4 (coloured tag dots): rowTags() returns names now; a colour lookup will
 *     wrap each into a dot. Sidebar tag rows + inline row tags share the seam.
 */
@Component({
  selector: 'app-asset-explorer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    TreeModule,
    MenuModule,
    OverlayPanelModule,
    ButtonModule,
    TooltipModule,
    ScrollingModule,
    // Kept so consumers' projected `<ng-template usGridCell="…">` still parses
    // (the module column DOM is now read directly in the Kind cell, but the
    // directive must remain a valid host import for API compatibility).
    UsGridCellDirective,
  ],
  templateUrl: './asset-explorer.component.html',
  styleUrls: ['./asset-explorer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetExplorerComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private foldersService = inject(FoldersService);
  private favouritesService = inject(FavouritesService);
  private globalService = inject(GlobalService);
  private translate = inject(TranslateService);

  /** Which object family this explorer lists. Required. */
  @Input() objectType!: ExplorerObjectType;

  /** Server adapter the parent builds. Kept for API compatibility; the tree
   *  loads its rows via FoldersService.listChildren, so this is not used for
   *  row data in the Finder view. */
  @Input() serverAdapter?: UsServerListAdapter<Record<string, unknown>>;

  /** Simple in-memory rows (legacy). Kept for API compatibility. */
  @Input() rows: Record<string, unknown>[] = [];

  /** Module-specific columns (e.g. a datasource badge). Kept for API
   *  compatibility; the Kind cell now reads datasource.name directly. */
  @Input() extraColumns: CustomTableColumn[] = [];

  /** Table config overrides. Kept for API compatibility. */
  @Input() tableConfig: CustomTableConfig = {};

  /** Whether folder/asset write affordances (New folder, kebab edit/delete)
   *  are shown. */
  @Input() canManage = true;

  /* ── outputs the parent handles ──────────────────────────────────── */
  @Output() open = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() create = new EventEmitter<void>();
  @Output() rename = new EventEmitter<any>();
  @Output() move = new EventEmitter<any>();
  @Output() copy = new EventEmitter<{ row: any; targetFolderId: string | null }>();
  @Output() remove = new EventEmitter<any>();
  @Output() favourite = new EventEmitter<any>();
  /** Fired after a successful in-shell folder move so the parent can refresh. */
  @Output() moved = new EventEmitter<{ row: any; targetFolderId: string | null }>();

  @ViewChild('kebabMenu') kebabMenu?: Menu;
  @ViewChild('moveOp') moveOp?: OverlayPanel;

  /* ── Finder tree state ───────────────────────────────────────────── */

  /** The ordered VISIBLE list of interleaved folder + asset rows. */
  nodes: ExplorerNode[] = [];

  /** Cached children per folder id ('root' for the top level) so re-expanding
   *  is instant. R3's right-click "Refresh" deletes an entry to force reload. */
  private childrenCache = new Map<string, ExplorerNode[]>();

  /** Whether the initial root load is running (drives the body spinner). */
  rootLoading = false;

  /** Single-select highlight: the selected node's composite key. */
  selectedKey: string | null = null;

  /* ── sidebar state ───────────────────────────────────────────────── */
  libraryView: LibraryView = 'all';
  favouriteCount = 0;

  tags: { tag: string; count: number }[] = [];
  tagsLoading = false;
  /** Active sidebar tag filter (R4 wires colour + real filtering). */
  selectedTag: string | null = null;

  /* ── base filter (kept for API compatibility) ────────────────────── */
  baseFilter: ExplorerBaseFilter = {};

  /* ── table columns (kept for API compatibility) ──────────────────── */
  columns: CustomTableColumn[] = [];

  /* ── kebab state ─────────────────────────────────────────────────── */
  kebabItems: MenuItem[] = [];
  private kebabRow: any = null;

  /* ── move/copy overlay state (UNCHANGED behaviour) ───────────────── */
  moveRow: any = null;
  moveNodes: FolderNode[] = [];
  moveSelection: TreeNode | null = null;
  moveLoading = false;
  moveTargetFolderId: string | null = null;
  moving = false;
  moveIsCopy = false;
  showMoveCreate = false;
  moveNewFolderName = '';
  savingMoveFolder = false;

  /* ── toolbar: new-folder-at-root inline create ───────────────────── */
  showRootCreate = false;
  rootNewFolderName = '';
  savingRootFolder = false;

  /** Expose the icon/label maps to the template. */
  readonly ASSET_ICON = ASSET_ICON;
  readonly KIND_LABEL = KIND_LABEL;
  readonly KIND_EXTENSION = KIND_EXTENSION;

  ngOnInit(): void {
    this.columns = this.buildColumns();
    this.baseFilter = {};
    this.loadRoot();
    // Warm favourite state so stars render and the sidebar count is accurate.
    this.favouritesService.refresh(this.objectType).then(() => {
      this.favouriteCount = this.currentFavouriteCount();
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['extraColumns'] && !changes['extraColumns'].firstChange) {
      this.columns = this.buildColumns();
    }
    if (changes['objectType'] && !changes['objectType'].firstChange) {
      this.tags = [];
      this.selectedTag = null;
      this.selectedKey = null;
      this.childrenCache.clear();
      this.libraryView = 'all';
      this.loadRoot();
    }
  }

  /* ── columns (API-compat shape only) ─────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const extras = this.extraColumns ?? [];
    return [
      { colId: 'name', field: 'name', header: 'COMMON.NAME', width: '260px', frozen: true },
      ...extras,
      { colId: 'kind', header: 'EXPLORER.COL.KIND', width: '200px', sortable: false },
      { colId: 'updated', field: 'updatedOn', header: 'EXPLORER.COL.MODIFIED', width: '176px' },
      { colId: 'tags', header: 'EXPLORER.COL.TAGS', width: '160px', sortable: false },
      { colId: 'kebab', header: '', width: '48px', sortable: false, align: 'center' },
    ];
  }

  /* ── tree: load + expand/collapse ────────────────────────────────── */

  /** Composite render key so folder/asset ids never collide. */
  nodeKey(n: ExplorerNode): string {
    return n.kind + ':' + n.id;
  }

  /** trackBy for the *ngFor / cdk viewport over `nodes`. */
  trackNode = (_: number, n: ExplorerNode): string => this.nodeKey(n);

  /** Load the top level (folderId 'root') into `nodes`. */
  loadRoot(): void {
    if (!this.objectType) return;
    this.rootLoading = true;
    this.nodes = [];
    this.foldersService
      .listChildren(this.objectType, 'root')
      .then((res: FolderChildrenResult) => {
        this.childrenCache.set('root', this.mapChildren(res, null, 0));
        this.nodes = [...this.childrenCache.get('root')!];
        this.rootLoading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.nodes = [];
        this.rootLoading = false;
        this.cdr.markForCheck();
      });
  }

  /** Map a children result into folder + asset nodes at `depth`. */
  private mapChildren(
    res: FolderChildrenResult,
    _parentId: string | null,
    depth: number,
  ): ExplorerNode[] {
    const folders: ExplorerNode[] = (res.folders ?? []).map(f => ({
      kind: 'folder' as const,
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      depth,
      expanded: false,
      loaded: false,
      loading: false,
    }));
    const assets: ExplorerNode[] = (res.assets ?? []).map(a => ({
      kind: 'asset' as const,
      id: a.id,
      name: a.name,
      parentId: (a.folderId as string | null) ?? null,
      depth,
      row: a,
      objectType: this.objectType,
    }));
    // Finder orders folders before loose files at each level.
    return [...folders, ...assets];
  }

  /** Toggle a folder row's expansion, lazy-loading children on first open. */
  toggleFolder(node: ExplorerNode): void {
    if (node.kind !== 'folder') return;
    if (node.expanded) {
      this.collapseFolder(node);
    } else {
      this.expandFolder(node);
    }
  }

  private expandFolder(node: ExplorerNode): void {
    node.expanded = true;
    const cached = this.childrenCache.get(node.id);
    if (cached) {
      this.spliceChildren(node, cached);
      this.cdr.markForCheck();
      return;
    }
    node.loading = true;
    this.cdr.markForCheck();
    this.foldersService
      .listChildren(this.objectType, node.id)
      .then((res: FolderChildrenResult) => {
        const kids = this.mapChildren(res, node.id, node.depth + 1);
        this.childrenCache.set(node.id, kids);
        node.loading = false;
        node.loaded = true;
        // Guard: only splice if still expanded (user may have collapsed).
        if (node.expanded) this.spliceChildren(node, kids);
        this.cdr.markForCheck();
      })
      .catch(() => {
        node.loading = false;
        node.expanded = false;
        this.cdr.markForCheck();
      });
  }

  private collapseFolder(node: ExplorerNode): void {
    node.expanded = false;
    const start = this.nodes.indexOf(node);
    if (start < 0) return;
    // Remove the contiguous descendant slice (deeper than this folder).
    let end = start + 1;
    while (end < this.nodes.length && this.nodes[end].depth > node.depth) end++;
    if (end > start + 1) {
      this.nodes = [
        ...this.nodes.slice(0, start + 1),
        ...this.nodes.slice(end),
      ];
    }
    this.cdr.markForCheck();
  }

  /** Splice a folder's cached children in right after it. */
  private spliceChildren(node: ExplorerNode, kids: ExplorerNode[]): void {
    const idx = this.nodes.indexOf(node);
    if (idx < 0) return;
    this.nodes = [
      ...this.nodes.slice(0, idx + 1),
      ...kids,
      ...this.nodes.slice(idx + 1),
    ];
  }

  /* ── row interaction ─────────────────────────────────────────────── */

  /** Click a row: folders toggle expand; assets select + emit open on name. */
  onRowClick(node: ExplorerNode): void {
    this.selectedKey = this.nodeKey(node);
    if (node.kind === 'folder') {
      this.toggleFolder(node);
    }
    this.cdr.markForCheck();
  }

  /** Click an asset name → open (folders open via row click / disclosure). */
  onAssetOpen(node: ExplorerNode, event?: MouseEvent): void {
    event?.stopPropagation();
    this.selectedKey = this.nodeKey(node);
    this.open.emit(node.row);
  }

  /** Disclosure click shouldn't double-fire with the row click. */
  onDisclosureClick(node: ExplorerNode, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedKey = this.nodeKey(node);
    this.toggleFolder(node);
    this.cdr.markForCheck();
  }

  isSelected(node: ExplorerNode): boolean {
    return this.selectedKey === this.nodeKey(node);
  }

  /**
   * TODO (R3): right-click a row / empty space opens a context menu.
   *  - asset row → reuse buildKebabItems(row) at the pointer;
   *  - folder row / empty space → New folder · New tag · Refresh
   *    (Refresh = childrenCache.delete(folderId) then re-expand).
   *  Left as a no-op stub so the seam is obvious.
   */
  onRowContextMenu(_event: MouseEvent, _node: ExplorerNode | null): void {
    // no-op for R2
  }

  /* ── sidebar: library + tags ─────────────────────────────────────── */

  setLibraryView(view: LibraryView): void {
    this.libraryView = view;
    // TODO (R4): 'favourites'/'recents' filter the tree; for R2 they only
    // set the active state — 'all' stays the source of truth.
    this.selectedTag = null;
    this.cdr.markForCheck();
  }

  loadTags(): void {
    if (!this.objectType) return;
    this.tagsLoading = true;
    this.foldersService
      .listTags(this.objectType)
      .then(tags => {
        this.tags = tags ?? [];
        this.tagsLoading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.tags = [];
        this.tagsLoading = false;
        this.cdr.markForCheck();
      });
  }

  /**
   * Click a sidebar tag. R2 = minimal: toggle the active state only (no tree
   * re-query — listChildren has no tag filter). R4 will drive a flat, filtered
   * "matching assets" view + coloured dots.
   */
  selectTag(tag: string): void {
    this.selectedTag = this.selectedTag === tag ? null : tag;
    this.libraryView = 'all';
    // TODO (R4): apply a flat tag filter (serverAdapter {tags:[tag]} or a
    // dedicated endpoint) and render matches without the folder tree.
    this.cdr.markForCheck();
  }

  /* ── favourites (UNCHANGED wiring) ───────────────────────────────── */

  isFavourite(id: string): boolean {
    return this.favouritesService.isFavourite(this.objectType, id);
  }

  toggleFavourite(row: any, event?: MouseEvent): void {
    event?.stopPropagation();
    const id = row?.id;
    if (!id) return;
    this.favouritesService.toggle(this.objectType, id).then((res: any) => {
      this.globalService.handleSuccessService(res, false);
      this.favouriteCount = this.currentFavouriteCount();
      this.favourite.emit(row);
      this.cdr.markForCheck();
    });
  }

  /** Count of the current user's favourites for this objectType. */
  private currentFavouriteCount(): number {
    return this.favouritesService.ids()[this.objectType]?.size ?? 0;
  }

  /* ── kebab (UNCHANGED) ───────────────────────────────────────────── */

  openKebab(event: MouseEvent, row: any): void {
    event.stopPropagation();
    this.kebabRow = row;
    this.kebabItems = this.buildKebabItems(row);
    this.kebabMenu?.toggle(event);
  }

  private buildKebabItems(row: any): MenuItem[] {
    const t = (k: string): string => this.translate.instant(k);
    const items: MenuItem[] = [
      {
        label: t('EXPLORER.KEBAB.OPEN'),
        icon: 'pi pi-external-link',
        command: () => this.open.emit(row),
      },
    ];
    if (this.canManage) {
      items.push({
        label: t('EXPLORER.KEBAB.EDIT'),
        icon: 'pi pi-pencil',
        command: () => this.edit.emit(row),
      });
      items.push({
        label: t('EXPLORER.KEBAB.RENAME'),
        icon: 'pi pi-tag',
        command: () => this.rename.emit(row),
      });
      items.push({
        label: t('EXPLORER.KEBAB.MOVE'),
        icon: 'pi pi-folder',
        command: () => this.openMoveOverlay(row, false),
      });
      items.push({
        label: t('EXPLORER.KEBAB.COPY'),
        icon: 'pi pi-copy',
        command: () => this.openMoveOverlay(row, true),
      });
    }
    items.push({
      label: this.isFavourite(row?.id)
        ? t('EXPLORER.KEBAB.UNFAVOURITE')
        : t('EXPLORER.KEBAB.FAVOURITE'),
      icon: this.isFavourite(row?.id) ? 'pi pi-star-fill' : 'pi pi-star',
      command: () => this.toggleFavourite(row),
    });
    if (this.canManage) {
      items.push({ separator: true });
      items.push({
        label: t('EXPLORER.KEBAB.DELETE'),
        icon: 'pi pi-trash',
        styleClass: 'kebab-danger',
        command: () => this.remove.emit(row),
      });
    }
    return items;
  }

  /* ── move / copy overlay (UNCHANGED behaviour) ───────────────────── */

  openMoveOverlay(row: any, isCopy: boolean): void {
    this.moveRow = row;
    this.moveIsCopy = isCopy;
    this.moveTargetFolderId = null;
    this.moveSelection = null;
    this.showMoveCreate = false;
    this.moveNewFolderName = '';
    this.loadMoveTree();
    const anchor = document.activeElement as HTMLElement | null;
    if (anchor) this.moveOp?.show(new Event('click'), anchor);
  }

  private loadMoveTree(): void {
    this.moveLoading = true;
    this.foldersService
      .listTree(this.objectType)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const rows = res.data?.folders ?? res.data ?? [];
          this.moveNodes = this.foldersService.toTreeNodes(rows);
        } else {
          this.moveNodes = [];
        }
        this.moveLoading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.moveNodes = [];
        this.moveLoading = false;
        this.cdr.markForCheck();
      });
  }

  onMoveNodeSelect(event: { node: TreeNode }): void {
    const node = event.node as FolderNode;
    this.moveTargetFolderId = node?.data?.id ?? null;
    this.moveSelection = node ?? null;
  }

  selectMoveRoot(): void {
    this.moveTargetFolderId = null;
    this.moveSelection = null;
  }

  openMoveCreate(): void {
    this.showMoveCreate = true;
    this.moveNewFolderName = '';
  }

  cancelMoveCreate(): void {
    this.showMoveCreate = false;
    this.moveNewFolderName = '';
  }

  saveMoveFolder(): void {
    const name = this.moveNewFolderName.trim();
    if (!name || this.savingMoveFolder) return;
    this.savingMoveFolder = true;
    this.foldersService
      .create({ name, objectType: this.objectType, parentId: this.moveTargetFolderId })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          const newId: string | null = res?.data?.id ?? res?.data?.folder?.id ?? null;
          this.showMoveCreate = false;
          this.moveNewFolderName = '';
          this.foldersService.listTree(this.objectType).then((treeRes: any) => {
            if (this.globalService.handleSuccessService(treeRes, false)) {
              const rows = treeRes.data?.folders ?? treeRes.data ?? [];
              this.moveNodes = this.foldersService.toTreeNodes(rows);
            }
            if (newId) {
              this.moveTargetFolderId = newId;
              this.moveSelection = this.findNode(this.moveNodes, newId);
            }
            this.savingMoveFolder = false;
            this.cdr.markForCheck();
          });
        } else {
          this.savingMoveFolder = false;
          this.cdr.markForCheck();
        }
      })
      .catch(() => {
        this.savingMoveFolder = false;
        this.cdr.markForCheck();
      });
  }

  /** Confirm the move: shell calls moveObject then emits `moved`, and reloads
   *  the tree so the row lands in its new home. */
  confirmMove(): void {
    if (!this.moveRow || this.moving) return;
    this.moving = true;
    const row = this.moveRow;
    const target = this.moveTargetFolderId;
    this.foldersService
      .moveObject(this.objectType, row.id, target)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.moved.emit({ row, targetFolderId: target });
          this.refreshTree();
          this.moveOp?.hide();
        }
        this.moving = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.moving = false;
        this.cdr.markForCheck();
      });
  }

  /** Confirm the copy: shell emits `copy` (parent owns the duplicate API). */
  confirmCopy(): void {
    if (!this.moveRow) return;
    this.copy.emit({ row: this.moveRow, targetFolderId: this.moveTargetFolderId });
    this.moveOp?.hide();
  }

  /* ── toolbar: new folder at root ─────────────────────────────────── */

  openRootCreate(): void {
    this.showRootCreate = true;
    this.rootNewFolderName = '';
  }

  cancelRootCreate(): void {
    this.showRootCreate = false;
    this.rootNewFolderName = '';
  }

  saveRootFolder(): void {
    const name = this.rootNewFolderName.trim();
    if (!name || this.savingRootFolder) return;
    this.savingRootFolder = true;
    // TODO (R3): the right-click "New folder" will create under the clicked
    // folder; the toolbar affordance always creates at root.
    this.foldersService
      .create({ name, objectType: this.objectType, parentId: null })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.showRootCreate = false;
          this.rootNewFolderName = '';
          this.refreshTree();
        }
        this.savingRootFolder = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.savingRootFolder = false;
        this.cdr.markForCheck();
      });
  }

  /** Invalidate the cache and reload from root (used after move / create). */
  private refreshTree(): void {
    this.childrenCache.clear();
    this.selectedKey = null;
    this.loadRoot();
  }

  /* ── helpers ─────────────────────────────────────────────────────── */

  private findNode(nodes: FolderNode[], id: string): FolderNode | null {
    for (const n of nodes) {
      if (n.data.id === id) return n;
      if (n.children) {
        const hit = this.findNode(n.children, id);
        if (hit) return hit;
      }
    }
    return null;
  }

  /** Normalise a row's tags into a string[] regardless of BE shape. */
  rowTags(row: any): string[] {
    const raw = row?.tags;
    if (Array.isArray(raw)) {
      return raw
        .map((t: any) => (typeof t === 'string' ? t : t?.tag ?? t?.name))
        .filter(Boolean);
    }
    return [];
  }

  /** Per-kind icon class for an asset node. */
  assetIcon(node: ExplorerNode): string {
    const type = (node.objectType ?? this.objectType) as ExplorerObjectType;
    return ASSET_ICON[type] ?? 'pi pi-file';
  }

  /** Per-kind CSS modifier (colours the icon in SCSS). */
  kindClass(node: ExplorerNode): string {
    if (node.kind === 'folder') return 'k-folder';
    return 'k-' + (node.objectType ?? this.objectType);
  }

  /** Faux extension for an asset node (.dset / .analysis / …). */
  assetExtension(node: ExplorerNode): string {
    const type = (node.objectType ?? this.objectType) as ExplorerObjectType;
    return KIND_EXTENSION[type] ?? '';
  }

  /**
   * Kind-cell label. Folders → "Folder"; assets → the kind label, plus
   * " · <datasource.name>" for dataset/analysis when present.
   */
  kindLabel(node: ExplorerNode): string {
    if (node.kind === 'folder') return this.translate.instant('EXPLORER.KIND.FOLDER');
    const type = (node.objectType ?? this.objectType) as ExplorerObjectType;
    const base = this.translate.instant(KIND_LABEL[type] ?? '');
    const dsName = node.row?.datasource?.name || node.row?.sourceType;
    if ((type === 'dataset' || type === 'analysis') && dsName) {
      return base + ' · ' + dsName;
    }
    return base;
  }

  /** Icon for the current object type (leading list icon). */
  get typeIcon(): string {
    return ASSET_ICON[this.objectType] ?? 'pi pi-file';
  }

  /* ── status bar counts ───────────────────────────────────────────── */

  get itemCount(): number {
    return this.nodes.filter(n => n.kind === 'asset').length;
  }

  get folderCount(): number {
    return this.nodes.filter(n => n.kind === 'folder').length;
  }
}
