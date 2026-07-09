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
import { ORGANISATION } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { OrganisationService } from '../../services/organisation.service';

/**
 * Organisation listing (System Admin scope) — renders through the shared
 * `<app-custom-table>` (the app's unified list table) driven by a
 * `UsServerListAdapter` on the BE `/orgs` list call. Infinite scroll (no page
 * controls), a single global search plus on-demand per-column filters (shared
 * inputs), and per-row actions. No bulk selection.
 *
 * Organisations is org-wide (System Admin scope) and lists organisations
 * themselves, so there is no datasource / secondary dropdown — the adapter
 * binds directly in ngOnInit.
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

  /* ── page state ──────────────────────────────────────── */

  showDeleteConfirm = false;
  orgIdToDelete: string | null = null;
  deleteJustification = '';
  today = new Date();
  statusOptions: { label: string; value: number }[] = [];

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll', // infinite scroll — no page controls
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE orgs list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'organisations-list',
    height: 'flex',
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
    // Field-specific search placeholder so the user knows what's matched.
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant('ORG.SEARCH_PLACEHOLDER'),
    };
    this.bindAdapter();
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.organisationService.cancelReads();
    this.adapter?.destroy();
  }

  /** Per-row delete spinner — bound to the service's signal map. */
  isDeleting = (id: string): boolean => this.organisationService.isDeleting(id);

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
      { colId: 'description', field: 'description', header: t('ORG.DESCRIPTION'), width: '320px', filter: 'text', sortable: false },
      { colId: 'status', field: 'status', header: t('COMMON.STATUS'), width: '144px' },
      { colId: 'createdOn', field: 'createdOn', header: t('COMMON.CREATED_ON'), width: '192px' },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '144px', sortable: false },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────── */

  private bindAdapter() {
    // Tear down any prior adapter so its in-flight call doesn't race
    // the new one's first load.
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.organisationService.listOrganisation({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { orgs: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.orgs ?? [],
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

  onAddNewOrganisation() {
    this.router.navigate([ORGANISATION.ADD]);
  }

  onEdit(org: any) {
    this.router.navigate([ORGANISATION.edit(org.id)]);
  }

  confirmDelete(orgId: string) {
    this.orgIdToDelete = orgId;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.orgIdToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.orgIdToDelete) {
      const id = this.orgIdToDelete;
      this.organisationService
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
    this.orgIdToDelete = null;
    this.deleteJustification = '';
  }
}
