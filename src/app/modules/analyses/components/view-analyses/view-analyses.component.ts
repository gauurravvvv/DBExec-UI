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
  selector: 'app-view-analyses',
  templateUrl: './view-analyses.component.html',
  styleUrls: ['./view-analyses.component.scss'],
})
export class ViewAnalysesComponent implements OnInit {
  analysisId: string = '';
  orgId: string = '';
  databaseId: string = '';
  datasetId: string = '';
  analysisDetails: any = null;
  datasetDetails: any = null;
  showDeleteConfirm = false;

  // Sidebar toggle states
  isFieldsPanelOpen: boolean = true;
  isVisualsPanelOpen: boolean = true;

  // Visuals (read-only)
  visuals: any[] = [];
  visualCounter: number = 0;

  // Available chart types
  chartTypes = CHART_TYPES;

  // Color schemes
  colorSchemes = COLOR_SCHEMES;

  // Curve types
  curveTypes = CURVE_TYPES;

  // Legend positions
  legendPositions = LEGEND_POSITIONS;

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

          // Load all visuals
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

  onPublish(): void {
    // TODO: Implement publish logic
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
          // Navigate back to list after successful deletion
          this.router.navigate([ANALYSES.LIST]);
        }
      });
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

  hasAxisLabels(chartType: string | null): boolean {
    return hasAxisLabels(chartType);
  }

  supportsGradient(chartType: string | null): boolean {
    return supportsGradient(chartType);
  }
}
