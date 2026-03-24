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
import { first } from 'rxjs/operators';
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
  isPieChartType,
  isPolarChartType,
  isTreeMapChartType,
  isLineChartType,
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
import { Visual, createVisual } from '../../models';
import { AnalysesService } from '../../service/analyses.service';
import { ChartDataTransformerService } from '../../services';
import {
  AddAnalysesActions,
  DatasetLoadingStatus,
  selectDatasetByKey,
  selectDatasetData,
  selectDatasetStatus,
  selectIsDatasetLoaded,
  selectIsDatasetStale,
} from '../../store';
import {
  ConfiguredFilter,
  FilterDialogSaveEvent,
} from '../filter-config-dialog/filter-config-dialog.component';

@Component({
  selector: 'app-add-analyses',
  templateUrl: './add-analyses.component.html',
  styleUrls: ['./add-analyses.component.scss'],
})
export class AddAnalysesComponent implements OnInit, AfterViewInit, OnDestroy {
  datasetId: string = '';
  orgId: string = '';
  databaseId: string = '';
  datasetDetails: any = null;

  // NgRx Store Observables - will be initialized after params are loaded
  graphData$!: Observable<any[] | null>;
  datasetStatus$!: Observable<DatasetLoadingStatus>;
  isDataLoaded$!: Observable<boolean>;

  // Raw graph data from store (for chart transformations)
  rawGraphData: any[] = [];

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

  // Visuals
  visuals: Visual[] = [];

  // Filtered visuals based on search query
  get filteredVisuals(): Visual[] {
    if (!this.visualListSearchQuery) {
      return this.visuals;
    }
    return this.visuals.filter(visual =>
      visual.title
        .toLowerCase()
        .includes(this.visualListSearchQuery.toLowerCase()),
    );
  }

  visualCounter: number = 0;
  focusedVisualId: string | null = null;
  resizingVisual: Visual | null = null;
  resizeStartX: number = 0;
  resizeStartY: number = 0;
  resizeStartColSpan: number = 0;
  resizeStartRowSpan: number = 0;
  resizeDirection: string = '';
  isResizing: boolean = false; // Flag to prevent click during resize
  isConfigSidebarOpen: boolean = false; // Right-click opens config sidebar
  private autoScrollRafId: number | null = null;
  private autoScrollClientY: number = 0;
  showSaveDialog: boolean = false; // Show save analysis dialog

  // Available chart types
  chartTypes = CHART_TYPES;

  // Dragging
  draggingVisual: any = null;

  // Maximized visual for fullscreen view
  maximizedVisual: any = null;

  // Axis field selection mode
  activeAxisSelection: 'x' | 'y' | 'z' | null = null;

  // Search for chart types
  chartSearchQuery: string = '';

  // Canvas container reference and dimensions for responsive sizing
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth: number = 1000; // Default fallback
  canvasHeight: number = 600; // Default fallback

  // Grid layout constants (24-col / 50px-row for fine-grained smooth resizing)
  private readonly GRID_COLUMNS = 24;
  private readonly ROW_HEIGHT = 50; // px per grid row unit
  private readonly GRID_GAP = 12; // px gap between grid cells
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private store: Store,
    private cdr: ChangeDetectorRef,
    private chartDataTransformer: ChartDataTransformerService,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.orgId = params['orgId'];
      this.datasetId = params['datasetId'];
      if (this.datasetId && this.orgId) {
        // Initialize selectors with dynamic keys
        this.graphData$ = this.store.select(
          selectDatasetData(this.orgId, this.datasetId),
        );
        this.datasetStatus$ = this.store.select(
          selectDatasetStatus(this.orgId, this.datasetId),
        );
        this.isDataLoaded$ = this.store.select(
          selectIsDatasetLoaded(this.orgId, this.datasetId),
        );

        // Subscribe to graphData$ to populate rawGraphData
        this.graphData$.subscribe(data => {
          if (data && data.length > 0) {
            this.rawGraphData = data;
            this.cdr.detectChanges();
          }
        });

        // Check if we have cached data and if it's stale
        this.checkCachedDataAndLoad();
      }
    });
  }

  ngAfterViewInit(): void {
    // Get initial canvas dimensions after view is initialized
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.lastStableWidth = this.canvasWidth; // Initialize threshold baseline
    }, 0);
    // Set up ResizeObserver to detect canvas size changes from any source
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
    this.stopAutoScroll();
  }

  private resizeDebounceTimer: any = null;
  private lastStableWidth: number = 0;

  /**
   * Setup ResizeObserver to detect canvas size changes
   * Handles: main sidebar toggle, internal sidebars, window resize
   * Uses debounce to prevent oscillation loops
   */
  private setupResizeObserver(): void {
    if (
      typeof ResizeObserver !== 'undefined' &&
      this.canvasContainer?.nativeElement
    ) {
      this.resizeObserver = new ResizeObserver(() => {
        // Debounce resize events to prevent oscillation
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

  /**
   * Handle resize with threshold to prevent oscillation
   * Only recalculate if width changes by more than 10px
   */
  private handleResize(): void {
    if (!this.canvasContainer?.nativeElement) return;

    const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
    const newWidth = rect.width || 1000;

    // Only recalculate if width change exceeds threshold (prevents oscillation)
    const THRESHOLD = 10;
    if (Math.abs(newWidth - this.lastStableWidth) > THRESHOLD) {
      this.lastStableWidth = newWidth;
      this.updateCanvasDimensions();
      this.recalculateAllVisualDimensions();
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
    this.visuals.forEach(visual => {
      this.computeVisualDimensions(visual);
    });
    this.cdr.detectChanges();
  }

  /**
   * Compute pixel dimensions from grid spans for a single visual.
   * Used to provide chartWidth/chartHeight to chart components.
   * CSS Grid handles actual visual box sizing; these are approximate pixel values.
   */
  private computeVisualDimensions(visual: Visual): void {
    const CANVAS_PADDING = 40;
    const SCROLLBAR_WIDTH = 17;

    const contentWidth = Math.max(
      0,
      this.canvasWidth - CANVAS_PADDING - SCROLLBAR_WIDTH,
    );

    // CSS Grid fr unit: (contentWidth - total gaps) / columns
    const fr =
      (contentWidth - (this.GRID_COLUMNS - 1) * this.GRID_GAP) /
      this.GRID_COLUMNS;

    // Visual pixel width = colSpan × fr + (colSpan - 1) × gap
    visual.width = Math.max(
      100,
      Math.round(visual.colSpan * fr + (visual.colSpan - 1) * this.GRID_GAP),
    );
    // Visual pixel height = rowSpan × rowHeight + (rowSpan - 1) × gap
    visual.height = Math.max(
      100,
      Math.round(
        visual.rowSpan * this.ROW_HEIGHT + (visual.rowSpan - 1) * this.GRID_GAP,
      ),
    );

    // Keep ratios in sync for backward compatibility / save
    visual.widthRatio = visual.colSpan / this.GRID_COLUMNS;
    visual.heightRatio =
      (visual.rowSpan * this.ROW_HEIGHT) / Math.max(1, this.canvasHeight);
  }

  /**
   * Place all visuals on the grid using a first-fit packing algorithm.
   * Scans left-to-right, top-to-bottom for the first position where each
   * visual fits without overlapping any previously placed visual.
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

  /** Check if a colSpan × rowSpan block fits at (row, col) without overlap */
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

  /** Mark grid cells as occupied */
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
   * Check cached data and decide whether to use it or refresh
   * - If no cached data: load fresh
   * - If cached but stale (>10 min old): show cached, then refresh in background
   * - If cached and fresh: use cached data
   */
  private checkCachedDataAndLoad(): void {
    this.store
      .select(selectDatasetByKey(this.orgId, this.datasetId))
      .pipe(first())
      .subscribe(cachedEntry => {
        if (!cachedEntry || !cachedEntry.data) {
          // No cached data, load fresh
          this.loadDatasetInfo();
        } else {
          // Check if data is stale
          this.store
            .select(selectIsDatasetStale(this.orgId, this.datasetId))
            .pipe(first())
            .subscribe(isStale => {
              if (isStale) {
                // Show stale data immediately, but refresh
                this.loadDatasetInfo();
              } else {
                // Data is fresh, just load dataset info for UI
                this.loadDatasetInfoOnly();
              }
            });
        }
      });
  }

  /**
   * Load only dataset info without refreshing graph data
   * Used when cached graph data is still fresh
   */
  private loadDatasetInfoOnly(): void {
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
          this.databaseId = response.data.databaseId;
          // Don't load graph data - using cache
        }
      });
  }

  loadDatasetInfo(): void {
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
          this.databaseId = response.data.databaseId;

          // After loading dataset info, fetch graph data
          this.loadGraphData();
        }
      });
  }

  loadGraphData(): void {
    // Dispatch loading action with orgId and datasetId
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
        this.store.dispatch(
          AddAnalysesActions.loadDatasetDataFailure({
            orgId: this.orgId,
            datasetId: this.datasetId,
            error: error.message || 'Failed to load graph data',
          }),
        );
      });
  }

  refreshData(): void {
    // Simply call loadGraphData again to refresh the data
    this.loadGraphData();
  }

  goBack(): void {
    this.router.navigate(['/app/dataset']);
  }

  toggleFieldsPanel(): void {
    this.isFieldsPanelOpen = !this.isFieldsPanelOpen;
    // If opening fields panel, close visual list panel (mutual exclusivity)
    if (this.isFieldsPanelOpen) {
      this.isVisualListPanelOpen = false;
    }
    // CSS Grid handles layout automatically via fr units.
    // ResizeObserver detects canvas width change and recalculates chart pixel dimensions.
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
    // If opening visuals panel, close filter panel (mutual exclusivity)
    if (this.isVisualsPanelOpen) {
      this.isFilterPanelOpen = false;
    }
  }

  toggleVisualListPanel(): void {
    this.isVisualListPanelOpen = !this.isVisualListPanelOpen;
    // If opening visual list panel, close fields panel (mutual exclusivity)
    if (this.isVisualListPanelOpen) {
      this.isFieldsPanelOpen = false;
    }
  }

  toggleFilterPanel(): void {
    this.isFilterPanelOpen = !this.isFilterPanelOpen;
    // If opening filter panel, close visuals panel (mutual exclusivity)
    if (this.isFilterPanelOpen) {
      this.isVisualsPanelOpen = false;
    }
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

  addVisual(): void {
    this.visualCounter++;
    const visual = createVisual(String(this.visualCounter), getDefaultChartConfig());

    // Default grid size: 6 columns (half width), 2 rows
    this.visuals.push(visual);

    // Place all visuals on grid (new visual gets first available slot)
    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();

    // Auto-focus the newly added visual
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
        }, 500);
      }
    }, 100);
  }

  /**
   * Populate all chart types with dummy data for testing configurations.
   * Creates one visual per chart type with pre-filled data.
   */
  populateTestData(): void {
    // --- Dummy data for different chart shapes ---
    const single = [
      { name: 'Electronics', value: 4800 },
      { name: 'Clothing', value: 3200 },
      { name: 'Groceries', value: 5600 },
      { name: 'Furniture', value: 2100 },
      { name: 'Sports', value: 1700 },
      { name: 'Books', value: 900 },
      { name: 'Toys', value: 1400 },
      { name: 'Healthcare', value: 2800 },
    ];

    const multi = [
      { name: 'Q1', series: [{ name: 'Electronics', value: 4200 }, { name: 'Clothing', value: 2800 }, { name: 'Groceries', value: 5100 }, { name: 'Furniture', value: 1800 }] },
      { name: 'Q2', series: [{ name: 'Electronics', value: 4900 }, { name: 'Clothing', value: 3100 }, { name: 'Groceries', value: 4800 }, { name: 'Furniture', value: 2200 }] },
      { name: 'Q3', series: [{ name: 'Electronics', value: 5300 }, { name: 'Clothing', value: 3600 }, { name: 'Groceries', value: 5400 }, { name: 'Furniture', value: 2500 }] },
      { name: 'Q4', series: [{ name: 'Electronics', value: 6100 }, { name: 'Clothing', value: 4200 }, { name: 'Groceries', value: 6200 }, { name: 'Furniture', value: 2900 }] },
    ];

    const sankeyGraph = {
      nodes: [
        { name: 'Budget' }, { name: 'Marketing' }, { name: 'Engineering' }, { name: 'Sales' },
        { name: 'Digital Ads' }, { name: 'Frontend' }, { name: 'Backend' }, { name: 'Direct' }, { name: 'Channel' },
      ],
      links: [
        { source: 'Budget', target: 'Marketing', value: 40 },
        { source: 'Budget', target: 'Engineering', value: 35 },
        { source: 'Budget', target: 'Sales', value: 25 },
        { source: 'Marketing', target: 'Digital Ads', value: 30 },
        { source: 'Engineering', target: 'Frontend', value: 15 },
        { source: 'Engineering', target: 'Backend', value: 20 },
        { source: 'Sales', target: 'Direct', value: 15 },
        { source: 'Sales', target: 'Channel', value: 10 },
      ],
    };

    const waterfall = [
      { name: 'Revenue', value: 10000 },
      { name: 'Cost of Goods', value: -4200 },
      { name: 'Gross Profit', value: 5800 },
      { name: 'Marketing', value: -1500 },
      { name: 'Operations', value: -1200 },
      { name: 'Tax', value: -800 },
      { name: 'Net Income', value: 2300 },
    ];

    const candlestick = [
      { name: 'Mon', value: [20, 34, 10, 38] },
      { name: 'Tue', value: [40, 35, 30, 50] },
      { name: 'Wed', value: [31, 38, 25, 44] },
      { name: 'Thu', value: [38, 15, 5, 42] },
      { name: 'Fri', value: [25, 36, 20, 48] },
    ];

    const boxData = [
      { name: 'Electronics', data: [850, 920, 1100, 1250, 1400, 1500, 1650, 1800, 2100] },
      { name: 'Clothing', data: [300, 420, 500, 580, 650, 720, 800, 950, 1100] },
      { name: 'Groceries', data: [200, 350, 400, 480, 520, 600, 680, 750, 900] },
      { name: 'Furniture', data: [500, 620, 700, 850, 950, 1050, 1200, 1350, 1500] },
    ];

    const parallel = [
      { name: 'Product A', Price: 40, Quality: 85, Delivery: 70, Support: 60 },
      { name: 'Product B', Price: 60, Quality: 90, Delivery: 55, Support: 80 },
      { name: 'Product C', Price: 30, Quality: 70, Delivery: 90, Support: 75 },
    ];

    const heatmap = [
      { name: 'Mon', series: [{ name: '9am', value: 5 }, { name: '12pm', value: 12 }, { name: '3pm', value: 8 }, { name: '6pm', value: 3 }] },
      { name: 'Tue', series: [{ name: '9am', value: 7 }, { name: '12pm', value: 15 }, { name: '3pm', value: 10 }, { name: '6pm', value: 6 }] },
      { name: 'Wed', series: [{ name: '9am', value: 4 }, { name: '12pm', value: 11 }, { name: '3pm', value: 14 }, { name: '6pm', value: 5 }] },
      { name: 'Thu', series: [{ name: '9am', value: 9 }, { name: '12pm', value: 8 }, { name: '3pm', value: 13 }, { name: '6pm', value: 7 }] },
      { name: 'Fri', series: [{ name: '9am', value: 6 }, { name: '12pm', value: 16 }, { name: '3pm', value: 9 }, { name: '6pm', value: 4 }] },
    ];

    const bubble = [
      { name: 'Electronics', series: [{ x: 20, y: 4800, r: 15 }, { x: 35, y: 5200, r: 20 }, { x: 50, y: 6100, r: 25 }] },
      { name: 'Clothing', series: [{ x: 15, y: 3200, r: 10 }, { x: 30, y: 3600, r: 14 }, { x: 45, y: 4200, r: 18 }] },
      { name: 'Groceries', series: [{ x: 25, y: 5600, r: 22 }, { x: 40, y: 5100, r: 16 }, { x: 55, y: 6200, r: 28 }] },
    ];

    const bar3d = [
      [0, 0, 5], [0, 1, 7], [0, 2, 3], [0, 3, 8],
      [1, 0, 4], [1, 1, 9], [1, 2, 6], [1, 3, 2],
      [2, 0, 8], [2, 1, 3], [2, 2, 7], [2, 3, 5],
      [3, 0, 6], [3, 1, 5], [3, 2, 9], [3, 3, 4],
    ];

    // --- Chart type to data mapping ---
    const chartDefs: { type: string; title: string; data: any; axes: [string | null, string | null, string | null]; colSpan?: number }[] = [
      // Bar variants
      { type: 'bar-vertical', title: 'Bar Vertical', data: single, axes: ['category', 'value', null] },
      { type: 'bar-horizontal', title: 'Bar Horizontal', data: single, axes: ['category', 'value', null] },
      { type: 'bar-vertical-2d', title: 'Grouped Bar', data: single, axes: ['category', 'value', null] },
      { type: 'bar-vertical-stacked', title: 'Stacked Bar', data: single, axes: ['category', 'value', null] },
      { type: 'bar-vertical-normalized', title: 'Normalized Bar', data: single, axes: ['category', 'value', null] },

      // Line / Area
      { type: 'line', title: 'Line Chart', data: multi, axes: ['category', 'value', null] },
      { type: 'line-stacked', title: 'Stacked Line', data: multi, axes: ['category', 'value', null] },
      { type: 'area', title: 'Area Chart', data: multi, axes: ['category', 'value', null] },
      { type: 'area-stacked', title: 'Stacked Area', data: multi, axes: ['category', 'value', null] },

      // Pie variants
      { type: 'pie', title: 'Pie Chart', data: single, axes: ['category', null, null] },
      { type: 'donut', title: 'Donut Chart', data: single, axes: ['category', null, null] },
      { type: 'rose', title: 'Rose Chart', data: single, axes: ['category', null, null] },

      // Gauge & Card
      { type: 'gauge', title: 'Gauge', data: [{ name: 'Score', value: 72 }], axes: ['score', null, null] },
      { type: 'number-card', title: 'Number Card', data: single, axes: ['category', null, null] },

      // Maps
      { type: 'heat-map', title: 'Heat Map', data: heatmap, axes: ['day', 'time', 'value'] },
      { type: 'tree-map', title: 'Tree Map', data: single, axes: ['category', null, null] },

      // Scatter / Bubble
      { type: 'scatter', title: 'Scatter', data: single, axes: ['category', 'value', null] },
      { type: 'bubble', title: 'Bubble', data: bubble, axes: ['x', 'y', 'size'] },
      { type: 'box-chart', title: 'Box Plot', data: boxData, axes: ['category', 'value', null] },

      // Funnel / Sunburst / Tree
      { type: 'funnel', title: 'Funnel', data: single, axes: ['category', null, null] },
      { type: 'sunburst', title: 'Sunburst', data: single, axes: ['category', null, null] },
      { type: 'tree', title: 'Tree', data: single, axes: ['category', null, null] },

      // Flow charts
      { type: 'sankey', title: 'Sankey', data: sankeyGraph, axes: ['source', 'target', 'value'] },
      { type: 'graph', title: 'Graph', data: sankeyGraph, axes: ['node', 'link', 'value'] },
      { type: 'waterfall', title: 'Waterfall', data: waterfall, axes: ['category', 'value', null] },

      // Special
      { type: 'theme-river', title: 'Theme River', data: single, axes: ['category', 'value', null] },
      { type: 'pictorial-bar', title: 'Pictorial Bar', data: single, axes: ['category', 'value', null] },
      { type: 'bar-polar', title: 'Polar Bar', data: single, axes: ['category', 'value', null] },
      { type: 'radar', title: 'Radar', data: multi, axes: ['category', 'value', null] },
      { type: 'candlestick', title: 'Candlestick', data: candlestick, axes: ['date', 'ohlc', null] },
      { type: 'parallel', title: 'Parallel', data: parallel, axes: ['dimension', 'value', null] },

      // 3D
      { type: 'bar3d', title: '3D Bar', data: bar3d, axes: ['x', 'y', 'z'] },
      { type: 'scatter3d', title: '3D Scatter', data: bar3d, axes: ['x', 'y', 'z'] },
    ];

    // Clear existing visuals
    this.visuals = [];
    this.visualCounter = 0;

    // Create one visual per chart type
    chartDefs.forEach(def => {
      this.visualCounter++;
      const visual = createVisual(String(this.visualCounter), getDefaultChartConfig());
      visual.title = def.title;
      visual.chartType = def.type;
      visual.chartData = def.data;
      visual.xAxisColumn = def.axes[0];
      visual.yAxisColumn = def.axes[1];
      visual.zAxisColumn = def.axes[2];
      visual.colSpan = def.colSpan || 12;
      visual.rowSpan = 6;
      this.visuals.push(visual);
    });

    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
    this.focusedVisualId = '1';
  }

  getFocusedVisual(): Visual | null {
    return this.visuals.find(v => v.id === this.focusedVisualId) || null;
  }

  /**
   * Safe getter for focused visual - use this in templates with ngModel
   * Returns a placeholder visual to avoid null errors when no visual is focused
   */
  get focusedVisual(): Visual {
    const visual = this.getFocusedVisual();
    if (visual) return visual;
    // Return an empty visual to avoid null errors in template bindings
    return createVisual('0', getDefaultChartConfig());
  }

  // Check if there's at least one visual with a chart type selected
  get canSave(): boolean {
    return this.visuals.some(v => v.chartType !== null);
  }

  getChartCategories(): string[] {
    const filtered = this.getFilteredChartTypes();
    const categories = [...new Set(filtered.map(c => c.category))];
    return categories;
  }

  getChartsByCategory(category: string): any[] {
    const filtered = this.getFilteredChartTypes();
    return filtered.filter(c => c.category === category);
  }

  getFilteredChartTypes(): any[] {
    if (!this.chartSearchQuery || this.chartSearchQuery.trim() === '') {
      return this.chartTypes;
    }
    const query = this.chartSearchQuery.toLowerCase().trim();
    return this.chartTypes.filter(
      chart =>
        chart.name.toLowerCase().includes(query) ||
        chart.description.toLowerCase().includes(query) ||
        chart.category.toLowerCase().includes(query),
    );
  }

  // Wrapper methods for imported helper functions (needed for template access)
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

  isLineChartType(chartType: string | null): boolean {
    return isLineChartType(chartType);
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

  /**
   * Check if a visual has all required fields mapped for its chart type.
   * No-axis charts (pie, gauge, card, funnel, sunburst, tree, etc.) only need dummy data or single column.
   * Heat map / sankey / graph require x, y, and z axis columns.
   * Standard axis charts require x and y axis columns.
   */
  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;

    // 3D coordinate charts need x + y + z
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }

    // No-axis charts only need at least one field mapped (or none for some)
    if (!hasAxisLabels(visual.chartType)) {
      return !!(visual.xAxisColumn || visual.yAxisColumn);
    }

    // 3-axis charts: heat-map, sankey, graph need x + y + z
    if (
      this.isHeatMapChartType(visual.chartType) ||
      this.isSankeyChartType(visual.chartType) ||
      this.isGraphChartType(visual.chartType)
    ) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }

    // Standard axis charts need x + y
    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  is3DCoordinateChartType(chartType: string | null): boolean {
    return is3DCoordinateChartType(chartType);
  }

  /**
   * Compute and store chart data on the visual object based on axis selections
   * Uses ChartDataTransformerService for modular data transformation
   * @param visual - The visual object with xAxisColumn, yAxisColumn, and zAxisColumn
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

  setVisualChartType(chartType: any): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = chartType.id;
      visual.title = chartType.name;
      // Recompute chart data for new chart type (different types need different formats)
      this.updateVisualChartData(visual);
    }
  }

  removeVisual(id: string): void {
    this.visuals = this.visuals.filter(v => v.id !== id);
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
    }
    // Reflow remaining visuals to fill the gap
    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
  }

  clearChartType(): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = null;
      visual.title = `Untitled Visual`;
      visual.chartData = []; // Clear chart data when chart type is cleared
    }
  }
  // --- Axis Field Selection Mode ---

  // Start axis selection mode (user clicked on X, Y, or Z axis slot)
  startAxisSelection(axis: 'x' | 'y' | 'z'): void {
    // Toggle off if same axis is clicked again
    if (this.activeAxisSelection === axis) {
      this.activeAxisSelection = null;
    } else {
      this.activeAxisSelection = axis;

      // Ensure dataset fields sidebar is open for field selection
      if (!this.isFieldsPanelOpen) {
        // Close visual list if open (mutual exclusivity)
        if (this.isVisualListPanelOpen) {
          this.isVisualListPanelOpen = false;
        }
        this.isFieldsPanelOpen = true;
      }
    }
  }

  // Cancel axis selection mode
  cancelAxisSelection(): void {
    this.activeAxisSelection = null;
  }

  // Handle field click from the Fields panel
  onFieldClick(field: any): void {
    if (this.activeAxisSelection && this.focusedVisualId) {
      const visual = this.getFocusedVisual();
      if (visual) {
        // Use columnToView (or columnToUse as fallback) to get the field name
        const fieldName = field.columnToView || field.columnToUse;

        if (this.activeAxisSelection === 'x') {
          visual.xAxisColumn = fieldName;
        } else if (this.activeAxisSelection === 'y') {
          visual.yAxisColumn = fieldName;
        } else if (this.activeAxisSelection === 'z') {
          visual.zAxisColumn = fieldName;
        }

        // Update chart data if required axes are set
        this.updateVisualChartData(visual);

        // Clear selection mode after assignment
        this.activeAxisSelection = null;
        // Trigger change detection to update the UI
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    }
  }

  // Clear a specific axis field
  clearAxisField(axis: 'x' | 'y' | 'z', event: Event): void {
    event.stopPropagation();
    const visual = this.getFocusedVisual();
    if (visual) {
      if (axis === 'x') {
        visual.xAxisColumn = null;
      } else if (axis === 'y') {
        visual.yAxisColumn = null;
      } else if (axis === 'z') {
        visual.zAxisColumn = null;
      }
      // Re-compute chart data after clearing
      this.updateVisualChartData(visual);
      this.cdr.detectChanges();
    }
  }

  // Get display name for a column
  getFieldDisplayName(columnToUse: string | null): string {
    if (!columnToUse || !this.datasetDetails?.datasetFields) return '';
    const field = this.datasetDetails.datasetFields.find(
      (f: any) =>
        f.columnToUse === columnToUse || f.columnToView === columnToUse,
    );
    return field?.columnToView || columnToUse;
  }

  clearFocus(): void {
    this.focusedVisualId = null;
    this.isConfigSidebarOpen = false;
  }

  // Left-click: Focus visual for chart type selection
  onVisualClick(event: MouseEvent, id: string): void {
    // Prevent click from firing during/after resize
    if (this.isResizing) {
      return;
    }
    event.stopPropagation();
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null; // Exit focus mode
    } else {
      this.focusedVisualId = id; // Enter focus mode
    }
  }

  // Right-click: Open configuration sidebar
  onVisualRightClick(event: MouseEvent, id: string): void {
    event.preventDefault(); // Prevent default context menu
    event.stopPropagation();
    // Focus the visual and open config sidebar
    this.focusedVisualId = id;
    this.isConfigSidebarOpen = true;
  }

  toggleFocusVisual(id: string): void {
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
      this.isConfigSidebarOpen = false;
    } else {
      this.focusedVisualId = id;
    }
  }

  closeConfigSidebar(): void {
    this.isConfigSidebarOpen = false;
  }

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

    // Calculate grid unit sizes for converting pixel deltas to grid spans
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

    // Only re-layout if spans actually changed
    if (
      newColSpan !== this.resizingVisual.colSpan ||
      newRowSpan !== this.resizingVisual.rowSpan
    ) {
      this.resizingVisual.colSpan = newColSpan;
      this.resizingVisual.rowSpan = newRowSpan;
      // Re-place all visuals so nothing overlaps during resize
      this.placeVisualsOnGrid();
      this.recalculateAllVisualDimensions();
    }

    // Auto-scroll when near canvas edge
    this.autoScrollNearEdge(event.clientY);
  }

  stopResize(mouseMoveHandler: any, mouseUpHandler: any): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);

    // Re-place all visuals to resolve any overlaps from the resize
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

  /**
   * Update the tracked cursor Y and start continuous auto-scroll.
   * Uses requestAnimationFrame so scrolling continues even when the
   * mouse is stationary inside the edge zone.
   */
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
        // Proportional speed: faster the closer to the edge
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
    // Auto-scroll when dragging near canvas edge
    this.autoScrollNearEdge(event.clientY);
  }

  /** Canvas-level dragover for auto-scroll in empty areas */
  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.autoScrollNearEdge(event.clientY);
  }

  onDrop(event: DragEvent, targetVisual: any): void {
    event.preventDefault();
    if (this.draggingVisual && this.draggingVisual !== targetVisual) {
      const draggedIndex = this.visuals.indexOf(this.draggingVisual);
      const targetIndex = this.visuals.indexOf(targetVisual);

      // Reorder array
      this.visuals.splice(draggedIndex, 1);
      this.visuals.splice(targetIndex, 0, this.draggingVisual);

      // Reflow grid after reorder
      this.placeVisualsOnGrid();
      this.recalculateAllVisualDimensions();
    }
    this.draggingVisual = null;
    this.stopAutoScroll();
  }

  onDragEnd(event: DragEvent): void {
    this.draggingVisual = null;
    this.stopAutoScroll();
  }

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
  scrollToVisual(visual: Visual, event?: Event): void {
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

  /**
   * Get visual configuration status for display
   */
  getVisualStatus(visual: Visual): {
    label: string;
    class: string;
    icon: string;
  } {
    if (!visual.chartType) {
      return {
        label: 'No chart type',
        class: 'status-incomplete',
        icon: 'pi-circle',
      };
    }
    if (!this.hasRequiredChartFields(visual)) {
      return {
        label: 'Fields needed',
        class: 'status-incomplete',
        icon: 'pi-exclamation-circle',
      };
    }
    return {
      label: 'Ready',
      class: 'status-complete',
      icon: 'pi-check-circle',
    };
  }

  /**
   * Get chart type display name
   */
  getChartTypeName(chartTypeId: string | null): string {
    if (!chartTypeId) return 'Not selected';
    const chartType = this.chartTypes.find(c => c.id === chartTypeId);
    return chartType?.name || chartTypeId;
  }

  saveAnalysis(): void {
    // Show the save analysis dialog
    this.showSaveDialog = true;
  }

  handleSaveDialogClose(
    formData: { name: string; description: string } | null,
  ): void {
    this.showSaveDialog = false;

    if (formData) {
      // Build visual configurations with grid-based fields
      const visualConfigurations = this.visuals.map(visual => {
        const visualConfig = {
          id: visual.id,
          title: visual.title,
          // Grid layout (12-column grid)
          colSpan: visual.colSpan,
          rowSpan: visual.rowSpan,
          // Legacy ratios for backward compat
          widthRatio: visual.widthRatio,
          heightRatio: visual.heightRatio,
          xRatio: visual.xRatio,
          yRatio: visual.yRatio,
          // Chart type
          chartType: visual.chartType,
          // Field mappings (columns selected for axes)
          xAxisColumn: visual.xAxisColumn || null,
          yAxisColumn: visual.yAxisColumn || null,
          zAxisColumn: visual.zAxisColumn || null, // For heatmap/bubble charts
          // Full chart configuration (colors, legend, labels, etc.)
          config: visual.config ? { ...visual.config } : null,
        };
        return visualConfig;
      });

      // Build analysis payload
      const analysisPayload = {
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

      this.analysesService.addAnalyses(analysisPayload).then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.router.navigate([ANALYSES.LIST]);
        }
      });
    }
  }
}
