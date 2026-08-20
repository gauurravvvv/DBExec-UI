import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CustomTableComponent } from 'src/app/shared/components/custom-table/custom-table.component';
import { MigrationService } from 'src/app/modules/migration/services/migration.service';
import {
  MigrationFileError,
  parseBundleFile,
} from 'src/app/modules/migration/utils/migration-file.util';
import type { MigrationAssetType } from 'src/app/shared/validators/migration';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  UsServerListAdapter,
  UsListLoadParams,
} from 'src/app/shared/components/us-data-grid/us-server-list-adapter';
import type {
  CustomTableColumn,
  CustomTableConfig,
} from 'src/app/shared/components/custom-table/custom-table.types';
import { FavouritesService } from 'src/app/shared/services/favourites.service';
import type { FavouriteObjectType } from 'src/app/shared/validators/favourites';
import { DashboardService } from '../../services/dashboard.service';

/**
 * Dashboard listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/dashboards`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters (shared inputs), and per-row actions. No bulk
 * selection.
 *
 * Dashboards do NOT require a datasource — the adapter loads ALL org
 * dashboards; a `?connectorId=` deep-link still narrows as an optional filter
 * and `?name=` still pre-searches. The page header and delete-confirm popup
 * retain their existing behaviour.
 */
@Component({
  selector: 'app-list-dashboard',
  templateUrl: './list-dashboard.component.html',
  styleUrls: ['./list-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListDashboardComponent implements OnInit, OnDestroy {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  /** Hidden file input for Import. */
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;
  /** The unified table — used to clear selection after a bulk export. */
  @ViewChild(CustomTableComponent) table?: CustomTableComponent;

  /* ── migration (export / import) ─────────────────────── */

  /** The list's asset family for the migration export request. */
  private readonly migrationAssetType: MigrationAssetType = 'dashboard';
  /** Row objects selected via the table's opt-in checkboxes. */
  selectedRows: any[] = [];
  exporting = this.migrationService.exporting;
  importing = this.migrationService.importing;

  /* ── page state — preserved from the p-table version ─── */

  showDeleteConfirm = false;
  dashboardToDelete: string | null = null;
  deleteJustification = '';

  // Asset-share dialog state.
  showShareDialog = false;
  shareAssetId = '';
  shareAssetName = '';

  Math = Math;
  /** Optional datasource narrow carried from a `?connectorId=` deep-link. */
  selectedDatasource: any = null;
  today = new Date();
  statusOptions: any[] = [];

  // Per-row spinner helper from the service.
  isDeleting = (id: string): boolean => this.dashboardService.isDeleting(id);

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 50, // rows fetched per scroll page
    globalSearch: true,
    globalSearchKey: 'search', // BE dashboards list matches a `search` filter key
    globalSearchPlaceholder: undefined, // set in ngOnInit (translate ready)
    showColumnFilters: true,
    enableExport: true,
    selectable: true, // migration bulk-export selection surface
    gridKey: 'dashboards-list',
    height: 'flex',
    rowIdField: 'id',
  };

  /** Server-side adapter — built once in ngOnInit; NO datasource gate. The
   *  list browses ALL org dashboards; a `?connectorId=` deep-link narrows it
   *  via the optional datasource filter. */
  adapter: UsServerListAdapter<any> | null = null;

  /* ── favourites ─────────────────────────────────────────────────── */

  readonly objectType: FavouriteObjectType = 'dashboard';
  favIds = this.favouritesService.ids;

  /** Per-row favourite star helpers (delegate to the shared service). */
  isFavourite = (id: string): boolean =>
    this.favouritesService.isFavourite(this.objectType, id);
  toggleFavourite(id: string): void {
    this.favouritesService
      .toggle(this.objectType, id)
      .then(() => this.cdr.markForCheck());
  }

  constructor(
    private dashboardService: DashboardService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute,
    private translate: TranslateService,
    private favouritesService: FavouritesService,
    private migrationService: MigrationService,
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
        'DASHBOARD.SEARCH_PLACEHOLDER',
      ),
    };

    // Build the datasource-free adapter once — the list browses ALL org
    // dashboards. A `?connectorId=` deep-link still narrows the list (optional
    // filter), and `?name=` still pre-searches.
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const dsId = params['connectorId'] || undefined;
        const name = params['name'] || undefined;
        this.selectedDatasource = dsId ?? null;
        this.bindAdapter(name);
      });

    // Warm the favourite-id set so each row's star renders correct state.
    this.favouritesService
      .refresh(this.objectType)
      .then(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    // Abort in-flight reads if the user navigates away.
    this.dashboardService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ──────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'favourite',
        header: '',
        width: '56px',
        sortable: false,
        align: 'center',
      },
      {
        colId: 'name',
        field: 'name',
        header: t('COMMON.NAME'),
        width: '224px',
        frozen: true,
        filter: 'text',
      },
      {
        colId: 'datasetName',
        field: 'datasetName',
        header: t('DASHBOARD.DATASET'),
        width: '192px',
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
   * Construct the server-side adapter. NO datasource gate — the list browses
   * ALL org dashboards. A `connectorId` is sent only when a deep-link /
   * optional filter selected one.
   */
  private bindAdapter(deepLinkName?: string) {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.dashboardService.listDashboard({
          ...(this.selectedDatasource
            ? { connectorId: this.selectedDatasource }
            : {}),
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // BE returns `{ data: { dashboards: [], count } }`.
      unwrap: (res: any) => ({
        rows: res?.data?.dashboards ?? [],
        total: res?.data?.count ?? 0,
      }),
      initial: {
        page: 1,
        limit: 50,
        ...(deepLinkName ? { filter: { name: deepLinkName } } : {}),
      },
    });
    this.cdr.markForCheck();
  }

  /* ── handlers re-pointed at the adapter ──────────────── */

  refreshList() {
    this.adapter?.reload();
  }

  /* ── nav + delete ───────────────────────────────────── */

  onView(id: string) {
    this.router.navigate([DB_ROUTES.view(id)]);
  }

  onShare(dashboard: any): void {
    this.shareAssetId = dashboard?.id ?? '';
    this.shareAssetName = dashboard?.name ?? '';
    this.showShareDialog = true;
  }

  onShareClosed(): void {
    this.showShareDialog = false;
    this.shareAssetId = '';
    this.shareAssetName = '';
  }

  /* ── migration: export / import ──────────────────────── */

  /** Table selection changed (opt-in checkboxes). */
  onSelectionChange(rows: any[]): void {
    this.selectedRows = rows;
    this.cdr.markForCheck();
  }

  /** Export a single row to a downloaded `.dbexec.json`. */
  async onExportRow(row: any): Promise<void> {
    if (!row?.id) return;
    try {
      await this.migrationService.exportAssets([
        { assetType: this.migrationAssetType, assetId: row.id },
      ]);
    } catch (err: any) {
      this.globalService.handleErrorService({
        status: false,
        message: this.resolveError(err),
      });
    }
    this.cdr.markForCheck();
  }

  /** Export every currently-selected row as ONE bundle, then clear selection. */
  async onExportSelected(): Promise<void> {
    if (!this.selectedRows.length) return;
    const items = this.selectedRows
      .filter(r => r?.id)
      .map(r => ({ assetType: this.migrationAssetType, assetId: r.id }));
    if (!items.length) return;
    try {
      await this.migrationService.exportAssets(items);
      this.table?.clearSelection();
      this.selectedRows = [];
    } catch (err: any) {
      this.globalService.handleErrorService({
        status: false,
        message: this.resolveError(err),
      });
    }
    this.cdr.markForCheck();
  }

  /** Open the hidden file picker for Import. */
  onImportClick(): void {
    this.importInput?.nativeElement.click();
  }

  /** A file was picked — parse, validate, import, refresh. */
  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    try {
      const bundle = await parseBundleFile(file);
      await this.migrationService.importBundle(bundle);
      this.globalService.showInfo(
        this.translate.instant('MIGRATION.IMPORT_SUCCESS'),
        this.translate.instant('MIGRATION.IMPORT'),
      );
      this.refreshList();
    } catch (err: any) {
      this.globalService.handleErrorService({
        status: false,
        message: this.resolveError(err),
      });
    }
    this.cdr.markForCheck();
  }

  /** Resolve an error to a display string — MigrationFileError + thrown
   *  Error messages are i18n keys; anything else is shown verbatim. */
  private resolveError(err: any): string {
    const key =
      err instanceof MigrationFileError
        ? err.messageKey
        : (err?.message ?? 'MIGRATION.IMPORT_FAILED');
    return this.translate.instant(key);
  }

  confirmDelete(id: string) {
    this.dashboardToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete() {
    const reason = this.deleteJustification.trim();
    if (!reason) return;

    if (this.dashboardToDelete) {
      this.dashboardService
        .delete(this.dashboardToDelete, reason)
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
      return;
    }
    this.closeDeletePopup();
  }

  private closeDeletePopup() {
    this.showDeleteConfirm = false;
    this.dashboardToDelete = null;
    this.deleteJustification = '';
  }
}
