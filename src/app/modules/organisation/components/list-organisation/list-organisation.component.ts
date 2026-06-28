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
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type { UsDataGridConfig } from 'src/app/shared/components/us-data-grid/us-data-grid.types';
import { OrganisationService } from '../../services/organisation.service';

/**
 * Organisation listing (System Admin scope) — renders through
 * `<us-data-grid>` with a `UsServerListAdapter` driving the BE
 * `/orgs` list call. The page header / content card / delete-confirm
 * popup retain the existing styling and behaviour; only the
 * `<p-table>` was swapped out for the AG Grid wrapper. There is no
 * datasource dropdown on this page — it lists organisations
 * themselves, so the adapter binds directly in ngOnInit.
 */
@Component({
  selector: 'app-list-organisation',
  templateUrl: './list-organisation.component.html',
  styleUrls: ['./list-organisation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListOrganisationComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /* ── page state — UNCHANGED from the p-table version ──── */

  selectedOrgs: any[] = [];
  showDeleteConfirm = false;
  orgIdToDelete: string | null = null;
  bulkDelete = false;
  deleteJustification = '';
  Math = Math;
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

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
    gridKey: 'organisations-list',
    pageSizeOptions: [10, 25, 50, 100],
    pageSize: 10,
    height: 'calc(100vh - 280px)',
    rowIdField: 'id',
  };

  /** Server-side adapter — bound in ngOnInit because this page has no
   *  datasource dropdown to gate first-fetch on. */
  adapter: UsServerListAdapter<any> | null = null;

  constructor(
    private organisationService: OrganisationService,
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
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.organisationService.cancelReads();
    this.adapter?.destroy();
  }

  get selectedCount(): number {
    return this.selectedOrgs?.length || 0;
  }

  get isFilterActive(): boolean {
    return !!this.adapter && Object.keys(this.adapter.filterModel()).length > 0;
  }

  /** Per-row delete spinner — bound to the service's signal map. */
  isDeleting = (id: string): boolean => this.organisationService.isDeleting(id);

  /** True while any selected row is being deleted — drives the bulk
   *  Delete button's spinner. */
  get isBulkDeleting(): boolean {
    return this.selectedOrgs.some(o =>
      this.organisationService.isDeleting(o.id),
    );
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): ColDef[] {
    return [
      {
        colId: 'name',
        field: 'name',
        headerName: this.translate.instant('COMMON.NAME'),
        width: 224,
        minWidth: 224,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        pinned: 'left',
      },
      {
        colId: 'description',
        field: 'description',
        headerName: this.translate.instant('ORG.DESCRIPTION'),
        minWidth: 320,
        flex: 1,
        filter: 'agTextColumnFilter',
        filterParams: { buttons: ['reset'], suppressAndOrCondition: true },
        sortable: false,
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
        width: 112,
        minWidth: 112,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'right',
      },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.organisationService.listOrganisation({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // Custom unwrap — the BE returns `{ orgs: [], count }`.
      unwrap: (res: any) => ({
        rows: res?.data?.orgs ?? [],
        total: res?.data?.count ?? 0,
      }),
      // Floating-filter cell value → BE filter slice. The grid's
      // floating filters emit AG-Grid-shaped cells; this map flattens
      // them into the `{name, description, status, createdDateFrom,
      // createdDateTo}` shape the BE expects.
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

  onSelectionChange(rows: any[]) {
    this.selectedOrgs = rows;
    this.cdr.markForCheck();
  }

  clearFilters() {
    if (!this.adapter) return;
    this.adapter.setFilter({});
    this.adapter.setSort([]);
    this.selectedOrgs = [];
  }

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + bulk-delete — UNCHANGED ───────────────────── */

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.edit(org.id)]);
  }

  confirmDelete(orgId: string) {
    this.orgIdToDelete = orgId;
    this.bulkDelete = false;
    this.showDeleteConfirm = true;
  }

  confirmBulkDelete() {
    if (this.selectedCount === 0) return;
    this.orgIdToDelete = null;
    this.bulkDelete = true;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.bulkDelete) {
      const ids = this.selectedOrgs.map(o => o.id);
      if (ids.length === 0) {
        this.cancelDelete();
        return;
      }
      this.organisationService
        .bulkDelete(ids, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedOrgs = [];
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

    if (this.orgIdToDelete) {
      const id = this.orgIdToDelete;
      this.organisationService
        .delete(id, reason)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res)) {
            this.selectedOrgs = this.selectedOrgs.filter(o => o.id !== id);
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
    this.orgIdToDelete = null;
    this.bulkDelete = false;
    this.deleteJustification = '';
  }
}
