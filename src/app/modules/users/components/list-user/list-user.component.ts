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
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { USER } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { UserService } from '../../services/user.service';

/**
 * User listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/users`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * Users is org-wide (no datasource gate) but carries an extra Group filter
 * (server-mode dropdown) projected into the table's toolbar-left slot, so it
 * sits inline with the search + action icons. Selecting a group rebuilds the
 * adapter so the closure captures the latest `groupId`.
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

  showDeleteConfirm = false;
  userToDelete: string | null = null;
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

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE users list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'users-list',
    height: 'flex',
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'USER.SEARCH_PLACEHOLDER',
      ),
    };
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

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'username',
        field: 'username',
        header: t('COMMON.USERNAME'),
        width: '192px',
        frozen: true,
        filter: 'text',
      },
      {
        colId: 'firstName',
        field: 'firstName',
        header: t('COMMON.FIRST_NAME'),
        width: '160px',
        filter: 'text',
      },
      {
        colId: 'lastName',
        field: 'lastName',
        header: t('COMMON.LAST_NAME'),
        width: '160px',
        filter: 'text',
      },
      {
        colId: 'email',
        field: 'email',
        header: t('COMMON.EMAIL'),
        width: '288px',
        filter: 'text',
      },
      {
        colId: 'groups',
        field: 'groupNames',
        header: t('USER.GROUPS'),
        width: '192px',
        sortable: false,
      },
      {
        colId: 'status',
        field: 'status',
        header: t('COMMON.STATUS'),
        width: '144px',
        sortable: false,
      },
      {
        colId: 'lastLogin',
        field: 'lastLogin',
        header: t('COMMON.LAST_LOGIN'),
        width: '192px',
        sortable: false,
      },
      {
        colId: 'createdOn',
        field: 'createdOn',
        header: t('COMMON.CREATED_ON'),
        width: '192px',
        sortable: false,
      },
      {
        colId: 'actions',
        header: t('COMMON.ACTIONS'),
        width: '144px',
        sortable: false,
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
      // custom-table sends PLAIN filter values (global `search` + per-column
      // username/firstName/lastName/email), so the adapter's identity mapping
      // passes them straight through — no AG-Grid cell unwrapping needed.
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + per-row delete ────────────────────────────── */

  onAddNewAdmin() {
    this.router.navigate([USER.ADD]);
  }

  onOpenBulkAdd() {
    this.router.navigate([USER.BULK_ADD]);
  }

  onOpenActivity() {
    this.router.navigate([USER.ACTIVITY]);
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
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.userToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.userToDelete) {
      this.userService
        .delete(this.userToDelete, reason)
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
    this.userToDelete = null;
    this.deleteJustification = '';
  }
}
