import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import {
  getChartRoles,
  isCardChartType,
  isTableChartType,
} from '../../constants/charts.constants';
import { Visual } from '../../models';

@Component({
  selector: 'app-chart-renderer',
  templateUrl: './chart-renderer.component.html',
  // styleUrls is REQUIRED: the host element defaults to display:
  // inline (zero height) without it, so the downstream
  // <app-echart-visual> computes height: 100% against zero and the
  // chart visually collapses. The wrapper styles (.visual-card,
  // .maximized-visual-body) still live in the parent template, but
  // the chart-renderer host itself must be a flex item that fills
  // its parent slot — see the .scss for details.
  styleUrls: ['./chart-renderer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartRendererComponent implements OnChanges {
  @Input() visual!: Visual;
  @Input() chartWidth!: number;
  @Input() chartHeight!: number;
  /**
   * Monotonic counter the parent bumps whenever `visual.config` is mutated
   * in place. Bumping it triggers an @Input change here, and we rebuild
   * `chartConfigRef` as a fresh shallow clone so the downstream OnPush
   * `<app-echart-visual>` actually sees a [chartConfig] reference change
   * — without that clone, OnPush blocks CD at echart-visual and the chart
   * never re-renders when sidebar properties change.
   */
  @Input() configVersion = 0;

  /**
   * Twin of configVersion for `visual.chartData` mutations. The parent
   * bumps this whenever the dataset query re-runs and rebuilds
   * chartData on every visual. Without this kick, OnPush sees the
   * same `visual` reference and skips CD on this component — the
   * template never re-reads `visual.chartData` via getDisplayData(),
   * so the chart stays painted with rows from the previous query
   * even though the parent already assigned the new data.
   *
   * We don't use the value; its mere presence as a changed @Input
   * forces ngOnChanges to fire, which propagates the new chartData
   * down to <app-echart-visual> through getDisplayData() in the
   * template.
   */
  @Input() dataVersion = 0;

  /** Shallow clone of `visual.config` rebuilt on every configVersion bump. */
  chartConfigRef: any = {};

  isCardChartType = isCardChartType;
  isTableChartType = isTableChartType;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visual'] || changes['configVersion']) {
      this.chartConfigRef = { ...(this.visual?.config ?? {}) };
    }
  }

  hasRequiredChartFields(visual: Visual): boolean {
    if (!visual.chartType) return false;
    // Role-spec driven: same logic as edit-analyses (single source of
    // truth in CHART_ROLES). Each chart declares its required roles
    // and the validator just walks them.
    const spec = getChartRoles(visual.chartType);
    return spec.required.every(role => this.hasRoleValue(visual, role));
  }

  private hasRoleValue(visual: any, role: string): boolean {
    switch (role) {
      case 'xAxis':
        return !!visual.xAxisColumn;
      case 'yAxis':
        return !!visual.yAxisColumn;
      case 'zAxis':
        return !!visual.zAxisColumn;
      case 'open':
        return !!visual.openColumn;
      case 'high':
        return !!visual.highColumn;
      case 'low':
        return !!visual.lowColumn;
      case 'close':
        return !!visual.closeColumn;
      case 'sample':
        return !!visual.sampleColumn;
      case 'parent':
        return !!visual.parentColumn;
      case 'lng':
        return !!visual.lngColumn;
      case 'lat':
        return !!visual.latColumn;
      case 'time':
        return !!visual.timeColumn;
      case 'indicators':
        return (
          Array.isArray(visual.indicatorColumns) &&
          visual.indicatorColumns.length > 0
        );
      case 'dimensions':
        return (
          Array.isArray(visual.dimensionColumns) &&
          visual.dimensionColumns.length > 0
        );
      case 'valueColumns':
        return (
          Array.isArray(visual.valueColumns) && visual.valueColumns.length > 0
        );
      default:
        return false;
    }
  }

  getDisplayData(visual: Visual): any {
    // Always return the real (possibly empty) data — dummy/sample
    // rows have been removed from the runtime path because they
    // misled users (charts looked populated when no real data was
    // there, and tooltips fired on fake values). The parent
    // template's empty-state branches own the "no data" UX now.
    return visual?.chartData ?? [];
  }
}
