import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { AnalysesService } from '../../service/analyses.service';
import { ANALYSES } from 'src/app/constants/routes';

@Component({
  selector: 'app-edit-analyses',
  templateUrl: './edit-analyses.component.html',
  styleUrls: ['./edit-analyses.component.scss'],
})
export class EditAnalysesComponent implements OnInit {
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

  // Editing
  editingTitleId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService,
    private analysesService: AnalysesService
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

  loadAnalysis(): void {
    this.analysesService
      .viewAnalyses(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.analysisDetails = response.data;
          this.databaseId = response.data.databaseId;
          this.datasetId = response.data.datasetId;

          // Load dataset info for field mapping
          if (this.datasetId) {
            this.loadDatasetInfo();
          }

          // Load all visuals in one call
          this.loadAllVisuals();
        }
      });
  }

  loadAllVisuals(): void {
    this.analysesService
      .viewVisuals(this.orgId, this.analysisId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const visualsData = response.data.visuals || [];

          // Create visuals from API response
          this.visuals = visualsData.map((visualData: any) => ({
            id: visualData.id,
            title: visualData.title || 'Untitled Visual',
            x: visualData.x || 0,
            y: visualData.y || 0,
            width: visualData.width || 400,
            height: visualData.height || 350,
            chartType: visualData.chartType || null,
            xAxisColumn: visualData.xAxisColumn || '',
            yAxisColumn: visualData.yAxisColumn || '',
            config: visualData.config
              ? { ...getDefaultChartConfig(), ...visualData.config }
              : getDefaultChartConfig(),
            chartData: visualData.chartData || visualData.data || null,
            loading: false,
          }));

          // Set visual counter
          if (this.visuals.length > 0) {
            this.visualCounter = Math.max(...this.visuals.map(v => v.id), 0);
          }
        }
      });
  }

  loadDatasetInfo(): void {
    this.datasetService
      .getDataset(this.orgId, this.datasetId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetDetails = response.data;
        }
      });
  }

  goBack(): void {
    this.router.navigate([ANALYSES.LIST]);
  }

  toggleFieldsPanel(): void {
    this.isFieldsPanelOpen = !this.isFieldsPanelOpen;
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
  }

  addVisual(): void {
    this.visualCounter++;
    this.visuals.push({
      id: this.visualCounter,
      title: `Untitled Visual`,
      width: 400,
      height: 350,
      x: 0,
      y: 0,
      chartType: null,
      config: getDefaultChartConfig(),
    });
    this.focusedVisualId = this.visualCounter;
  }

  getFocusedVisual(): any {
    return this.visuals.find(v => v.id === this.focusedVisualId) || null;
  }

  get canSave(): boolean {
    return this.visuals.some(v => v.chartType !== null);
  }

  getChartCategories(): string[] {
    const categories = [...new Set(this.chartTypes.map(c => c.category))];
    return categories;
  }

  getChartsByCategory(category: string): any[] {
    return this.chartTypes.filter(c => c.category === category);
  }

  // Wrapper methods for imported helper functions
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

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  supportsGradient(chartType: string | null): boolean {
    return supportsGradient(chartType);
  }

  setVisualChartType(chartType: any): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = chartType.id;
      visual.title = chartType.name;
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
    }
  }

  clearFocus(): void {
    this.focusedVisualId = null;
    this.isConfigSidebarOpen = false;
  }

  onVisualClick(event: MouseEvent, id: number): void {
    if (this.isResizing) {
      return;
    }
    event.stopPropagation();
    if (this.focusedVisualId === id) {
      this.focusedVisualId = null;
    } else {
      this.focusedVisualId = id;
    }
  }

  onVisualRightClick(event: MouseEvent, id: number): void {
    event.preventDefault();
    event.stopPropagation();
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
        this.resizeStartHeight + deltaY
      );
    } else if (this.resizeDirection.includes('top')) {
      this.resizingVisual.height = Math.max(
        250,
        this.resizeStartHeight - deltaY
      );
    }
  }

  stopResize(mouseMoveHandler: any, mouseUpHandler: any): void {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    this.resizingVisual = null;
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

      this.visuals.splice(draggedIndex, 1);
      this.visuals.splice(targetIndex, 0, this.draggingVisual);
    }
    this.draggingVisual = null;
  }

  onDragEnd(event: DragEvent): void {
    this.draggingVisual = null;
  }

  startEditTitle(id: number, event: Event): void {
    event.stopPropagation();
    this.editingTitleId = id;
  }

  finishEditTitle(): void {
    this.editingTitleId = null;
  }

  onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.finishEditTitle();
    } else if (event.key === 'Escape') {
      this.finishEditTitle();
    }
  }

  saveAnalysis(): void {
    this.showSaveDialog = true;
  }

  handleSaveDialogClose(
    formData: { name: string; description: string } | null
  ): void {
    this.showSaveDialog = false;

    if (formData) {
      // Build update payload
      const updatePayload = {
        id: this.analysisId,
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

      this.analysesService.updateAnalyses(updatePayload).then(response => {
        if (this.globalService.handleSuccessService(response, true)) {
          this.router.navigate([ANALYSES.LIST]);
        }
      });
    }
  }
}
