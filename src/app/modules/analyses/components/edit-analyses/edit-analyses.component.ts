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
import { ANALYSES } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  CURVE_TYPES,
  LEGEND_POSITIONS,
  getDefaultChartConfig,
  hasAxisLabels,
  isAreaChartType,
  isBarChartType,
  isCardChartType,
  isGaugeChartType,
  isHeatMapChartType,
  isPieChartType,
  isTreeMapChartType,
  supportsGradient,
} from '../../constants/charts.constants';
import { Visual } from '../../models';
import { AnalysesService } from '../../service/analyses.service';
import { ChartDataTransformerService } from '../../services';
import {
  AddAnalysesActions,
  selectDatasetData,
  selectDatasetStatus,
  selectIsDatasetLoaded,
} from '../../store';

@Component({
  selector: 'app-edit-analyses',
  templateUrl: './edit-analyses.component.html',
  styleUrls: ['./edit-analyses.component.scss'],
})
export class EditAnalysesComponent implements OnInit, AfterViewInit, OnDestroy {
  analysisId: string = '';
  orgId: string = '';
  databaseId: string = '';
  datasetId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;

  // Sidebar toggle states
  isFieldsPanelOpen: boolean = true;
  isVisualsPanelOpen: boolean = true;

  // Visuals
  visuals: any[] = [];
  visualCounter: number = 0;
  focusedVisualId: number | null = null;
  resizingVisual: any = null;
  resizeStartX: number = 0;
  resizeStartY: number = 0;
  resizeStartWidth: number = 0;
  resizeStartHeight: number = 0;
  resizeDirection: string = '';
  isResizing: boolean = false;
  isConfigSidebarOpen: boolean = false;
  showSaveDialog: boolean = false;

  // NgRx Store Observables
  graphData$!: Observable<any[] | null>;
  datasetStatus$!: Observable<string>;
  isDataLoaded$!: Observable<boolean>;

  // Raw data from dataset query
  rawGraphData: any[] = [];

  // Maximized visual
  maximizedVisual: any = null;

  // Available chart types
  chartTypes = CHART_TYPES;

  // Color schemes
  colorSchemes = COLOR_SCHEMES;

  // Curve types
  curveTypes = CURVE_TYPES;

  // Legend positions
  legendPositions = LEGEND_POSITIONS;

  // Dragging
  draggingVisual: any = null;

  // Title editing
  editingTitleId: number | null = null;

  // Axis selection mode
  activeAxisSelection: 'x' | 'y' | 'z' | null = null;

  // Search for chart types
  chartSearchQuery: string = '';

  // Canvas container reference and dimensions for responsive sizing
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth: number = 1000; // Default fallback
  canvasHeight: number = 600; // Default fallback

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
      const oldWidth = this.canvasWidth;
      const oldHeight = this.canvasHeight;
      this.canvasWidth = rect.width || 1000;
      this.canvasHeight = rect.height || 600;
      console.log(
        `[CANVAS] Dimensions updated: ${oldWidth}x${oldHeight} → ${this.canvasWidth}x${this.canvasHeight}`,
      );
    }
  }

  /**
   * Recalculate all visual pixel dimensions from their ratios
   */
  private recalculateAllVisualDimensions(): void {
    this.visuals.forEach(visual => {
      if (visual.widthRatio && visual.heightRatio) {
        this.computeVisualDimensions(visual);
      }
    });
    this.cdr.detectChanges();
  }

  /**
   * Compute pixel dimensions from ratios for a single visual.
   * For flexbox layout, widthRatio represents the fraction of total row width.
   * Examples: 0.5 = half width (2 per row), 1.0 = full width (1 per row)
   */
  private computeVisualDimensions(visual: any): void {
    // Canvas has 20px padding on each side
    const CANVAS_PADDING = 40;
    // Flexbox gap between visuals
    const GAP = 20;
    // Scrollbar width (always visible now to prevent resize oscillation)
    const SCROLLBAR_WIDTH = 17;

    // Calculate content width (canvas minus padding and scrollbar)
    const contentWidth = Math.max(
      0,
      this.canvasWidth - CANVAS_PADDING - SCROLLBAR_WIDTH,
    );

    // For a visual with widthRatio, we need to account for gaps
    // If widthRatio = 0.5, there are 2 visuals per row, so 1 gap
    // If widthRatio = 0.33, there are 3 visuals per row, so 2 gaps
    const numVisualsInRow = Math.max(1, Math.round(1 / visual.widthRatio));
    const gapsInRow = numVisualsInRow - 1;

    // Available width for visuals after accounting for gaps
    const availableForVisuals = contentWidth - gapsInRow * GAP;

    // Each visual gets its ratio of the available space
    visual.width = Math.max(
      300,
      Math.round(visual.widthRatio * availableForVisuals),
    );
    visual.height = Math.max(
      250,
      Math.round(visual.heightRatio * this.canvasHeight),
    );

    // Position (for absolute positioning if needed later)
    visual.x = Math.round((visual.xRatio || 0) * this.canvasWidth);
    visual.y = Math.round((visual.yRatio || 0) * this.canvasHeight);
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

  /**
   * Step 1: Load analysis data
   */
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
   * Step 2: Load dataset info (fields)
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

          // Step 3: Initialize store and run query
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

    // Step 4: Load saved visuals
    this.loadAllVisuals();
  }

  /**
   * Run the dataset query API
   */
  loadDatasetData(): void {
    this.store.dispatch(
      AddAnalysesActions.loadDatasetData({
        orgId: this.orgId,
        datasetId: this.datasetId,
      }),
    );

    this.datasetService
      .runDatasetQuery({
        datasetId: this.datasetId,
        organisation: this.orgId,
      })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          console.log(
            'Query executed successfully. Data rows:',
            response.data?.length,
          );
          this.store.dispatch(
            AddAnalysesActions.loadDatasetDataSuccess({
              orgId: this.orgId,
              datasetId: this.datasetId,
              data: response.data,
            }),
          );
        } else {
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

            console.log(
              `[LOAD] Visual ${visualData.id}: API widthRatio=${visualData.widthRatio}, width=${visualData.width}`,
            );

            const visual: any = {
              id: visualData.id,
              title: visualData.title || 'Loading...',
              x: visualData.x || 0,
              y: visualData.y || 0,
              width: visualData.width || 400,
              height: visualData.height || 350,
              // Use ratios if available, otherwise calculate from legacy pixels
              widthRatio: visualData.widthRatio || null,
              heightRatio: visualData.heightRatio || null,
              xRatio: visualData.xRatio ?? null,
              yRatio: visualData.yRatio ?? null,
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
            };

            // Calculate ratios from legacy pixels if not available
            if (
              !visual.widthRatio ||
              !visual.heightRatio ||
              visual.xRatio === null ||
              visual.yRatio === null
            ) {
              console.log(
                `[LOAD] Visual ${visual.id}: No ratios saved, calculating from legacy pixels. width=${visual.width}, height=${visual.height}`,
              );
              this.calculateRatiosFromLegacy(visual);
              console.log(
                `[LOAD] Visual ${visual.id}: Calculated widthRatio=${visual.widthRatio}`,
              );
            }

            // Compute pixel dimensions from ratios based on current canvas
            this.computeVisualDimensions(visual);

            return visual;
          });

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

  /**
   * Update chart data for a specific visual
   */
  updateVisualChartData(visual: any): void {
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

  addVisual(): void {
    this.visualCounter++;

    // Smart grid placement: 2 visuals per row (each 50% width)
    const { xRatio, yRatio } = this.getNextVisualPosition();

    const visual: any = {
      id: this.visualCounter,
      title: 'Untitled Visual',
      x: 0,
      y: 0,
      xRatio: xRatio,
      yRatio: yRatio,
      width: 400, // Will be computed from ratios
      height: 350, // Will be computed from ratios
      widthRatio: 0.5, // 50% of available space (2 visuals per row)
      heightRatio: 0.45, // 45% of canvas height
      chartType: null,
      xAxisColumn: null,
      yAxisColumn: null,
      zAxisColumn: null,
      config: getDefaultChartConfig(),
      chartData: [],
    };
    // Compute pixel dimensions from ratios
    this.computeVisualDimensions(visual);
    this.visuals.push(visual);
    this.focusedVisualId = this.visualCounter;
  }

  /**
   * Calculate next available position for a new visual in grid layout
   * Grid: 2 columns (50% width each), rows stack vertically
   */
  private getNextVisualPosition(): { xRatio: number; yRatio: number } {
    if (this.visuals.length === 0) {
      return { xRatio: 0, yRatio: 0 };
    }

    // Group visuals by their row (based on yRatio, with tolerance for float comparison)
    const rows: Map<number, any[]> = new Map();
    this.visuals.forEach(v => {
      // Round yRatio to 2 decimal places for grouping
      const rowKey = Math.round((v.yRatio || 0) * 100);
      if (!rows.has(rowKey)) {
        rows.set(rowKey, []);
      }
      rows.get(rowKey)!.push(v);
    });

    // Find the last row and check if it has space
    const sortedRowKeys = Array.from(rows.keys()).sort((a, b) => a - b);
    const lastRowKey = sortedRowKeys[sortedRowKeys.length - 1];
    const lastRowVisuals = rows.get(lastRowKey) || [];

    // If last row has only 1 visual with xRatio = 0 (left side), place on right
    if (lastRowVisuals.length === 1 && (lastRowVisuals[0].xRatio || 0) < 0.25) {
      return { xRatio: 0.5, yRatio: lastRowVisuals[0].yRatio };
    }

    // Otherwise, start a new row below the highest bottom edge
    let maxBottom = 0;
    this.visuals.forEach(v => {
      const bottom = (v.yRatio || 0) + (v.heightRatio || 0.45);
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    });

    // Add small gap (roughly 10px as ratio)
    const gap = this.canvasHeight > 0 ? 10 / this.canvasHeight : 0.02;
    return { xRatio: 0, yRatio: maxBottom + gap };
  }

  get focusedVisual(): any {
    return this.visuals.find(v => v.id === this.focusedVisualId) || null;
  }

  getFocusedVisual(): any {
    return this.focusedVisual;
  }

  get canSave(): boolean {
    return this.visuals.some(v => v.chartType !== null);
  }

  getChartCategories(): string[] {
    return [...new Set(this.chartTypes.map(c => c.category))];
  }

  getChartsByCategory(category: string): any[] {
    return this.chartTypes.filter(c => c.category === category);
  }

  get filteredChartTypes(): any[] {
    if (!this.chartSearchQuery) {
      return this.chartTypes;
    }
    const query = this.chartSearchQuery.toLowerCase();
    return this.chartTypes.filter(
      c =>
        c.name.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query),
    );
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
    return chartType === 'bubble';
  }

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  supportsGradient(chartType: string | null): boolean {
    return supportsGradient(chartType);
  }

  supportsLegend(chartType: string | null): boolean {
    return chartType !== 'card';
  }

  hasRequiredChartFields(visual: any): boolean {
    if (!visual.chartType) return false;
    if (isHeatMapChartType(visual.chartType)) {
      return visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn;
    }
    return visual.xAxisColumn && visual.yAxisColumn;
  }

  setVisualChartType(chartType: any): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = chartType.id;
      visual.title = chartType.name;
      this.updateVisualChartData(visual);
    }
  }

  removeVisual(id: number): void {
    this.visuals = this.visuals.filter(v => v.id !== id);
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
    }
  }

  clearChartType(): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = null;
      visual.title = 'Untitled Visual';
      visual.chartData = [];
    }
  }

  clearFocus(): void {
    this.focusedVisualId = null;
    this.isConfigSidebarOpen = false;
  }

  startEditTitle(id: number, event: Event): void {
    event.stopPropagation();
    this.editingTitleId = id;
  }

  finishEditTitle(): void {
    this.editingTitleId = null;
  }

  onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === 'Escape') {
      this.finishEditTitle();
    }
  }

  onVisualClick(event: MouseEvent, id: number): void {
    if (this.isResizing) return;
    event.stopPropagation();
    this.focusedVisualId = this.focusedVisualId === id ? null : id;
  }

  onVisualRightClick(event: MouseEvent, id: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.focusedVisualId = id;
    this.isConfigSidebarOpen = true;
  }

  closeConfigSidebar(): void {
    this.isConfigSidebarOpen = false;
  }

  // Axis selection methods
  startAxisSelection(axis: 'x' | 'y' | 'z'): void {
    this.activeAxisSelection = this.activeAxisSelection === axis ? null : axis;
  }

  cancelAxisSelection(): void {
    this.activeAxisSelection = null;
  }

  onFieldClick(field: any): void {
    if (!this.activeAxisSelection || !this.focusedVisualId) return;

    const visual = this.getFocusedVisual();
    if (!visual) return;

    // Use columnName (the actual column name to use for data)
    const fieldName = field.columnName || field.columnToView;

    if (this.activeAxisSelection === 'x') {
      visual.xAxisColumn = fieldName;
    } else if (this.activeAxisSelection === 'y') {
      visual.yAxisColumn = fieldName;
    } else if (this.activeAxisSelection === 'z') {
      visual.zAxisColumn = fieldName;
    }

    this.activeAxisSelection = null;
    this.updateVisualChartData(visual);
    this.cdr.detectChanges();
  }

  clearAxisField(axis: 'x' | 'y' | 'z', event: Event): void {
    event.stopPropagation();
    const visual = this.getFocusedVisual();
    if (!visual) return;

    if (axis === 'x') {
      visual.xAxisColumn = null;
    } else if (axis === 'y') {
      visual.yAxisColumn = null;
    } else if (axis === 'z') {
      visual.zAxisColumn = null;
    }

    this.updateVisualChartData(visual);
    this.cdr.detectChanges();
  }

  getFieldDisplayName(columnName: string | null): string {
    if (!columnName || !this.datasetDetails?.datasetFields) return '';
    const field = this.datasetDetails.datasetFields.find(
      (f: any) => f.columnName === columnName || f.columnToView === columnName,
    );
    return field?.columnToView || columnName;
  }

  // Maximize visual
  maximizeVisual(visual: any, event: Event): void {
    event.stopPropagation();
    this.maximizedVisual = visual;
  }

  minimizeVisual(): void {
    this.maximizedVisual = null;
  }

  // Resize methods
  startResize(event: MouseEvent, visual: any, direction: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.resizingVisual = visual;
    this.resizeDirection = direction;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = visual.width;
    this.resizeStartHeight = visual.height;

    const mouseMoveHandler = (e: MouseEvent) => this.onResize(e);
    const mouseUpHandler = () =>
      this.stopResize(mouseMoveHandler, mouseUpHandler);

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  onResize(event: MouseEvent): void {
    if (!this.resizingVisual) return;

    const deltaX = event.clientX - this.resizeStartX;
    const deltaY = event.clientY - this.resizeStartY;

    if (this.resizeDirection.includes('right')) {
      this.resizingVisual.width = Math.max(300, this.resizeStartWidth + deltaX);
    } else if (this.resizeDirection.includes('left')) {
      this.resizingVisual.width = Math.max(300, this.resizeStartWidth - deltaX);
    }

    if (this.resizeDirection.includes('bottom')) {
      this.resizingVisual.height = Math.max(
        250,
        this.resizeStartHeight + deltaY,
      );
    } else if (this.resizeDirection.includes('top')) {
      this.resizingVisual.height = Math.max(
        250,
        this.resizeStartHeight - deltaY,
      );
    }

    // Update ratios based on new pixel dimensions
    this.resizingVisual.widthRatio =
      this.resizingVisual.width / this.canvasWidth;
    this.resizingVisual.heightRatio =
      this.resizingVisual.height / this.canvasHeight;
  }

  stopResize(mouseMoveHandler: any, mouseUpHandler: any): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);

    // Log final ratio values for debugging
    if (this.resizingVisual) {
      console.log(
        `Visual resized: ${(this.resizingVisual.widthRatio * 100).toFixed(1)}% × ${(this.resizingVisual.heightRatio * 100).toFixed(1)}%`,
      );
    }

    this.resizingVisual = null;
    setTimeout(() => {
      this.isResizing = false;
    }, 100);
  }

  // Drag methods
  startDrag(event: DragEvent, visual: any): void {
    this.draggingVisual = visual;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/html', visual.id.toString());
    }
  }

  onDragOver(event: DragEvent, targetVisual: any): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDrop(event: DragEvent, targetVisual: any): void {
    event.preventDefault();
    if (this.draggingVisual && this.draggingVisual !== targetVisual) {
      const draggedIndex = this.visuals.indexOf(this.draggingVisual);
      const targetIndex = this.visuals.indexOf(targetVisual);

      this.visuals.splice(draggedIndex, 1);
      this.visuals.splice(targetIndex, 0, this.draggingVisual);
    }
    this.draggingVisual = null;
  }

  onDragEnd(event: DragEvent): void {
    this.draggingVisual = null;
  }

  saveAnalysis(): void {
    this.showSaveDialog = true;
  }

  handleSaveDialogClose(
    formData: { name: string; description: string } | null,
  ): void {
    this.showSaveDialog = false;

    if (formData) {
      // Build visual configurations with ratio-based fields only
      const visualConfigurations = this.visuals.map(visual => ({
        id: visual.id,
        title: visual.title,
        // Ratios for responsive positioning and sizing
        widthRatio: visual.widthRatio,
        heightRatio: visual.heightRatio,
        xRatio: visual.xRatio,
        yRatio: visual.yRatio,
        // Chart configuration
        chartType: visual.chartType,
        xAxisColumn: visual.xAxisColumn || null,
        yAxisColumn: visual.yAxisColumn || null,
        zAxisColumn: visual.zAxisColumn || null,
        config: visual.config ? { ...visual.config } : null,
      }));

      console.log(
        '[SAVE] Saving visuals with ratios:',
        visualConfigurations.map(v => ({
          id: v.id,
          widthRatio: v.widthRatio,
          heightRatio: v.heightRatio,
        })),
      );

      const updatePayload = {
        id: this.analysisId,
        name: formData.name,
        description: formData.description,
        datasetId: this.datasetId,
        organisation: this.orgId,
        database: this.databaseId,
        visuals: visualConfigurations,
      };

      this.analysesService.updateAnalyses(updatePayload).then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.router.navigate([ANALYSES.LIST]);
        }
      });
    }
  }
}
