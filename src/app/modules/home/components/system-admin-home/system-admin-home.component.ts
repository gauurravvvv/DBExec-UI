import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { GlobalService } from 'src/app/core/services/global.service';
import { WidgetState } from 'src/app/shared/components/dashboard/widget-card/widget-card.component';
import {
  DonutSlice,
  TrendSeries,
} from 'src/app/shared/components/dashboard/trend-chart/trend-chart.component';
import { ActivityEntry } from 'src/app/shared/components/dashboard/activity-item/activity-item.component';
import {
  ActivityRow,
  AdminOrgRow,
  AdminSummary,
  AdminTrendPoint,
  DateWindow,
  LoginHealth,
  OrgsCreatedPoint,
} from '../../models/dashboard.models';
import { HomeService } from '../../services/home.service';

interface Widget<T> {
  state: WidgetState;
  data: T | null;
}
/** 'all' = no date filter (complete data); 'custom' = date-range picker. */
type RangePreset = 'all' | 'custom' | 7 | 30 | 90;

@Component({
  selector: 'app-system-admin-home',
  templateUrl: './system-admin-home.component.html',
  styleUrls: ['./system-admin-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemAdminHomeComponent implements OnInit, OnDestroy {
  adminName = '';

  /** Default = all-time (no filter). */
  preset: RangePreset = 'all';
  /** null = all-time (send no from/to). */
  window: DateWindow | null = null;
  customRange: Date[] | null = null;

  summary: Widget<AdminSummary> = { state: 'loading', data: null };
  trends: Widget<AdminTrendPoint[]> = { state: 'loading', data: null };
  orgsCreated: Widget<OrgsCreatedPoint[]> = { state: 'loading', data: null };
  organisations: Widget<AdminOrgRow[]> = { state: 'loading', data: null };
  activity: Widget<ActivityRow[]> = { state: 'loading', data: null };
  loginHealth: Widget<LoginHealth> = { state: 'loading', data: null };

  /* derived chart inputs */
  trendCategories: string[] = [];
  trendSeries: TrendSeries[] = [];
  orgsCategories: string[] = [];
  orgsSeries: TrendSeries[] = [];
  statusSlices: DonutSlice[] = [];
  loginHealthCategories: string[] = [];
  loginHealthSeries: TrendSeries[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private homeService: HomeService,
    private globalService: GlobalService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.adminName = this.globalService.getTokenDetails('name') || '';
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.homeService.cancelReads();
  }

  /* ================= loading ================= */

  private loadAll(): void {
    this.loadSummary();
    this.loadTrends();
    this.loadOrgsCreated();
    this.loadOrganisations();
    this.loadActivity();
    this.loadLoginHealth();
  }

  private loadSummary(): void {
    this.summary = { state: 'loading', data: null };
    this.homeService
      .getAdminSummary(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.summary = { state: data ? 'ready' : 'empty', data };
          if (data) {
            this.statusSlices = [
              { name: 'Active', value: data.platform.orgsActive },
              { name: 'Inactive', value: data.platform.orgsInactive },
            ];
          }
          this.cdr.markForCheck();
        },
        error: () => this.fail('summary'),
      });
  }

  loadOrganisations(): void {
    this.organisations = { state: 'loading', data: null };
    this.homeService
      .getAdminOrganisations(50)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.organisations = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('organisations'),
      });
  }

  loadActivity(): void {
    this.activity = { state: 'loading', data: null };
    this.homeService
      .getAdminActivity(8)
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

  loadLoginHealth(): void {
    this.loginHealth = { state: 'loading', data: null };
    this.homeService
      .getAdminLoginHealth(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          const series = data?.series ?? [];
          this.loginHealthCategories = series.map(p => this.shortDate(p.date));
          this.loginHealthSeries = [
            {
              name: 'Success',
              data: series.map(p => p.success),
              type: 'bar',
              colorVar: '--success-color',
            },
            {
              name: 'Failed',
              data: series.map(p => p.failed),
              type: 'bar',
              colorVar: '--error-color',
            },
          ];
          this.loginHealth = {
            state: data && series.length ? 'ready' : 'empty',
            data,
          };
          this.cdr.markForCheck();
        },
        error: () => this.fail('loginHealth'),
      });
  }

  private loadTrends(): void {
    this.trends = { state: 'loading', data: null };
    this.homeService
      .getAdminTrends(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.trendCategories = data.map(p => this.shortDate(p.date));
          this.trendSeries = [
            {
              name: 'Queries',
              data: data.map(p => p.queries),
              type: 'bar',
              colorVar: '--primary-color',
            },
            {
              name: 'Logins',
              data: data.map(p => p.logins),
              type: 'line',
              colorVar: '--warning-color',
            },
          ];
          this.trends = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('trends'),
      });
  }

  private loadOrgsCreated(): void {
    this.orgsCreated = { state: 'loading', data: null };
    this.homeService
      .getOrgsCreated(this.window)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          const data = rows ?? [];
          this.orgsCategories = data.map(p => this.shortDate(p.date));
          this.orgsSeries = [
            {
              name: 'New orgs',
              data: data.map(p => p.count),
              type: 'bar',
              colorVar: '--success-color',
            },
          ];
          this.orgsCreated = { state: data.length ? 'ready' : 'empty', data };
          this.cdr.markForCheck();
        },
        error: () => this.fail('orgsCreated'),
      });
  }

  private fail(
    key:
      | 'summary'
      | 'trends'
      | 'orgsCreated'
      | 'organisations'
      | 'activity'
      | 'loginHealth',
  ): void {
    (this[key] as Widget<unknown>).state = 'error';
    this.cdr.markForCheck();
  }

  /* activity-feed mapping (reuse the shared item shape) */
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

  /** Format an org's created date for the table. */
  fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /* ================= date range ================= */

  /**
   * Select a range. Clicking the ALREADY-active preset toggles back to
   * all-time (complete data). Default on load is all-time.
   */
  setPreset(preset: 7 | 30 | 90): void {
    if (this.preset === preset) {
      // Re-clicking the active pill clears back to all-time (complete data).
      this.setAllTime();
      return;
    }
    this.preset = preset;
    this.window = this.resolveWindow(preset);
    this.loadAll();
  }

  /** All-time: no date filter, complete data. */
  setAllTime(): void {
    this.preset = 'all';
    this.window = null;
    this.customRange = null;
    this.loadAll();
  }

  onCustomRange(range: Date[] | null): void {
    if (!range || range.length < 2 || !range[0] || !range[1]) return;
    this.preset = 'custom'; // no preset pill highlighted for a custom range
    this.window = {
      from: this.startOfDay(range[0]).toISOString(),
      to: this.endOfDay(range[1]).toISOString(),
    };
    this.loadAll();
  }

  refresh(): void {
    this.loadAll();
  }

  private resolveWindow(days: 7 | 30 | 90): DateWindow {
    const to = this.endOfDay(new Date());
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { from: this.startOfDay(from).toISOString(), to: to.toISOString() };
  }

  /* ================= helpers ================= */

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

  goOrgs(): void {
    this.router.navigate(['/app/organisations']);
  }
  goAudit(): void {
    this.router.navigate(['/app/audit']);
  }
  goSystemUsers(): void {
    this.router.navigate(['/app/system-users']);
  }
}
