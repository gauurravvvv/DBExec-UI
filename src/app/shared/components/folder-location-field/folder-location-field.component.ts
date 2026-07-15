import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  inject,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { OverlayPanel, OverlayPanelModule } from 'primeng/overlaypanel';
import { TooltipModule } from 'primeng/tooltip';
import { TreeModule } from 'primeng/tree';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  FolderNode,
  FoldersService,
} from 'src/app/shared/services/folders.service';
import { ExplorerObjectType } from 'src/app/shared/helpers/asset-icon.helper';

/**
 * `app-folder-location-field` — a ControlValueAccessor form field for picking
 * the folder an object lives in (Track F). Used on add/edit screens: bind it
 * like any control (`[(ngModel)]="folderId"` or `formControlName="folderId"`)
 * and it reads/writes a `folderId: string | null` (null = the Root / no
 * folder).
 *
 * Visually it matches the app's dropdown field chrome (a read-only labelled
 * trigger showing the resolved folder PATH, e.g. "Sales / Q3"). Clicking opens
 * an overlay hosting a click-based `p-tree` (drag OFF) plus a "＋ New folder"
 * inline row that creates a folder under the current selection and re-selects
 * it. Selecting a node (or the Root option) sets the value, updates the label,
 * closes the overlay, and fires onChange/onTouched.
 *
 * Standalone (like `app-folder-tree` / `app-custom-dropdown`).
 */
@Component({
  selector: 'app-folder-location-field',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    TreeModule,
    OverlayPanelModule,
    ButtonModule,
    TooltipModule,
  ],
  templateUrl: './folder-location-field.component.html',
  styleUrls: ['./folder-location-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FolderLocationFieldComponent),
      multi: true,
    },
  ],
})
export class FolderLocationFieldComponent
  implements ControlValueAccessor, OnInit, OnChanges
{
  private cdr = inject(ChangeDetectorRef);
  private foldersService = inject(FoldersService);
  private globalService = inject(GlobalService);

  /** Which object family's folder tree to load. Required. */
  @Input() objectType!: ExplorerObjectType;

  /** Optional field label (already resolved OR an i18n key rendered by the
   *  caller); defaults to the EXPLORER.LOCATION key. */
  @Input() label = 'EXPLORER.LOCATION';

  /** Disable the field (CVA setDisabledState also flips this). */
  @Input() set disabled(value: boolean) {
    this._disabled = !!value;
  }
  get disabled(): boolean {
    return this._disabled;
  }
  private _disabled = false;

  @ViewChild('op') op?: OverlayPanel;

  /** The bound value — a folder id, or null for Root. */
  folderId: string | null = null;

  nodes: FolderNode[] = [];
  selection: TreeNode | null = null;
  loading = false;

  /** Resolved path label for the trigger (e.g. "Sales / Q3"). */
  pathLabel = '';

  /* ── inline create ─────────────────────────────────────────────── */
  showCreateRow = false;
  newFolderName = '';
  savingFolder = false;

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.loadTree();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['objectType'] && !changes['objectType'].firstChange) {
      this.loadTree();
    }
  }

  /* ── ControlValueAccessor ──────────────────────────────────────── */

  writeValue(value: string | null): void {
    this.folderId = value ?? null;
    this.syncSelectionAndLabel();
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this._disabled = isDisabled;
  }

  /* ── load ──────────────────────────────────────────────────────── */

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
        this.syncSelectionAndLabel();
        this.loading = false;
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.nodes = [];
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  /* ── trigger ───────────────────────────────────────────────────── */

  toggle(event: MouseEvent): void {
    if (this._disabled) return;
    this.op?.toggle(event);
  }

  /* ── selection ─────────────────────────────────────────────────── */

  /** Choose the Root (no folder). */
  selectRoot(): void {
    this.folderId = null;
    this.selection = null;
    this.pathLabel = '';
    this.commit();
    this.op?.hide();
  }

  onNodeSelect(event: { node: TreeNode }): void {
    const node = event.node as FolderNode;
    this.folderId = node?.data?.id ?? null;
    this.selection = node ?? null;
    this.pathLabel = this.buildPath(this.folderId);
    this.commit();
    this.op?.hide();
  }

  private commit(): void {
    this.onChange(this.folderId);
    this.onTouched();
  }

  /* ── inline create folder ──────────────────────────────────────── */

  openCreateRow(): void {
    this.showCreateRow = true;
    this.newFolderName = '';
  }

  cancelCreateRow(): void {
    this.showCreateRow = false;
    this.newFolderName = '';
  }

  saveNewFolder(): void {
    const name = this.newFolderName.trim();
    if (!name || this.savingFolder) return;
    this.savingFolder = true;
    // New folder is created UNDER the currently-selected folder (or root when
    // none is selected).
    this.foldersService
      .create({
        name,
        objectType: this.objectType,
        parentId: this.folderId,
      })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) {
          const newId: string | null = res?.data?.id ?? res?.data?.folder?.id ?? null;
          this.showCreateRow = false;
          this.newFolderName = '';
          // Reload the tree, then select the newly created folder if we can id it.
          this.foldersService
            .listTree(this.objectType)
            .then((treeRes: any) => {
              if (this.globalService.handleSuccessService(treeRes, false)) {
                const rows = treeRes.data?.folders ?? treeRes.data ?? [];
                this.nodes = this.foldersService.toTreeNodes(rows);
              }
              if (newId) {
                this.folderId = newId;
                this.selection = this.findNode(this.nodes, newId);
                this.pathLabel = this.buildPath(newId);
                this.commit();
              }
              this.savingFolder = false;
              this.cdr.markForCheck();
            })
            .catch(() => {
              this.savingFolder = false;
              this.cdr.markForCheck();
            });
        } else {
          this.savingFolder = false;
          this.cdr.markForCheck();
        }
      })
      .catch(() => {
        this.savingFolder = false;
        this.cdr.markForCheck();
      });
  }

  /* ── helpers ───────────────────────────────────────────────────── */

  /** Keep the tree highlight + trigger path label in sync with folderId. */
  private syncSelectionAndLabel(): void {
    this.selection = this.folderId
      ? this.findNode(this.nodes, this.folderId)
      : null;
    this.pathLabel = this.buildPath(this.folderId);
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

  /** Build a " / "-joined path from root → node by walking parentId. */
  private buildPath(id: string | null): string {
    if (!id) return '';
    const byId = new Map<string, FolderNode>();
    const index = (nodes: FolderNode[]): void => {
      for (const n of nodes) {
        byId.set(n.data.id, n);
        if (n.children) index(n.children);
      }
    };
    index(this.nodes);
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

  asFolderNode(node: TreeNode): FolderNode {
    return node as FolderNode;
  }
}
