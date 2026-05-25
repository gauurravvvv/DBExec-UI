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
import { DASHBOARD as DB_ROUTES } from 'src/app/core/constants/routes.constant';
import { GlobalService } from 'src/app/core/services/global.service';
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
import { ChartDataTransformerService } from '../../../analyses/services/chart-data-transformer.service';
import { DashboardService } from '../../services/dashboard.service';

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

  // Signal refs from service
  rendered = this._dashboardService.rendered;
  loading = this._dashboardService.loading;

  dashboardId = '';
  dashboard: any = null;
  visuals: Visual[] = [];
  filters: any[] = [];
  rawData: any[] = [];
  appliedFilters: any[] = [];

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private globalService: GlobalService,
    private chartDataTransformer: ChartDataTransformerService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
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

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    clearTimeout(this.resizeDebounceTimer);
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
          this.mapVisualsFromResponse(data.visuals || []);
          this.executeQuery();
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
        loading: true,
        loaded: false,
        error: false,
      };

      return visual;
    });

    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
  }

  executeQuery(filters?: any[]): void {
    if (!this.dashboard) return;

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

    // limit: -1 tells the BE to skip the LIMIT wrap entirely and
    // return the full result set. Dashboards are consumption surfaces
    // where the user expects "real" totals/averages/proportions over
    // the complete population — a sampled cap would silently distort
    // every aggregate they see. Edit Analysis still uses the default
    // cap (1000) because that surface is for building charts, where a
    // representative sample is sufficient and faster to iterate on.
    // Post-snapshot: dashboards run their own snapshotted SQL via
    // /dashboard/run instead of poking the live analyses endpoint.
    // Source analysis edits no longer affect dashboard query results.
    const payload: any = {
      dashboardId: this.dashboard.id,
      limit: -1,
    };

    if (filters && filters.length > 0) {
      payload.filters = filters;
      this.appliedFilters = filters;
    } else if (!filters) {
      this.appliedFilters = [];
    }

    this._dashboardService
      .runQuery(payload)
      .then(response => {
        // Stale response — a newer executeQuery has already fired
        // since this one was issued. Drop the result silently so
        // we don't overwrite fresher chart data.
        if (queryId !== this.currentQueryId) return;

        this.isDataLoading.set(false);

        if (this.globalService.handleSuccessService(response, false)) {
          this.rawData = response.data || [];
          this.transformAllVisuals();
        } else {
          this.visuals.forEach(v => {
            v.loading = false;
            v.error = true;
          });
        }
        this.cdr.markForCheck();
        // Canvas container is behind *ngIf, set up observer after DOM renders
        setTimeout(() => this.trySetupCanvas(), 0);
      })
      .catch(() => {
        // Same staleness guard on the error path — don't flash an
        // error banner from a superseded query.
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

  transformAllVisuals(): void {
    this.visuals.forEach(visual => {
      if (visual.chartType && visual.xAxisColumn && visual.yAxisColumn) {
        visual.chartData = this.chartDataTransformer.transformData(
          visual.chartType,
          this.rawData,
          this.chartDataTransformer.buildMapping(visual),
        ) as any[];
        visual.loading = false;
        visual.loaded = true;
      } else {
        visual.chartData = [];
        visual.loading = false;
        visual.loaded = true;
      }
    });
    this.cdr.markForCheck();
  }

  // ── Filter Handlers ──

  onFiltersApplied(filters: any[]): void {
    this.executeQuery(filters);
  }

  onFiltersCleared(): void {
    this.executeQuery();
  }

  onRefresh(): void {
    if (this.appliedFilters.length > 0) {
      this.executeQuery(this.appliedFilters);
    } else {
      this.executeQuery();
    }
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

  // ── Navigation ──

  goBack(): void {
    this.router.navigate([DB_ROUTES.LIST]);
  }
}
