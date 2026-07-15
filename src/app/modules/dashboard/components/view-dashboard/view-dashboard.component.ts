import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  exportDashboardPdf,
  exportDashboardPng,
  exportRowsCsv,
} from '../../services/dashboard-export.util';
import { FilterFetcher } from 'src/app/modules/analyses/components/analysis-filter-bar/analysis-filter-bar.component';
import {
  getMissingFieldsForVisual,
  hasAxisLabels,
  is3DCoordinateChartType,
  isCardChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isSankeyChartType,
} from '../../../analyses/constants/charts.constants';
import { Visual } from '../../../analyses/models/visual.model';
import type { AnalysisParameter } from '../../../analyses/models/analysis-parameter.model';
import { ChartDataTransformerService } from '../../../analyses/services/chart-data-transformer.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardCrossFilter } from '../../services/dashboard-interaction';
import type { DashboardWidget } from '../dashboard-widget/dashboard-widget.component';
import type { PreloadGateResult } from '../dashboard-preload-gate/dashboard-preload-gate.component';
import type { ParameterValue } from '../../../analyses/models/analysis-parameter.model';

@Component({
  selector: 'app-view-dashboard',
  templateUrl: './view-dashboard.component.html',
  styleUrls: ['./view-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewDashboardComponent
  implements OnInit, AfterViewInit, OnDestroy
{
  private destroyRef = inject(DestroyRef);
  private _dashboardService = inject(DashboardService);

  // Signal refs from service. `rendering` covers the heavier
  // render() call; `isDeleting(id)` drives the per-dashboard delete
  // spinner if/when this page exposes a delete button.
  rendered = this._dashboardService.rendered;
  loading = this._dashboardService.loading;
  rendering = this._dashboardService.rendering;
  isDeleting = (id: string): boolean => this._dashboardService.isDeleting(id);

  dashboardId = '';
  dashboard: any = null;
  visuals: Visual[] = [];
  filters: any[] = [];
  rawData: any[] = [];
  appliedFilters: any[] = [];

  // ── Multi-tab (Dashboard & Analysis v2, Track A4) ───────────────────
  /** Snapshot tabs from the render response (ordered by sequence). */
  tabs: any[] = [];
  /** Active tab id; null when the dashboard is single/implicit-tab. */
  activeTabId: string | null = null;

  // ── Widgets (Track E3) ──────────────────────────────────────────────
  /** Text / KPI tiles placed on the grid alongside visuals. */
  widgets: DashboardWidget[] = [];

  // ── Pre-load gate (Track C3) ────────────────────────────────────────
  /** Required parameters + mandatory filters + flag from render. */
  parameters: AnalysisParameter[] = [];
  mandatoryFilters: any[] = [];
  requiresPreloadGate = false;
  /** True while the blocking gate is shown (no query runs). */
  gateOpen = false;
  /** Values submitted from the gate, fed into every runQuery. */
  private preloadParamValues: ParameterValue[] = [];
  private preloadFilterValues: any[] = [];
  /** Raw seed maps so re-opening ("Edit inputs") restores prior input. */
  gateSeedParams: ParameterValue[] | null = null;
  gateSeedFilters: Record<string, any> | null = null;

  // ── Cross-filter (Track E2) — dashboard-local, configurable targets ─
  crossFilter = new DashboardCrossFilter();

  // ── Auto-refresh (Track E4) ─────────────────────────────────────────
  /** Interval seconds from the render response; null/0 = off. */
  autoRefreshSeconds: number | null = null;
  private autoRefreshTimer: any = null;
  /** Countdown shown in the toolbar indicator. */
  autoRefreshCountdown = 0;
  private countdownTimer: any = null;

  // ── Schedule delivery dialog (Track E4) ─────────────────────────────
  scheduleVisible = false;

  /**
   * Server-side missing-field warnings from the render endpoint. Each
   * entry is `{ scope, id, label, missingColumns }` — a snapshot
   * visual/filter/field whose bound column the LIVE dataset no longer
   * projects. Surfaced as a dashboard-level banner (see the template)
   * in addition to the per-visual placeholder that keys off the
   * loaded data sample. Empty by default.
   */
  serverWarnings: {
    scope: 'visual' | 'filter' | 'field';
    id: string;
    label: string;
    missingColumns: string[];
  }[] = [];

  /**
   * True only when the BE actually enumerated the live dataset columns.
   * When false (e.g. a datasource engine that doesn't expose column
   * metadata) an empty `serverWarnings` means "not checked", not "all
   * good" — so we suppress the banner rather than imply a clean bill.
   */
  fieldsChecked = false;

  /** Whether the missing-field banner is expanded to show the detail
   *  list. Collapsed by default so it stays a one-line signal. */
  warningsExpanded = false;

  /**
   * Publish-time metadata for the "Published from … · snapshot vN"
   * breadcrumb: `{ sourceAnalysisId, publishedAt, snapshotVersion,
   * datasetName }`. datasetName is resolved live; the rest are frozen
   * at publish. Null until the render response arrives.
   */
  meta: {
    sourceAnalysisId: string | null;
    publishedAt: string | null;
    snapshotVersion: number | null;
    datasetName: string | null;
  } | null = null;

  /**
   * Fetcher factory passed to the shared filter-bar so its dropdowns
   * resolve distinct values via the dashboard's own endpoint instead
   * of the analyses one. Each per-filter call resolves the dashboard's
   * snapshotted column or custom field — never the live source.
   *
   * Stable identity: arrow bound on the instance, so passing it down
   * via [fetcherFactory] doesn't churn the bar's @Input on every CD
   * pass.
   */
  dashboardFetcherFactory = (filter: any): FilterFetcher => {
    return async ({ search, page, limit }) => {
      const response: any = await this._dashboardService.getDistinctFieldValues(
        this.dashboardId,
        {
          fieldName: filter?.columnName,
          search,
          page,
          pageSize: limit,
        },
      );
      const data = response?.data || {};
      return {
        items: (data.values || []).map((v: any) => ({
          label: v.label ?? String(v.value),
          value: v.value,
        })),
        total: data.total ?? (data.values?.length || 0),
      };
    };
  };

  /**
   * Monotonically increasing id stamped on every executeQuery call.
   * When a rapid sequence of filter changes fires multiple queries
   * back-to-back, the earlier responses get discarded — only the
   * most recent query's result is allowed to write back into the
   * canvas. Without this guard the second query could finish first
   * and then be silently overwritten by the slower first response,
   * leaving stale chart data on screen.
   *
   * This is a lightweight alternative to RxJS switchMap; we keep
   * the Promise-based service contract and just compare ids on
   * resolve/reject.
   */
  private currentQueryId = 0;

  isDataLoading = signal(false);

  /**
   * Filter sidebar open state. Default CLOSED so the dashboard
   * loads with the canvas at full width — viewers consuming a
   * dashboard usually want chart real estate first; only the ones
   * who want to drill down open the panel. The toolbar filter
   * button toggles this. Mirrors the Edit Analysis sidebar pattern
   * so navigation between modules feels the same.
   */
  isFilterSidebarOpen = false;

  toggleFilterSidebar(): void {
    this.isFilterSidebarOpen = !this.isFilterSidebarOpen;
    // After the sidebar slides in/out the canvas width changes —
    // recompute visuals' pixel sizes so charts redraw at the new
    // dimensions. 350ms matches the CSS transition duration on
    // .filter-sidebar's width property.
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350);
  }

  // Canvas dimensions
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth = 1000;
  canvasHeight = 600;
  private dynamicRowHeight = 50;
  private readonly GRID_COLUMNS = 24;
  private readonly GRID_ROWS = 12;
  private readonly GRID_GAP = 12;

  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: any = null;
  private lastStableWidth = 0;
  private lastStableHeight = 0;

  isCardChartType = isCardChartType;

  // ── Share + export ───────────────────────────────────────────────
  shareVisible = false;
  exporting = false;
  exportItems: MenuItem[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private globalService: GlobalService,
    private chartDataTransformer: ChartDataTransformerService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.buildExportMenu();
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.dashboardId = params['id'];
        if (this.dashboardId) {
          this._dashboardService.resetCurrent();
          this.loadDashboard();
        }
      });
  }

  ngAfterViewInit(): void {
    this.trySetupCanvas();
  }

  // ── Share + export ───────────────────────────────────────────────

  /** Open the public-embed share-links dialog. */
  openShare(): void {
    if (!this.dashboardId) return;
    this.shareVisible = true;
  }

  private buildExportMenu(): void {
    this.exportItems = [
      {
        label: this.translate.instant('DASHBOARD.EXPORT.PNG'),
        icon: 'pi pi-image',
        command: () => void this.onExportPng(),
      },
      {
        label: this.translate.instant('DASHBOARD.EXPORT.PDF'),
        icon: 'pi pi-file-pdf',
        command: () => void this.onExportPdf(),
      },
      {
        label: this.translate.instant('DASHBOARD.EXPORT.CSV'),
        icon: 'pi pi-file-excel',
        command: () => this.onExportCsv(),
      },
    ];
  }

  private get exportTitle(): string {
    return this.dashboard?.name || 'dashboard';
  }

  async onExportPng(): Promise<void> {
    const node = this.canvasContainer?.nativeElement;
    if (!node || this.exporting) return;
    this.exporting = true;
    this.cdr.markForCheck();
    try {
      await exportDashboardPng(node, this.exportTitle);
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  async onExportPdf(): Promise<void> {
    const node = this.canvasContainer?.nativeElement;
    if (!node || this.exporting) return;
    this.exporting = true;
    this.cdr.markForCheck();
    try {
      await exportDashboardPdf(node, this.exportTitle);
    } finally {
      this.exporting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Export the raw row set backing the dashboard as CSV. Uses the loaded
   * rows (post-filter) so the download matches what's on screen.
   */
  onExportCsv(): void {
    const rows = Array.isArray(this.rawData) ? this.rawData : [];
    if (!rows.length) return;
    exportRowsCsv(rows as Array<Record<string, unknown>>, this.exportTitle);
  }

  ngOnDestroy(): void {
    // Abort in-flight reads if the user navigates away.
    this._dashboardService.cancelReads();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    clearTimeout(this.resizeDebounceTimer);
    this.stopAutoRefresh();
  }

  private trySetupCanvas(): void {
    if (this.canvasContainer?.nativeElement) {
      this.updateCanvasDimensions();
      this.lastStableWidth = this.canvasWidth;
      this.lastStableHeight = this.canvasHeight;
      this.recalculateAllVisualDimensions();
      this.setupResizeObserver();
    }
  }

  private setupResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.canvasContainer?.nativeElement) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeDebounceTimer) {
          clearTimeout(this.resizeDebounceTimer);
        }
        this.resizeDebounceTimer = setTimeout(() => {
          this.handleResize();
        }, 100);
      });
      this.resizeObserver.observe(this.canvasContainer.nativeElement);
    }
  }

  private handleResize(): void {
    if (!this.canvasContainer?.nativeElement) return;

    const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
    const newWidth = rect.width || 1000;
    const newHeight = rect.height || 600;

    const THRESHOLD = 10;
    const widthChanged = Math.abs(newWidth - this.lastStableWidth) > THRESHOLD;
    const heightChanged =
      Math.abs(newHeight - this.lastStableHeight) > THRESHOLD;

    if (widthChanged || heightChanged) {
      this.lastStableWidth = newWidth;
      this.lastStableHeight = newHeight;
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }
  }

  // ── Data Loading ──

  loadDashboard(): void {
    this._dashboardService
      .render(this.dashboardId)
      .then(() => {
        const data = this._dashboardService.rendered();
        if (data) {
          this.dashboard = data;
          this.filters = data.filters || [];
          // Additive fields from the hardened render endpoint — default
          // safely when an older BE omits them.
          this.serverWarnings = Array.isArray(data.warnings)
            ? data.warnings
            : [];
          this.fieldsChecked = data.fieldsChecked === true;
          this.meta = data.meta || null;
          this.warningsExpanded = false;

          // Dashboard & Analysis v2 additive render fields.
          this.tabs = Array.isArray(data.tabs) ? data.tabs : [];
          this.activeTabId = this.tabs.length > 0 ? this.tabs[0].id : null;
          this.widgets = Array.isArray(data.widgets) ? data.widgets : [];
          this.parameters = Array.isArray(data.parameters)
            ? data.parameters
            : [];
          this.mandatoryFilters = Array.isArray(data.mandatoryFilters)
            ? data.mandatoryFilters
            : [];
          this.requiresPreloadGate = data.requiresPreloadGate === true;
          this.autoRefreshSeconds =
            typeof data.autoRefreshSeconds === 'number' &&
            data.autoRefreshSeconds > 0
              ? data.autoRefreshSeconds
              : null;

          this.crossFilter.clear();
          this.mapVisualsFromResponse(data.visuals || []);

          // Blocking gate: withhold every query until the viewer submits
          // the required inputs. Otherwise run immediately + arm refresh.
          if (this.requiresPreloadGate) {
            this.gateOpen = true;
            this.stopAutoRefresh();
            this.cdr.markForCheck();
          } else {
            this.gateOpen = false;
            this.executeQuery();
            this.startAutoRefresh();
          }
        } else {
          this.cdr.markForCheck();
        }
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  mapVisualsFromResponse(apiVisuals: any[]): void {
    this.visuals = apiVisuals.map((v: any) => {
      const widthRatio = parseFloat(v.widthRatio) || 0.5;
      const heightRatio = parseFloat(v.heightRatio) || 0.45;
      const xRatio = parseFloat(v.xRatio) || 0;
      const yRatio = parseFloat(v.yRatio) || 0;

      const colSpan = Math.max(1, Math.round(widthRatio * this.GRID_COLUMNS));
      const rowSpan = Math.max(1, Math.round(heightRatio * this.GRID_ROWS));

      const visual: Visual = {
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
        gridCol: 0,
        gridRow: 0,
        chartType: v.visualConfig?.chartType || null,
        xAxisColumn: v.visualConfig?.xAxisColumn || null,
        yAxisColumn: v.visualConfig?.yAxisColumn || null,
        zAxisColumn: v.visualConfig?.config?.zAxisColumn || null,
        chartData: [],
        config: v.visualConfig?.config || {},
        // Owning tab (multi-tab render). null = default/implicit tab.
        tabId: v.tabId ?? null,
        loading: true,
        loaded: false,
        error: false,
      };

      return visual;
    });

    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
  }

  // ── Tabs ──────────────────────────────────────────────────────────

  /** True when a visible tab strip should render (>1 tab). */
  get showTabStrip(): boolean {
    return this.tabs.length > 1;
  }

  /** Visuals belonging to the active tab (all when single/implicit). */
  get visibleVisuals(): Visual[] {
    if (!this.showTabStrip) return this.visuals;
    return this.visuals.filter(
      v => (v.tabId ?? null) === this.activeTabId,
    );
  }

  /** Widgets belonging to the active tab. */
  get visibleWidgets(): DashboardWidget[] {
    if (!this.showTabStrip) return this.widgets;
    return this.widgets.filter(
      w => (w.tabId ?? null) === this.activeTabId,
    );
  }

  /** True when the active tab has neither visuals nor widgets. */
  get activeTabEmpty(): boolean {
    return this.visibleVisuals.length === 0 && this.visibleWidgets.length === 0;
  }

  selectTab(tabId: string): void {
    if (this.activeTabId === tabId) return;
    this.activeTabId = tabId;
    // A cross-filter is scoped to the tab it was raised on; switching
    // tabs clears it so the new tab starts clean.
    if (this.crossFilter.isActive()) {
      this.crossFilter.clear();
    }
    this.cdr.markForCheck();
    // Re-place + re-measure the now-visible grid after the DOM updates.
    setTimeout(() => {
      this.placeVisualsOnGrid();
      this.recalculateAllVisualDimensions();
    }, 0);
  }

  trackByTabId(_i: number, t: any): string {
    return t.id;
  }

  trackByWidgetId(_i: number, w: DashboardWidget): string {
    return w.id;
  }

  /** Grid placement (col/row span) for a widget from its ratios. */
  widgetColSpan(w: DashboardWidget): number {
    const r = parseFloat(String(w.widthRatio)) || 0.25;
    return Math.max(1, Math.round(r * this.GRID_COLUMNS));
  }
  widgetRowSpan(w: DashboardWidget): number {
    const r = parseFloat(String(w.heightRatio)) || 0.2;
    return Math.max(1, Math.round(r * this.GRID_ROWS));
  }

  /**
   * The effective run-query filter set for ONE visual: the dashboard's
   * applied filters + the pre-load gate's mandatory filters + this
   * visual's cross-filter contribution (empty unless it's a target of an
   * active cross-filter). Base filters apply to every visual; only the
   * cross-filter part differs per visual, which is what lets a click
   * constrain just the configured target set.
   */
  private effectiveFiltersFor(visual: Visual, base: any[]): any[] {
    return [
      ...base,
      ...this.preloadFilterValues,
      ...this.crossFilter.filtersFor(visual),
    ];
  }

  /**
   * Run the dashboard query and paint the visuals. When no cross-filter
   * is active every visual shares one filter set → a single run (the
   * common, cheap case, identical to before). When a cross-filter IS
   * active, visuals are grouped by their effective filter signature so
   * targets (extra predicate) and non-targets (base only) each run once,
   * and every result is fanned back to its own visuals.
   */
  executeQuery(filters?: any[]): void {
    if (!this.dashboard) return;
    // Never run while the blocking gate is up.
    if (this.gateOpen) return;

    // Stamp this call with a fresh id and capture it locally; any
    // older in-flight queries will see their captured id no longer
    // matches currentQueryId on resolve and will short-circuit.
    const queryId = ++this.currentQueryId;

    this.isDataLoading.set(true);

    this.visuals.forEach(v => {
      v.loading = true;
      v.loaded = false;
      v.error = false;
    });

    // Base applied filters: an explicit arg overrides; `undefined` means
    // "no filter change" (keep the current appliedFilters); an empty
    // array clears them.
    if (filters && filters.length > 0) {
      this.appliedFilters = filters;
    } else if (filters && filters.length === 0) {
      this.appliedFilters = [];
    } else if (!filters) {
      // keep this.appliedFilters as-is (auto-refresh / cross-filter re-run)
    }
    const base = this.appliedFilters || [];

    // Group visuals by their effective-filter signature so identical
    // queries run once. `limit: -1` → BE returns the full population
    // (consumption surface; a sampled cap would distort aggregates).
    const groups = new Map<string, { filters: any[]; visuals: Visual[] }>();
    for (const v of this.visuals) {
      const eff = this.effectiveFiltersFor(v, base);
      const sig = JSON.stringify(eff);
      const g = groups.get(sig);
      if (g) g.visuals.push(v);
      else groups.set(sig, { filters: eff, visuals: [v] });
    }

    const runs = Array.from(groups.values()).map(group => {
      const payload: any = { dashboardId: this.dashboard.id, limit: -1 };
      if (group.filters.length > 0) payload.filters = group.filters;
      // Pre-load gate parameter values feed the substitution on every run.
      if (this.preloadParamValues.length > 0) {
        payload.paramValues = this.preloadParamValues;
      }
      return this._dashboardService
        .runQuery(payload)
        .then(response => ({ group, response, ok: true as const }))
        .catch(() => ({ group, response: null, ok: false as const }));
    });

    Promise.all(runs)
      .then(results => {
        // Stale response — a newer executeQuery has already fired.
        if (queryId !== this.currentQueryId) return;
        this.isDataLoading.set(false);

        // Keep the first successful group's rows as the "dashboard rawData"
        // (drives CSV export + KPI widgets). Cross-filtered groups don't
        // change the export baseline.
        let baselineSet = false;

        for (const r of results) {
          if (
            r.ok &&
            r.response &&
            this.globalService.handleSuccessService(r.response, false)
          ) {
            const rows = r.response.data || [];
            if (!baselineSet) {
              this.rawData = rows;
              baselineSet = true;
            }
            for (const v of r.group.visuals) this.paintVisual(v, rows);
          } else {
            for (const v of r.group.visuals) {
              v.loading = false;
              v.error = true;
            }
          }
        }

        this.cdr.markForCheck();
        // Canvas container is behind *ngIf, set up observer after DOM renders
        setTimeout(() => this.trySetupCanvas(), 0);
      })
      .catch(() => {
        if (queryId !== this.currentQueryId) return;
        this.isDataLoading.set(false);
        this.visuals.forEach(v => {
          v.loading = false;
          v.error = true;
        });
        this.cdr.markForCheck();
        setTimeout(() => this.trySetupCanvas(), 0);
      });
  }

  /** Transform + paint one visual from its own (possibly targeted) rows. */
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
    visual.loading = false;
    visual.loaded = true;
  }

  transformAllVisuals(): void {
    this.visuals.forEach(visual => this.paintVisual(visual, this.rawData));
    this.cdr.markForCheck();
  }

  // ── Filter Handlers ──

  onFiltersApplied(filters: any[]): void {
    this.executeQuery(filters);
  }

  onFiltersCleared(): void {
    // Explicit clear — pass an empty array so executeQuery resets the
    // applied filters (an `undefined` arg means "keep current").
    this.executeQuery([]);
  }

  onRefresh(): void {
    // Re-run with the current applied filters + cross-filter state.
    this.executeQuery();
  }

  // ── Pre-load gate (Track C3) ────────────────────────────────────────

  /**
   * The gate submitted valid inputs. Store the parameter + filter values,
   * hide the gate, run every query with them, and arm auto-refresh.
   */
  onGateSubmit(result: PreloadGateResult): void {
    this.preloadParamValues = result.paramValues || [];
    this.preloadFilterValues = result.filterValues || [];
    // Seed maps so re-opening restores the same inputs.
    this.gateSeedParams = this.preloadParamValues;
    this.gateSeedFilters = {};
    for (const fv of this.preloadFilterValues) {
      if (fv?.filterId) {
        this.gateSeedFilters[fv.filterId] =
          fv.values?.[0] ?? fv.rangeMin ?? fv.dateRangeStart ?? null;
      }
    }
    this.gateOpen = false;
    this.cdr.markForCheck();
    this.executeQuery();
    this.startAutoRefresh();
  }

  /** Re-open the blocking gate ("Edit inputs"); pauses auto-refresh. */
  editInputs(): void {
    this.gateOpen = true;
    this.stopAutoRefresh();
    this.cdr.markForCheck();
  }

  // ── Cross-filter (Track E2) ─────────────────────────────────────────

  /** True when a visual has cross-filter opt-in (drives the click cursor). */
  isCrossFilterSource(visual: Visual): boolean {
    return DashboardCrossFilter.isEnabled(visual);
  }

  /**
   * A visual emitted a data-point click. If it's cross-filter-enabled,
   * resolve the clicked value, set the active cross-filter, and re-run
   * only the configured target visuals.
   */
  onVisualChartSelect(visual: Visual, event: any): void {
    if (!DashboardCrossFilter.isEnabled(visual)) return;
    const value = this.extractClickedValue(event);
    const column = visual.xAxisColumn;
    if (this.crossFilter.apply(visual, column, value)) {
      this.executeQuery();
      this.cdr.markForCheck();
    }
  }

  /** Clear the active cross-filter and restore all visuals. */
  clearCrossFilter(): void {
    if (!this.crossFilter.isActive()) return;
    this.crossFilter.clear();
    this.executeQuery();
    this.cdr.markForCheck();
  }

  get hasActiveCrossFilter(): boolean {
    return this.crossFilter.isActive();
  }

  /** Human summary of the active cross-filter for the chip label. */
  get crossFilterLabel(): string {
    const cf = this.crossFilter.current();
    if (!cf) return '';
    return `${cf.columnName}: ${cf.value}`;
  }

  /**
   * Pull the clicked category out of the ECharts click payload
   * (`{ name, value }`) or a table row (`{ row }`).
   */
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

  // ── Auto-refresh (Track E4) ─────────────────────────────────────────

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    if (!this.autoRefreshSeconds || this.autoRefreshSeconds <= 0) return;
    this.autoRefreshCountdown = this.autoRefreshSeconds;
    // Re-run on the interval; pause implicitly while the gate is open
    // (the tick short-circuits because executeQuery bails when gateOpen).
    this.autoRefreshTimer = setInterval(() => {
      if (this.gateOpen) return;
      this.autoRefreshCountdown = this.autoRefreshSeconds!;
      this.executeQuery();
    }, this.autoRefreshSeconds * 1000);
    // 1s visible countdown for the indicator.
    this.countdownTimer = setInterval(() => {
      if (this.gateOpen) return;
      this.autoRefreshCountdown = Math.max(0, this.autoRefreshCountdown - 1);
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  get autoRefreshActive(): boolean {
    return !!this.autoRefreshSeconds && this.autoRefreshSeconds > 0;
  }

  // ── Schedule delivery (Track E4) ────────────────────────────────────

  openSchedule(): void {
    if (!this.dashboardId) return;
    this.scheduleVisible = true;
  }

  // ── Grid Layout ──

  private updateCanvasDimensions(): void {
    if (this.canvasContainer?.nativeElement) {
      const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
      this.canvasWidth = rect.width || 1000;
      this.canvasHeight = rect.height || 600;

      const CANVAS_PADDING = 40;
      const availableHeight = this.canvasHeight - CANVAS_PADDING;
      this.dynamicRowHeight = Math.max(
        30,
        Math.floor(
          (availableHeight - (this.GRID_ROWS - 1) * this.GRID_GAP) /
            this.GRID_ROWS,
        ),
      );

      this.canvasContainer.nativeElement.style.setProperty(
        '--dynamic-row-height',
        `${this.dynamicRowHeight}px`,
      );
    }
  }

  private recalculateAllVisualDimensions(): void {
    this.visuals.forEach(visual => {
      this.computeVisualDimensions(visual);
    });
    this.cdr.markForCheck();
  }

  private computeVisualDimensions(visual: Visual): void {
    const CANVAS_PADDING = 40;
    const SCROLLBAR_WIDTH = 17;
    const contentWidth = Math.max(
      0,
      this.canvasWidth - CANVAS_PADDING - SCROLLBAR_WIDTH,
    );
    const fr =
      (contentWidth - (this.GRID_COLUMNS - 1) * this.GRID_GAP) /
      this.GRID_COLUMNS;
    visual.width = Math.max(
      100,
      Math.round(visual.colSpan * fr + (visual.colSpan - 1) * this.GRID_GAP),
    );
    visual.height = Math.max(
      100,
      Math.round(
        visual.rowSpan * this.dynamicRowHeight +
          (visual.rowSpan - 1) * this.GRID_GAP,
      ),
    );
  }

  private placeVisualsOnGrid(): void {
    const occupied = new Set<string>();
    for (const visual of this.visuals) {
      const colSpan = Math.min(visual.colSpan, this.GRID_COLUMNS);
      let placed = false;
      for (let row = 0; !placed && row < 500; row++) {
        for (let col = 0; col <= this.GRID_COLUMNS - colSpan; col++) {
          if (this.canPlaceAt(occupied, row, col, colSpan, visual.rowSpan)) {
            visual.gridRow = row;
            visual.gridCol = col;
            this.markGridCells(occupied, row, col, colSpan, visual.rowSpan);
            placed = true;
            break;
          }
        }
      }
    }
  }

  private canPlaceAt(
    occupied: Set<string>,
    row: number,
    col: number,
    colSpan: number,
    rowSpan: number,
  ): boolean {
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        if (occupied.has(`${r},${c}`)) return false;
      }
    }
    return true;
  }

  private markGridCells(
    occupied: Set<string>,
    row: number,
    col: number,
    colSpan: number,
    rowSpan: number,
  ): void {
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        occupied.add(`${r},${c}`);
      }
    }
  }

  // ── Chart Helpers ──

  /**
   * Columns this visual is bound to that no longer exist in the
   * rebound data. See the helper in charts.constants.ts for the
   * full rationale. Surfaces a clear "field missing" empty state
   * instead of letting the chart fall through to a misleading empty paint.
   */
  getMissingFields(visual: Visual): string[] {
    const sample = this.rawData?.[0];
    return getMissingFieldsForVisual(visual, sample);
  }

  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;
    // A bound column no longer exists in the rebound data → not
    // renderable. The template surfaces a distinct viewer-facing
    // empty-state telling them to contact the dashboard owner.
    if (this.getMissingFields(visual).length > 0) return false;
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    if (isLines3dChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn);
    }
    if (!hasAxisLabels(visual.chartType)) {
      return !!(visual.xAxisColumn || visual.yAxisColumn);
    }
    if (
      isHeatMapChartType(visual.chartType) ||
      isSankeyChartType(visual.chartType) ||
      isGraphChartType(visual.chartType)
    ) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  getDisplayData(visual: Visual): any {
    // Always return the real (possibly empty) data. Dummy/sample
    // rows were removed from the runtime path because they triggered
    // misleading tooltips on phantom values and persisted after the
    // underlying column was deleted. Empty-state UX is owned by the
    // template's missing-field and no-config branches.
    return visual?.chartData ?? [];
  }

  trackByVisualId(index: number, visual: Visual): string {
    return visual.id;
  }

  // ── Missing-field banner ──

  /**
   * Show the dashboard-level banner only when the BE actually checked
   * the live columns AND found at least one dropped reference. When
   * detection couldn't run (fieldsChecked=false) we stay silent — the
   * per-visual placeholder still guards individual charts from painting
   * bogus data off the loaded sample.
   */
  get hasFieldWarnings(): boolean {
    return this.fieldsChecked && this.serverWarnings.length > 0;
  }

  /** Total number of distinct columns flagged as missing across all
   *  references — drives the banner's summary count. */
  get missingFieldCount(): number {
    const cols = new Set<string>();
    for (const w of this.serverWarnings) {
      for (const c of w.missingColumns || []) cols.add(c);
    }
    return cols.size;
  }

  toggleWarnings(): void {
    this.warningsExpanded = !this.warningsExpanded;
    this.cdr.markForCheck();
  }

  /** i18n key for a warning row's scope, so the banner can label each
   *  entry ("Visual" / "Filter" / "Field"). */
  scopeLabelKey(scope: string): string {
    switch (scope) {
      case 'visual':
        return 'DASHBOARD.WARNING_SCOPE_VISUAL';
      case 'filter':
        return 'DASHBOARD.WARNING_SCOPE_FILTER';
      default:
        return 'DASHBOARD.WARNING_SCOPE_FIELD';
    }
  }

  trackByWarning(
    index: number,
    w: { scope: string; id: string },
  ): string {
    return `${w.scope}:${w.id}`;
  }

  // ── Navigation ──

  goBack(): void {
    this.router.navigate([DB_ROUTES.LIST]);
  }
}
