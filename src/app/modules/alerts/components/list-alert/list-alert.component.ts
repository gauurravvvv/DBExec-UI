import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ALERT } from 'src/app/core/constants/routes.constant';
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
import type { FolderObjectType } from 'src/app/shared/validators/folders';
import { AlertService } from '../../services/alert.service';

/**
 * Alerts listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/alerts`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters, and per-row actions (enable/disable toggle,
 * snooze, test-now, edit, delete). No bulk selection.
 *
 * Unlike analyses/rls-rules, alerts are org-scoped (not datasource-scoped), so
 * the adapter binds immediately on init — no datasource picker gate.
 */
@Component({
  selector: 'app-list-alert',
  templateUrl: './list-alert.component.html',
  styleUrls: ['./list-alert.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListAlertComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  /* ── delete confirm ─────────────────────────────────────────────── */
  showDeleteConfirm = false;
  alertToDelete: string | null = null;
  deleteJustification = '';

  /* ── snooze dialog ──────────────────────────────────────────────── */
  showSnoozeDialog = false;
  alertToSnooze: any = null;
  snoozeMinutes = 60;
  snoozePresets = [
    { label: '30m', value: 30 },
    { label: '1h', value: 60 },
    { label: '3h', value: 180 },
    { label: '12h', value: 720 },
    { label: '1d', value: 1440 },
  ];

  /* ── test-now result ────────────────────────────────────────────── */
  testingId: string | null = null;

  /* ── custom-table wiring ────────────────────────────────────────── */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    mode: 'scroll',
    pageSize: 50,
    globalSearch: true,
    globalSearchKey: 'search',
    globalSearchPlaceholder: undefined,
    showColumnFilters: true,
    enableExport: true,
    gridKey: 'alerts-list',
    height: 'flex',
    rowIdField: 'id',
  };

  adapter: UsServerListAdapter<any> | null = null;

  /* ── folders / tags / favourites (Track F) ──────────────────────── */

  /** Object family this list organizes — drives the folder tree + favourites. */
  readonly objectType: FolderObjectType = 'alert';

  /** Host-owned filter slice merged into every server request by the custom
   *  table (single writer). Reassign a NEW object to trigger a re-fetch. */
  listFilter: Record<string, unknown> = {};

  selectedFolderId: string | null = null;
  filterTags: string[] = [];
  favouritesOnly = false;

  /** Favourite-id set for this object family (from FavouritesService). */
  favIds = this.favouritesService.ids;

  isDeleting = (id: string): boolean => this.alertService.isDeleting(id);
  saving = this.alertService.saving;

  constructor(
    private alertService: AlertService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
    private favouritesService: FavouritesService,
  ) {}

  ngOnInit(): void {
    this.cols = this.buildColumns();
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ALERTS.SEARCH_PLACEHOLDER',
      ),
    };
    this.bindAdapter();
    // Warm the favourite-id set so each row's star renders correct state.
    this.favouritesService.refresh(this.objectType).then(() => {
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.alertService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── column definitions ─────────────────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      { colId: 'favourite', header: '', width: '56px', sortable: false, align: 'center' },
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '220px', frozen: true, filter: 'text' },
      { colId: 'sourceType', field: 'sourceType', header: t('ALERTS.SOURCE'), width: '128px', sortable: false },
      { colId: 'severity', field: 'severity', header: t('ALERTS.SEVERITY'), width: '128px', sortable: false },
      { colId: 'cronExpression', field: 'cronExpression', header: t('ALERTS.SCHEDULE'), width: '176px', sortable: false },
      { colId: 'nextRunAt', field: 'nextRunAt', header: t('ALERTS.NEXT_RUN'), width: '176px' },
      { colId: 'enabled', field: 'enabled', header: t('COMMON.STATUS'), width: '144px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '208px', sortable: false },
    ];
  }

  /* ── adapter wiring ─────────────────────────────────────────────── */

  private bindAdapter(): void {
    this.adapter?.destroy();
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.alertService.load({
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
          ...(params.filter ? { filter: params.filter } : {}),
        }),
      // load() writes the service signals but returns void; drive the grid
      // from the signals it just set.
      unwrap: () => ({
        rows: this.alertService.alerts(),
        total: this.alertService.total(),
      }),
      initial: { page: 1, limit: 50 },
    });
    this.cdr.markForCheck();
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  /* ── folders / tags / favourites (Track F) ──────────────────────── */

  /** Rebuild the host filter slice from the current folder / tag / favourite
   *  selections. Reassigns a NEW object so the custom table re-fetches. */
  private applyOrgFilter(): void {
    const f: Record<string, unknown> = {};
    if (this.selectedFolderId) f['folderId'] = this.selectedFolderId;
    if (this.filterTags.length) f['tags'] = this.filterTags;
    if (this.favouritesOnly) f['favouritesOnly'] = true;
    this.listFilter = f;
  }

  onFolderSelected(folderId: string | null): void {
    this.selectedFolderId = folderId;
    this.applyOrgFilter();
  }

  onTagsChanged(tags: string[]): void {
    this.filterTags = tags ?? [];
    this.applyOrgFilter();
  }

  toggleFavouritesOnly(): void {
    this.favouritesOnly = !this.favouritesOnly;
    this.applyOrgFilter();
  }

  onObjectMoved(): void {
    this.refreshList();
  }

  isFavourite(id: string): boolean {
    return this.favouritesService.isFavourite(this.objectType, id);
  }

  toggleFavourite(id: string): void {
    this.favouritesService.toggle(this.objectType, id).then((res: any) => {
      this.globalService.handleSuccessService(res, false);
      // If the Favourites filter is active, re-fetch so the row drops out.
      if (this.favouritesOnly) this.refreshList();
      this.cdr.markForCheck();
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  /* ── nav ────────────────────────────────────────────────────────── */

  onAddNewAlert(): void {
    this.router.navigate([ALERT.ADD]);
  }

  onView(id: string): void {
    this.router.navigate([ALERT.view(id)]);
  }

  onEdit(id: string): void {
    this.router.navigate([ALERT.edit(id)]);
  }

  /* ── toggle enable / disable ─────────────────────────────────────── */

  onToggle(alert: any): void {
    this.alertService
      .toggle(alert.id, !alert.enabled)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.refreshList();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  /* ── snooze ─────────────────────────────────────────────────────── */

  openSnooze(alert: any): void {
    this.alertToSnooze = alert;
    this.snoozeMinutes = 60;
    this.showSnoozeDialog = true;
  }

  cancelSnooze(): void {
    this.showSnoozeDialog = false;
    this.alertToSnooze = null;
  }

  proceedSnooze(): void {
    if (!this.alertToSnooze || !this.snoozeMinutes) return;
    this.alertService
      .snooze(this.alertToSnooze.id, this.snoozeMinutes)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.refreshList();
        this.cancelSnooze();
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cancelSnooze();
        this.cdr.markForCheck();
      });
  }

  /* ── test now ───────────────────────────────────────────────────── */

  onTestNow(alert: any): void {
    this.testingId = alert.id;
    this.alertService
      .test(alert.id)
      .then((res: any) => {
        this.globalService.handleSuccessService(res);
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck())
      .finally(() => {
        this.testingId = null;
        this.cdr.markForCheck();
      });
  }

  isTesting(id: string): boolean {
    return this.testingId === id;
  }

  /* ── delete ─────────────────────────────────────────────────────── */

  confirmDelete(id: string): void {
    this.alertToDelete = id;
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.alertToDelete = null;
    this.deleteJustification = '';
  }

  proceedDelete(): void {
    const reason = this.deleteJustification.trim();
    if (!this.alertToDelete || !reason) return;
    this.alertService
      .delete(this.alertToDelete, reason)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.refreshList();
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
