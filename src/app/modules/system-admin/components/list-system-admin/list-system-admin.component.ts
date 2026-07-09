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
import { SYSTEM_ADMIN } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { SystemAdminService } from '../../services/system-admin.service';

/**
 * System Admin listing — renders through the shared `<app-custom-table>` (the
 * app's unified list table) driven by a `UsServerListAdapter` on the BE
 * `/system-admins` list call. Infinite scroll (no page controls), a single
 * global search plus on-demand per-column filters (shared inputs), and
 * per-row actions. No bulk selection.
 *
 * System admins are org-wide (master-DB scoped) so there's no datasource gate
 * and no secondary filter dropdown — the adapter binds on `ngOnInit`.
 */
@Component({
  selector: 'app-list-system-admin',
  templateUrl: './list-system-admin.component.html',
  styleUrls: ['./list-system-admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSystemAdminComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  loggedInUserId: any;
  showDeleteConfirm = false;
  adminIdToDelete: string | null = null;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Per-row spinner helpers — template asks for the id and the service
  // tells us whether THAT row's delete / unlock is in flight. Other
  // rows stay clickable.
  isDeleting = (id: string): boolean => this.systemAdminService.isDeleting(id);
  isUnlocking = (id: string): boolean =>
    this.systemAdminService.isUnlocking(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE system-admins list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'system-admins-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound synchronously in ngOnInit because
   *  there's no datasource gate for this list. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private systemAdminService: SystemAdminService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.loggedInUserId = this.globalService.getTokenDetails('userId');
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'SYSTEM_ADMIN.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.systemAdminService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'username', field: 'username', header: t('COMMON.USERNAME'), width: '192px', frozen: true, filter: 'text' },
      { colId: 'firstName', field: 'firstName', header: t('COMMON.FIRST_NAME'), width: '160px', filter: 'text' },
      { colId: 'lastName', field: 'lastName', header: t('COMMON.LAST_NAME'), width: '160px', filter: 'text' },
      { colId: 'email', field: 'email', header: t('COMMON.EMAIL'), width: '288px', filter: 'text' },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
      { colId: 'lastLogin', field: 'lastLogin', header: t('COMMON.LAST_LOGIN'), width: '192px' },
      { colId: 'createdOn', field: 'createdOn', header: t('COMMON.CREATED_ON'), width: '192px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
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
        this.systemAdminService.listSystemAdmins({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ systemAdmins: [], count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.systemAdmins ?? [],
        total: res?.data?.count ?? 0,
      }),
      // custom-table sends PLAIN filter values (global `search` + per-column
      // username/firstName/lastName/email/status), so the adapter's identity
      // mapping passes them straight through — no AG-Grid cell unwrapping.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row actions ───────────────────────────── */

  onAddNewAdmin() {
    this.router.navigate([SYSTEM_ADMIN.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SYSTEM_ADMIN.edit(id)]);
  }

  onUnlock(id: string) {
    this.systemAdminService.unlock(id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.refreshList();
      }
      this.cdr.markForCheck();
    });
  }

  confirmDelete(id: string) {
    this.adminIdToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.adminIdToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.adminIdToDelete) {
      const id = this.adminIdToDelete;
      this.systemAdminService
        .delete(id, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
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
    this.adminIdToDelete = null;
    this.deleteJustification = '';
  }
}
