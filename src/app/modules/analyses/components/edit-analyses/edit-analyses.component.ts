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
  getDefaultChartConfig,
  hasAxisLabels,
  is3DCoordinateChartType,
  isAreaChartType,
  isBarChartType,
  isBubbleChartType,
  isBoxChartType,
  isCardChartType,
  isGaugeChartType,
  isHeatMapChartType,
  isLineChartType,
  isPieChartType,
  isPolarChartType,
  isTreeMapChartType,
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
import {
  ConfiguredFilter,
  FilterDialogSaveEvent,
} from '../filter-config-dialog/filter-config-dialog.component';

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

  // Analysis-level fields
  analysisFields: any[] = [];

  // Sidebar toggle states
  isFieldsPanelOpen: boolean = true;
  isVisualsPanelOpen: boolean = true;
  isVisualListPanelOpen: boolean = false;
  isFilterPanelOpen: boolean = false;

  // Filter configuration
  configuredFilters: ConfiguredFilter[] = [];
  showFilterDialog: boolean = false;
  editingFilter: ConfiguredFilter | null = null;

  // Filter type options (used by getFilterTypeLabel)
  filterTypeOptions = [
    { label: 'Category', value: 'category' },
    { label: 'Numeric (Exact)', value: 'numeric_equality' },
    { label: 'Numeric (Range)', value: 'numeric_range' },
    { label: 'Date/Time (Exact)', value: 'time_equality' },
    { label: 'Date/Time (Range)', value: 'time_range' },
  ];

  // Search queries
  visualListSearchQuery: string = '';

  // Combined fields: dataset-level + analysis-level
  get allFields(): any[] {
    const datasetFields = (this.datasetDetails?.datasetFields || []).map((f: any) => ({
      ...f,
      _scope: 'dataset',
    }));
    const analysisFields = (this.analysisFields || []).map((f: any) => ({
      ...f,
      _scope: 'analysis',
    }));
    return [...datasetFields, ...analysisFields];
  }

  // Visuals
  visuals: any[] = [];

  // Filtered visuals based on search query
  get filteredVisuals(): any[] {
    if (!this.visualListSearchQuery) {
      return this.visuals;
    }
    return this.visuals.filter((visual: any) =>
      visual.title
        .toLowerCase()
        .includes(this.visualListSearchQuery.toLowerCase()),
    );
  }

  visualCounter: number = 0;
  focusedVisualId: string | null = null;
  resizingVisual: any = null;
  resizeStartX: number = 0;
  resizeStartY: number = 0;
  resizeStartColSpan: number = 0;
  resizeStartRowSpan: number = 0;
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

  // Dragging
  draggingVisual: any = null;

  // Title editing
  editingTitleId: string | null = null;

  // Axis selection mode
  activeAxisSelection: 'x' | 'y' | 'z' | null = null;

  // Search for chart types
  chartSearchQuery: string = '';

  // Canvas container reference and dimensions for responsive sizing
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth: number = 1000; // Default fallback
  canvasHeight: number = 600; // Default fallback

  // Auto-scroll for resize
  private autoScrollRafId: number | null = null;
  private autoScrollClientY: number = 0;

  // Grid constants
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
    this.stopAutoScroll();
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
   * Recalculate all visual pixel dimensions from their grid spans
   */
  private recalculateAllVisualDimensions(): void {
    this.visuals.forEach(visual => {
      if (visual.colSpan && visual.rowSpan) {
        this.computeVisualDimensions(visual);
      }
    });
    this.cdr.detectChanges();
  }

  /**
   * Compute pixel dimensions from grid spans for a single visual.
   * Uses CSS Grid math: colSpan/rowSpan determine size.
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
   * Step 2: Load dataset info (fields) + analysis-level fields
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

          // Also fetch analysis-level fields
          this.loadAnalysisFields();

          // Load existing filters for this analysis
          this.loadExistingFilters();

          // Step 3: Initialize store and run query
          this.initializeStoreSelectors();
        }
      });
  }

  /**
   * Load analysis-level custom fields
   */
  loadAnalysisFields(): void {
    this.analysesService
      .getAnalysisFields(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisFields = response.data?.analysisFields || [];
          console.log('Analysis fields loaded:', this.analysisFields.length);
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

            // Ensure grid properties exist
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

            // Compute pixel dimensions from ratios based on current canvas
            this.computeVisualDimensions(visual);

            return visual;
          });

          // Place visuals on grid after all are loaded
          this.placeVisualsOnGrid();

          // Set visual counter
          if (this.visuals.length > 0) {
            this.visualCounter = Math.max(...this.visuals.map(v => Number(v.id) || 0), 0);
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

  // Called when fields panel emits fieldsChanged (after custom field create/edit/delete)
  onFieldsChanged(): void {
    this.loadAnalysisFields();
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
        }
      });
  }

  toggleFieldsPanel(): void {
    this.isFieldsPanelOpen = !this.isFieldsPanelOpen;
    // If opening fields panel, close visual list panel (mutual exclusivity)
    if (this.isFieldsPanelOpen) {
      this.isVisualListPanelOpen = false;
    }
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
    // If opening visuals panel, close filter panel (mutual exclusivity)
    if (this.isVisualsPanelOpen) {
      this.isFilterPanelOpen = false;
    }
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  toggleVisualListPanel(): void {
    this.isVisualListPanelOpen = !this.isVisualListPanelOpen;
    // If opening visual list panel, close fields panel (mutual exclusivity)
    if (this.isVisualListPanelOpen) {
      this.isFieldsPanelOpen = false;
    }
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  toggleFilterPanel(): void {
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
    // If opening filter panel, close visuals panel (mutual exclusivity)
    if (this.isFilterPanelOpen) {
      this.isVisualsPanelOpen = false;
    }
    // Wait for CSS transition to complete, then recalculate dimensions
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
    }, 350); // Match CSS transition duration
  }

  addFilter(): void {
    this.editingFilter = null;
    this.showFilterDialog = true;
  }

  editFilter(filter: ConfiguredFilter): void {
    this.editingFilter = filter;
    this.showFilterDialog = true;
  }

  removeFilter(filter: ConfiguredFilter): void {
    this.configuredFilters = this.configuredFilters.filter(
      f => f.tempId !== filter.tempId,
    );
    this.resequenceFilters();
  }

  onFilterDialogSave(event: FilterDialogSaveEvent): void {
    if (this.editingFilter) {
      const idx = this.configuredFilters.findIndex(f => f.tempId === this.editingFilter!.tempId);
      if (idx !== -1) {
        this.configuredFilters[idx] = {
          ...this.configuredFilters[idx],
          name: event.name,
          columnName: event.columnName,
          filterType: event.filterType,
          controlType: event.controlType,
          isEnabled: event.isEnabled,
          isMandatory: event.isMandatory,
        };
      }
    } else {
      this.configuredFilters.push({
        tempId: crypto.randomUUID(),
        name: event.name,
        columnName: event.columnName,
        filterType: event.filterType,
        controlType: event.controlType,
        config: {},
        isEnabled: event.isEnabled,
        isMandatory: event.isMandatory,
        sequence: this.configuredFilters.length,
      });
    }
    this.showFilterDialog = false;
  }

  resequenceFilters(): void {
    this.configuredFilters.forEach((f, i) => f.sequence = i);
  }

  getFilterTypeLabel(type: string): string {
    return this.filterTypeOptions.find(o => o.value === type)?.label || type;
  }

  async loadExistingFilters(): Promise<void> {
    try {
      const res: any = await this.analysesService.listFilters(this.orgId, this.analysisId);
      if (res?.success && res.data) {
        this.configuredFilters = (res.data || []).map((f: any) => ({
          tempId: f.id || crypto.randomUUID(),
          name: f.name,
          columnName: f.columnName,
          filterType: f.filterType,
          controlType: f.controlType,
          config: f.config || {},
          isEnabled: f.isEnabled,
          isMandatory: f.isMandatory,
          sequence: f.sequence,
        }));
      }
    } catch (err) {
      console.error('Failed to load existing filters', err);
    }
  }

  addVisual(): void {
    this.visualCounter++;

    // Smart grid placement: 2 visuals per row (each 50% width)
    const { xRatio, yRatio } = this.getNextVisualPosition();

    const visual: any = {
      id: String(this.visualCounter),
      title: 'Untitled Visual',
      x: 0,
      y: 0,
      xRatio: xRatio,
      yRatio: yRatio,
      width: 400, // Will be computed from ratios
      height: 350, // Will be computed from ratios
      widthRatio: 0.5, // 50% of available space (2 visuals per row)
      heightRatio: 0.45, // 45% of canvas height
      colSpan: 12,
      rowSpan: 6,
      gridCol: 0,
      gridRow: 0,
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
    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
    this.focusedVisualId = String(this.visualCounter);

    // Scroll to the new visual (scoped to canvas container only)
    setTimeout(() => {
      if (!this.canvasContainer?.nativeElement) return;

      const container = this.canvasContainer.nativeElement.querySelector(
        '.canvas-area',
      ) as HTMLElement;
      if (!container) return;

      const visualElements = container.querySelectorAll('.visual-box');
      if (visualElements && visualElements.length > 0) {
        const lastVisual = visualElements[
          visualElements.length - 1
        ] as HTMLElement;

        const containerRect = container.getBoundingClientRect();
        const visualRect = lastVisual.getBoundingClientRect();

        // Calculate offset to center the visual in the container
        // Formula: (VisualCenter) - (ContainerCenter)
        const offset =
          visualRect.top +
          visualRect.height / 2 -
          (containerRect.top + containerRect.height / 2);

        container.scrollTo({
          top: container.scrollTop + offset,
          behavior: 'smooth',
        });

        // Add blinking effect
        lastVisual.classList.add('blinking-visual');
        setTimeout(() => {
          lastVisual.classList.remove('blinking-visual');
        }, 1000);
      }
    }, 100);
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

  is3DCoordinateChartType(chartType: string | null): boolean {
    return is3DCoordinateChartType(chartType);
  }

  hasRequiredChartFields(visual: any): boolean {
    if (!visual.chartType) return false;
    // 3D coordinate charts need x + y + z
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    // No-axis charts only need at least one field
    if (!hasAxisLabels(visual.chartType)) {
      return !!(visual.xAxisColumn || visual.yAxisColumn);
    }
    // 3-axis charts: heat-map, sankey, graph need x + y + z
    if (
      isHeatMapChartType(visual.chartType) ||
      isSankeyChartType(visual.chartType) ||
      isGraphChartType(visual.chartType)
    ) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  setVisualChartType(chartType: any): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = chartType.id;
      visual.title = chartType.name;
      this.updateVisualChartData(visual);
    }
  }

  removeVisual(id: string): void {
    this.visuals = this.visuals.filter(v => v.id !== id);
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
    }
    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
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

  startEditTitle(id: string, event: Event): void {
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

  onVisualClick(event: MouseEvent, id: string): void {
    if (this.isResizing) return;
    event.stopPropagation();
    this.focusedVisualId = this.focusedVisualId === id ? null : id;
  }

  onVisualRightClick(event: MouseEvent, id: string): void {
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

    // Ensure dataset fields sidebar is open for field selection
    if (this.activeAxisSelection && !this.isFieldsPanelOpen) {
      // Close visual list if open (mutual exclusivity)
      if (this.isVisualListPanelOpen) {
        this.isVisualListPanelOpen = false;
      }
      this.isFieldsPanelOpen = true;
    }
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
    if (!columnName) return '';
    // Search in combined fields (dataset + analysis)
    const field = this.allFields.find(
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

  /**
   * Scroll to a specific visual and highlight it
   */
  scrollToVisual(visual: any, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    // Don't focus - only scroll and highlight
    setTimeout(() => {
      if (!this.canvasContainer?.nativeElement) return;

      const container = this.canvasContainer.nativeElement.querySelector(
        '.canvas-area',
      ) as HTMLElement;
      if (!container) return;

      // Find the visual element by matching its visual ID
      const visualElements = container.querySelectorAll('.visual-box');
      const visualArray = Array.from(visualElements);

      const targetIndex = this.visuals.findIndex(v => v.id === visual.id);
      if (targetIndex >= 0 && targetIndex < visualArray.length) {
        const targetVisual = visualArray[targetIndex] as HTMLElement;

        const containerRect = container.getBoundingClientRect();
        const visualRect = targetVisual.getBoundingClientRect();

        // Calculate offset to center the visual in the container
        const offset =
          visualRect.top +
          visualRect.height / 2 -
          (containerRect.top + containerRect.height / 2);

        container.scrollTo({
          top: container.scrollTop + offset,
          behavior: 'smooth',
        });

        // Add blinking highlight animation (like Add Visual)
        targetVisual.classList.add('blinking-visual');
        setTimeout(() => {
          targetVisual.classList.remove('blinking-visual');
        }, 500);
      }
    }, 100);
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
    this.resizeStartColSpan = visual.colSpan;
    this.resizeStartRowSpan = visual.rowSpan;

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

    const CANVAS_PADDING = 40;
    const SCROLLBAR_WIDTH = 17;
    const contentWidth = Math.max(
      0,
      this.canvasWidth - CANVAS_PADDING - SCROLLBAR_WIDTH,
    );
    const fr =
      (contentWidth - (this.GRID_COLUMNS - 1) * this.GRID_GAP) /
      this.GRID_COLUMNS;
    const colUnit = fr + this.GRID_GAP;
    const rowUnit = this.ROW_HEIGHT + this.GRID_GAP;

    let newColSpan = this.resizeStartColSpan;
    let newRowSpan = this.resizeStartRowSpan;

    if (this.resizeDirection.includes('right')) {
      const maxCols = this.GRID_COLUMNS - this.resizingVisual.gridCol;
      newColSpan = Math.max(
        4,
        Math.min(
          maxCols,
          this.resizeStartColSpan + Math.round(deltaX / colUnit),
        ),
      );
    }

    if (this.resizeDirection.includes('bottom')) {
      newRowSpan = Math.max(
        3,
        this.resizeStartRowSpan + Math.round(deltaY / rowUnit),
      );
    }

    if (
      newColSpan !== this.resizingVisual.colSpan ||
      newRowSpan !== this.resizingVisual.rowSpan
    ) {
      this.resizingVisual.colSpan = newColSpan;
      this.resizingVisual.rowSpan = newRowSpan;
      this.placeVisualsOnGrid();
      this.recalculateAllVisualDimensions();
    }

    this.autoScrollNearEdge(event.clientY);
  }

  stopResize(mouseMoveHandler: any, mouseUpHandler: any): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);

    if (this.resizingVisual) {
      this.placeVisualsOnGrid();
      this.recalculateAllVisualDimensions();
    }

    this.resizingVisual = null;
    this.stopAutoScroll();
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
      const visualBox = (event.target as HTMLElement).closest('.visual-box');
      if (visualBox) {
        const rect = visualBox.getBoundingClientRect();
        event.dataTransfer.setDragImage(
          visualBox,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      }
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
    this.stopAutoScroll();
  }

  onDragEnd(event: DragEvent): void {
    this.draggingVisual = null;
    this.stopAutoScroll();
  }

  private autoScrollNearEdge(clientY: number): void {
    this.autoScrollClientY = clientY;
    if (!this.autoScrollRafId) {
      this.startAutoScrollLoop();
    }
  }

  private startAutoScrollLoop(): void {
    const tick = () => {
      const container = this.canvasContainer?.nativeElement?.querySelector(
        '.canvas-area',
      ) as HTMLElement;
      if (!container) {
        this.autoScrollRafId = null;
        return;
      }
      const rect = container.getBoundingClientRect();
      const EDGE = 80;
      const MAX_SPEED = 18;
      let scrolled = false;
      if (this.autoScrollClientY > rect.bottom - EDGE) {
        const ratio = Math.min(
          1,
          (this.autoScrollClientY - (rect.bottom - EDGE)) / EDGE,
        );
        container.scrollTop += Math.ceil(MAX_SPEED * ratio);
        scrolled = true;
      } else if (this.autoScrollClientY < rect.top + EDGE) {
        const ratio = Math.min(
          1,
          (rect.top + EDGE - this.autoScrollClientY) / EDGE,
        );
        container.scrollTop -= Math.ceil(MAX_SPEED * ratio);
        scrolled = true;
      }
      if (scrolled) {
        this.autoScrollRafId = requestAnimationFrame(tick);
      } else {
        this.autoScrollRafId = null;
      }
    };
    this.autoScrollRafId = requestAnimationFrame(tick);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollRafId) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
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
        // Grid spans for responsive sizing
        colSpan: visual.colSpan,
        rowSpan: visual.rowSpan,
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
        filters: this.configuredFilters.map((f, i) => ({
          name: f.name,
          columnName: f.columnName,
          filterType: f.filterType,
          controlType: f.controlType,
          config: f.config || {},
          isEnabled: f.isEnabled,
          isMandatory: f.isMandatory,
          sequence: i,
        })),
      };

      this.analysesService.updateAnalyses(updatePayload).then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.router.navigate([ANALYSES.LIST]);
        }
      });
    }
  }
}
