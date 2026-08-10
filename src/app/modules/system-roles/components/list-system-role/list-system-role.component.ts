import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { SYSTEM_ROLE } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { SystemRoleService } from '../../services/system-role.service';

/**
 * System-role listing — renders through the shared `<app-custom-table>`
 * (the app's unified list table) driven by a `UsServerListAdapter` on the
 * BE `/system-roles` list call. Infinite scroll (no page controls), a
 * single global search plus on-demand per-column filters (shared inputs),
 * and per-row actions. No bulk selection.
 *
 * System roles are platform-wide (no datasource gate) and there is no
 * secondary filter dropdown, so the adapter binds on `ngOnInit` and no
 * toolbar-left slot is projected.
 */
@Component({
  selector: 'app-list-system-role',
  templateUrl: './list-system-role.component.html',
  styleUrls: ['./list-system-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSystemRoleComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  showDeleteConfirm = false;
  roleToDelete: string | null = null;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Per-row spinner helper — template asks for the id and the service
  // tells us whether THAT row's delete is in flight. Other rows stay
  // clickable.
  isDeleting = (id: string): boolean => this.roleService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE system-roles list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'system-roles-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on ngOnInit (no datasource gate). */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private roleService: SystemRoleService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ROLE.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.roleService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'name',
        field: 'name',
        header: t('COMMON.NAME'),
        width: '224px',
        frozen: true,
        filter: 'text',
      },
      {
        colId: 'description',
        field: 'description',
        header: t('ROLE.DESCRIPTION'),
        width: '320px',
        sortable: false,
        filter: 'text',
      },
      {
        colId: 'status',
        field: 'status',
        header: t('COMMON.STATUS'),
        width: '144px',
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        header: t('COMMON.CREATED_ON'),
        width: '192px',
      },
      {
        colId: 'actions',
        header: t('COMMON.ACTIONS'),
        width: '144px',
        sortable: false,
      },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  /**
   * Construct the server-side adapter. Called once from ngOnInit —
   * there's no datasource to gate on.
   */
  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.roleService.listRoles({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        } as any),
      // Custom unwrap — the BE returns `{ roles: [], count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.roles ?? [],
        total: res?.data?.count ?? 0,
      }),
      // custom-table sends PLAIN filter values (global `search` + per-column
      // name/description/status), so the adapter's identity mapping passes
      // them straight through — no AG-Grid cell unwrapping needed.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row delete ────────────────────────────── */

  onAddNewRole() {
    this.router.navigate([SYSTEM_ROLE.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SYSTEM_ROLE.edit(id)]);
  }

  confirmDelete(id: string) {
    this.roleToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.roleToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.roleToDelete) {
      this.roleService
        .delete(this.roleToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.refreshList();
          }
        })
        .catch(() => {
          /* global interceptor shows error toast */
        })
        .finally(() => {
          this.closeDeletePopup();
          this.cdr.markForCheck();
        });
    }
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.roleToDelete = null;
    this.deleteJustification = '';
  }
}
