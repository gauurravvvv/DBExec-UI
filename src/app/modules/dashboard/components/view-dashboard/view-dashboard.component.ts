import { ChangeDetectionStrategy, AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild, } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DASHBOARD as DB_ROUTES } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DashboardService } from '../../services/dashboard.service';
import { AnalysesService } from '../../../analyses/service/analyses.service';
import { ChartDataTransformerService } from '../../../analyses/services/chart-data-transformer.service';
import { Visual } from '../../../analyses/models/visual.model';
import {
  isBarChartType,
  isLineChartType,
  isAreaChartType,
  isPieChartType,
  isGaugeChartType,
  isCardChartType,
  isHeatMapChartType,
  isTreeMapChartType,
  isPolarChartType,
  isBubbleChartType,
  isBoxChartType,
  isScatterChartType,
  isFunnelChartType,
  isSankeyChartType,
  isSunburstChartType,
  isWaterfallChartType,
  isGraphChartType,
  isTreeChartType,
  isThemeRiverChartType,
  isPictorialBarChartType,
  isPolarBarChartType,
  isRadarChartType,
  isCandlestickChartType,
  isParallelChartType,
  isBar3dChartType,
  isLine3dChartType,
  isScatter3dChartType,
  isSurfaceChartType,
  isGlobeChartType,
  isGraphGlChartType,
  isScatterGlChartType,
  isLinesGlChartType,
  isMap3dChartType,
  isFlowGlChartType,
  isWorldMapChartType,
  isFlowLinesChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  is3DCoordinateChartType,
  hasAxisLabels,
  getDummyData,
} from '../../../analyses/constants/charts.constants';

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
  loading  = this._dashboardService.loading;

  orgId = '';
  dashboardId = '';
  dashboard: any = null;
  visuals: Visual[] = [];
  filters: any[] = [];
  rawData: any[] = [];
  appliedFilters: any[] = [];

  isDataLoading = signal(false);

  // Filter sidebar
  isFilterSidebarOpen = false;

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

  // Chart type checkers as class properties
  isBarChartType = isBarChartType;
  isLineChartType = isLineChartType;
  isAreaChartType = isAreaChartType;
  isPieChartType = isPieChartType;
  isGaugeChartType = isGaugeChartType;
  isCardChartType = isCardChartType;
  isHeatMapChartType = isHeatMapChartType;
  isTreeMapChartType = isTreeMapChartType;
  isPolarChartType = isPolarChartType;
  isBubbleChartType = isBubbleChartType;
  isBoxChartType = isBoxChartType;
  isScatterChartType = isScatterChartType;
  isFunnelChartType = isFunnelChartType;
  isSankeyChartType = isSankeyChartType;
  isSunburstChartType = isSunburstChartType;
  isWaterfallChartType = isWaterfallChartType;
  isGraphChartType = isGraphChartType;
  isTreeChartType = isTreeChartType;
  isThemeRiverChartType = isThemeRiverChartType;
  isPictorialBarChartType = isPictorialBarChartType;
  isPolarBarChartType = isPolarBarChartType;
  isRadarChartType = isRadarChartType;
  isCandlestickChartType = isCandlestickChartType;
  isParallelChartType = isParallelChartType;
  isBar3dChartType = isBar3dChartType;
  isLine3dChartType = isLine3dChartType;
  isScatter3dChartType = isScatter3dChartType;
  isSurfaceChartType = isSurfaceChartType;
  isGlobeChartType = isGlobeChartType;
  isGraphGlChartType = isGraphGlChartType;
  isScatterGlChartType = isScatterGlChartType;
  isLinesGlChartType = isLinesGlChartType;
  isMap3dChartType = isMap3dChartType;
  isFlowGlChartType = isFlowGlChartType;
  isWorldMapChartType = isWorldMapChartType;
  isFlowLinesChartType = isFlowLinesChartType;
  isLines3dChartType = isLines3dChartType;
  isPolygons3dChartType = isPolygons3dChartType;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private chartDataTransformer: ChartDataTransformerService,
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.orgId = params['orgId'];
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
      .render(this.orgId, this.dashboardId)
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
        title: v.title || 'Untitled Visual',
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

    this.isDataLoading.set(true);

    this.visuals.forEach(v => {
      v.loading = true;
      v.loaded = false;
      v.error = false;
    });

    const payload: any = {
      datasetId: this.dashboard.datasetId,
      analysisId: this.dashboard.analysisId,
      organisation: this.orgId,
      limit: 1000,
    };

    if (filters && filters.length > 0) {
      payload.filters = filters;
      this.appliedFilters = filters;
    } else if (!filters) {
      this.appliedFilters = [];
    }

    this.analysesService
      .runAnalysisQuery(payload)
      .then(response => {
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
        this.cdr.detectChanges();
        // Canvas container is behind *ngIf, set up observer after DOM renders
        setTimeout(() => this.trySetupCanvas(), 0);
      })
      .catch(() => {
        this.isDataLoading.set(false);
        this.visuals.forEach(v => {
          v.loading = false;
          v.error = true;
        });
        this.cdr.detectChanges();
        setTimeout(() => this.trySetupCanvas(), 0);
      });
  }

  transformAllVisuals(): void {
    this.visuals.forEach(visual => {
      if (visual.chartType && visual.xAxisColumn && visual.yAxisColumn) {
        const mapping = {
          xAxisColumn: visual.xAxisColumn,
          yAxisColumn: visual.yAxisColumn,
          zAxisColumn: visual.zAxisColumn || null,
        };
        visual.chartData = this.chartDataTransformer.transformData(
          visual.chartType,
          this.rawData,
          mapping,
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

  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;
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
    if (visual?.chartData?.length) {
      return visual.chartData;
    }
    return getDummyData(visual?.chartType || '');
  }

  trackByVisualId(index: number, visual: Visual): string {
    return visual.id;
  }

  // ── Filter Sidebar ──

  toggleFilterSidebar(): void {
    this.isFilterSidebarOpen = !this.isFilterSidebarOpen;
    // Recalculate after sidebar transition completes
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350);
  }

  // ── Navigation ──

  goBack(): void {
    this.router.navigate([DB_ROUTES.LIST]);
  }
}
