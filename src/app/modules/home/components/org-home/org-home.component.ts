import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PERMISSIONS } from 'src/app/core/constants/permissions.constant';
import {
  ANALYSES,
  DASHBOARD,
  DATASET,
  QUERY_RUNNER,
  USER,
} from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { PermissionService } from 'src/app/core/services/permission.service';
import { WidgetState } from 'src/app/shared/components/dashboard/widget-card/widget-card.component';
import {
  ActivityEntry,
} from 'src/app/shared/components/dashboard/activity-item/activity-item.component';
import {
  DonutSlice,
  TrendSeries,
} from 'src/app/shared/components/dashboard/trend-chart/trend-chart.component';
import {
  ActivityRow,
  DateWindow,
  LoginTrendPoint,
  ModuleExecution,
  OrgSummary,
  QueryTrendPoint,
} from '../../models/dashboard.models';
import { HomeService } from '../../services/home.service';

/** A widget's async lifecycle wrapper. */
interface Widget<T> {
  state: WidgetState;
  data: T | null;
}

/** Quick range presets for the date control. */
type RangePreset = 7 | 30 | 90 | 'custom';

@Component({
  selector: 'app-org-home',
  templateUrl: './org-home.component.html',
  styleUrls: ['./org-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgHomeComponent implements OnInit, OnDestroy {
  userName = '';
  organisationName = '';

  /** Selected range preset + resolved window. */
  preset: RangePreset = 30;
  window!: DateWindow;
  /** For the custom date-range picker (two-date array). */
  customRange: Date[] | null = null;

  /* ---- widget state ---- */
  summary: Widget<OrgSummary> = { state: 'loading', data: null };
  queryTrend: Widget<QueryTrendPoint[]> = { state: 'loading', data: null };
  loginTrend: Widget<LoginTrendPoint[]> = { state: 'loading', data: null };
  execByModule: Widget<ModuleExecution[]> = { state: 'loading', data: null };
  activity: Widget<ActivityRow[]> = { state: 'loading', data: null };

  /* ---- derived chart inputs ---- */
  queryTrendCategories: string[] = [];
  queryTrendSeries: TrendSeries[] = [];
  loginTrendCategories: string[] = [];
  loginTrendSeries: TrendSeries[] = [];
  donutSlices: DonutSlice[] = [];

  private destroy$ = new Subject<void>();

  /** Expose permission keys to the template. */
  readonly P = PERMISSIONS;

  constructor(
    private homeService: HomeService,
    private globalService: GlobalService,
    public permission: PermissionService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.userName = this.globalService.getTokenDetails('name') || '';
    this.organisationName =
      this.globalService.getTokenDetails('organisation') || '';
    this.window = this.resolveWindow(this.preset);
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.homeService.cancelReads();
  }

  /* ================= data loading ================= */

  /**
   * Fire every widget's request in parallel. Each subscribes on its
   * own so the fastest response paints first — no widget waits on
   * another. Permission-denied widgets are short-circuited to the
   * 'denied' state without a network call.
   */
  private loadAll(): void {
    this.loadSummary();
    this.loadQueryTrend();
    this.loadLoginTrend();
    this.loadExecByModule();
    this.loadActivity();
  }

  /** Re-fetch only the widgets that depend on the date window. */
  private reloadWindowed(): void {
    this.loadSummary();
    this.loadQueryTrend();
    this.loadLoginTrend();
    this.loadExecByModule();
  }

  private loadSummary(): void {
    // Summary needs no special permission (every user has `home`).
    this.summary = { state: 'loading', data: null };
    this.homeService
      .getOrgSummary(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.summary = { state: data ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('summary'),
      });
  }

  loadQueryTrend(): void {
    if (!this.permission.canRead(PERMISSIONS.AUDIT_LOGS)) {
      this.queryTrend = { state: 'denied', data: null };
      return;
    }
    this.queryTrend = { state: 'loading', data: null };
    this.homeService
      .getQueryTrend(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.queryTrendCategories = data.map(p => this.shortDate(p.date));
          this.queryTrendSeries = [
            { name: 'Queries', data: data.map(p => p.count), type: 'line' },
          ];
          this.queryTrend = {
            state: data.length ? 'ready' : 'empty',
            data,
          };
          this.cdr.markForCheck();
        },
        error: () => this.fail('queryTrend'),
      });
  }

  loadLoginTrend(): void {
    if (!this.permission.canRead(PERMISSIONS.LOGIN_ACTIVITY)) {
      this.loginTrend = { state: 'denied', data: null };
      return;
    }
    this.loginTrend = { state: 'loading', data: null };
    this.homeService
      .getLoginTrend(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.loginTrendCategories = data.map(p => this.shortDate(p.date));
          this.loginTrendSeries = [
            {
              name: 'Success',
              data: data.map(p => p.success),
              type: 'bar',
              colorVar: '--success-color',
            },
            {
              name: 'Failed',
              data: data.map(p => p.failed),
              type: 'bar',
              colorVar: '--error-color',
            },
          ];
          this.loginTrend = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('loginTrend'),
      });
  }

  loadExecByModule(): void {
    if (!this.permission.canRead(PERMISSIONS.AUDIT_LOGS)) {
      this.execByModule = { state: 'denied', data: null };
      return;
    }
    this.execByModule = { state: 'loading', data: null };
    this.homeService
      .getExecutionsByModule(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.donutSlices = data.map(r => ({
            name: r.module,
            value: r.count,
          }));
          this.execByModule = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('execByModule'),
      });
  }

  loadActivity(): void {
    if (!this.permission.canRead(PERMISSIONS.AUDIT_LOGS)) {
      this.activity = { state: 'denied', data: null };
      return;
    }
    this.activity = { state: 'loading', data: null };
    this.homeService
      .getActivity(8)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.activity = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('activity'),
      });
  }

  private fail(
    key: 'summary' | 'queryTrend' | 'loginTrend' | 'execByModule' | 'activity',
  ): void {
    (this[key] as Widget<unknown>).state = 'error';
    this.cdr.markForCheck();
  }

  /** Total executions in range — summed from the by-module widget. */
  get execTotal(): number | null {
    if (!this.execByModule.data) return null;
    return this.execByModule.data.reduce((sum, r) => sum + (r.count || 0), 0);
  }

  /**
   * Percentage delta of a metric versus its pre-window baseline.
   * Returns null when there is no baseline (avoids a divide-by-zero
   * ▲∞). An absolute-count delta is used where % is meaningless
   * (callers pass deltaUnit="").
   */
  deltaOf(pair?: { current: number; previous: number } | null): number | null {
    if (!pair) return null;
    return pair.current - pair.previous;
  }

  /* ================= date range ================= */

  setPreset(preset: RangePreset): void {
    if (preset === 'custom') {
      this.preset = 'custom';
      return; // window changes when the picker emits a value
    }
    this.preset = preset;
    this.window = this.resolveWindow(preset);
    this.reloadWindowed();
  }

  onCustomRange(range: Date[] | null): void {
    if (!range || range.length < 2 || !range[0] || !range[1]) return;
    this.preset = 'custom';
    this.window = {
      from: this.startOfDay(range[0]).toISOString(),
      to: this.endOfDay(range[1]).toISOString(),
    };
    this.reloadWindowed();
  }

  private resolveWindow(days: RangePreset): DateWindow {
    const to = this.endOfDay(new Date());
    const from = new Date();
    from.setDate(from.getDate() - (typeof days === 'number' ? days : 30));
    return { from: this.startOfDay(from).toISOString(), to: to.toISOString() };
  }

  refresh(): void {
    this.loadAll();
  }

  /* ================= mapping helpers ================= */

  /** Map an ActivityRow to the activity-item entry shape. */
  toEntry(row: ActivityRow): ActivityEntry {
    return {
      id: row.id,
      actorName: row.actorName,
      action: row.action,
      module: row.module,
      entityName: row.entityName,
      entityType: row.entityType,
      responseSuccess: row.responseSuccess,
      createdOn: row.createdOn,
    };
  }

  /** i18n verb key for an audit action, resolved in the template. */
  verbKey(action: string): string {
    const a = (action || '').toUpperCase();
    const known = [
      'EXECUTE',
      'CREATE',
      'UPDATE',
      'DELETE',
      'EXPORT',
      'IMPORT',
      'LOGIN',
      'LOGOUT',
      'CONFIG',
    ];
    return known.includes(a) ? `HOME_DASH.VERB.${a}` : 'HOME_DASH.VERB.DEFAULT';
  }

  private shortDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  private startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  private endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  /* ================= quick actions ================= */

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }

  goNewQuery(): void {
    this.router.navigateByUrl(QUERY_RUNNER.SAVED_QUERIES_LIST);
  }
  goDatasets(): void {
    this.router.navigateByUrl(DATASET.LIST);
  }
  goAnalyses(): void {
    this.router.navigateByUrl(ANALYSES.LIST);
  }
  goDashboards(): void {
    this.router.navigateByUrl(DASHBOARD.LIST);
  }
  goUsers(): void {
    this.router.navigateByUrl(USER.LIST);
  }
  goAudit(): void {
    this.router.navigate(['/app/audit']);
  }
}
