import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { ANALYSES } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import {
  CHART_TYPES,
  getDefaultChartConfig,
  hasAxisLabels,
  is3DCoordinateChartType,
  isFlowLinesChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  isSankeyChartType,
  isWorldMapChartType,
} from '../../constants/charts.constants';
import { createVisual, Visual } from '../../models';
import { AnalysesService } from '../../services/analyses.service';
import { TranslateService } from '@ngx-translate/core';
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
  DATE_FORMAT_OPTIONS,
  FILTER_OPERATOR_KEYS,
  NULL_OPTION_KEYS,
} from '../filter-dialog/filter-dialog.component';

@Component({
  selector: 'app-edit-analyses',
  templateUrl: './edit-analyses.component.html',
  styleUrls: ['./edit-analyses.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditAnalysesComponent
  implements OnInit, AfterViewInit, OnDestroy, HasUnsavedChanges
{
  private destroyRef = inject(DestroyRef);
  analysisId: string = '';
  orgId: string = '';
  datasourceId: string = '';

  private _isDirty = false;

  hasUnsavedChanges(): boolean {
    return this._isDirty;
  }

  markDirty(): void {
    this._isDirty = true;
  }
  datasetId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;

  // Analysis-level fields
  analysisFields: any[] = [];

  // Cached combined fields (dataset + analysis) to avoid creating new objects on every getter call
  private _cachedAllFields: any[] = [];

  // Custom field dialog state
  showCustomFieldDialog: boolean = false;
  editFieldMode: boolean = false;
  editFieldData: any = null;

  // Delete field confirmation
  showDeleteFieldConfirm: boolean = false;
  fieldToDelete: any = null;

  // Sidebar toggle states
  isFieldsPanelOpen: boolean = true;
  isVisualsPanelOpen: boolean = true;
  isVisualListPanelOpen: boolean = false;
  isFilterPanelOpen: boolean = false;

  // Filter configuration
  configuredFilters: ConfiguredFilter[] = [];
  showFilterDialog: boolean = false;
  editingFilter: ConfiguredFilter | null = null;

  // Filter dropdown options (used by getFilterTypeLabel in template)
  filterTypeOptions: { label: string; value: string }[] = [];

  // Search queries
  visualListSearchQuery: string = '';
  datasetFieldsSearchQuery: string = '';

  // Max rows fetched for analysis data
  readonly DATA_ROW_LIMIT = 1000;

  // Visuals
  visuals: Visual[] = [];

  // Filtered visuals based on search query
  get filteredVisuals(): Visual[] {
    if (!this.visualListSearchQuery) {
      return this.visuals;
    }
    return this.visuals.filter((visual: any) =>
      visual.title
        .toLowerCase()
        .includes(this.visualListSearchQuery.toLowerCase()),
    );
  }

  getDataTypeIcon(dataType: string): string {
    if (!dataType) return 'pi-bars';
    const type = dataType.toLowerCase();
    if (
      type.includes('int') ||
      type.includes('numeric') ||
      type.includes('decimal') ||
      type.includes('float') ||
      type.includes('double') ||
      type.includes('real') ||
      type.includes('serial') ||
      type.includes('money')
    )
      return 'pi-hashtag';
    if (
      type.includes('char') ||
      type.includes('text') ||
      type.includes('string') ||
      type.includes('citext') ||
      type.includes('name')
    )
      return 'pi-align-left';
    if (type.includes('bool')) return 'pi-check-square';
    if (
      type.includes('timestamp') ||
      type.includes('date') ||
      type.includes('time') ||
      type.includes('interval')
    )
      return 'pi-calendar';
    if (type.includes('uuid')) return 'pi-key';
    if (type.includes('json')) return 'pi-code';
    if (type.includes('array') || type.includes('[]')) return 'pi-list';
    if (type.includes('bytea') || type.includes('blob')) return 'pi-file';
    if (
      type.includes('inet') ||
      type.includes('cidr') ||
      type.includes('macaddr')
    )
      return 'pi-globe';
    if (type.includes('enum') || type.includes('user-defined'))
      return 'pi-sliders-h';
    return 'pi-bars';
  }

  // Combined fields: dataset-level + analysis-level (cached)
  get allFields(): any[] {
    return this._cachedAllFields;
  }

  // Rebuild the cached fields list — call when datasetDetails or analysisFields change
  private rebuildAllFields(): void {
    const datasetFields = (this.datasetDetails?.datasetFields || []).map(
      (f: any) => ({
        ...f,
        _scope: 'dataset',
      }),
    );
    const analysisFields = (this.analysisFields || []).map((f: any) => ({
      ...f,
      _scope: 'analysis',
    }));
    this._cachedAllFields = [...datasetFields, ...analysisFields];
  }

  // Filtered fields based on search query
  get filteredDatasetFields(): any[] {
    const fields = this._cachedAllFields;
    if (!fields.length) {
      return [];
    }
    if (!this.datasetFieldsSearchQuery) {
      return fields;
    }
    return fields.filter((field: any) =>
      field.columnToView
        .toLowerCase()
        .includes(this.datasetFieldsSearchQuery.toLowerCase()),
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
  datasetStatus$!: Observable<DatasetLoadingStatus>;
  isDataLoaded$!: Observable<boolean>;

  // Raw data from dataset query
  rawGraphData: any[] = [];

  // Maximized visual
  maximizedVisual: any = null;

  // Dragging
  draggingVisual: any = null;

  // Title editing
  editingTitleId: string | null = null;

  // Axis selection mode
  activeAxisSelection: 'x' | 'y' | 'z' | null = null;

  // Canvas container reference and dimensions for responsive sizing
  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;
  canvasWidth: number = 1000; // Default fallback
  canvasHeight: number = 600; // Default fallback

  // Auto-scroll for resize
  private autoScrollRafId: number | null = null;
  private autoScrollClientY: number = 0;

  // Grid constants
  private readonly GRID_COLUMNS = 24;
  private readonly GRID_ROWS = 12;
  private readonly GRID_GAP = 12;
  private dynamicRowHeight = 50; // Computed from canvas height

  // Reference canvas size for legacy visuals (pixels to ratio conversion)
  private readonly REFERENCE_CANVAS_WIDTH = 1200;
  private readonly REFERENCE_CANVAS_HEIGHT = 600;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: any = null;
  private lastStableWidth: number = 0;
  private lastStableHeight: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: Store,
    private cdr: ChangeDetectorRef,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService,
    private chartDataTransformer: ChartDataTransformerService,
    private translate: TranslateService,
  ) {}

  get saving() {
    return this.analysesService.saving;
  }
  get running() {
    return this.analysesService.running;
  }

  ngOnInit(): void {
    this.filterTypeOptions = [
      { label: this.translate.instant('ANALYSES.FILTER_TYPE_CATEGORY'), value: 'category' },
      { label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_EXACT'), value: 'numeric_equality' },
      { label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_RANGE'), value: 'numeric_range' },
      { label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_EXACT'), value: 'time_equality' },
      { label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_RANGE'), value: 'time_range' },
    ];

    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.orgId = params['orgId'];
        this.analysisId = params['id'];
        if (this.analysisId) {
          this.loadAnalysis();
        }
      });
  }

  ngAfterViewInit(): void {
    // Get initial canvas dimensions after view is initialized
    setTimeout(() => {
      this.updateCanvasDimensions();
      this.lastStableWidth = this.canvasWidth;
      this.lastStableHeight = this.canvasHeight;
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

      // Compute dynamic row height so GRID_ROWS rows fill the visible canvas
      // Formula: canvasHeight = GRID_ROWS * rowHeight + (GRID_ROWS - 1) * gap + padding
      const CANVAS_PADDING = 40;
      const availableHeight = this.canvasHeight - CANVAS_PADDING;
      this.dynamicRowHeight = Math.max(
        30,
        Math.floor(
          (availableHeight - (this.GRID_ROWS - 1) * this.GRID_GAP) /
            this.GRID_ROWS,
        ),
      );

      // Apply as CSS variable so grid-auto-rows stays in sync
      this.canvasContainer.nativeElement.style.setProperty(
        '--dynamic-row-height',
        `${this.dynamicRowHeight}px`,
      );
    }
  }

  /**
   * Recalculate all visual pixel dimensions from their grid spans
   */
  private recalculateAllVisualDimensions(): void {
    this.visuals.forEach(visual => {
      this.computeVisualDimensions(visual);
    });
    this.cdr.markForCheck();
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
        visual.rowSpan * this.dynamicRowHeight +
          (visual.rowSpan - 1) * this.GRID_GAP,
      ),
    );
    visual.widthRatio = visual.colSpan / this.GRID_COLUMNS;
    visual.heightRatio = visual.rowSpan / this.GRID_ROWS;
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
    this.analysesService
      .viewAnalyses(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisDetails = response.data;
          this.datasourceId = response.data.datasourceId;
          this.datasetId = response.data.datasetId;

          if (this.datasetId) {
            // Immediately initialize store selectors so cached data is available
            this.initializeStoreSelectors();

            // Load dataset info, analysis fields, filters in parallel
            this.loadDatasetInfo();
            this.loadAnalysisFields();
            this.loadExistingFilters();

            // Check cache and load data + visuals
            this.checkCachedDataAndLoad();
          }
        }
        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Error loading analysis:', error);
        this.cdr.markForCheck();
      });
  }

  /**
   * Step 2: Load dataset info (fields)
   */
  loadDatasetInfo(): void {
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
          this.rebuildAllFields();
        }
        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Error loading dataset info:', error);
        this.cdr.markForCheck();
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
          this.rebuildAllFields();
        }
        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Error loading analysis fields:', error);
        this.cdr.markForCheck();
      });
  }

  /**
   * Check for cached data in the store before running a fresh query.
   * - No cache: load fresh data
   * - Cached but stale (>10 min): use cached immediately, refresh in background
   * - Cached and fresh: use cached data, skip query
   */
  private checkCachedDataAndLoad(): void {
    this.store
      .select(selectDatasetByKey(this.orgId, this.datasetId))
      .pipe(first())
      .subscribe(cachedEntry => {
        if (!cachedEntry || !cachedEntry.data) {
          // No cached data, load fresh
          this.loadDatasetData();
        } else {
          // Check if data is stale
          this.store
            .select(selectIsDatasetStale(this.orgId, this.datasetId))
            .pipe(first())
            .subscribe(isStale => {
              if (isStale) {
                // Stale data is already in store (subscription picks it up),
                // but refresh in background
                this.loadDatasetData();
              }
              // If fresh, do nothing — store subscription already has the data
            });
        }

        // Load saved visuals regardless of cache state
        this.loadAllVisuals();
      });
  }

  /**
   * Initialize NgRx store selectors and subscribe to data changes
   */
  initializeStoreSelectors(): void {
    this.graphData$ = this.store.select(
      selectDatasetData(this.orgId, this.datasetId),
    );
    this.datasetStatus$ = this.store.select(
      selectDatasetStatus(this.orgId, this.datasetId),
    );
    this.isDataLoaded$ = this.store.select(
      selectIsDatasetLoaded(this.orgId, this.datasetId),
    );

    // Subscribe to graphData$ to populate rawGraphData and transform charts
    this.graphData$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => {
        if (data && data.length > 0) {
          this.rawGraphData = data;
          // Transform chart data for all loaded visuals
          this.transformAllVisualsChartData();
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Run the analysis query API — fetches dataset data enriched with
   * both dataset-level and analysis-level custom fields.
   */
  loadDatasetData(): void {
    this.store.dispatch(
      AddAnalysesActions.loadDatasetData({
        orgId: this.orgId,
        datasetId: this.datasetId,
      }),
    );

    this.analysesService
      .runAnalysisQuery({
        datasetId: this.datasetId,
        analysisId: this.analysisId,
        organisation: this.orgId,
        limit: this.DATA_ROW_LIMIT,
      })
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
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
              error: response?.message || this.translate.instant('ANALYSES.FAILED_LOAD_GRAPH_DATA'),
            }),
          );
        }
      })
      .catch(error => {
        console.error('Error running analysis query:', error);
        this.store.dispatch(
          AddAnalysesActions.loadDatasetDataFailure({
            orgId: this.orgId,
            datasetId: this.datasetId,
            error: error?.message || this.translate.instant('ANALYSES.ERROR_LOADING_GRAPH_DATA'),
          }),
        );
      });
  }

  /**
   * Transform chart data for all loaded visuals
   */
  transformAllVisualsChartData(): void {
    if (!this.rawGraphData || this.rawGraphData.length === 0) {
      return;
    }

    this.visuals.forEach(visual => {
      // Only transform visuals that are loaded (not in skeleton state)
      if (visual.loaded && !visual.chartData?.length) {
        this.transformSingleVisualChartData(visual);
      }
    });
  }

  /**
   * Step 4: Load visual list as skeletons, then fetch each visual independently
   */
  loadAllVisuals(): void {
    // First, get the list of visuals (for skeleton)
    this.analysesService
      .listVisuals(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const visualsData = response.data.visuals || [];

          // Create skeleton visuals with loading state
          this.visuals = visualsData.map((visualData: any) => {
            // Extract chart configuration from nested visualConfig object
            const visualConfig = visualData.visualConfig || {};

            const visual: any = {
              id: visualData.id,
              title: visualData.title || this.translate.instant('COMMON.LOADING'),
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
              this.calculateRatiosFromLegacy(visual);
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
                Math.round((visual.heightRatio || 0.5) * this.GRID_ROWS),
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
            this.visualCounter = Math.max(
              ...this.visuals.map(v => Number(v.id) || 0),
              0,
            );
          }

          this.cdr.markForCheck();

          // Step 5: Fetch each visual independently and plot in real-time
          this.fetchVisualsIndependently();
        }
      })
      .catch(error => {
        console.error('Error loading visuals:', error);
      });
  }

  /**
   * Step 5: Fetch each visual independently in parallel
   * Plot each visual as soon as its data arrives
   */
  fetchVisualsIndependently(): void {
    // Create promises for all visuals
    this.visuals.forEach(visual => {
      this.analysesService
        .getVisual(this.orgId, this.analysisId, visual.id)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            const visualData = response.data;

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

              this.cdr.markForCheck();
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
            this.cdr.markForCheck();
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
    if (!this.rawGraphData || this.rawGraphData.length === 0) {
      visual.chartData = [];
      return;
    }
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

  refreshData(): void {
    // Simply call loadDatasetData again to refresh the data
    this.loadDatasetData();
  }

  goBack(): void {
    this.router.navigate([ANALYSES.LIST]);
  }

  // --- Custom Field Dialog ---

  openAddCustomField(): void {
    this.editFieldMode = false;
    this.editFieldData = null;
    this.showCustomFieldDialog = true;
  }

  openEditCustomField(field: any): void {
    this.editFieldMode = true;
    this.editFieldData = {
      ...field,
      datasetId: this.datasetId,
      organisationId: this.orgId,
    };
    this.showCustomFieldDialog = true;
  }

  onCustomFieldDialogClose(event: any): void {
    this.showCustomFieldDialog = false;
    if (event?.field) {
      // Refresh both dataset and analysis fields
      this.loadAnalysisFields();
      // Also refresh dataset details in case a dataset-level field was edited
      this.datasetService
        .getDataset(this.orgId, this.datasetId)
        .then(response => {
          if (this.globalService.handleSuccessService(response, false)) {
            this.datasetDetails = response.data;
            this.rebuildAllFields();
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
      // Re-run dataset query so the new field's computed values are available
      this.loadDatasetData();
    }
  }

  confirmDeleteField(field: any): void {
    this.fieldToDelete = field;
    this.showDeleteFieldConfirm = true;
  }

  cancelDeleteField(): void {
    this.fieldToDelete = null;
    this.showDeleteFieldConfirm = false;
  }

  proceedDeleteField(): void {
    if (!this.fieldToDelete) return;
    this.datasetService
      .deleteDatasetField(this.orgId, this.datasetId, this.fieldToDelete.id)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.fieldToDelete = null;
          this.showDeleteFieldConfirm = false;
          this.loadAnalysisFields();
        } else {
          // Keep dialog open so user sees context; toast shows the API error
          this.showDeleteFieldConfirm = false;
        }
      })
      .catch(error => {
        console.error('Error deleting field:', error);
        this.showDeleteFieldConfirm = false;
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

  isDeletingFilter: string | null = null;

  async removeFilter(filter: ConfiguredFilter): Promise<void> {
    if (this.isDeletingFilter) return; // prevent double-click
    this.isDeletingFilter = filter.tempId;
    try {
      const res: any = await this.analysesService.deleteFilter(
        this.orgId,
        filter.tempId,
      );
      if (this.globalService.handleSuccessService(res, true)) {
        await this.loadExistingFilters();
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    } finally {
      this.isDeletingFilter = null;
    }
  }

  getOperatorLabel(filterType: string, operatorValue: string): string {
    const ops = FILTER_OPERATOR_KEYS[filterType] || [];
    const match = ops.find((o: { labelKey: string; value: string }) => o.value === operatorValue);
    return match ? this.translate.instant(match.labelKey) : operatorValue;
  }

  getNullOptionLabel(value: string): string {
    const match = NULL_OPTION_KEYS.find((o: { labelKey: string; value: string }) => o.value === value);
    return match ? this.translate.instant(match.labelKey) : value;
  }

  getFilterConfigSummary(filter: ConfiguredFilter): string {
    const parts: string[] = [];
    const config = filter.config || {};
    if (config.matchOperator) {
      parts.push(
        this.getOperatorLabel(filter.filterType, config.matchOperator),
      );
    }
    if (filter.nullOption && filter.nullOption !== 'ALL_VALUES') {
      parts.push(this.getNullOptionLabel(filter.nullOption));
    }
    if (config.placeholder) {
      parts.push(`"${config.placeholder}"`);
    }
    if (config.defaultValue) {
      if (Array.isArray(config.defaultValue)) {
        parts.push(this.translate.instant('ANALYSES.DEFAULT_VALUES_COUNT', { count: config.defaultValue.length }));
      } else {
        parts.push(this.translate.instant('ANALYSES.DEFAULT_VALUE', { value: config.defaultValue }));
      }
    }
    if (config.rangeMin !== undefined || config.rangeMax !== undefined) {
      parts.push(
        this.translate.instant('ANALYSES.RANGE_SUMMARY', { min: config.rangeMin ?? '...', max: config.rangeMax ?? '...' }),
      );
    }
    if (config.dateRangeStart || config.dateRangeEnd) {
      parts.push(this.translate.instant('ANALYSES.DATE_RANGE_SET'));
    }
    if (config.dateFormat) {
      const fmt = DATE_FORMAT_OPTIONS.find(o => o.value === config.dateFormat);
      parts.push(fmt ? fmt.label : config.dateFormat);
    }
    if (config.includeTime) {
      parts.push(this.translate.instant('ANALYSES.WITH_TIME'));
    }
    return parts.join(' · ');
  }

  resequenceFilters(): void {
    this.configuredFilters.forEach((f, i) => (f.sequence = i));
  }

  getFilterTypeLabel(type: string): string {
    return this.filterTypeOptions.find(o => o.value === type)?.label || type;
  }

  async loadExistingFilters(): Promise<void> {
    try {
      const res: any = await this.analysesService.listFilters(
        this.orgId,
        this.analysisId,
      );
      if (res?.status && res.data) {
        this.configuredFilters = (res.data || []).map((f: any) => ({
          tempId: f.id || crypto.randomUUID(),
          name: f.name,
          columnName: f.columnName,
          filterType: f.filterType,
          controlType: f.controlType,
          config: f.config || {},
          nullOption: f.nullOption || 'ALL_VALUES',
          isEnabled: f.isEnabled !== false,
          isMandatory: f.isMandatory || false,
          sequence: f.sequence ?? 0,
        }));
      } else if (res && !res.status) {
        this.globalService.handleSuccessService(res, false, true);
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    }
  }

  addVisual(): void {
    this.markDirty();
    this.visualCounter++;
    const visual = createVisual(
      String(this.visualCounter),
      getDefaultChartConfig(),
    );

    // Default grid size: 12 columns (half width), 6 rows
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
        }, 1000);
      }
    }, 100);
  }

  trackByVisualId(index: number, visual: Visual): string {
    return visual.id;
  }

  trackById(index: number, item: any): any {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByName(index: number, item: any): any {
    return item.name;
  }

  getFocusedVisual(): Visual | null {
    return this.visuals.find(v => v.id === this.focusedVisualId) || null;
  }

  // Stable placeholder for when no visual is focused — prevents creating throwaway objects per CD cycle
  private readonly _placeholderVisual: Visual = createVisual(
    '0',
    getDefaultChartConfig(),
  );

  /**
   * Safe getter for focused visual - use this in templates with ngModel
   * Returns a stable placeholder visual to avoid null errors when no visual is focused
   */
  get focusedVisual(): Visual {
    return this.getFocusedVisual() || this._placeholderVisual;
  }

  get focusedVisualMappedFieldCount(): number {
    const v = this.getFocusedVisual();
    if (!v) return 0;
    return [v.xAxisColumn, v.yAxisColumn, v.zAxisColumn].filter(Boolean).length;
  }

  get canSave(): boolean {
    return this.visuals.some(v => v.chartType !== null);
  }

  getVisualChartIcon(chartType: string | null | undefined): string {
    if (!chartType) return 'pi pi-chart-bar';
    return CHART_TYPES.find(c => c.id === chartType)?.icon ?? 'pi pi-chart-bar';
  }

  getVisualChartLabel(chartType: string | null | undefined): string {
    if (!chartType) return this.translate.instant('ANALYSES.NO_CHART_SELECTED');
    return CHART_TYPES.find(c => c.id === chartType)?.name ?? chartType;
  }

  isHeatMapChartType(chartType: string | null | undefined): boolean {
    return isHeatMapChartType(chartType ?? null);
  }

  isSankeyChartType(chartType: string | null | undefined): boolean {
    return isSankeyChartType(chartType ?? null);
  }

  isGraphChartType(chartType: string | null | undefined): boolean {
    return isGraphChartType(chartType ?? null);
  }

  isWorldMapChartType(chartType: string | null | undefined): boolean {
    return isWorldMapChartType(chartType ?? null);
  }

  isFlowLinesChartType(chartType: string | null | undefined): boolean {
    return isFlowLinesChartType(chartType ?? null);
  }

  isLines3dChartType(chartType: string | null | undefined): boolean {
    return isLines3dChartType(chartType ?? null);
  }

  isPolygons3dChartType(chartType: string | null | undefined): boolean {
    return isPolygons3dChartType(chartType ?? null);
  }

  hasRequiredChartFields(visual: any): boolean {
    if (!visual.chartType) return false;
    // 3D coordinate charts need x + y + z
    if (is3DCoordinateChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }
    // lines3d needs longitude AND latitude (x + y), even though it has no axis labels
    if (isLines3dChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn);
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

  removeVisual(id: string): void {
    this.markDirty();
    this.visuals = this.visuals.filter(v => v.id !== id);
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
    }
    this.placeVisualsOnGrid();
    this.recalculateAllVisualDimensions();
  }

  clearChartType(visual?: Visual): void {
    this.markDirty();
    const target = visual || this.getFocusedVisual();
    if (target) {
      target.chartType = null;
      target.title = this.translate.instant('ANALYSES.UNTITLED_VISUAL');
      target.xAxisColumn = null;
      target.yAxisColumn = null;
      target.zAxisColumn = null;
      target.config = getDefaultChartConfig();
      target.chartData = [];
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
    this.markDirty();
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

  onChartTypeSelected(): void {
    this.markDirty();
    const visual = this.getFocusedVisual();
    if (visual) {
      this.updateVisualChartData(visual);
    }
  }

  onAxisSelectionStarted(axis: 'x' | 'y' | 'z' | null): void {
    this.activeAxisSelection = axis;
    if (axis && !this.isFieldsPanelOpen) {
      if (this.isVisualListPanelOpen) {
        this.isVisualListPanelOpen = false;
      }
      this.isFieldsPanelOpen = true;
    }
  }

  onAxisFieldCleared(): void {
    this.markDirty();
    const visual = this.getFocusedVisual();
    if (visual) {
      this.updateVisualChartData(visual);
    }
    this.cdr.markForCheck();
  }

  onFieldClick(field: any): void {
    if (this.activeAxisSelection && this.focusedVisualId) {
      this.markDirty();
      const visual = this.getFocusedVisual();
      if (visual) {
        // Use columnToUse — this is the actual key in the raw data rows
        const fieldName = field.columnToUse || field.columnToView;

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
        this.cdr.markForCheck();
      }
    }
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
    const rowUnit = this.dynamicRowHeight + this.GRID_GAP;

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
      this.markDirty();
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
      this.markDirty();
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
        label: this.translate.instant('ANALYSES.STATUS_NO_CHART_TYPE'),
        class: 'status-incomplete',
        icon: 'pi-circle',
      };
    }
    if (!this.hasRequiredChartFields(visual)) {
      return {
        label: this.translate.instant('ANALYSES.STATUS_FIELDS_NEEDED'),
        class: 'status-incomplete',
        icon: 'pi-exclamation-circle',
      };
    }
    return {
      label: this.translate.instant('ANALYSES.STATUS_READY'),
      class: 'status-complete',
      icon: 'pi-check-circle',
    };
  }

  saveAnalysis(): void {
    this.showSaveDialog = true;
  }

  handleSaveDialogClose(
    formData: {
      name: string;
      description: string;
      justification?: string;
    } | null,
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

      const updatePayload = {
        id: this.analysisId,
        name: formData.name,
        description: formData.description,
        datasetId: this.datasetId,
        organisation: this.orgId,
        datasource: this.datasourceId,
        visuals: visualConfigurations,
      };

      this.analysesService
        .updateAnalyses(updatePayload, formData.justification)
        .then(response => {
          if (this.globalService.handleSuccessService(response, true)) {
            this._isDirty = false;
            this.router.navigate([ANALYSES.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }
}
