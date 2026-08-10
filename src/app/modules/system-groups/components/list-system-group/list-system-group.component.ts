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
import { lastValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { SYSTEM_ROLE } from 'src/app/core/constants/api.constant';
import { SYSTEM_GROUP } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { SystemGroupService } from '../../services/system-group.service';

/**
 * System-group listing — renders through the shared `<app-custom-table>`
 * (the app's unified list table) driven by a `UsServerListAdapter` on the
 * BE `/system-groups` list call. Infinite scroll (no page controls), a
 * single global search plus on-demand per-column filters (shared inputs),
 * and per-row actions. No bulk selection.
 *
 * Carries an extra Role filter (server-mode dropdown over SYSTEM roles)
 * projected into the table's toolbar-left slot. Selecting a role rebuilds
 * the adapter so the closure captures the latest `roleId`.
 */
@Component({
  selector: 'app-list-system-group',
  templateUrl: './list-system-group.component.html',
  styleUrls: ['./list-system-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSystemGroupComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  showDeleteConfirm = false;
  groupToDelete: string | null = null;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Role filter — server-mode dropdown outside the grid (card toolbar).
  roles: any[] = [];
  selectedRole: string | null = null;
  preloadedRoles: any[] | null = null;
  preloadedRolesTotal: number | null = null;

  // Per-row spinner helpers — the BE delete promise sets a per-id
  // flag on the service so each row can spin independently.
  isDeleting = (id: string): boolean => this.groupService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE groups list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'system-groups-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound on ngOnInit (no datasource gate)
   *  and rebuilt whenever the Role filter changes so the closure
   *  picks up the new value. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private groupService: SystemGroupService,
    private http: HttpClientService,
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
        'GROUP.SEARCH_PLACEHOLDER',
      ),
    };
    this.loadRoles();
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away. The adapter
    // itself cancels via the rxjs subscription teardown but the
    // service still has its own cancel pipe.
    this.groupService.cancelReads();
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
        header: t('COMMON.DESCRIPTION'),
        width: '320px',
        filter: 'text',
        sortable: false,
      },
      {
        colId: 'roles',
        field: 'roles',
        header: t('COMMON.ROLE'),
        width: '192px',
        sortable: false,
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

  /**
   * Join a group's roles array into a comma-separated display string.
   * Group ↔ Role is many-to-many, so the row carries `roles: {id,name}[]`.
   */
  roleNames(group: any): string {
    const roles = group?.roles ?? [];
    const names = roles
      .map((r: any) => r?.name)
      .filter((n: any) => !!n);
    return names.length ? names.join(', ') : '';
  }

  /* ── role filter dropdown ────────────────────────────── */

  /**
   * Fetch SYSTEM roles from the master-DB /system-roles endpoint
   * (SYSTEM_ROLE.LIST). No SystemRoleService yet, so this calls
   * HttpClientService directly, mirroring RoleService.listRoles' shape.
   */
  private listSystemRoles(params: {
    page?: number;
    limit?: number;
    filter?: any;
  }): Promise<any> {
    const queryParams: any = {};
    if (params.page) queryParams.page = params.page;
    if (params.limit) queryParams.limit = params.limit;
    if (params.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return lastValueFrom(
      this.http.apiGet(SYSTEM_ROLE.LIST, {
        params: queryParams,
        skipLoader: true,
      }),
    );
  }

  /**
   * Fetcher for the server-mode Role filter dropdown.
   */
  loadRolesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = { name: search };
    try {
      const res: any = await this.listSystemRoles(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return { items: res?.data?.roles ?? [], total: res?.data?.count ?? 0 };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  /** Preload page 1 of roles so the dropdown can render without a fresh fetch
   *  on first open. */
  loadRoles() {
    this.listSystemRoles({ page: DEFAULT_PAGE, limit: 10 }).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        const roles = response?.data?.roles ?? [];
        this.roles = roles;
        this.preloadedRoles = roles;
        this.preloadedRolesTotal = response?.data?.count ?? roles.length;
      }
      this.cdr.markForCheck();
    });
  }

  onRoleChange(roleId: string | null) {
    this.selectedRole = roleId;
    // The adapter closes over selectedRole — rebuild so the next
    // load picks up the new value.
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    const roleId = this.selectedRole;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.groupService.listGroups({
          page: params.page,
          limit: params.limit,
          ...(roleId ? { roleId } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { groups: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.groups ?? [],
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

  onAddNewCategory() {
    this.router.navigate([SYSTEM_GROUP.ADD]);
  }

  onEdit(id: string) {
    this.router.navigate([SYSTEM_GROUP.edit(id)]);
  }

  confirmDelete(id: string) {
    this.groupToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.groupToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.groupToDelete) {
      this.groupService
        .delete(this.groupToDelete, reason)
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
    this.groupToDelete = null;
    this.deleteJustification = '';
  }
}
