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
import { AlertService } from '../../services/alert.service';

/**
 * Alerts listing — renders through the shared `<app-custom-table>` (the app's
 * unified list table) driven by a `UsServerListAdapter` on the BE `/alerts`
 * list call. Infinite scroll (no page controls), a single global search plus
 * on-demand per-column filters, and per-row actions. No bulk selection.
 *
 * Alerts are org-scoped (not datasource-scoped), so the adapter binds
 * unconditionally on init — no datasource gate. The alert-specific per-row
 * lifecycle actions (enable/disable toggle, snooze, test-now, edit, delete)
 * are rendered via the "actions" column's `usGridCell` template.
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
    { label: 'ALERTS.SNOOZE_30M', value: 30 },
    { label: 'ALERTS.SNOOZE_1H', value: 60 },
    { label: 'ALERTS.SNOOZE_3H', value: 180 },
    { label: 'ALERTS.SNOOZE_12H', value: 720 },
    { label: 'ALERTS.SNOOZE_1D', value: 1440 },
  ];

  /* ── test-now result ────────────────────────────────────────────── */
  testingId: string | null = null;

  /* ── custom-table wiring (unified simple table; server-driven) ──────── */

  /** Unified-table columns. Cell DOM is supplied by `<ng-template usGridCell>`
   *  in the HTML; `filter` flags enable the on-demand per-column filter row. */
  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
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
    this.cols = this.buildColumns();
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

  /* ── column definitions ─────────────────────────────────────────── */

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string): string => this.translate.instant(k);
    return [
      { colId: 'name', field: 'name', header: t('COMMON.NAME'), width: '224px', frozen: true, filter: 'text' },
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
