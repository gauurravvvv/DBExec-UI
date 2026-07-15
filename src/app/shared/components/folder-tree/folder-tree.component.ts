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
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TreeModule } from 'primeng/tree';
import { TooltipModule } from 'primeng/tooltip';
import { TreeNode } from 'primeng/api';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  FolderNode,
  FoldersService,
} from 'src/app/shared/services/folders.service';
import type { FolderObjectType } from 'src/app/shared/validators/folders';

/**
 * Reusable left-rail folder tree (Track F). One instance per object list
 * (dataset / analysis / dashboard / alert); the caller passes the `objectType`
 * and the component owns the whole tree lifecycle:
 *
 *   • loads the tree for that objectType (PrimeNG `p-tree`)
 *   • a synthetic "All" root that clears the folder filter
 *   • select a folder → emits `(folderSelected)` with its id (null = All)
 *   • create / rename / delete a folder (inline, house-styled)
 *   • move an object into a folder — either by DROP (the list rows are drag
 *     sources) or via the parent calling {@link openMoveMenuFor} / listening to
 *     `(objectMoved)` after a menu action.
 *
 * Standalone (like `app-custom-table`) so each feature module imports it
 * directly. Emits, never navigates — the host list owns filtering + refresh.
 */
@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, TreeModule, TooltipModule],
  templateUrl: './folder-tree.component.html',
  styleUrls: ['./folder-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTreeComponent implements OnInit, OnChanges {
  private cdr = inject(ChangeDetectorRef);
  private foldersService = inject(FoldersService);
  private globalService = inject(GlobalService);
  private translate = inject(TranslateService);

  /** Which object family's tree to load. Required. */
  @Input() objectType!: FolderObjectType;

  /** Currently active folder id (null = All). Two-way friendly. */
  @Input() selectedFolderId: string | null = null;

  /** Whether the caller has write permission (shows folder CUD affordances). */
  @Input() canManage = true;

  /** Emits the selected folder id (null when "All" is chosen). */
  @Output() folderSelected = new EventEmitter<string | null>();

  /** Emits after an object is dropped / moved into a folder, so the host can
   *  reload its list. Payload: the moved object id + its new folder id. */
  @Output() objectMoved = new EventEmitter<{
    objectId: string;
    folderId: string | null;
  }>();

  nodes: FolderNode[] = [];
  selection: TreeNode | null = null;
  loading = false;

  /* ── inline create / rename ─────────────────────────────────────── */
  showFolderDialog = false;
  dialogMode: 'create' | 'rename' = 'create';
  dialogName = '';
  dialogParentId: string | null = null;
  editingFolderId: string | null = null;
  savingFolder = false;

  /* ── delete confirm ─────────────────────────────────────────────── */
  showDeleteConfirm = false;
  folderToDelete: FolderNode | null = null;
  deletingFolder = false;

  ngOnInit(): void {
    this.loadTree();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A parent-driven objectType switch reloads the whole tree.
    if (changes['objectType'] && !changes['objectType'].firstChange) {
      this.loadTree();
    }
  }

  /* ── load ────────────────────────────────────────────────────────── */

  loadTree(): void {
    if (!this.objectType) return;
    this.loading = true;
    this.foldersService
      .listTree(this.objectType)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const rows = res.data?.folders ?? res.data ?? [];
          this.nodes = this.foldersService.toTreeNodes(rows);
        } else {
          this.nodes = [];
        }
        // Restore selection highlight if the active folder still exists.
        this.selection = this.selectedFolderId
          ? this.findNode(this.nodes, this.selectedFolderId)
          : null;
        this.loading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.nodes = [];
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

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

  /* ── selection ──────────────────────────────────────────────────── */

  selectAll(): void {
    this.selection = null;
    this.selectedFolderId = null;
    this.folderSelected.emit(null);
  }

  onNodeSelect(event: { node: TreeNode }): void {
    const id = (event.node as FolderNode)?.data?.id ?? null;
    this.selectedFolderId = id;
    this.folderSelected.emit(id);
  }

  /* ── create / rename ────────────────────────────────────────────── */

  openCreate(parent?: FolderNode): void {
    this.dialogMode = 'create';
    this.dialogName = '';
    this.dialogParentId = parent?.data?.id ?? null;
    this.editingFolderId = null;
    this.showFolderDialog = true;
  }

  openRename(node: FolderNode): void {
    this.dialogMode = 'rename';
    this.dialogName = node.label;
    this.editingFolderId = node.data.id;
    this.dialogParentId = node.data.parentId;
    this.showFolderDialog = true;
  }

  closeFolderDialog(): void {
    this.showFolderDialog = false;
    this.dialogName = '';
    this.editingFolderId = null;
    this.dialogParentId = null;
  }

  saveFolder(): void {
    const name = this.dialogName.trim();
    if (!name || this.savingFolder) return;
    this.savingFolder = true;

    const done = (res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.closeFolderDialog();
        this.loadTree();
      }
      this.savingFolder = false;
      this.cdr.markForCheck();
    };
    const fail = () => {
      this.savingFolder = false;
      this.cdr.markForCheck();
    };

    if (this.dialogMode === 'create') {
      this.foldersService
        .create({
          name,
          objectType: this.objectType,
          parentId: this.dialogParentId,
        })
        .then(done)
        .catch(fail);
    } else if (this.editingFolderId) {
      this.foldersService
        .rename(this.editingFolderId, name)
        .then(done)
        .catch(fail);
    }
  }

  /* ── delete ─────────────────────────────────────────────────────── */

  confirmDelete(node: FolderNode): void {
    this.folderToDelete = node;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.folderToDelete = null;
  }

  proceedDelete(): void {
    if (!this.folderToDelete || this.deletingFolder) return;
    const id = this.folderToDelete.data.id;
    this.deletingFolder = true;
    this.foldersService
      .delete(id)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          // If the active folder was just deleted, fall back to "All".
          if (this.selectedFolderId === id) this.selectAll();
          this.loadTree();
        }
      })
      .catch(() => {
        /* interceptor toasts */
      })
      .finally(() => {
        this.deletingFolder = false;
        this.cancelDelete();
        this.cdr.markForCheck();
      });
  }

  /* ── object drop (move into folder) ─────────────────────────────── */

  /**
   * Wired to each folder row's native drop. The list rows set
   * `dataTransfer` with the dragged object id; dropping on a folder moves it.
   */
  onFolderDrop(event: DragEvent, node: FolderNode | null): void {
    event.preventDefault();
    const objectId = event.dataTransfer?.getData('text/plain');
    if (!objectId) return;
    const folderId = node?.data?.id ?? null;
    this.moveObject(objectId, folderId);
  }

  onDragOver(event: DragEvent): void {
    // Allow drop.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  /**
   * Move an object into a folder (public so a host "move to folder" menu can
   * call it too). Emits `(objectMoved)` on success.
   */
  moveObject(objectId: string, folderId: string | null): void {
    this.foldersService
      .moveObject(this.objectType, objectId, folderId)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          this.objectMoved.emit({ objectId, folderId });
          this.loadTree();
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /* ── template helpers ───────────────────────────────────────────── */

  asFolderNode(node: TreeNode): FolderNode {
    return node as FolderNode;
  }
}
