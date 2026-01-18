import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { DatasetService } from '../../../dataset/services/dataset.service';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  CURVE_TYPES,
  LEGEND_POSITIONS,
  getDefaultChartConfig,
  isBarChartType,
  isAreaChartType,
  isPieChartType,
  isGaugeChartType,
  isCardChartType,
  isHeatMapChartType,
  isTreeMapChartType,
  hasAxisLabels,
  supportsGradient,
} from '../../constants/charts.constants';
import { ChartDataTransformerService } from '../../services';
import { Visual, AxisSelection, createVisual } from '../../models';
import { AnalysesService } from '../../service/analyses.service';
import { ANALYSES } from 'src/app/constants/routes';
import {
  AddAnalysesActions,
  DatasetLoadingStatus,
  selectDatasetData,
  selectDatasetStatus,
  selectIsDatasetStale,
  selectDatasetByKey,
  selectIsDatasetLoaded,
} from '../../store';

@Component({
  selector: 'app-add-analyses',
  templateUrl: './add-analyses.component.html',
  styleUrls: ['./add-analyses.component.scss'],
})
export class AddAnalysesComponent implements OnInit {
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

  // Visuals
  visuals: Visual[] = [];
  visualCounter: number = 0;
  focusedVisualId: number | null = null;
  resizingVisual: Visual | null = null;
  resizeStartX: number = 0;
  resizeStartY: number = 0;
  resizeStartWidth: number = 0;
  resizeStartHeight: number = 0;
  resizeDirection: string = '';
  isResizing: boolean = false; // Flag to prevent click during resize
  isConfigSidebarOpen: boolean = false; // Right-click opens config sidebar
  showSaveDialog: boolean = false; // Show save analysis dialog

  // Available chart types from ngx-charts
  chartTypes = CHART_TYPES;

  // Color schemes for chart configuration
  colorSchemes = COLOR_SCHEMES;

  // Curve types for line charts
  curveTypes = CURVE_TYPES;

  // Legend positions
  legendPositions = LEGEND_POSITIONS;

  // Dragging
  draggingVisual: any = null;

  // Maximized visual for fullscreen view
  maximizedVisual: any = null;

  // Axis field selection mode
  activeAxisSelection: 'x' | 'y' | 'z' | null = null;

  // Search for chart types
  chartSearchQuery: string = '';

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
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
  }

  addVisual(): void {
    this.visualCounter++;
    this.visuals.push(
      createVisual(this.visualCounter, getDefaultChartConfig()),
    );
    // Auto-focus the newly added visual
    this.focusedVisualId = this.visualCounter;
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
    return createVisual(0, getDefaultChartConfig());
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

  /**
   * Check if a chart type supports legend
   * Advanced pie and pie grid have built-in displays and don't use legend property
   * Tree map doesn't support legend in ngx-charts
   */
  supportsLegend(chartType: string | null): boolean {
    if (!chartType) return false;
    const noLegendTypes = [
      'pie-advanced',
      'pie-grid',
      'tree-map',
      'number-card',
    ];
    return !noLegendTypes.includes(chartType);
  }

  isBubbleChartType(chartType: string | null): boolean {
    return chartType === 'bubble';
  }

  isBoxChartType(chartType: string | null): boolean {
    return chartType === 'box-chart';
  }

  /**
   * Check if a visual has all required fields mapped for its chart type
   * For heat maps: requires x, y, and z axis columns
   * For other charts: requires x and y axis columns
   */
  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;

    if (this.isHeatMapChartType(visual.chartType)) {
      return !!(visual.xAxisColumn && visual.yAxisColumn && visual.zAxisColumn);
    }

    return !!(visual.xAxisColumn && visual.yAxisColumn);
  }

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  supportsGradient(chartType: string | null): boolean {
    return supportsGradient(chartType);
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
  onVisualClick(event: MouseEvent, id: number): void {
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
  onVisualRightClick(event: MouseEvent, id: number): void {
    event.preventDefault(); // Prevent default context menu
    event.stopPropagation();
    // Focus the visual and open config sidebar
    this.focusedVisualId = id;
    this.isConfigSidebarOpen = true;
  }

  toggleFocusVisual(id: number): void {
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
    this.isResizing = true; // Set flag to prevent click
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

    // Handle horizontal resize (minimum 300px to prevent flickering)
    if (this.resizeDirection.includes('right')) {
      this.resizingVisual.width = Math.max(300, this.resizeStartWidth + deltaX);
    } else if (this.resizeDirection.includes('left')) {
      this.resizingVisual.width = Math.max(300, this.resizeStartWidth - deltaX);
    }

    // Handle vertical resize (minimum 250px to prevent flickering)
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
  }

  stopResize(mouseMoveHandler: any, mouseUpHandler: any): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    this.resizingVisual = null;
    // Clear resize flag after a short delay to prevent click from firing
    setTimeout(() => {
      this.isResizing = false;
    }, 100);
  }

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

      // Reorder array
      this.visuals.splice(draggedIndex, 1);
      this.visuals.splice(targetIndex, 0, this.draggingVisual);
    }
    this.draggingVisual = null;
  }

  onDragEnd(event: DragEvent): void {
    this.draggingVisual = null;
  }

  maximizeVisual(visual: any, event: Event): void {
    event.stopPropagation();
    this.maximizedVisual = visual;
  }

  minimizeVisual(): void {
    this.maximizedVisual = null;
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
      // Build analysis payload
      const analysisPayload = {
        name: formData.name,
        description: formData.description,
        datasetId: this.datasetId,
        organisation: this.orgId,
        database: this.databaseId,
        visuals: this.visuals.map(visual => ({
          id: visual.id,
          title: visual.title,
          x: visual.x || 0,
          y: visual.y || 0,
          width: visual.width,
          height: visual.height,
          chartType: visual.chartType,
          xAxisColumn: visual.xAxisColumn || null,
          yAxisColumn: visual.yAxisColumn || null,
          config: visual.config ? { ...visual.config } : null,
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
