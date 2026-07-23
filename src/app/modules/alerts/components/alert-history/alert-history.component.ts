import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
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
 * AlertHistory — the immutable evaluation history (alert_event rows) for a
 * single alert, rendered through the shared `<app-custom-table>` driven by a
 * `UsServerListAdapter` on `AlertService.loadEvents`. Used as the "History" tab
 * on the view-alert page. Read-only: status, observed value, notification
 * flags, duration, error message.
 */
@Component({
  selector: 'app-alert-history',
  templateUrl: './alert-history.component.html',
  styleUrls: ['./alert-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertHistoryComponent implements OnInit, OnChanges, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);
  private alertService = inject(AlertService);

  @Input() alertId!: string;

  cols: CustomTableColumn[] = [];

  tableConfig: CustomTableConfig = {
    pageSize: 25,
    globalSearch: false,
    showColumnFilters: false,
    enableExport: true,
    gridKey: 'alert-events-list',
    height: '420px',
    rowIdField: 'id',
  };

  adapter: UsServerListAdapter<any> | null = null;

  ngOnInit(): void {
    this.cols = this.buildColumns();
    if (this.alertId) this.bindAdapter();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['alertId'] && !changes['alertId'].firstChange && this.alertId) {
      this.bindAdapter();
    }
  }

  ngOnDestroy(): void {
    this.adapter?.destroy();
  }

  private buildColumns(): CustomTableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        colId: 'evaluatedAt',
        field: 'evaluatedAt',
        header: t('ALERTS.EVALUATED_AT'),
        width: '200px',
      },
      {
        colId: 'eventStatus',
        field: 'eventStatus',
        header: t('COMMON.STATUS'),
        width: '128px',
        sortable: false,
      },
      {
        colId: 'observedValue',
        field: 'observedValue',
        header: t('ALERTS.OBSERVED_VALUE'),
        width: '240px',
        sortable: false,
      },
      {
        colId: 'notified',
        header: t('ALERTS.NOTIFIED'),
        width: '144px',
        sortable: false,
      },
      {
        colId: 'durationMs',
        field: 'durationMs',
        header: t('ALERTS.DURATION'),
        width: '112px',
        sortable: false,
        align: 'right',
      },
      {
        colId: 'errorMessage',
        field: 'errorMessage',
        header: t('ALERTS.ERROR'),
        width: '260px',
        sortable: false,
      },
    ];
  }

  private bindAdapter(): void {
    this.adapter?.destroy();
    const id = this.alertId;
    this.adapter = new UsServerListAdapter<any>({
      load: (params: UsListLoadParams) =>
        this.alertService.loadEvents(id, {
          page: params.page,
          limit: params.limit,
          ...(params.sort ? { sort: params.sort } : {}),
        }),
      unwrap: () => ({
        rows: this.alertService.events(),
        total: this.alertService.eventsTotal(),
      }),
      initial: { page: 1, limit: 25 },
    });
    this.cdr.markForCheck();
  }

  refreshList(): void {
    this.adapter?.reload();
  }

  /** Compact observed-value display. */
  formatObserved(v: any): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
}
