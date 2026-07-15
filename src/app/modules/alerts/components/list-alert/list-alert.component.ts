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
import type { ExplorerObjectType } from 'src/app/shared/helpers/asset-icon.helper';
import { AlertService } from '../../services/alert.service';

/**
 * Alerts listing — renders through the shared folder-first `<app-asset-explorer>`
 * (Track F). The explorer shell owns the Folders|Tags rail, the favourite star,
 * the per-row kebab (open / edit / rename / move / copy / delete), and the
 * baseFilter (folderId / tags) it merges into every server request; this host
 * only builds the `/alerts` list adapter, supplies the alert-specific columns as
 * `extraColumns` (source, severity, schedule, next-run, status), and handles the
 * emitted actions.
 *
 * Alerts are org-scoped (not datasource-scoped), so the adapter binds
 * unconditionally on init — no datasource gate. The alert-specific per-row
 * lifecycle actions that AREN'T in the kebab set (enable/disable toggle, snooze,
 * test-now) are preserved as an extra "actions" column rendered via a
 * `usGridCell` template.
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

  /* ── explorer wiring ────────────────────────────────────────────── */

  /** objectType typed for the shared explorer input. */
  readonly explorerObjectType: ExplorerObjectType = 'alert';

  /** Alert-specific columns the explorer inserts after its name column:
   *  source, severity, schedule, next-run, status, and the lifecycle actions. */
  explorerColumns: CustomTableColumn[] = [];

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

  isDeleting = (id: string): boolean => this.alertService.isDeleting(id);
  saving = this.alertService.saving;

  constructor(
    private alertService: AlertService,
    private router: Router,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.explorerColumns = this.buildExplorerColumns();
    this.tableConfig = {
      ...this.tableConfig,
      globalSearchPlaceholder: this.translate.instant(
        'ALERTS.SEARCH_PLACEHOLDER',
      ),
    };
    // Alerts don't need a datasource — build the adapter unconditionally.
    this.bindAdapter();
  }

  ngOnDestroy(): void {
    this.alertService.cancelReads();
    this.adapter?.destroy();
  }

  /* ── explorer columns (alert-specific extras) ───────────────────── */

  private buildExplorerColumns(): CustomTableColumn[] {
    const t = (k: string): string => this.translate.instant(k);
    return [
      { colId: 'sourceType', field: 'sourceType', header: t('ALERTS.SOURCE'), width: '128px', sortable: false },
      { colId: 'severity', field: 'severity', header: t('ALERTS.SEVERITY'), width: '128px', sortable: false },
      { colId: 'cronExpression', field: 'cronExpression', header: t('ALERTS.SCHEDULE'), width: '176px', sortable: false },
      { colId: 'nextRunAt', field: 'nextRunAt', header: t('ALERTS.NEXT_RUN'), width: '176px' },
      { colId: 'enabled', field: 'enabled', header: t('COMMON.STATUS'), width: '144px', sortable: false },
      { colId: 'actions', header: t('COMMON.ACTIONS'), width: '160px', sortable: false },
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

  /* ── asset-explorer output handlers (Track F folder-first) ──────── */

  /** Open (view) an alert — existing view nav. */
  onOpen(row: any): void {
    if (row?.id) this.router.navigate([ALERT.view(row.id)]);
  }

  /** Rename maps to edit for alerts (no inline-rename form today). */
  onRename(row: any): void {
    if (row?.id) this.onEdit(row.id);
  }

  /** Copy from the explorer kebab → duplicate the rule, filing the copy into
   *  the chosen target folder. */
  onExplorerCopy(payload: { row: any; targetFolderId: string | null }): void {
    if (!payload?.row?.id) return;
    this.alertService
      .duplicate(payload.row.id, payload.targetFolderId)
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res)) this.refreshList();
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
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

  trackByIndex(index: number): number {
    return index;
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
