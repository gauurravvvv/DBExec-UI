import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  LEGEND_POSITIONS,
  getDefaultChartConfig,
  is3DCoordinateChartType,
  isBarChartType,
  isLineChartType,
  isAreaChartType,
  isPieChartType,
  isGaugeChartType,
  isCardChartType,
  isHeatMapChartType,
  isTreeMapChartType,
  isBubbleChartType,
  isBoxChartType,
  isPolarChartType,
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
  hasAxisLabels,
  supportsGradient,
} from '../../constants/charts.constants';
import { ChartDataTransformerService } from '../../services';
import { AnalysesService } from '../../service/analyses.service';
import { ANALYSES } from 'src/app/constants/routes';
import {
  AddAnalysesActions,
  selectDatasetData,
  selectDatasetStatus,
  selectIsDatasetLoaded,
} from '../../store';

@Component({
  selector: 'app-view-analyses',
  templateUrl: './view-analyses.component.html',
  styleUrls: ['./view-analyses.component.scss'],
})
export class ViewAnalysesComponent implements OnInit, AfterViewInit, OnDestroy {
  analysisId: string = '';
  orgId: string = '';
  databaseId: string = '';
  datasetId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;
  showDeleteConfirm = false;
  activeFilters: any[] = [];

  // Sidebar toggle states
  isFieldsPanelOpen: boolean = true;
  isVisualsPanelOpen: boolean = true;

  // Visuals (read-only)
  visuals: any[] = [];
  visualCounter: number = 0;

  // NgRx Store Observables
  graphData$!: Observable<any[] | null>;
  datasetStatus$!: Observable<string>;
  isDataLoaded$!: Observable<boolean>;

  // Raw data from dataset query
  rawGraphData: any[] = [];

  // Available chart types
  chartTypes = CHART_TYPES;

  // Color schemes
  colorSchemes = COLOR_SCHEMES;

  // Legend positions
  legendPositions = LEGEND_POSITIONS;

  // Maximized visual
  maximizedVisual: any = null;

  // Canvas container reference and dimensions for responsive sizing
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth: number = 1000; // Default fallback
  canvasHeight: number = 600; // Default fallback

  // Grid layout constants
  private readonly GRID_COLUMNS = 24;
  private readonly ROW_HEIGHT = 50;
  private readonly GRID_GAP = 12;

  // Reference canvas size for legacy visuals (pixels to ratio conversion)
  private readonly REFERENCE_CANVAS_WIDTH = 1200;
  private readonly REFERENCE_CANVAS_HEIGHT = 600;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store,
    private cdr: ChangeDetectorRef,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private chartDataTransformer: ChartDataTransformerService,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.orgId = params['orgId'];
      this.analysisId = params['id'];
      if (this.analysisId) {
        this.loadAnalysis();
      }
    });
  }

  ngAfterViewInit(): void {
    // Get initial canvas dimensions after view is initialized
    setTimeout(() => this.updateCanvasDimensions(), 0);
    // Set up ResizeObserver to detect canvas size changes from any source
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  /**
   * Setup ResizeObserver to detect canvas size changes
   * Handles: main sidebar toggle, internal sidebars, window resize
   */
  private setupResizeObserver(): void {
    if (
      typeof ResizeObserver !== 'undefined' &&
      this.canvasContainer?.nativeElement
    ) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasDimensions();
        this.recalculateAllVisualDimensions();
      });
      this.resizeObserver.observe(this.canvasContainer.nativeElement);
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    // Note: ResizeObserver will also fire, so we don't need to duplicate here
  }

  /**
   * Update canvas dimensions from the container element
   */
  private updateCanvasDimensions(): void {
    if (this.canvasContainer?.nativeElement) {
      const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
      this.canvasWidth = rect.width || 1000;
      this.canvasHeight = rect.height || 600;
    }
  }

  /**
   * Recalculate all visual pixel dimensions from their ratios
   */
  private recalculateAllVisualDimensions(): void {
    this.placeVisualsOnGrid();
    this.visuals.forEach(visual => {
      this.computeVisualDimensions(visual);
    });
    this.cdr.detectChanges();
  }

  /**
   * Compute pixel dimensions from grid span values for a single visual.
   * Uses CSS Grid math: colSpan columns + (colSpan-1) gaps for width,
   * rowSpan rows + (rowSpan-1) gaps for height.
   */
  private computeVisualDimensions(visual: any): void {
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
        visual.rowSpan * this.ROW_HEIGHT + (visual.rowSpan - 1) * this.GRID_GAP,
      ),
    );
    visual.widthRatio = visual.colSpan / this.GRID_COLUMNS;
    visual.heightRatio =
      (visual.rowSpan * this.ROW_HEIGHT) / Math.max(1, this.canvasHeight);
  }

  /**
   * Place visuals on a virtual grid using first-fit algorithm.
   * Assigns gridRow and gridCol to each visual.
   */
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

  /**
   * Calculate ratios from legacy pixel-based visual dimensions
   * Uses reference canvas size for backward compatibility
   */
  private calculateRatiosFromLegacy(visual: any): void {
    const CANVAS_PADDING = 40;
    const GAP = 20;

    // Reference content width (minus padding)
    const referenceContentWidth = this.REFERENCE_CANVAS_WIDTH - CANVAS_PADDING;

    // Estimate how many visuals fit per row based on legacy width
    // Assume 2 per row for default (legacy visuals were typically 50%)
    const estimatedNumPerRow = 2;
    const gapsInRow = estimatedNumPerRow - 1;
    const referenceAvailableForVisuals =
      referenceContentWidth - gapsInRow * GAP;

    visual.widthRatio = visual.width / referenceAvailableForVisuals;
    visual.heightRatio = visual.height / this.REFERENCE_CANVAS_HEIGHT;
    visual.xRatio = (visual.x || 0) / this.REFERENCE_CANVAS_WIDTH;
    visual.yRatio = (visual.y || 0) / this.REFERENCE_CANVAS_HEIGHT;
  }

  loadAnalysis(): void {
    console.log('=== 1. LOADING ANALYSIS DATA ===');
    this.analysesService
      .viewAnalyses(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisDetails = response.data;
          this.databaseId = response.data.databaseId;
          this.datasetId = response.data.datasetId;
          console.log('Analysis loaded. DatasetId:', this.datasetId);

          // Step 2: Load dataset info
          if (this.datasetId) {
            this.loadDatasetInfo();
          }
        }
      });
  }

  /**
   * Step 2: Load dataset info (fields), then initialize store and run query
   */
  loadDatasetInfo(): void {
    console.log('=== 2. LOADING DATASET INFO ===');
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
          console.log(
            'Dataset info loaded. Fields:',
            this.datasetDetails?.datasetFields?.length,
          );

          // Step 3: Initialize store selectors and run data query
          this.initializeStoreSelectors();
        }
      });
  }

  /**
   * Step 3: Initialize NgRx store selectors and run data query
   */
  initializeStoreSelectors(): void {
    console.log('=== 3. INITIALIZING STORE AND RUNNING QUERY ===');

    this.graphData$ = this.store.select(
      selectDatasetData(this.orgId, this.datasetId),
    );
    this.datasetStatus$ = this.store.select(
      selectDatasetStatus(this.orgId, this.datasetId),
    );
    this.isDataLoaded$ = this.store.select(
      selectIsDatasetLoaded(this.orgId, this.datasetId),
    );

    // Subscribe to graphData$ to transform chart data when data arrives
    this.graphData$.subscribe(data => {
      if (data && data.length > 0) {
        this.rawGraphData = data;
        console.log(
          'Data received from store. Rows:',
          this.rawGraphData.length,
        );
        // Transform chart data for all visuals
        this.transformAllVisualsChartData();
        this.cdr.detectChanges();
      }
    });

    // Step 3a: Run the data query
    this.loadDatasetData();

    // Step 4: Load saved visuals (can run in parallel with query)
    this.loadAllVisuals();
  }

  /**
   * Load dataset data by running the dataset query (same as add-analyses)
   */
  loadDatasetData(): void {
    // Dispatch loading action
    this.store.dispatch(
      AddAnalysesActions.loadDatasetData({
        orgId: this.orgId,
        datasetId: this.datasetId,
      }),
    );

    // Actually run the dataset query API
    this.datasetService
      .runDatasetQuery({
        datasetId: this.datasetId,
        organisation: this.orgId,
      })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          console.log('=== VIEW ANALYSES: Query executed successfully ===');
          console.log('Data rows received:', response.data?.length);

          // Dispatch success action with graph data
          this.store.dispatch(
            AddAnalysesActions.loadDatasetDataSuccess({
              orgId: this.orgId,
              datasetId: this.datasetId,
              data: response.data,
            }),
          );
        } else {
          // Dispatch failure action
          this.store.dispatch(
            AddAnalysesActions.loadDatasetDataFailure({
              orgId: this.orgId,
              datasetId: this.datasetId,
              error: response?.message || 'Failed to load graph data',
            }),
          );
        }
      })
      .catch(error => {
        console.error('Error running dataset query:', error);
        this.store.dispatch(
          AddAnalysesActions.loadDatasetDataFailure({
            orgId: this.orgId,
            datasetId: this.datasetId,
            error: error?.message || 'Error loading graph data',
          }),
        );
      });
  }

  /**
   * Transform chart data for all loaded visuals
   */
  transformAllVisualsChartData(): void {
    if (!this.rawGraphData || this.rawGraphData.length === 0) {
      console.log('No raw data available for transformation');
      return;
    }

    console.log('=== TRANSFORMING CHART DATA FOR LOADED VISUALS ===');
    this.visuals.forEach((visual, index) => {
      // Only transform visuals that are loaded (not in skeleton state)
      if (visual.loaded && !visual.chartData?.length) {
        console.log(`Transforming Visual ${index + 1}: ${visual.title}`);
        this.transformSingleVisualChartData(visual);
      }
    });
    console.log('=== END TRANSFORMATION ===');
  }

  /**
   * Step 4: Load visual list as skeletons, then fetch each visual independently
   */
  loadAllVisuals(): void {
    console.log('=== 4. LOADING VISUAL LIST (SKELETON) ===');

    // First, get the list of visuals (for skeleton)
    this.analysesService
      .listVisuals(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const visualsData = response.data.visuals || [];
          console.log('Visual skeletons loaded:', visualsData.length);

          // Create skeleton visuals with loading state
          this.visuals = visualsData.map((visualData: any) => {
            // Extract chart configuration from nested visualConfig object
            const visualConfig = visualData.visualConfig || {};

            const visual: any = {
              id: visualData.id,
              title: visualData.title || 'Loading...',
              x: visualData.x || 0,
              y: visualData.y || 0,
              width: visualData.width || 400,
              height: visualData.height || 350,
              // Extract from nested visualConfig
              chartType: visualConfig.chartType || visualData.chartType || null,
              xAxisColumn:
                visualConfig.xAxisColumn || visualData.xAxisColumn || null,
              yAxisColumn:
                visualConfig.yAxisColumn || visualData.yAxisColumn || null,
              zAxisColumn:
                visualConfig.zAxisColumn || visualData.zAxisColumn || null,
              config: visualConfig.config
                ? { ...getDefaultChartConfig(), ...visualConfig.config }
                : visualData.config
                  ? { ...getDefaultChartConfig(), ...visualData.config }
                  : getDefaultChartConfig(),
              chartData: [],
              loading: true, // Skeleton loading state
              loaded: false,
              // Use saved ratios if available, otherwise calculate from legacy pixels
              widthRatio: visualData.widthRatio || null,
              heightRatio: visualData.heightRatio || null,
              xRatio: visualData.xRatio ?? null,
              yRatio: visualData.yRatio ?? null,
            };

            // If no ratios saved, calculate from legacy pixel dimensions
            if (
              !visual.widthRatio ||
              !visual.heightRatio ||
              visual.xRatio === null ||
              visual.yRatio === null
            ) {
              this.calculateRatiosFromLegacy(visual);
            }

            // Set grid properties from ratios
            if (!visual.colSpan) {
              visual.colSpan = Math.max(
                4,
                Math.min(24, Math.round((visual.widthRatio || 0.5) * 24)),
              );
            }
            if (!visual.rowSpan) {
              visual.rowSpan = Math.max(
                3,
                Math.round(((visual.heightRatio || 0.45) * 600) / 50),
              );
            }
            visual.gridCol = 0;
            visual.gridRow = 0;

            // Compute initial pixel dimensions based on current canvas size
            this.computeVisualDimensions(visual);

            return visual;
          });

          // Place visuals on grid after all are created
          this.placeVisualsOnGrid();

          // Set visual counter
          if (this.visuals.length > 0) {
            this.visualCounter = Math.max(...this.visuals.map(v => v.id), 0);
          }

          this.cdr.detectChanges();

          // Step 5: Fetch each visual independently and plot in real-time
          this.fetchVisualsIndependently();
        }
      });
  }

  /**
   * Step 5: Fetch each visual independently in parallel
   * Plot each visual as soon as its data arrives
   */
  fetchVisualsIndependently(): void {
    console.log('=== 5. FETCHING VISUALS INDEPENDENTLY ===');

    // Create promises for all visuals
    this.visuals.forEach(visual => {
      console.log(`Fetching visual ${visual.id}: ${visual.title}`);

      this.analysesService
        .getVisual(this.orgId, this.analysisId, visual.id)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const visualData = response.data;
            console.log(`Visual ${visual.id} data received`);

            // Find and update the visual in our array
            const visualIndex = this.visuals.findIndex(v => v.id === visual.id);
            if (visualIndex !== -1) {
              // Extract from nested visualConfig (API returns data this way)
              const visualConfig = visualData.visualConfig || {};

              // Update visual with full data
              this.visuals[visualIndex] = {
                ...this.visuals[visualIndex],
                title: visualData.title || this.visuals[visualIndex].title,
                chartType:
                  visualConfig.chartType || visualData.chartType || null,
                xAxisColumn:
                  visualConfig.xAxisColumn || visualData.xAxisColumn || null,
                yAxisColumn:
                  visualConfig.yAxisColumn || visualData.yAxisColumn || null,
                zAxisColumn:
                  visualConfig.zAxisColumn || visualData.zAxisColumn || null,
                config: visualConfig.config
                  ? { ...getDefaultChartConfig(), ...visualConfig.config }
                  : visualData.config
                    ? { ...getDefaultChartConfig(), ...visualData.config }
                    : getDefaultChartConfig(),
                loading: false,
                loaded: true,
              };

              // Transform chart data if rawGraphData is available
              if (this.rawGraphData && this.rawGraphData.length > 0) {
                this.transformSingleVisualChartData(this.visuals[visualIndex]);
              }

              console.log(`Visual ${visual.id} plotted successfully`);
              this.cdr.detectChanges();
            }
          }
        })
        .catch(error => {
          console.error(`Error fetching visual ${visual.id}:`, error);
          // Mark visual as failed
          const visualIndex = this.visuals.findIndex(v => v.id === visual.id);
          if (visualIndex !== -1) {
            this.visuals[visualIndex].loading = false;
            this.visuals[visualIndex].error = true;
            this.cdr.detectChanges();
          }
        });
    });
  }

  /**
   * Transform chart data for a single visual
   */
  transformSingleVisualChartData(visual: any): void {
    if (!this.rawGraphData || this.rawGraphData.length === 0) {
      return;
    }

    if (visual.chartType && visual.xAxisColumn && visual.yAxisColumn) {
      visual.chartData = this.chartDataTransformer.transformData(
        visual.chartType,
        this.rawGraphData,
        {
          xAxisColumn: visual.xAxisColumn,
          yAxisColumn: visual.yAxisColumn,
          zAxisColumn: visual.zAxisColumn,
        },
      );
    }
  }

  onFiltersApplied(filters: any[]): void {
    this.activeFilters = filters;
    this.reloadDataWithFilters();
  }

  onFiltersCleared(): void {
    this.activeFilters = [];
    this.reloadDataWithFilters();
  }

  private reloadDataWithFilters(): void {
    // Dispatch loading action
    this.store.dispatch(
      AddAnalysesActions.loadDatasetData({
        orgId: this.orgId,
        datasetId: this.datasetId,
      }),
    );

    // Re-run query with filters
    this.datasetService
      .runDatasetQuery({
        datasetId: this.datasetId,
        organisation: this.orgId,
        filters: this.activeFilters,
      })
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.store.dispatch(
            AddAnalysesActions.loadDatasetDataSuccess({
              orgId: this.orgId,
              datasetId: this.datasetId,
              data: response.data,
            }),
          );
        }
      })
      .catch((err: any) => {
        console.error('Error running filtered query', err);
        this.store.dispatch(
          AddAnalysesActions.loadDatasetDataFailure({
            orgId: this.orgId,
            datasetId: this.datasetId,
            error: err?.message || 'Filter query failed',
          }),
        );
      });
  }

  goBack(): void {
    this.router.navigate([ANALYSES.LIST]);
  }

  toggleFieldsPanel(): void {
    this.isFieldsPanelOpen = !this.isFieldsPanelOpen;
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  onPublish(): void {
    console.log('Publish analysis:', this.analysisId);
    alert('Publish feature coming soon!');
  }

  onDelete(): void {
    this.showDeleteConfirm = true;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
  }

  proceedDelete(): void {
    this.analysesService
      .deleteAnalyses(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.showDeleteConfirm = false;
          this.router.navigate([ANALYSES.LIST]);
        }
      });
  }

  // Maximize visual for enlarged view
  maximizeVisual(visual: any, event: Event): void {
    event.stopPropagation();
    this.maximizedVisual = visual;
  }

  minimizeVisual(): void {
    this.maximizedVisual = null;
  }

  // Check if visual has required fields for chart
  hasRequiredChartFields(visual: any): boolean {
    if (!visual.chartType) return false;
    // 3D coordinate charts need x + y + z
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    // No-axis charts (pie, gauge, card, funnel, sunburst, etc.) only need one field
    if (!hasAxisLabels(visual.chartType)) {
      return !!(visual.xAxisColumn || visual.yAxisColumn);
    }
    // 3-axis charts need all three fields
    if (
      isHeatMapChartType(visual.chartType) ||
      isSankeyChartType(visual.chartType) ||
      isGraphChartType(visual.chartType)
    ) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  getChartCategories(): string[] {
    const categories = [...new Set(this.chartTypes.map(c => c.category))];
    return categories;
  }

  getChartsByCategory(category: string): any[] {
    return this.chartTypes.filter(c => c.category === category);
  }

  // Wrapper methods for chart type checking
  isBarChartType(chartType: string | null): boolean {
    return isBarChartType(chartType);
  }

  isAreaChartType(chartType: string | null): boolean {
    return isAreaChartType(chartType);
  }

  isPieChartType(chartType: string | null): boolean {
    return isPieChartType(chartType);
  }

  isGaugeChartType(chartType: string | null): boolean {
    return isGaugeChartType(chartType);
  }

  isCardChartType(chartType: string | null): boolean {
    return isCardChartType(chartType);
  }

  isHeatMapChartType(chartType: string | null): boolean {
    return isHeatMapChartType(chartType);
  }

  isTreeMapChartType(chartType: string | null): boolean {
    return isTreeMapChartType(chartType);
  }

  isBubbleChartType(chartType: string | null): boolean {
    return isBubbleChartType(chartType);
  }

  isBoxChartType(chartType: string | null): boolean {
    return isBoxChartType(chartType);
  }

  isPolarChartType(chartType: string | null): boolean {
    return isPolarChartType(chartType);
  }

  isLineChartType(chartType: string | null): boolean {
    return isLineChartType(chartType);
  }

  isScatterChartType(chartType: string | null): boolean {
    return isScatterChartType(chartType);
  }

  isFunnelChartType(chartType: string | null): boolean {
    return isFunnelChartType(chartType);
  }

  isSankeyChartType(chartType: string | null): boolean {
    return isSankeyChartType(chartType);
  }

  isSunburstChartType(chartType: string | null): boolean {
    return isSunburstChartType(chartType);
  }

  isWaterfallChartType(chartType: string | null): boolean {
    return isWaterfallChartType(chartType);
  }

  isGraphChartType(chartType: string | null): boolean {
    return isGraphChartType(chartType);
  }

  isTreeChartType(chartType: string | null): boolean {
    return isTreeChartType(chartType);
  }

  isThemeRiverChartType(chartType: string | null): boolean {
    return isThemeRiverChartType(chartType);
  }

  isPictorialBarChartType(chartType: string | null): boolean {
    return isPictorialBarChartType(chartType);
  }

  isPolarBarChartType(chartType: string | null): boolean {
    return isPolarBarChartType(chartType);
  }

  isRadarChartType(chartType: string | null): boolean {
    return isRadarChartType(chartType);
  }

  isCandlestickChartType(chartType: string | null): boolean {
    return isCandlestickChartType(chartType);
  }

  isParallelChartType(chartType: string | null): boolean {
    return isParallelChartType(chartType);
  }

  isBar3dChartType(chartType: string | null): boolean {
    return isBar3dChartType(chartType);
  }

  isLine3dChartType(chartType: string | null): boolean {
    return isLine3dChartType(chartType);
  }

  isScatter3dChartType(chartType: string | null): boolean {
    return isScatter3dChartType(chartType);
  }

  isSurfaceChartType(chartType: string | null): boolean {
    return isSurfaceChartType(chartType);
  }

  isGlobeChartType(chartType: string | null): boolean {
    return isGlobeChartType(chartType);
  }

  isGraphGlChartType(chartType: string | null): boolean {
    return isGraphGlChartType(chartType);
  }

  isScatterGlChartType(chartType: string | null): boolean {
    return isScatterGlChartType(chartType);
  }

  isLinesGlChartType(chartType: string | null): boolean {
    return isLinesGlChartType(chartType);
  }

  isMap3dChartType(chartType: string | null): boolean {
    return isMap3dChartType(chartType);
  }

  isFlowGlChartType(chartType: string | null): boolean {
    return isFlowGlChartType(chartType);
  }

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  supportsGradient(chartType: string | null): boolean {
    return supportsGradient(chartType);
  }

  supportsLegend(chartType: string | null): boolean {
    // Most charts support legend except cards
    return chartType !== 'card';
  }
}
