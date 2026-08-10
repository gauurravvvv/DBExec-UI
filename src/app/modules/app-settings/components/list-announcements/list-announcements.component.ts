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
import { ANNOUNCEMENT } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { AnnouncementService } from '../../services/announcement.service';

/**
 * Announcements listing — renders through the shared `<app-custom-table>` (the
 * app's unified list table) driven by a `UsServerListAdapter` on the BE
 * `/announcements` list call. Infinite scroll (no page controls), a single
 * global search plus on-demand per-column filters (shared inputs), and per-row
 * actions. No bulk selection.
 *
 * No datasource gate; the adapter binds in `ngOnInit`. Announcements are
 * org-wide (no per-group targeting), so the list is a straight org-scoped
 * feed with search + per-column filters.
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

  showDeleteConfirm = false;
  toDeleteId: string | null = null;
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE announcements list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'announcements-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in `ngOnInit` (no datasource gate) and
   *  rebuilt whenever the Group filter changes so the closure picks up the
   *  new value. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private announcementService: AnnouncementService,
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ANNOUNCEMENT.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
  }

  ngOnDestroy(): void {
    // Abort in-flight reads if the user navigates away. The adapter
    // itself cancels via the rxjs subscription teardown but the
    // service still has its own cancel pipe.
    this.announcementService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'name',
        field: 'name',
        header: t('ANNOUNCEMENT.ANNOUNCEMENT_TITLE'),
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
        colId: 'status',
        field: 'status',
        header: t('COMMON.STATUS'),
        width: '144px',
      },
      {
        colId: 'activeWindow',
        header: t('ANNOUNCEMENT.ACTIVE_WINDOW'),
        width: '224px',
        sortable: false,
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

  private bindAdapter(): void {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.announcementService.listAnnouncements({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { announcements: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.announcements ?? [],
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

  /* ── nav + per-row delete ───────────────────────────── */

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
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.toDeleteId = null;
  }

  proceedDelete(): void {
    if (this.toDeleteId) {
      this.announcementService
        .delete(this.toDeleteId)
        .then(res => {
          if (this.globalService.handleSuccessService(res)) {
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
