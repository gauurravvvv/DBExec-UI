import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { Visual } from '../analyses/models/visual.model';
import type { AnalysisParameter } from '../analyses/models/analysis-parameter.model';
import type { ParameterValue } from '../analyses/models/analysis-parameter.model';
import { ChartDataTransformerService } from '../analyses/services/chart-data-transformer.service';
import { isCardChartType } from '../analyses/constants/charts.constants';
import { DashboardService } from '../dashboard/services/dashboard.service';
import { DashboardCrossFilter } from '../dashboard/services/dashboard-interaction';
import { DashboardPreloadGateComponent } from '../dashboard/components/dashboard-preload-gate/dashboard-preload-gate.component';
import type { PreloadGateResult } from '../dashboard/components/dashboard-preload-gate/dashboard-preload-gate.component';
import {
  DashboardWidgetComponent,
  DashboardWidget,
} from '../dashboard/components/dashboard-widget/dashboard-widget.component';

/**
 * EmbedDashboardComponent — the PUBLIC, read-only dashboard viewer that a
 * share link opens. Standalone + hosted OUTSIDE the /app shell (no
 * sidebar/topbar, no auth). It:
 *   1. reads the opaque :token from the route,
 *   2. renders the snapshot layout via the public render endpoint,
 *   3. runs the snapshot SQL via the public run endpoint (RLS-hardened
 *      for the anonymous viewer on the BE),
 *   4. draws each visual with the SAME shared echart-visual / table-visual
 *      components + ChartDataTransformerService the authed dashboard uses,
 *      so charts look identical.
 *
 * Render parity with the authed view (Dashboard & Analysis v2): tabbed
 * render, a blocking pre-load gate, text/KPI widgets, and configurable
 * cross-filter — all under the anonymous RLS-hardened identity, never
 * more. Still view-only: no filter sidebar, no share/export/schedule
 * chrome, no edit. A bad/expired/revoked token surfaces a friendly error.
 */
@Component({
  selector: 'app-embed-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SharedChartsModule,
    DashboardPreloadGateComponent,
    DashboardWidgetComponent,
  ],
  templateUrl: './embed-dashboard.component.html',
  styleUrls: ['./embed-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedDashboardComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  @ViewChild('canvas') canvas!: ElementRef<HTMLDivElement>;

  token = '';
  dashboardName = '';
  visuals: Visual[] = [];
  rawData: any[] = [];

  loading = true;
  error = false;

  canvasWidth = 1000;
  canvasHeight = 600;

  private readonly GRID_COLUMNS = 24;
  private readonly GRID_ROWS = 12;
  private resizeObserver: ResizeObserver | null = null;

  isCardChartType = isCardChartType;

  // ── Multi-tab + widgets (Tracks A4 / E3) ────────────────────────────
  tabs: any[] = [];
  activeTabId: string | null = null;
  widgets: DashboardWidget[] = [];

  // ── Pre-load gate (Track C3) ────────────────────────────────────────
  parameters: AnalysisParameter[] = [];
  mandatoryFilters: any[] = [];
  requiresPreloadGate = false;
  gateOpen = false;
  private preloadParamValues: ParameterValue[] = [];
  private preloadFilterValues: any[] = [];

  // ── Cross-filter (Track E2) ─────────────────────────────────────────
  crossFilter = new DashboardCrossFilter();

  constructor(
    private route: ActivatedRoute,
    private _dashboardService: DashboardService,
    private chartDataTransformer: ChartDataTransformerService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.loading = false;
      this.error = true;
      return;
    }
    void this.load();
  }

  ngAfterViewInit(): void {
    this.setupResize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private async load(): Promise<void> {
    try {
      const res: any = await this._dashboardService.renderPublic(this.token);
      const data = res?.data ?? res;
      if (!data || res?.status === false) {
        this.fail();
        return;
      }
      this.dashboardName = data.name || '';

      // Dashboard & Analysis v2 additive render fields (embed parity).
      this.tabs = Array.isArray(data.tabs) ? data.tabs : [];
      this.activeTabId = this.tabs.length > 0 ? this.tabs[0].id : null;
      this.widgets = Array.isArray(data.widgets) ? data.widgets : [];
      this.parameters = Array.isArray(data.parameters) ? data.parameters : [];
      this.mandatoryFilters = Array.isArray(data.mandatoryFilters)
        ? data.mandatoryFilters
        : [];
      this.requiresPreloadGate = data.requiresPreloadGate === true;

      this.crossFilter.clear();
      this.mapVisuals(data.visuals || []);

      // Blocking gate: show ONLY the gate, run nothing until submit.
      if (this.requiresPreloadGate) {
        this.gateOpen = true;
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      await this.runVisuals();
      this.loading = false;
      this.cdr.markForCheck();
      setTimeout(() => this.setupResize(), 0);
    } catch {
      this.fail();
    }
  }

  private fail(): void {
    this.loading = false;
    this.error = true;
    this.cdr.markForCheck();
  }

  /** Ratio → CSS-grid span, mirroring view-dashboard.mapVisualsFromResponse. */
  private mapVisuals(apiVisuals: any[]): void {
    this.visuals = apiVisuals.map((v: any) => {
      const widthRatio = parseFloat(v.widthRatio) || 0.5;
      const heightRatio = parseFloat(v.heightRatio) || 0.45;
      const xRatio = parseFloat(v.xRatio) || 0;
      const yRatio = parseFloat(v.yRatio) || 0;
      const colSpan = Math.max(1, Math.round(widthRatio * this.GRID_COLUMNS));
      const rowSpan = Math.max(1, Math.round(heightRatio * this.GRID_ROWS));
      const gridCol = Math.min(
        this.GRID_COLUMNS - 1,
        Math.round(xRatio * this.GRID_COLUMNS),
      );
      const gridRow = Math.round(yRatio * this.GRID_ROWS);
      return {
        id: v.id,
        title: v.title || this.translate.instant('DASHBOARD.UNTITLED_VISUAL'),
        width: 400,
        height: 350,
        widthRatio,
        heightRatio,
        x: 0,
        y: 0,
        xRatio,
        yRatio,
        colSpan,
        rowSpan,
        gridCol,
        gridRow,
        chartType: v.visualConfig?.chartType || null,
        xAxisColumn: v.visualConfig?.xAxisColumn || null,
        yAxisColumn: v.visualConfig?.yAxisColumn || null,
        zAxisColumn: v.visualConfig?.config?.zAxisColumn || null,
        chartData: [],
        config: v.visualConfig?.config || {},
        tabId: v.tabId ?? null,
        loading: false,
        loaded: false,
        error: false,
      } as Visual;
    });
  }

  /** Effective run-query filters for one visual (gate filters + cross-filter). */
  private effectiveFiltersFor(visual: Visual): any[] {
    return [
      ...this.preloadFilterValues,
      ...this.crossFilter.filtersFor(visual),
    ];
  }

  /**
   * Run the public query and paint the visuals. Groups visuals by their
   * effective-filter signature so identical queries run once — a single
   * run in the common case, extra runs only when a cross-filter targets a
   * subset. Fans each result to its own visuals.
   */
  private async runVisuals(): Promise<void> {
    const groups = new Map<string, { filters: any[]; visuals: Visual[] }>();
    for (const v of this.visuals) {
      const eff = this.effectiveFiltersFor(v);
      const sig = JSON.stringify(eff);
      const g = groups.get(sig);
      if (g) g.visuals.push(v);
      else groups.set(sig, { filters: eff, visuals: [v] });
    }

    const runs = Array.from(groups.values()).map(async group => {
      const body: any = { limit: -1 };
      if (group.filters.length > 0) body.filters = group.filters;
      if (this.preloadParamValues.length > 0) {
        body.paramValues = this.preloadParamValues;
      }
      try {
        const runRes: any = await this._dashboardService.runPublicQuery(
          this.token,
          body,
        );
        return { group, rows: (runRes?.data ?? []) as any[], ok: true };
      } catch {
        return { group, rows: [] as any[], ok: false };
      }
    });

    const results = await Promise.all(runs);
    let baselineSet = false;
    for (const r of results) {
      if (r.ok && !baselineSet) {
        this.rawData = r.rows;
        baselineSet = true;
      }
      for (const v of r.group.visuals) this.paintVisual(v, r.rows);
    }
    this.cdr.markForCheck();
  }

  /** Transform + paint one visual from its own row set. */
  private paintVisual(visual: Visual, rows: any[]): void {
    if (visual.chartType && visual.xAxisColumn && visual.yAxisColumn) {
      visual.chartData = this.chartDataTransformer.transformData(
        visual.chartType,
        rows,
        this.chartDataTransformer.buildMapping(visual),
      ) as any[];
    } else {
      visual.chartData = [];
    }
    visual.loaded = true;
  }

  // ── Tabs ──────────────────────────────────────────────────────────

  get showTabStrip(): boolean {
    return this.tabs.length > 1;
  }

  get visibleVisuals(): Visual[] {
    if (!this.showTabStrip) return this.visuals;
    return this.visuals.filter(v => (v.tabId ?? null) === this.activeTabId);
  }

  get visibleWidgets(): DashboardWidget[] {
    if (!this.showTabStrip) return this.widgets;
    return this.widgets.filter(w => (w.tabId ?? null) === this.activeTabId);
  }

  get activeTabEmpty(): boolean {
    return this.visibleVisuals.length === 0 && this.visibleWidgets.length === 0;
  }

  selectTab(tabId: string): void {
    if (this.activeTabId === tabId) return;
    this.activeTabId = tabId;
    if (this.crossFilter.isActive()) this.crossFilter.clear();
    this.cdr.markForCheck();
  }

  trackByTabId = (_: number, t: any): string => t.id as string;
  trackByWidgetId = (_: number, w: DashboardWidget): string => w.id as string;

  widgetColSpan(w: DashboardWidget): number {
    const r = parseFloat(String(w.widthRatio)) || 0.25;
    return Math.max(1, Math.round(r * this.GRID_COLUMNS));
  }
  widgetRowSpan(w: DashboardWidget): number {
    const r = parseFloat(String(w.heightRatio)) || 0.2;
    return Math.max(1, Math.round(r * this.GRID_ROWS));
  }

  // ── Pre-load gate (Track C3) ────────────────────────────────────────

  async onGateSubmit(result: PreloadGateResult): Promise<void> {
    this.preloadParamValues = result.paramValues || [];
    this.preloadFilterValues = result.filterValues || [];
    this.gateOpen = false;
    this.loading = true;
    this.cdr.markForCheck();
    await this.runVisuals();
    this.loading = false;
    this.cdr.markForCheck();
    setTimeout(() => this.setupResize(), 0);
  }

  // ── Cross-filter (Track E2) ─────────────────────────────────────────

  isCrossFilterSource(visual: Visual): boolean {
    return DashboardCrossFilter.isEnabled(visual);
  }

  onVisualChartSelect(visual: Visual, event: any): void {
    if (!DashboardCrossFilter.isEnabled(visual)) return;
    const value = this.extractClickedValue(event);
    if (this.crossFilter.apply(visual, visual.xAxisColumn, value)) {
      void this.runVisuals();
    }
  }

  clearCrossFilter(): void {
    if (!this.crossFilter.isActive()) return;
    this.crossFilter.clear();
    void this.runVisuals();
  }

  get hasActiveCrossFilter(): boolean {
    return this.crossFilter.isActive();
  }

  get crossFilterLabel(): string {
    const cf = this.crossFilter.current();
    return cf ? `${cf.columnName}: ${cf.value}` : '';
  }

  private extractClickedValue(event: any): string | number | null {
    if (event == null) return null;
    if (typeof event === 'string' || typeof event === 'number') return event;
    if (event.name !== undefined && event.name !== null) return event.name;
    if (event.row && typeof event.row === 'object') {
      const first = Object.values(event.row)[0];
      if (typeof first === 'string' || typeof first === 'number') return first;
    }
    if (Array.isArray(event.value) && event.value.length) {
      const v = event.value[0];
      if (typeof v === 'string' || typeof v === 'number') return v;
    }
    return null;
  }

  private setupResize(): void {
    if (!this.canvas?.nativeElement || this.resizeObserver) return;
    this.updateDimensions();
    this.resizeObserver = new ResizeObserver(() => {
      this.updateDimensions();
      this.cdr.markForCheck();
    });
    this.resizeObserver.observe(this.canvas.nativeElement);
  }

  private updateDimensions(): void {
    const rect = this.canvas?.nativeElement?.getBoundingClientRect();
    if (rect) {
      this.canvasWidth = rect.width || 1000;
      this.canvasHeight = rect.height || 600;
    }
  }

  getDisplayData(visual: Visual): any[] {
    return visual?.chartData ?? [];
  }

  trackByVisualId = (_: number, v: Visual): string => v.id as string;
}
