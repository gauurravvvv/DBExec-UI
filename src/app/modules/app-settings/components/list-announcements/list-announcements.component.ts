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
import { ANNOUNCEMENT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { AnnouncementService } from '../../services/announcement.service';

/**
 * Announcements listing — renders through `<us-data-grid>` with a
 * `UsServerListAdapter` driving the BE `/announcements` list call.
 * No datasource gate; the adapter binds in `ngOnInit`. The Group
 * filter (a server-mode dropdown) lives in the card toolbar above
 * the grid and feeds an additional `targetGroupId` param into the
 * load fn — rebuilding the adapter on group change keeps the closure
 * in sync, mirroring the role filter in the group listing.
 */
@Component({
  selector: 'app-list-announcements',
  templateUrl: './list-announcements.component.html',
  styleUrls: ['./list-announcements.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAnnouncementsComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state ──────────────────────────────────────── */

  selectedAnnouncements: any[] = [];
  showDeleteConfirm = false;
  toDeleteId: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  // Group filter — server-mode dropdown outside the grid. Mirrors the
  // role filter on groups/list; lives in the card toolbar because the
  // BE expects `targetGroupId` as a top-level param, not inside the
  // `filter` JSON.
  groups: any[] = [];
  selectedGroup: string | null = null;
  preloadedGroups: any[] | null = null;
  preloadedGroupsTotal: number | null = null;

  /* ── grid wiring ───────────────────────────────────────── */

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
    gridKey: 'announcements-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    // No datasource dropdown = full available height.
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in `ngOnInit` (no datasource gate). */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private announcementService: AnnouncementService,
    private groupService: GroupService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.statusOptions = [
      { label: this.translate.instant('COMMON.ACTIVE'), value: 1 },
      { label: this.translate.instant('COMMON.INACTIVE'), value: 0 },
    ];

    this.cols = this.buildColumns();
    this.loadGroups();
    this.bindAdapter();
  }

  ngOnDestroy(): void {
    // Abort in-flight reads if the user navigates away. The adapter
    // itself cancels via the rxjs subscription teardown but the
    // service still has its own cancel pipe.
    this.announcementService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedAnnouncements?.length || 0;
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
        colId: 'name',
        field: 'name',
        headerName: this.translate.instant('ANNOUNCEMENT.ANNOUNCEMENT_TITLE'),
        width: 224,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'description',
        field: 'description',
        headerName: this.translate.instant('COMMON.DESCRIPTION'),
        minWidth: 320,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
      },
      {
        colId: 'targetGroup',
        field: 'targetGroup.name',
        headerName: this.translate.instant('ANNOUNCEMENT.GROUP'),
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
        colId: 'activeWindow',
        headerName: this.translate.instant('ANNOUNCEMENT.ACTIVE_WINDOW'),
        width: 224,
        minWidth: 224,
        sortable: false,
        filter: false,
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
        width: 128,
        minWidth: 128,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
      },
    ];
  }

  /* ── group filter dropdown ───────────────────────────── */

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

  loadGroups(): void {
    this.groupService
      .listGroups({ page: DEFAULT_PAGE, limit: 10 })
      .then(res => {
        if (this.globalService.handleSuccessService(res, false)) {
          const groups = res?.data?.groups ?? [];
          this.groups = groups;
          this.preloadedGroups = groups;
          this.preloadedGroupsTotal = res?.data?.count ?? groups.length;
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  onGroupChange(groupId: string | null): void {
    this.selectedGroup = groupId;
    this.selectedAnnouncements = [];
    // The adapter closes over selectedGroup — rebuild so the next
    // load picks up the new value.
    this.bindAdapter();
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter(): void {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    const targetGroupId = this.selectedGroup;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.announcementService.listAnnouncements({
          page: params.page,
          limit: params.limit,
          ...(targetGroupId ? { targetGroupId } : {}),
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { announcements: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.announcements ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. Flattens the
      // AG-Grid-shaped cells into the
      // `{name, description, status, createdDateFrom, createdDateTo}`
      // shape the BE expects. Announcements use `name`/`description`
      // entity fields (despite UI calling them title/message in some
      // labels).
      filterBuilders: {
        name: cell => ({ name: (cell as any)?.filter ?? cell }),
        description: cell => ({
          description: (cell as any)?.filter ?? cell,
        }),
        status: cell => {
          const v = (cell as any)?.filter ?? cell;
          return v === '' || v === null || v === undefined ? {} : { status: v };
        },
        createdOn: cell => {
          // AG Grid date filter shapes: {dateFrom, dateTo, type, filterType}.
          const c = cell as any;
          const out: Record<string, string> = {};
          if (c?.dateFrom) out['createdDateFrom'] = new Date(c.dateFrom).toISOString();
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

  onSelectionChange(rows: any[]): void {
    this.selectedAnnouncements = rows ?? [];
    this.cdr.markForCheck();
  }

  clearFilters(): void {
    if (this.adapter) {
      this.adapter.setFilter({});
      this.adapter.setSort([]);
    }
    this.selectedGroup = null;
    this.selectedAnnouncements = [];
    this.bindAdapter();
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  /* ── isActive helper — preserved from the p-table version. */

  isActive(a: any): boolean {
    if (a.status !== 1) return false;
    const now = new Date();
    if (a.startTime && new Date(a.startTime) > now) return false;
    if (a.endTime && new Date(a.endTime) < now) return false;
    return true;
  }

  /* ── nav + delete ───────────────────────────────────── */

  onAdd(): void {
    this.router.navigate([ANNOUNCEMENT.ADD]);
  }

  onView(id: string): void {
    this.router.navigate([ANNOUNCEMENT.view(id)]);
  }

  onEdit(id: string): void {
    this.router.navigate([ANNOUNCEMENT.edit(id)]);
  }

  confirmDelete(id: string): void {
    this.toDeleteId = id;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete(): void {
    if (this.selectedCount === 0) return;
    this.toDeleteId = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDeleteId = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    if (this.bulkDelete) {
      // No bulk-delete endpoint on /announcements — fire per-id
      // deletes in parallel and refresh once they settle. This keeps
      // the UI affordance (select N rows → delete) without needing a
      // BE addition.
      const ids = this.selectedAnnouncements.map(a => a.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      Promise.allSettled(ids.map(id => this.announcementService.delete(id)))
        .then(() => {
          this.selectedAnnouncements = [];
          this.refreshList();
        })
        .finally(() => {
          this.cancelDelete();
          this.cdr.markForCheck();
        });
      return;
    }

    if (this.toDeleteId) {
      this.announcementService
        .delete(this.toDeleteId)
        .then(res => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedAnnouncements = this.selectedAnnouncements.filter(
              a => a.id !== this.toDeleteId,
            );
            this.refreshList();
          }
        })
        .catch(() => {
          /* global interceptor shows error toast */
        })
        .finally(() => {
          this.cancelDelete();
          this.cdr.markForCheck();
        });
    }
  }
}
