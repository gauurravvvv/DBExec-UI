import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatasetService } from '../../dataset/services/dataset.service';
import { GlobalService } from 'src/app/core/services/global.service';

@Component({
  selector: 'app-add-analyses',
  templateUrl: './add-analyses.component.html',
  styleUrls: ['./add-analyses.component.scss'],
})
export class AddAnalysesComponent implements OnInit {
  datasetId: string = '';
  orgId: string = '';
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
  isResizing: boolean = false; // Flag to prevent click during resize
  isConfigSidebarOpen: boolean = false; // Right-click opens config sidebar

  // Available chart types from ngx-charts
  chartTypes = [
    // Bar Charts
    { id: 'bar-vertical', name: 'Bar Chart', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Vertical bar chart' },
    { id: 'bar-horizontal', name: 'Horizontal Bar', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Horizontal bar chart', rotate: true },
    { id: 'bar-vertical-2d', name: 'Grouped Vertical', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Grouped vertical bar chart' },
    { id: 'bar-horizontal-2d', name: 'Grouped Horizontal', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Grouped horizontal bar chart', rotate: true },
    { id: 'bar-vertical-stacked', name: 'Stacked Vertical', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Stacked vertical bar chart' },
    { id: 'bar-horizontal-stacked', name: 'Stacked Horizontal', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Stacked horizontal bar chart', rotate: true },
    { id: 'bar-vertical-normalized', name: 'Normalized Vertical', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Normalized vertical bar chart' },
    { id: 'bar-horizontal-normalized', name: 'Normalized Horizontal', icon: 'pi pi-chart-bar', category: 'Bar Charts', description: 'Normalized horizontal bar chart', rotate: true },
    
    // Line Charts
    { id: 'line', name: 'Line Chart', icon: 'pi pi-chart-line', category: 'Line Charts', description: 'Standard line chart' },
    { id: 'polar', name: 'Polar Chart', icon: 'pi pi-sun', category: 'Line Charts', description: 'Polar/radar chart' },
    
    // Area Charts
    { id: 'area', name: 'Area Chart', icon: 'pi pi-chart-line', category: 'Area Charts', description: 'Standard area chart' },
    { id: 'area-stacked', name: 'Stacked Area', icon: 'pi pi-chart-line', category: 'Area Charts', description: 'Stacked area chart' },
    { id: 'area-normalized', name: 'Normalized Area', icon: 'pi pi-chart-line', category: 'Area Charts', description: 'Normalized area chart' },
    
    // Pie Charts
    { id: 'pie', name: 'Pie Chart', icon: 'pi pi-chart-pie', category: 'Pie Charts', description: 'Standard pie chart' },
    { id: 'pie-advanced', name: 'Advanced Pie', icon: 'pi pi-chart-pie', category: 'Pie Charts', description: 'Pie with legend and totals' },
    { id: 'pie-grid', name: 'Pie Grid', icon: 'pi pi-th-large', category: 'Pie Charts', description: 'Grid of pie charts' },
    { id: 'donut', name: 'Donut Chart', icon: 'pi pi-circle', category: 'Pie Charts', description: 'Donut style pie chart' },
    
    // Gauges
    { id: 'gauge', name: 'Gauge', icon: 'pi pi-compass', category: 'Gauges', description: 'Radial gauge chart' },
    { id: 'linear-gauge', name: 'Linear Gauge', icon: 'pi pi-minus', category: 'Gauges', description: 'Linear gauge chart' },
    
    // Other Charts
    { id: 'number-card', name: 'Number Cards', icon: 'pi pi-hashtag', category: 'Cards', description: 'Number display cards' },
    { id: 'heat-map', name: 'Heat Map', icon: 'pi pi-table', category: 'Maps', description: 'Heat map visualization' },
    { id: 'tree-map', name: 'Tree Map', icon: 'pi pi-sitemap', category: 'Maps', description: 'Hierarchical tree map' },
    { id: 'bubble', name: 'Bubble Chart', icon: 'pi pi-circle-fill', category: 'Scatter', description: 'Bubble scatter chart' },
    { id: 'box-chart', name: 'Box Chart', icon: 'pi pi-box', category: 'Statistical', description: 'Box and whisker plot' },
    { id: 'sankey', name: 'Sankey Diagram', icon: 'pi pi-arrows-h', category: 'Flow', description: 'Flow/relationship diagram' },
  ];

  // Color schemes for chart configuration
  colorSchemes = [
    { label: 'Vivid', value: 'vivid' },
    { label: 'Natural', value: 'natural' },
    { label: 'Cool', value: 'cool' },
    { label: 'Fire', value: 'fire' },
    { label: 'Solar', value: 'solar' },
    { label: 'Air', value: 'air' },
    { label: 'Aqua', value: 'aqua' },
    { label: 'Flame', value: 'flame' },
    { label: 'Ocean', value: 'ocean' },
    { label: 'Forest', value: 'forest' },
    { label: 'Horizon', value: 'horizon' },
    { label: 'Neons', value: 'neons' },
  ];

  // Curve types for line charts
  curveTypes = [
    { label: 'Linear', value: 'linear' },
    { label: 'Smooth', value: 'monotoneX' },
    { label: 'Step', value: 'step' },
    { label: 'Basis', value: 'basis' },
    { label: 'Cardinal', value: 'cardinal' },
  ];

  // Legend positions
  legendPositions = [
    { label: 'Right', value: 'right' },
    { label: 'Below', value: 'below' },
  ];

  // Dragging
  draggingVisual: any = null;
  dragOffsetX: number = 0;
  dragOffsetY: number = 0;

  // Editing
  editingTitleId: number | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private datasetService: DatasetService,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.orgId = params['orgId'];
      this.datasetId = params['datasetId'];
      if (this.datasetId) {
        this.loadDatasetInfo();
      }
    });
    
    // Load test data for development
    this.loadTestData();
  }

  /**
   * Load visuals from saved configuration (for testing)
   */
  loadTestData(): void {
    const savedConfig = {
      "visuals": [
        { "id": 1, "title": "Bar Chart", "x": 0, "y": 0, "width": 613, "height": 406, "chartType": "bar-vertical", "config": { "colorScheme": "vivid", "xAxis": true, "yAxis": true, "showGridLines": true, "legend": false, "legendPosition": "right" } },
        { "id": 2, "title": "Horizontal Bar", "x": 620, "y": 0, "width": 689, "height": 486, "chartType": "bar-horizontal", "config": { "colorScheme": "cool", "xAxis": true, "yAxis": true, "showGridLines": true, "legend": false } },
        { "id": 3, "title": "Normalized Area", "x": 0, "y": 420, "width": 702, "height": 350, "chartType": "area-normalized", "config": { "colorScheme": "fire", "xAxis": true, "yAxis": true } },
        { "id": 4, "title": "Line Chart", "x": 710, "y": 500, "width": 602, "height": 344, "chartType": "line", "config": { "colorScheme": "ocean", "xAxis": true, "yAxis": true } },
        { "id": 5, "title": "Gauge", "x": 1320, "y": 0, "width": 301, "height": 351, "chartType": "gauge", "config": { "colorScheme": "forest", "min": 0, "max": 100, "units": "%" } },
        { "id": 6, "title": "Pie Chart", "x": 1320, "y": 360, "width": 400, "height": 350, "chartType": "pie", "config": { "colorScheme": "neons", "labels": true, "doughnut": false } }
      ]
    };

    // Clear existing visuals
    this.visuals = [];
    this.visualCounter = 0;

    // Load visuals from saved config
    savedConfig.visuals.forEach((savedVisual: any) => {
      const visual = {
        id: savedVisual.id,
        title: savedVisual.title,
        x: savedVisual.x || 0,
        y: savedVisual.y || 0,
        width: savedVisual.width || 400,
        height: savedVisual.height || 300,
        chartType: savedVisual.chartType || '',
        xAxisColumn: savedVisual.xAxisColumn || '',
        yAxisColumn: savedVisual.yAxisColumn || '',
        config: savedVisual.config ? { ...this.getDefaultChartConfig(), ...savedVisual.config } : this.getDefaultChartConfig()
      };
      this.visuals.push(visual);
      this.visualCounter = Math.max(this.visualCounter, visual.id);
    });

    console.log('Loaded test data:', this.visuals);
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
    this.router.navigate(['/app/dataset']);
  }

  toggleFieldsPanel(): void {
    this.isFieldsPanelOpen = !this.isFieldsPanelOpen;
  }

  toggleVisualsPanel(): void {
    this.isVisualsPanelOpen = !this.isVisualsPanelOpen;
  }

  getDefaultChartConfig(): any {
    return {
      // Color
      colorScheme: 'vivid',
      // Axis
      xAxis: true,
      yAxis: true,
      showGridLines: true,
      roundDomains: false,
      // Labels
      showXAxisLabel: true,
      showYAxisLabel: true,
      xAxisLabel: 'Category',
      yAxisLabel: 'Value',
      showDataLabel: false,
      // Legend
      legend: false,
      legendTitle: 'Legend',
      legendPosition: 'right',
      // Styling
      gradient: false,
      animations: false,
      // Tooltip
      tooltipDisabled: false,
      // Bar chart specific
      barPadding: 8,
      roundEdges: false,
      noBarWhenZero: true,
      // Line chart specific
      curveType: 'linear',
      autoScale: true,
      timeline: false,
      rangeFillOpacity: 0.15,
      // Pie chart specific
      labels: true,
      trimLabels: true,
      maxLabelLength: 10,
      doughnut: false,
      arcWidth: 0.25,
      explodeSlices: false,
      // Polar chart specific
      labelTrim: true,
      labelTrimSize: 10,
      showSeriesOnHover: true,
      // Gauge chart specific
      min: 0,
      max: 100,
      units: '%',
      bigSegments: 10,
      smallSegments: 5,
      showAxis: true,
      angleSpan: 240,
      startAngle: -120,
      showText: true,
      // Card chart specific
      cardColor: '',
      bandColor: '',
      textColor: '',
      emptyColor: 'rgba(0, 0, 0, 0)',
      innerPadding: 15,
      // Heat map specific
      trimXAxisTicks: true,
      trimYAxisTicks: true,
      rotateXAxisTicks: true,
      maxXAxisTickLength: 16,
      maxYAxisTickLength: 16,
      wrapTicks: false,
    };
  }

  addVisual(): void {
    this.visualCounter++;
    this.visuals.push({
      id: this.visualCounter,
      title: `Visual ${this.visualCounter}`,
      width: 400,
      height: 350,
      x: 0,
      y: 0,
      chartType: null,
      config: this.getDefaultChartConfig(), // Each visual has its own config
    });
  }

  getFocusedVisual(): any {
    return this.visuals.find(v => v.id === this.focusedVisualId) || null;
  }

  getChartCategories(): string[] {
    const categories = [...new Set(this.chartTypes.map(c => c.category))];
    return categories;
  }

  getChartsByCategory(category: string): any[] {
    return this.chartTypes.filter(c => c.category === category);
  }

  isBarChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    const barChartTypes = [
      'bar-vertical', 'bar-horizontal', 
      'bar-vertical-2d', 'bar-horizontal-2d',
      'bar-vertical-stacked', 'bar-horizontal-stacked',
      'bar-vertical-normalized', 'bar-horizontal-normalized'
    ];
    return barChartTypes.includes(chartType);
  }

  isAreaChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    const areaChartTypes = ['area', 'area-stacked', 'area-normalized'];
    return areaChartTypes.includes(chartType);
  }

  isPieChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    // Match IDs from chartTypes array: pie, pie-advanced, pie-grid, donut
    const pieChartTypes = ['pie', 'pie-advanced', 'pie-grid', 'donut'];
    return pieChartTypes.includes(chartType);
  }

  // Charts that have X/Y axes with labels
  hasAxisLabels(chartType: string | null): boolean {
    if (!chartType) return false;
    // Pie/gauge/card/treemap charts don't have traditional axes
    const noAxisLabels = ['pie', 'pie-advanced', 'pie-grid', 'donut', 'gauge', 'linear-gauge', 'number-card', 'tree-map'];
    return !noAxisLabels.includes(chartType);
  }

  // Charts that support gradient fill
  supportsGradient(chartType: string | null): boolean {
    if (!chartType) return false;
    // Polar, gauge, and card charts don't support gradient well
    const noGradient = ['polar', 'gauge', 'linear-gauge', 'number-card'];
    return !noGradient.includes(chartType);
  }

  isGaugeChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    const gaugeChartTypes = ['gauge', 'linear-gauge'];
    return gaugeChartTypes.includes(chartType);
  }

  isCardChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    return chartType === 'number-card';
  }

  isHeatMapChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    return chartType === 'heat-map';
  }

  isTreeMapChartType(chartType: string | null): boolean {
    if (!chartType) return false;
    return chartType === 'tree-map';
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

  getSelectedChartIcon(): string {
    const visual = this.getFocusedVisual();
    if (!visual?.chartType) return 'pi pi-chart-bar';
    const chartType = this.chartTypes.find(c => c.id === visual.chartType);
    return chartType?.icon || 'pi pi-chart-bar';
  }

  clearChartType(): void {
    const visual = this.getFocusedVisual();
    if (visual) {
      visual.chartType = null;
      visual.title = `Visual ${visual.id}`;
    }
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
    // Build canvas configuration JSON
    const canvasConfig = {
      datasetId: this.datasetId,
      orgId: this.orgId,
      datasetName: this.datasetDetails?.name,
      createdAt: new Date().toISOString(),
      visuals: this.visuals.map(visual => ({
        id: visual.id,
        title: visual.title,
        // Position and Size
        x: visual.x || 0,
        y: visual.y || 0,
        width: visual.width,
        height: visual.height,
        // Chart Type
        chartType: visual.chartType,
        // Data Mapping
        xAxisColumn: visual.xAxisColumn || null,
        yAxisColumn: visual.yAxisColumn || null,
        // Configuration
        config: visual.config ? { ...visual.config } : null
      }))
    };

    console.log('=== ANALYSIS CONFIGURATION ===');
    console.log(JSON.stringify(canvasConfig, null, 2));
    console.log('==============================');
  }
}
