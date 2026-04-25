import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {
  CHART_TYPES,
  hasAxisLabels,
  is3DCoordinateChartType,
  isBubbleChartType,
  isGraphChartType,
  isHeatMapChartType,
  isLines3dChartType,
  isPolygons3dChartType,
  isSankeyChartType,
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-visuals-chart-sidebar',
  templateUrl: './visuals-chart-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualsChartSidebarComponent {
  @Input() focusedVisual!: Visual;
  @Input() focusedVisualId: string | null = null;
  @Input() isDataLoaded = false;
  @Input() activeAxisSelection: 'x' | 'y' | 'z' | null = null;
  @Input() allFields: any[] = [];

  @Output() addVisualClicked = new EventEmitter<void>();
  @Output() chartTypeSelected = new EventEmitter<void>();
  @Output() axisSelectionStarted = new EventEmitter<'x' | 'y' | 'z' | null>();
  @Output() axisFieldCleared = new EventEmitter<void>();

  // Chart type checkers
  isHeatMapChartType = isHeatMapChartType;
  isSankeyChartType = isSankeyChartType;
  isGraphChartType = isGraphChartType;
  isBubbleChartType = isBubbleChartType;
  is3DCoordinateChartType = is3DCoordinateChartType;
  isPolygons3dChartType = isPolygons3dChartType;
  isLines3dChartType = isLines3dChartType;
  hasAxisLabels = hasAxisLabels;

  // Chart types and search
  chartTypes = CHART_TYPES;
  chartSearchQuery = '';
  private _cachedChartCategories: string[] = [];
  private _cachedChartsByCategory: Map<string, any[]> = new Map();
  private _lastChartSearchQuery: string | null = null;

  private rebuildChartCategoryCache(): void {
    const filtered = this.getFilteredChartTypes();
    this._cachedChartCategories = [...new Set(filtered.map(c => c.category))];
    this._cachedChartsByCategory = new Map();
    for (const category of this._cachedChartCategories) {
      this._cachedChartsByCategory.set(
        category,
        filtered.filter(c => c.category === category),
      );
    }
    this._lastChartSearchQuery = this.chartSearchQuery;
  }

  private ensureChartCacheValid(): void {
    if (this._lastChartSearchQuery !== this.chartSearchQuery) {
      this.rebuildChartCategoryCache();
    }
  }

  getChartCategories(): string[] {
    this.ensureChartCacheValid();
    return this._cachedChartCategories;
  }

  getChartsByCategory(category: string): any[] {
    this.ensureChartCacheValid();
    return this._cachedChartsByCategory.get(category) || [];
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

  setVisualChartType(chartType: any): void {
    if (this.focusedVisual) {
      this.focusedVisual.chartType = chartType.id;
      this.focusedVisual.title = chartType.name;
      this.chartTypeSelected.emit();
    }
  }

  startAxisSelection(axis: 'x' | 'y' | 'z'): void {
    const newValue = this.activeAxisSelection === axis ? null : axis;
    this.axisSelectionStarted.emit(newValue);
  }

  clearAxisField(axis: 'x' | 'y' | 'z', event: Event): void {
    event.stopPropagation();
    if (!this.focusedVisual) return;
    if (axis === 'x') this.focusedVisual.xAxisColumn = null;
    else if (axis === 'y') this.focusedVisual.yAxisColumn = null;
    else if (axis === 'z') this.focusedVisual.zAxisColumn = null;
    this.axisFieldCleared.emit();
  }

  getFieldDisplayName(columnToUse: string | null): string {
    if (!columnToUse) return '';
    const field = this.allFields.find(
      (f: any) =>
        f.columnToUse === columnToUse || f.columnToView === columnToUse,
    );
    return field?.columnToView || columnToUse;
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackById(index: number, item: any): any {
    return item.id;
  }
}
