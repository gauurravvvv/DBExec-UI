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
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { ANALYSES, DASHBOARD } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DashboardService } from 'src/app/modules/dashboard/services/dashboard.service';
import { DatasetService } from '../../../dataset/services/dataset.service';
import {
  CHART_TYPES,
  getDefaultChartConfig,
  getMissingFieldsForVisual,
  hasAxisLabels,
  is3DCoordinateChartType,
  isFlowLinesChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  isSankeyChartType,
  isTableChartType,
  isWorldMapChartType,
} from '../../constants/charts.constants';
import { createVisual, Visual } from '../../models';
import { ChartDataTransformerService } from '../../services';
import { AnalysesService } from '../../services/analyses.service';
import {
  AddAnalysesActions,
  AnalysesFilterActions,
  AnalysesFilterDef,
  DatasetLoadingStatus,
  selectConfiguredFilters,
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
import { PublishDashboardPayload } from '../publish-dashboard-dialog/publish-dashboard-dialog.component';

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

  /**
   * Monotonic counter passed down to chart-renderer as `configVersion`. Bumped
   * on every mutation that should re-render the chart — config sidebar field
   * tweaks, axis remaps, etc. — so OnPush sees a real Input change and CD
   * reaches the inner EchartVisual whose ngDoCheck does the deep diff.
   */
  chartConfigVersion = 0;

  /**
   * Twin of chartConfigVersion for `visual.chartData` mutations.
   * Bumped after every transform pass so chart-renderer's OnPush sees
   * a real @Input change. Without this kick, mutating `visual.chartData`
   * in-place doesn't propagate — the parent reference (visual) is the
   * same object and OnPush blocks CD. Symptom before the fix: chart
   * stayed painted with stale rows after a field-edit re-query.
   */
  chartDataVersion = 0;

  markDirty(): void {
    this._isDirty = true;
    this.chartConfigVersion++;
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

  /** Coarse type bucket, used to color the field-icon chip per type. */
  getDataTypeCategory(dataType: string): string {
    if (!dataType) return 'other';
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
      return 'numeric';
    if (
      type.includes('char') ||
      type.includes('text') ||
      type.includes('string') ||
      type.includes('citext') ||
      type.includes('name')
    )
      return 'text';
    if (type.includes('bool')) return 'bool';
    if (
      type.includes('timestamp') ||
      type.includes('date') ||
      type.includes('time') ||
      type.includes('interval')
    )
      return 'date';
    if (type.includes('uuid') || type.includes('json')) return 'special';
    return 'other';
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

  // Publish-to-dashboard state. Tracked alongside save state but
  // independent so the user can have one in-flight without blocking
  // the other. publishing is a signal so OnPush still picks up the
  // flip if a future refactor moves the assignment outside a
  // zone-triggered context (timer, microtask).
  showPublishDialog: boolean = false;
  publishing = signal(false);

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
    private dashboardService: DashboardService,
  ) {}

  get saving() {
    return this.analysesService.saving;
  }
  get running() {
    return this.analysesService.running;
  }

  ngOnInit(): void {
    this.filterTypeOptions = [
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_CATEGORY'),
        value: 'category',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_EXACT'),
        value: 'numeric_equality',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_NUMERIC_RANGE'),
        value: 'numeric_range',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_EXACT'),
        value: 'time_equality',
      },
      {
        label: this.translate.instant('ANALYSES.FILTER_TYPE_DATETIME_RANGE'),
        value: 'time_range',
      },
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
   * Step 1: Load analysis bootstrap — single call that primes the
   * page with analysis metadata + dataset name + dataset/analysis
   * field lists. Replaces three legacy calls (viewAnalyses,
   * loadDatasetInfo, loadAnalysisFields) on first load.
   *
   * The helper methods (loadDatasetInfo, loadAnalysisFields) stay
   * available for the Refresh Fields button and any code path that
   * needs to re-fetch just one slice without re-running the whole
   * bootstrap.
   */
  loadAnalysis(): void {
    this.analysesService
      .getBootstrap(this.orgId, this.analysisId)
      .then(response => {
        if (!this.globalService.handleSuccessService(response, false)) {
          this.cdr.markForCheck();
          return;
        }

        const data = response.data || {};
        const a = data.analysis || {};

        // Analysis metadata. Old viewAnalyses returned a much fatter
        // payload (nested dataset, nested datasource, organisation
        // fields, createdOn). The page never used any of that — we
        // only project what's actually consumed.
        this.analysisDetails = a;
        this.datasourceId = a.datasourceId;
        this.datasetId = a.datasetId;

        // Dataset details — the page only needs the name (sidebar
        // header crumb) and the field list. Build a thin stub so
        // template bindings like `datasetDetails?.name` keep working
        // without changing every template reference.
        this.datasetDetails = {
          id: a.datasetId,
          name: a.datasetName,
          datasetFields: data.datasetFields || [],
        };

        // Analysis-level custom fields
        this.analysisFields = data.analysisFields || [];

        // Rebuild the merged allFields list once, after both slices
        // are populated. The old chain rebuilt twice (once per call);
        // bootstrap does it in a single pass.
        this.rebuildAllFields();

        if (this.datasetId) {
          // Initialise selectors first so the filter store
          // subscription is wired BEFORE any dispatch.
          this.initializeStoreSelectors();

          this.checkCachedDataAndLoad();
        }

        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Error loading analysis bootstrap:', error);
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
   * Initialize NgRx store selectors and subscribe to data changes.
   *
   * Two slices feed this component:
   *   addAnalyses     — dataset cache (graphData / status / loaded).
   *   analysesFilter  — filter metadata + per-filter option cache.
   *
   * The filter selectors render configuredFilters from the store
   * instead of the old loadExistingFilters() local fetch.
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

    // Filter slice — mirror the store's configured[] into the
    // component's local field that the template + dialog already read.
    // The selector returns AnalysesFilterDef[]; we map into the
    // existing ConfiguredFilter shape so no template changes are
    // needed.
    this.store
      .select(selectConfiguredFilters(this.analysisId))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((filters: AnalysesFilterDef[]) => {
        this.configuredFilters = (filters || []).map(f => ({
          tempId: f.id,
          name: f.name,
          columnName: f.columnName,
          filterType: f.filterType,
          controlType: f.controlType,
          config: f.config || {},
          nullOption: f.nullOption || 'ALL_VALUES',
          isEnabled: f.isEnabled !== false,
          isMandatory: !!f.isMandatory,
          sequence: f.sequence ?? 0,
        }));
        this.cdr.markForCheck();
      });

    // Mark this analysis active so selectors target the right lane.
    // The actual loadOpen dispatch is DEFERRED to toggleFilterPanel —
    // users who never open the filter sidebar shouldn't pay for the
    // filter-list + dropdown-options network round trip. The effect's
    // own freshness gate handles re-opens, so this lazy strategy
    // composes correctly with the existing cache.
    this.store.dispatch(
      AnalysesFilterActions.setActiveAnalysis({ analysisId: this.analysisId }),
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
              error:
                response?.message ||
                this.translate.instant('ANALYSES.FAILED_LOAD_GRAPH_DATA'),
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
            error:
              error?.message ||
              this.translate.instant('ANALYSES.ERROR_LOADING_GRAPH_DATA'),
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

    // Re-transform every loaded visual on every query response. The
    // previous guard (`!visual.chartData?.length`) skipped visuals
    // that already had chart data — which was exactly the case that
    // needs re-transformation after a field edit / formula change.
    // Without the re-transform, charts kept showing rows from the
    // previous query even after the new response landed. Skeleton
    // visuals (loaded=false) are still skipped — their initial
    // transform fires when they hydrate.
    this.visuals.forEach(visual => {
      if (visual.loaded) {
        this.transformSingleVisualChartData(visual);
      }
    });

    // Bump the dataVersion counter so chart-renderer's OnPush
    // detects a real @Input change and propagates the new chartData
    // down to <app-echart-visual>. Without this, in-place mutation
    // of visual.chartData doesn't trigger CD on the OnPush child —
    // the chart keeps painting rows from the previous query.
    this.chartDataVersion++;
  }

  /**
   * Step 4: Load all visuals — single hydrated call. The response
   * already includes each visual's visualConfig, so we hydrate the
   * canvas in one pass instead of doing list + N per-visual fetches.
   *
   * The original list+per-visual pattern is kept available via
   * listVisuals() / getVisual() for any future code path that wants
   * skeleton-first behaviour. On the Edit Analysis canvas the user
   * always sees all visuals at once, so paying for one combined
   * round trip wins clearly.
   */
  loadAllVisuals(): void {
    this.analysesService
      .listVisualsWithConfig(this.orgId, this.analysisId)
      .then(response => {
        if (!this.globalService.handleSuccessService(response, false)) return;

        const visualsData = response.data.visuals || [];

        this.visuals = visualsData.map((visualData: any) => {
          // visualConfig is guaranteed populated by the hydrated
          // endpoint (LEFT JOIN — null is valid for orphaned visuals
          // that never had a config saved). Fall back to top-level
          // fields for those rare cases so we never crash.
          const visualConfig = visualData.visualConfig || {};

          const visual: any = {
            id: visualData.id,
            title: visualData.title || this.translate.instant('COMMON.LOADING'),
            x: visualData.x || 0,
            y: visualData.y || 0,
            width: visualData.width || 400,
            height: visualData.height || 350,
            widthRatio: visualData.widthRatio || null,
            heightRatio: visualData.heightRatio || null,
            xRatio: visualData.xRatio ?? null,
            yRatio: visualData.yRatio ?? null,
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
            // No two-phase skeleton anymore — everything we need is
            // already in the response. Mark loaded immediately so
            // the canvas paints without an empty-state flash.
            loading: false,
            loaded: true,
          };

          if (
            !visual.widthRatio ||
            !visual.heightRatio ||
            visual.xRatio === null ||
            visual.yRatio === null
          ) {
            this.calculateRatiosFromLegacy(visual);
          }

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

          this.computeVisualDimensions(visual);

          return visual;
        });

        this.placeVisualsOnGrid();

        if (this.visuals.length > 0) {
          this.visualCounter = Math.max(
            ...this.visuals.map(v => Number(v.id) || 0),
            0,
          );
        }

        // If the dataset rows have already arrived, transform each
        // visual's chartData now. Otherwise the rows will trigger
        // transforms when they land (see loadDatasetDataSuccess).
        if (this.rawGraphData && this.rawGraphData.length > 0) {
          this.visuals.forEach(v => this.transformSingleVisualChartData(v));
        }

        this.cdr.markForCheck();
      })
      .catch(error => {
        console.error('Error loading visuals:', error);
      });
  }

  /**
   * Transform chart data for a single visual
   */
  transformSingleVisualChartData(visual: any): void {
    if (!this.rawGraphData || this.rawGraphData.length === 0) {
      return;
    }

    // Tables render the full dataset as-is; no axis-to-field mapping.
    if (isTableChartType(visual.chartType)) {
      // Seed an empty visibility config on first render so the table
      // starts blank and the user opts each column in.
      if (!visual.config || visual.config.tableHiddenColumns === undefined) {
        this.seedTableHiddenColumns(visual);
      }
      visual.chartData = this.rawGraphData;
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
    if (isTableChartType(visual.chartType)) {
      if (!visual.config || visual.config.tableHiddenColumns === undefined) {
        this.seedTableHiddenColumns(visual);
      }
      visual.chartData = this.rawGraphData;
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

  // ── Refresh the field list ────────────────────────────────────────
  // Re-fetches BOTH the dataset's schema fields and the analysis-level
  // custom fields, then drops the analyses-filter store lane so the
  // filter sidebar refetches its filters + options too. This is the
  // single entry point users hit when they want to see what someone
  // (themselves or a collaborator) has added since the page loaded.
  //
  // Why do both at once: the merged allFields list and the filter list
  // share the same "this analysis" mental model. Splitting them into
  // two separate refresh buttons would be confusing — and the user
  // explicitly asked for one button that covers both surfaces.
  //
  // Why not a full page reload: it discards in-progress visual config,
  // chart edits, axis selections, etc. — work the user hasn't saved
  // yet. This refresh keeps all of that intact.

  isRefreshingFields = false;

  refreshFields(): void {
    if (this.isRefreshingFields) return; // guard against rapid clicks
    if (!this.orgId || !this.analysisId || !this.datasetId) return;

    this.isRefreshingFields = true;
    this.cdr.markForCheck();

    // Kick off dataset + analysis-fields fetches in parallel. They
    // share rebuildAllFields() as their merge point; each completes
    // independently, so we use Promise.allSettled to keep the
    // spinner accurate even if one of the two fails.
    const datasetPromise = this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
          this.rebuildAllFields();
        }
      })
      .catch(err => {
        console.error('Refresh: dataset fields failed', err);
      });

    const analysisPromise = this.analysesService
      .getAnalysisFields(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisFields = response.data?.analysisFields || [];
          this.rebuildAllFields();
        }
      })
      .catch(err => {
        console.error('Refresh: analysis fields failed', err);
      });

    Promise.allSettled([datasetPromise, analysisPromise]).then(() => {
      // Drop the analyses-filter lane so the next sidebar interaction
      // (or the immediate loadOpen below, if the sidebar is open)
      // pulls fresh filter rows + dropdown options. The freshness
      // gate inside loadOpen$ effect respects loadedAt; we use the
      // explicit invalidate to bypass it.
      this.store.dispatch(
        AnalysesFilterActions.invalidateAnalysis({
          analysisId: this.analysisId,
        }),
      );

      // If the filter sidebar is open right now, the user expects
      // to see fresh filters immediately — no second click needed.
      // Re-dispatch loadOpen after the invalidate so the effect
      // takes the empty-lane fast path and fetches.
      if (this.isFilterPanelOpen) {
        this.store.dispatch(
          AnalysesFilterActions.loadOpen({
            analysisId: this.analysisId,
            organisation: this.orgId,
          }),
        );
      }

      this.isRefreshingFields = false;
      this.cdr.markForCheck();
    });
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

      // Field edits can change the values produced by the column even
      // when the column key stays the same (BE doesn't allow renaming
      // columnToUse). Drop the filter store lane so any filter that
      // pulls distinct values from this column re-fetches options on
      // the next sidebar open. Cheap; only affects filter dropdowns.
      if (this.analysisId) {
        this.store.dispatch(
          AnalysesFilterActions.invalidateAnalysis({
            analysisId: this.analysisId,
          }),
        );
      }

      // Re-run dataset query so the new field's computed values are
      // available. getMissingFields() will sustain the missing-field
      // empty-state on visuals that reference a column the BE no
      // longer projects (e.g. dataset-level custom field deleted).
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
    // Capture the doomed column key BEFORE the entity reference is
    // cleared, so the post-delete cleanup below can compare against it.
    const deletedColumnKey = this.fieldToDelete.columnToUse;
    this.datasetService
      .deleteDatasetField(this.orgId, this.datasetId, this.fieldToDelete.id)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.fieldToDelete = null;
          this.showDeleteFieldConfirm = false;
          this.handleFieldDeleted(deletedColumnKey);
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

  /**
   * Post-delete cleanup that propagates a field deletion across the
   * surfaces that cache its value or reference its column key. Without
   * this, the user only sees the change after a page reload — the
   * sidebar updates from loadAnalysisFields() but the canvas keeps
   * showing the old chart because rawGraphData still has the deleted
   * column in its projection.
   *
   * Steps, in order:
   *  1. Refresh the field lists (sidebar + custom-field dialog options)
   *  2. Eagerly clear chartData on any visual that was bound to the
   *     deleted column so the amber missing-field empty-state appears
   *     immediately, before the network round-trip below completes.
   *  3. Invalidate the analyses-filter store lane so saved filters
   *     referencing the deleted column will surface their
   *     column_missing warning the next time the sidebar opens.
   *  4. Re-run /analyses/run to refresh rawGraphData with the new
   *     (deleted-column-absent) projection. getMissingFields() then
   *     correctly returns the deleted column name on affected
   *     visuals, sustaining the empty-state across future renders.
   */
  private handleFieldDeleted(
    deletedColumnKey: string | null | undefined,
  ): void {
    this.loadAnalysisFields();

    if (deletedColumnKey) {
      // Step 2: eager clear of any visual that referenced the doomed
      // column. The reference comparison covers all three axis wells.
      // Bump chartDataVersion so chart-renderer's OnPush picks up the
      // cleared data; without it the chart would keep painting the
      // pre-delete rows until the re-run query lands.
      for (const visual of this.visuals) {
        if (
          visual.xAxisColumn === deletedColumnKey ||
          visual.yAxisColumn === deletedColumnKey ||
          visual.zAxisColumn === deletedColumnKey
        ) {
          visual.chartData = [];
        }
      }
      this.chartDataVersion++;
      this.cdr.markForCheck();
    }

    // Step 3: drop the filter store lane so saved filters resync.
    if (this.analysisId) {
      this.store.dispatch(
        AnalysesFilterActions.invalidateAnalysis({
          analysisId: this.analysisId,
        }),
      );
    }

    // Step 4: refresh dataset rows.
    this.loadDatasetData();
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
      // Lazy-load the filter list + first-page dropdown options the
      // moment the user signals intent to interact with filters.
      // The effect's freshness gate (10-min TTL) means re-opens
      // within the window are a no-op; subsequent opens after TTL
      // refresh in the background.
      if (this.analysisId && this.orgId) {
        this.store.dispatch(
          AnalysesFilterActions.loadOpen({
            analysisId: this.analysisId,
            organisation: this.orgId,
          }),
        );
      }
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

  // ── Filter-delete confirmation popup ─────────────────────────────
  // Mirrors the listing-module pattern: open a popup with a required
  // justification textarea, only fire the network call when the user
  // confirms with a non-empty reason. The reason flows to the BE for
  // audit-log capture (see deleteAnalysisFilter controller).
  showDeleteFilterConfirm = false;
  filterToDelete: ConfiguredFilter | null = null;
  filterDeleteJustification = '';

  confirmRemoveFilter(filter: ConfiguredFilter): void {
    if (this.isDeletingFilter) return; // prevent double-click while a delete is in flight
    this.filterToDelete = filter;
    this.filterDeleteJustification = '';
    this.showDeleteFilterConfirm = true;
  }

  cancelRemoveFilter(): void {
    this.showDeleteFilterConfirm = false;
    this.filterToDelete = null;
    this.filterDeleteJustification = '';
  }

  async proceedRemoveFilter(): Promise<void> {
    const filter = this.filterToDelete;
    const reason = this.filterDeleteJustification.trim();
    if (!filter || !reason) return;

    this.isDeletingFilter = filter.tempId;
    try {
      const res: any = await this.analysesService.deleteFilter(
        this.orgId,
        filter.tempId,
        reason,
      );
      if (this.globalService.handleSuccessService(res, true)) {
        // Surgical store patch — drop the deleted filter from the
        // lane and clear its option cache. No network refetch needed.
        this.store.dispatch(
          AnalysesFilterActions.filterDeleted({
            analysisId: this.analysisId,
            filterId: filter.tempId,
          }),
        );
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    } finally {
      this.isDeletingFilter = null;
      this.cancelRemoveFilter();
    }
  }

  getOperatorLabel(filterType: string, operatorValue: string): string {
    const ops = FILTER_OPERATOR_KEYS[filterType] || [];
    const match = ops.find(
      (o: { labelKey: string; value: string }) => o.value === operatorValue,
    );
    return match ? this.translate.instant(match.labelKey) : operatorValue;
  }

  getNullOptionLabel(value: string): string {
    const match = NULL_OPTION_KEYS.find(
      (o: { labelKey: string; value: string }) => o.value === value,
    );
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
        parts.push(
          this.translate.instant('ANALYSES.DEFAULT_VALUES_COUNT', {
            count: config.defaultValue.length,
          }),
        );
      } else {
        parts.push(
          this.translate.instant('ANALYSES.DEFAULT_VALUE', {
            value: config.defaultValue,
          }),
        );
      }
    }
    if (config.rangeMin !== undefined || config.rangeMax !== undefined) {
      parts.push(
        this.translate.instant('ANALYSES.RANGE_SUMMARY', {
          min: config.rangeMin ?? '...',
          max: config.rangeMax ?? '...',
        }),
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

  /**
   * Dialog `(saved)` handler. The dialog passes the saved filter row
   * back — we dispatch filterSaved so the store patches its lane in
   * place (no full-list refetch needed). If the payload is missing
   * (legacy emit-without-value) we fall back to a full reload via
   * loadOpen so behaviour stays correct.
   */
  onFilterSaved(filter: any): void {
    if (filter && filter.id) {
      this.store.dispatch(
        AnalysesFilterActions.filterSaved({
          analysisId: this.analysisId,
          filter: {
            id: filter.id,
            name: filter.name,
            filterType: filter.filterType,
            controlType: filter.controlType,
            columnName: filter.columnName,
            config: filter.config || {},
            nullOption: filter.nullOption || 'ALL_VALUES',
            isEnabled: filter.isEnabled !== false,
            isMandatory: !!filter.isMandatory,
            sequence: filter.sequence ?? 0,
          },
        }),
      );
      return;
    }
    // Fallback for safety — kick a fresh open-mode load.
    this.store.dispatch(
      AnalysesFilterActions.loadOpen({
        analysisId: this.analysisId,
        organisation: this.orgId,
      }),
    );
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

  isTableChartType(chartType: string | null | undefined): boolean {
    return isTableChartType(chartType ?? null);
  }

  /**
   * Returns the list of columns this visual is bound to that no
   * longer exist in the rebound data. Empty array = everything maps.
   *
   * Why this matters: when a custom field is deleted, the dataset
   * SQL is edited, or a column gets renamed, the visual's saved
   * xAxisColumn / yAxisColumn / zAxisColumn strings still point at
   * the dead name. Without this guard, the chart renderer falls
   * through to dummy data and the user sees a misleading bar (one
   * "(empty)" category, height equal to row count). Surface a clear
   * empty state instead.
   *
   * We use rawGraphData[0] as the sample row — every row in the
   * /analyses/run projection has the same shape, so one row is
   * enough to enumerate available columns. When rawGraphData is
   * empty (load failure, no rows), the helper returns [] so we
   * fall through to the chart's own empty-state handling rather
   * than flagging a false positive.
   */
  getMissingFields(visual: any): string[] {
    const sample = this.rawGraphData?.[0];
    return getMissingFieldsForVisual(visual, sample);
  }

  hasRequiredChartFields(visual: any): boolean {
    if (!visual.chartType) return false;
    // A column saved on the visual no longer exists in the rebound
    // data → not "configured", regardless of whether the bound names
    // are non-empty strings. The template uses this to swap chart
    // render for a re-map prompt.
    if (this.getMissingFields(visual).length > 0) return false;
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

  /**
   * Triggered from the missing-field empty-state's "Re-map field"
   * button. Same as opening the chart config sidebar via right-click,
   * but spelled as its own method so the call site reads clearly and
   * we control exactly what happens (focus this visual + open the
   * config panel) without relying on click bubbling.
   */
  openVisualConfigForRemap(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.focusedVisualId = id;
    this.isConfigSidebarOpen = true;
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
      // For tables: start with no columns shown. The user opts in by
      // clicking fields. Only seed when the user hasn't already
      // configured a hidden list (e.g. opening an existing analysis).
      if (
        isTableChartType(visual.chartType) &&
        (!visual.config || visual.config.tableHiddenColumns === undefined)
      ) {
        this.seedTableHiddenColumns(visual);
      }
      this.updateVisualChartData(visual);
    }
  }

  /**
   * Initialise visual.config.tableHiddenColumns with every available
   * field. Used the first time a visual becomes a table so the user
   * sees an empty table and opts each column in.
   */
  private seedTableHiddenColumns(visual: any): void {
    if (!visual.config) visual.config = {};
    const cols = (this.allFields || [])
      .map((f: any) => f?.columnToUse ?? f?.columnToView ?? f)
      .filter((v: any) => typeof v === 'string' && v.length > 0);
    visual.config.tableHiddenColumns = [...cols];
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
    // Table visuals don't have axis slots; clicking a field toggles
    // whether that column is shown in the table.
    const focused = this.getFocusedVisual();
    if (
      focused &&
      this.focusedVisualId &&
      isTableChartType(focused.chartType)
    ) {
      this.toggleTableColumn(focused, field);
      return;
    }

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

  /**
   * Flip the visibility of a single column on the focused table visual.
   * The hidden list is stored on visual.config.tableHiddenColumns; we
   * re-assign the array reference so OnPush downstream picks it up.
   */
  private toggleTableColumn(visual: any, field: any): void {
    const col = field?.columnToUse || field?.columnToView;
    if (!col) return;
    this.markDirty();
    if (!visual.config) visual.config = {};
    const cfg = visual.config;
    const hidden: string[] = Array.isArray(cfg.tableHiddenColumns)
      ? [...cfg.tableHiddenColumns]
      : [];
    const idx = hidden.indexOf(col);
    if (idx >= 0) {
      hidden.splice(idx, 1);
    } else {
      hidden.push(col);
    }
    cfg.tableHiddenColumns = hidden;
    this.cdr.markForCheck();
  }

  /**
   * Used by the dataset-fields template to tint each field card in
   * table mode. Returns true when the field's column is currently
   * visible in the focused table visual.
   */
  isFieldVisibleInTable(field: any): boolean {
    const focused = this.getFocusedVisual();
    if (!focused || !isTableChartType(focused.chartType)) return false;
    const col = field?.columnToUse || field?.columnToView;
    if (!col) return false;
    const hidden = focused.config?.tableHiddenColumns;
    if (!Array.isArray(hidden)) return true;
    return !hidden.includes(col);
  }

  /** True when the focused visual is a table — drives template visuals. */
  isFocusedVisualTable(): boolean {
    const focused = this.getFocusedVisual();
    return !!focused && isTableChartType(focused.chartType);
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

        // Trigger a single-shot 1.2s primary-glow pulse on the
        // scrolled-to card so the user sees which card they clicked.
        // The class is removed after the animation completes so a
        // re-click can re-trigger it.
        targetVisual.classList.remove('blinking-visual');
        // Reflow forces the class re-add to actually retrigger the
        // CSS animation (without this, removing then re-adding in
        // the same tick is a no-op for keyframes).
        // eslint-disable-next-line no-unused-expressions
        void targetVisual.offsetWidth;
        targetVisual.classList.add('blinking-visual');
        setTimeout(() => {
          targetVisual.classList.remove('blinking-visual');
        }, 1300);
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

  /**
   * Opens the publish-to-dashboard dialog. We gate access through the
   * button's `disabled` state (no unsaved changes, has visuals, not
   * already saving/publishing) so by the time we get here the analysis
   * is in a publishable state.
   */
  openPublishDashboardDialog(): void {
    this.showPublishDialog = true;
  }

  /**
   * Handles the publish dialog closing. `payload === null` means the
   * user cancelled. A payload triggers the actual server call.
   *
   * On success we navigate to the new (or republished) dashboard.
   * That mirrors the save-analysis flow which also navigates away on
   * success — it confirms the operation succeeded and gives the user
   * something to do next.
   */
  handlePublishDialogClose(payload: PublishDashboardPayload | null): void {
    if (!payload) {
      this.showPublishDialog = false;
      return;
    }

    this.publishing.set(true);
    this.dashboardService
      .publish({
        orgId: this.orgId,
        analysisId: this.analysisId,
        mode: payload.mode,
        dashboardId: payload.dashboardId,
        name: payload.name,
        description: payload.description,
      })
      .then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.showPublishDialog = false;
          const newId = response?.data?.id;
          if (newId) {
            this.router.navigate([DASHBOARD.view(this.orgId, newId)]);
          }
        }
      })
      .finally(() => {
        this.publishing.set(false);
        this.cdr.markForCheck();
      });
  }
}
