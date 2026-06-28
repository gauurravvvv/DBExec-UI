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
import type { ColDef } from 'ag-grid-community';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { USER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { UserService } from '../../services/user.service';

/**
 * User listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/users` list call. The page
 * header / content card / delete-confirm popup retain the existing
 * styling and behaviour; only the `<p-table>` was swapped out for
 * the AG Grid wrapper.
 *
 * Users is org-wide (no datasource gate) but carries an extra
 * Group filter (server-mode dropdown) in the card toolbar — same
 * shape as the role-filter in the groups module, just inverted.
 * Selecting a group rebuilds the adapter so the closure captures
 * the latest `groupId`.
 */
@Component({
  selector: 'app-list-user',
  templateUrl: './list-user.component.html',
  styleUrls: ['./list-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListUserComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  selectedUsers: any[] = [];
  showDeleteConfirm = false;
  userToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Group filter — server-mode dropdown outside the grid (card toolbar).
  groups: any[] = [];
  selectedGroup: string | null = null;
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;

  // Logged-in user id — used for the YOU badge + defensive selection
  // filter so the current user can't bulk-delete themselves.
  loggedInUserId: any = this.globalService.getTokenDetails('userId');

  // Per-row spinner helpers — each row's delete/unlock button reads
  // its own state, so other rows stay clickable.
  isDeleting = (id: string): boolean => this.userService.isDeleting(id);
  isUnlocking = (id: string): boolean => this.userService.isUnlocking(id);
  get isBulkDeleting(): boolean {
    return this.selectedUsers.some(u => this.userService.isDeleting(u.id));
  }

  /* ── grid wiring ───────────────────────────────────────── */

  /** AG Grid column definitions — widths preserved from the old
   *  `<p-table>` so the visual layout is unchanged. cellRenderer
   *  templates live in the HTML as `<ng-template usGridCell>`. */
  cols: ColDef[] = [];

  gridConfig: UsDataGridConfig = {
    enableRowSelection: true,
    rowSelectionMode: 'multiple',
    freezeFirstColumn: true,
    enableColumnChooser: true,
    enableAddFilter: false, // we use the BE-driven floating filters
    enableAutoFit: true,
    enableDensityToggle: true,
    enableCsvExport: true,
    enableXlsxExport: true,
    enableRefresh: true,
    enableSavedViews: true,
    gridKey: 'users-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on ngOnInit (no datasource gate)
   *  and rebuilt whenever the Group filter changes so the closure
   *  picks up the new value. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private userService: UserService,
    private groupService: GroupService,
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
    this.loadGroupOptions();
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away. The adapter
    // itself cancels via the rxjs subscription teardown but the
    // service still has its own cancel pipe.
    this.userService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedUsers?.length || 0;
  }

  get isFilterActive(): boolean {
    return (
      (!!this.adapter && Object.keys(this.adapter.filterModel()).length > 0) ||
      !!this.selectedGroup
    );
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'username',
        field: 'username',
        headerName: this.translate.instant('COMMON.USERNAME'),
        width: 192,
        minWidth: 192,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'firstName',
        field: 'firstName',
        headerName: this.translate.instant('COMMON.FIRST_NAME'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'lastName',
        field: 'lastName',
        headerName: this.translate.instant('COMMON.LAST_NAME'),
        width: 160,
        minWidth: 160,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'email',
        field: 'email',
        headerName: this.translate.instant('COMMON.EMAIL'),
        minWidth: 288,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'groups',
        field: 'groupNames',
        headerName: this.translate.instant('USER.GROUPS'),
        width: 192,
        minWidth: 192,
        sortable: false,
        filter: false,
      },
      {
        colId: 'status',
        field: 'status',
        headerName: this.translate.instant('COMMON.STATUS'),
        width: 144,
        minWidth: 144,
        filter: 'agNumberColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'lastLogin',
        field: 'lastLogin',
        headerName: this.translate.instant('COMMON.LAST_LOGIN'),
        width: 192,
        minWidth: 192,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        headerName: this.translate.instant('COMMON.CREATED_ON'),
        width: 192,
        minWidth: 192,
        filter: 'agDateColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
      },
      {
        colId: 'actions',
        headerName: this.translate.instant('COMMON.ACTIONS'),
        width: 144,
        minWidth: 144,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
      },
    ];
  }

  /* ── group filter dropdown ───────────────────────────── */

  /**
   * Fetcher for the server-mode Group filter dropdown.
   */
  loadGroupsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.groupService.listGroups(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.groups ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /**
   * Preload page 1 of groups so the dropdown can render without a
   * fresh fetch on first open. The legacy `groups[]` array also stays
   * populated for any other code paths that may consume it.
   */
  loadGroupOptions() {
    this.groupService
      .listGroups({ page: DEFAULT_PAGE, limit: 10 })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const groups = response?.data?.groups ?? [];
          this.groups = groups.filter((g: any) => g.status === 1);
          this.preloadedGroups = groups;
          this.preloadedGroupsTotal = response?.data?.count ?? groups.length;
        }
        this.cdr.markForCheck();
      });
  }

  onGroupChange(groupId: string | null) {
    this.selectedGroup = groupId;
    this.selectedUsers = [];
    // The adapter closes over selectedGroup — rebuild so the next
    // load picks up the new value.
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    const groupId = this.selectedGroup;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.userService.listUser({
          page: params.page,
          limit: params.limit,
          ...(groupId ? { groupId } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { users: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.users ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. The grid's
      // floating filters emit AG-Grid-shaped cells; this map
      // flattens them into the BE-expected shape — text contains
      // for username/firstName/lastName/email, plain value for
      // status, and date ranges for lastLogin / createdOn.
      filterBuilders: {
        username: cell => ({ username: (cell as any)?.filter ?? cell }),
        firstName: cell => ({ firstName: (cell as any)?.filter ?? cell }),
        lastName: cell => ({ lastName: (cell as any)?.filter ?? cell }),
        email: cell => ({ email: (cell as any)?.filter ?? cell }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { status: v };
        },
        lastLogin: cell => {
          // AG Grid date filter shapes: {dateFrom, dateTo, type, filterType}.
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom)
            out['lastLoginDateFrom'] = new Date(c.dateFrom).toISOString();
          if (c?.dateTo) {
            const to = new Date(c.dateTo);
            to.setHours(23, 59, 59, 999);
            out['lastLoginDateTo'] = to.toISOString();
          }
          return out;
        },
        createdOn: cell => {
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom)
            out['createdDateFrom'] = new Date(c.dateFrom).toISOString();
          if (c?.dateTo) {
            const to = new Date(c.dateTo);
            to.setHours(23, 59, 59, 999);
            out['createdDateTo'] = to.toISOString();
          }
          return out;
        },
      },
      initial: { page: 1, limit: 10 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  onSelectionChange(rows: any[]) {
    // Defensive — even though isRowSelectable blocks default users
    // and self in the grid, ignore them here in case anything slips
    // through. Same posture as roles / groups.
    this.selectedUsers = (rows ?? []).filter(
      r =>
        r?.isDefault !== 1 &&
        r?.canDelete !== false &&
        r?.id !== this.loggedInUserId,
    );
    this.cdr.markForCheck();
  }

  isRowSelectable = (event: any) => !!event?.data?.canDelete;

  clearFilters() {
    if (this.adapter) {
      this.adapter.setFilter({});
      this.adapter.setSort([]);
    }
    this.selectedGroup = null;
    this.selectedUsers = [];
    this.bindAdapter();
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + bulk-delete ───────────────────────────────── */

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onOpenBulkAdd() {
    this.router.navigate([USER.BULK_ADD]);
  }

  onUnlock(id: string) {
    this.userService.unlock(id).then((res: any) => {
      if (this.globalService.handleSuccessService(res)) {
        this.refreshList();
      }
    });
  }

  onEdit(id: string) {
    this.router.navigate([USER.edit(id)]);
  }

  confirmDelete(id: string) {
    this.userToDelete = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.userToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedUsers.map(u => u.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.userService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedUsers = [];
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
      return;
    }

    if (this.userToDelete) {
      this.userService
        .delete(this.userToDelete, reason)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.selectedUsers = this.selectedUsers.filter(
              u => u.id !== this.userToDelete,
            );
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
    this.userToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
