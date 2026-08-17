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
import {
  AdminSummary,
  AdminTrendPoint,
  DateWindow,
  OrgsCreatedPoint,
} from '../../models/dashboard.models';
import { HomeService } from '../../services/home.service';

interface Widget<T> {
  state: WidgetState;
  data: T | null;
}
type RangePreset = 7 | 30 | 90 | 'custom';

@Component({
  selector: 'app-system-admin-home',
  templateUrl: './system-admin-home.component.html',
  styleUrls: ['./system-admin-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemAdminHomeComponent implements OnInit, OnDestroy {
  adminName = '';

  preset: RangePreset = 30;
  window!: DateWindow;
  customRange: Date[] | null = null;

  summary: Widget<AdminSummary> = { state: 'loading', data: null };
  trends: Widget<AdminTrendPoint[]> = { state: 'loading', data: null };
  orgsCreated: Widget<OrgsCreatedPoint[]> = { state: 'loading', data: null };

  /* derived chart inputs */
  trendCategories: string[] = [];
  trendSeries: TrendSeries[] = [];
  orgsCategories: string[] = [];
  orgsSeries: TrendSeries[] = [];
  statusSlices: DonutSlice[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private homeService: HomeService,
    private globalService: GlobalService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.adminName = this.globalService.getTokenDetails('name') || '';
    this.window = this.resolveWindow(this.preset);
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
              {
                name: 'Active',
                value: data.platform.orgsActive,
              },
              {
                name: 'Inactive',
                value: data.platform.orgsInactive,
              },
            ];
          }
          this.cdr.markForCheck();
        },
        error: () => this.fail('summary'),
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

  private fail(key: 'summary' | 'trends' | 'orgsCreated'): void {
    (this[key] as Widget<unknown>).state = 'error';
    this.cdr.markForCheck();
  }

  /* ================= date range ================= */

  setPreset(preset: RangePreset): void {
    if (preset === 'custom') {
      this.preset = 'custom';
      return;
    }
    this.preset = preset;
    this.window = this.resolveWindow(preset);
    this.loadAll();
  }

  onCustomRange(range: Date[] | null): void {
    if (!range || range.length < 2 || !range[0] || !range[1]) return;
    this.preset = 'custom';
    this.window = {
      from: this.startOfDay(range[0]).toISOString(),
      to: this.endOfDay(range[1]).toISOString(),
    };
    this.loadAll();
  }

  refresh(): void {
    this.loadAll();
  }

  private resolveWindow(days: RangePreset): DateWindow {
    const to = this.endOfDay(new Date());
    const from = new Date();
    from.setDate(from.getDate() - (typeof days === 'number' ? days : 30));
    return { from: this.startOfDay(from).toISOString(), to: to.toISOString() };
  }

  /* ================= helpers ================= */

  /** dbStatus → chip tone for the rollup table. */
  dbStatusTone(status: string): 'success' | 'warning' | 'error' | 'neutral' {
    switch (status) {
      case 'connected':
        return 'success';
      case 'not_configured':
        return 'neutral';
      case 'timeout':
        return 'warning';
      default:
        return 'error';
    }
  }

  loginSuccessRate(): number | null {
    // Derived from the trend widget if present; platform success % is a
    // headline the operator scans. Falls back to null (—) when no data.
    const rows = this.trends.data;
    if (!rows || !rows.length) return null;
    const totalLogins = rows.reduce((s, r) => s + (r.logins || 0), 0);
    return totalLogins > 0 ? 100 : null; // logins here are success-only counts
  }

  goOrgs(): void {
    this.router.navigate(['/app/organisations']);
  }
  goAudit(): void {
    this.router.navigate(['/app/audit']);
  }
  goLogins(): void {
    this.router.navigate(['/app/audit/logins']);
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
}
