import { CommonModule } from '@angular/common';
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
} from 'src/app/shared/helpers/asset-icon.helper';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { UsGridCellDirective } from 'src/app/shared/components/us-data-grid/us-grid-cell.directive';
import { UsServerListAdapter } from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import {
  FolderNode,
  FoldersService,
} from 'src/app/shared/services/folders.service';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import {
  ExplorerBaseFilter,
} from './asset-explorer.types';

type RailMode = 'folders' | 'tags';

/**
 * `app-asset-explorer` — the shared Finder / SharePoint-style asset explorer
 * shell (Track F). LIST view only, NO drag-drop. It owns:
 *
 *   • a segmented "Folders | Tags" left rail:
 *       - Folders: a click-based `p-tree` (drag OFF) with a Root/All node and a
 *         "＋ New folder" affordance; selecting a folder sets
 *         `baseFilter.folderId` and clears any tag.
 *       - Tags: a scrollable list of {tag,count} chips; selecting a tag sets
 *         `baseFilter.tags=[tag]` and clears the folder selection.
 *   • a body with a breadcrumb + `<app-custom-table>` (re-queries on baseFilter
 *     change — the table's ngOnChanges 'baseFilter' branch calls pushFilter).
 *   • a per-row kebab (`p-menu`, appendTo body) rebuilt for the clicked row.
 *   • ONE move/copy overlay hosting a mini folder tree + New folder.
 *
 * The shell wires the favourite star + kebab-Favourite straight to
 * FavouritesService and the Move action to FoldersService.moveObject; every
 * other action is EMITTED so the parent handles navigation / module endpoints.
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
    CustomTableComponent,
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

  /** Server adapter the parent builds — passed straight to app-custom-table.
   *  Preferred over [rows]. */
  @Input() serverAdapter?: UsServerListAdapter<Record<string, unknown>>;

  /** Simple in-memory rows (used only when no serverAdapter is provided). */
  @Input() rows: Record<string, unknown>[] = [];

  /** Module-specific columns inserted after the name column (e.g. a datasource
   *  badge). Rendered via projected `usGridCell` templates the parent supplies,
   *  or a plain text cell. */
  @Input() extraColumns: CustomTableColumn[] = [];

  /** Table config overrides forwarded to app-custom-table. */
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

  /* ── rail state ──────────────────────────────────────────────────── */
  railMode: RailMode = 'folders';

  folderNodes: FolderNode[] = [];
  folderSelection: TreeNode | null = null;
  foldersLoading = false;

  tags: { tag: string; count: number }[] = [];
  tagsLoading = false;
  selectedTag: string | null = null;

  /** Selected folder id (null = Root/All, no filter). */
  selectedFolderId: string | null = null;

  /** The base filter passed to app-custom-table. Re-assigned (new object) on
   *  every folder/tag change so custom-table's ngOnChanges fires. */
  baseFilter: ExplorerBaseFilter = {};

  /** Breadcrumb text — folder path or the selected tag. */
  breadcrumb = '';

  /* ── inline folder create (rail) ─────────────────────────────────── */
  showRailCreate = false;
  railNewFolderName = '';
  savingRailFolder = false;

  /* ── table columns (built once objectType + extras are known) ────── */
  columns: CustomTableColumn[] = [];

  /* ── kebab state ─────────────────────────────────────────────────── */
  kebabItems: MenuItem[] = [];
  private kebabRow: any = null;

  /* ── move/copy overlay state ─────────────────────────────────────── */
  moveRow: any = null;
  moveNodes: FolderNode[] = [];
  moveSelection: TreeNode | null = null;
  moveLoading = false;
  moveTargetFolderId: string | null = null;
  moving = false;
  showMoveCreate = false;
  moveNewFolderName = '';
  savingMoveFolder = false;

  /** Expose the icon map to the template. */
  readonly ASSET_ICON = ASSET_ICON;

  ngOnInit(): void {
    this.columns = this.buildColumns();
    this.baseFilter = {};
    this.loadFolders();
    // Warm favourite state so the star column renders correctly.
    this.favouritesService
      .refresh(this.objectType)
      .then(() => this.cdr.markForCheck());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['extraColumns'] && !changes['extraColumns'].firstChange) {
      this.columns = this.buildColumns();
    }
    if (changes['objectType'] && !changes['objectType'].firstChange) {
      this.loadFolders();
      this.tags = [];
      this.selectedTag = null;
      this.selectedFolderId = null;
      this.applyBaseFilter();
    }
  }

  /* ── columns ─────────────────────────────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const extras = this.extraColumns ?? [];
    return [
      { colId: 'name', field: 'name', header: 'COMMON.NAME', width: '260px', frozen: true },
      ...extras,
      { colId: 'tags', header: 'EXPLORER.COL.TAGS', width: '200px', sortable: false },
      { colId: 'updated', field: 'updatedOn', header: 'EXPLORER.COL.UPDATED', width: '176px' },
      { colId: 'favourite', header: '', width: '56px', sortable: false, align: 'center' },
      { colId: 'kebab', header: '', width: '56px', sortable: false, align: 'center' },
    ];
  }

  /* ── rail: mode toggle ───────────────────────────────────────────── */

  setRailMode(mode: RailMode): void {
    if (this.railMode === mode) return;
    this.railMode = mode;
    if (mode === 'tags' && this.tags.length === 0) this.loadTags();
  }

  /* ── rail: folders ───────────────────────────────────────────────── */

  loadFolders(): void {
    if (!this.objectType) return;
    this.foldersLoading = true;
    this.foldersService
      .listTree(this.objectType)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const rows = res.data?.folders ?? res.data ?? [];
          this.folderNodes = this.foldersService.toTreeNodes(rows);
        } else {
          this.folderNodes = [];
        }
        this.folderSelection = this.selectedFolderId
          ? this.findNode(this.folderNodes, this.selectedFolderId)
          : null;
        this.foldersLoading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.folderNodes = [];
        this.foldersLoading = false;
        this.cdr.markForCheck();
      });
  }

  selectRootFolder(): void {
    this.selectedFolderId = null;
    this.folderSelection = null;
    this.selectedTag = null;
    this.breadcrumb = '';
    this.applyBaseFilter();
  }

  onFolderNodeSelect(event: { node: TreeNode }): void {
    const node = event.node as FolderNode;
    this.selectedFolderId = node?.data?.id ?? null;
    this.folderSelection = node ?? null;
    this.selectedTag = null;
    this.breadcrumb = this.buildPath(this.folderNodes, this.selectedFolderId);
    this.applyBaseFilter();
  }

  openRailCreate(): void {
    this.showRailCreate = true;
    this.railNewFolderName = '';
  }

  cancelRailCreate(): void {
    this.showRailCreate = false;
    this.railNewFolderName = '';
  }

  saveRailFolder(): void {
    const name = this.railNewFolderName.trim();
    if (!name || this.savingRailFolder) return;
    this.savingRailFolder = true;
    this.foldersService
      .create({ name, objectType: this.objectType, parentId: this.selectedFolderId })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.showRailCreate = false;
          this.railNewFolderName = '';
          this.loadFolders();
        }
        this.savingRailFolder = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.savingRailFolder = false;
        this.cdr.markForCheck();
      });
  }

  /* ── rail: tags ──────────────────────────────────────────────────── */

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

  selectTag(tag: string): void {
    // Toggle off if the same tag is clicked again.
    if (this.selectedTag === tag) {
      this.selectedTag = null;
      this.breadcrumb = '';
    } else {
      this.selectedTag = tag;
      this.breadcrumb = tag;
    }
    // Selecting a tag clears the folder selection (mutually exclusive).
    this.selectedFolderId = null;
    this.folderSelection = null;
    this.applyBaseFilter();
  }

  /* ── base filter ─────────────────────────────────────────────────── */

  /** Re-assign a fresh baseFilter object so app-custom-table's ngOnChanges
   *  observes the change and re-queries. */
  private applyBaseFilter(): void {
    const f: ExplorerBaseFilter = {};
    if (this.selectedTag) {
      f.tags = [this.selectedTag];
    } else if (this.selectedFolderId) {
      f.folderId = this.selectedFolderId;
    }
    // No folder + no tag selected ("Root / All" node) = NO folderId filter, so
    // the list shows EVERY asset across all folders (Finder-style "All").
    // Note: on the BE, folderId:'root' means folderId IS NULL (only unfiled
    // assets) — deliberately NOT what we want for the top node, so we simply
    // omit folderId here to return everything.
    this.baseFilter = f;
    this.cdr.markForCheck();
  }

  /** The base filter as a plain record for app-custom-table's [baseFilter]. */
  get tableBaseFilter(): Record<string, unknown> {
    return this.baseFilter as Record<string, unknown>;
  }

  /* ── favourites ──────────────────────────────────────────────────── */

  isFavourite(id: string): boolean {
    return this.favouritesService.isFavourite(this.objectType, id);
  }

  toggleFavourite(row: any): void {
    const id = row?.id;
    if (!id) return;
    this.favouritesService.toggle(this.objectType, id).then((res: any) => {
      this.globalService.handleSuccessService(res, false);
      this.favourite.emit(row);
      this.cdr.markForCheck();
    });
  }

  /* ── kebab ───────────────────────────────────────────────────────── */

  openKebab(event: MouseEvent, row: any): void {
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

  /* ── move / copy overlay ─────────────────────────────────────────── */

  /** Whether the move overlay is currently in copy mode. */
  moveIsCopy = false;

  openMoveOverlay(row: any, isCopy: boolean): void {
    this.moveRow = row;
    this.moveIsCopy = isCopy;
    this.moveTargetFolderId = null;
    this.moveSelection = null;
    this.showMoveCreate = false;
    this.moveNewFolderName = '';
    this.loadMoveTree();
    // Anchor the overlay to the kebab menu target if possible; the template
    // uses a hidden anchor button we toggle programmatically. As a fallback
    // we open relative to the current active element.
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

  /** Confirm the move: shell calls moveObject then emits `moved`. */
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
          this.loadFolders();
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

  /** Confirm the copy: shell emits `copy` (parent calls the module duplicate
   *  API — the shell doesn't know module endpoints). */
  confirmCopy(): void {
    if (!this.moveRow) return;
    this.copy.emit({ row: this.moveRow, targetFolderId: this.moveTargetFolderId });
    this.moveOp?.hide();
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

  private buildPath(nodes: FolderNode[], id: string | null): string {
    if (!id) return '';
    const byId = new Map<string, FolderNode>();
    const index = (ns: FolderNode[]): void => {
      for (const n of ns) {
        byId.set(n.data.id, n);
        if (n.children) index(n.children);
      }
    };
    index(nodes);
    const parts: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 100) {
      parts.unshift(cur.label);
      const parentId = cur.data.parentId;
      cur = parentId ? byId.get(parentId) : undefined;
    }
    return parts.join(' / ');
  }

  /** Normalise a row's tags into a string[] regardless of BE shape. */
  rowTags(row: any): string[] {
    const raw = row?.tags;
    if (Array.isArray(raw)) {
      return raw.map((t: any) => (typeof t === 'string' ? t : t?.tag ?? t?.name)).filter(Boolean);
    }
    return [];
  }

  /** Icon for the current object type (leading list icon). */
  get typeIcon(): string {
    return ASSET_ICON[this.objectType] ?? 'pi pi-file';
  }

  asFolderNode(node: TreeNode): FolderNode {
    return node as FolderNode;
  }
}
