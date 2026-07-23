import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { EchartVisualComponent } from 'src/app/shared/components/echart-visual/echart-visual.component';
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

  /**
   * Bubbles the inner echart-visual / table-visual `chartSelect` up to the
   * analysis view so the interaction bus (cross-filter / drill-down, spec
   * §6) can act on a data-point click. Payload is the raw ECharts click
   * event (echarts) or `{ row }` (table). Terminated unused until a parent
   * binds it — the analysis view is the sole consumer.
   */
  @Output() chartSelect = new EventEmitter<any>();

  /** Shallow clone of `visual.config` rebuilt on every configVersion bump. */
  chartConfigRef: any = {};

  /**
   * The inner ECharts visual, present only when this renderer is showing an
   * ECharts-backed chart (not a table / card). Used by the parent's per-visual
   * "Export PNG" action to reach the live ECharts instance for getDataURL().
   * Undefined for table/card visuals — the caller falls back gracefully.
   */
  @ViewChild(EchartVisualComponent)
  private echartVisual?: EchartVisualComponent;

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

  /**
   * Result-scale truncation banner (Wave 5, DATA-SCALE & PERF). True when the
   * BE clipped this visual's result to a cap (raw-row LIMIT or aggregation
   * group ceiling) and reported it back on `visual.truncation`. The parent
   * populates that field per run from response.meta — exactly parallel to how
   * `pivotTotalRows` is populated — so this renderer needs no extra @Input
   * wiring; it just reflects the flag when present. Applies to every visual
   * type (chart / table / card) because the banner sits above the visual body.
   */
  get isTruncated(): boolean {
    return this.visual?.truncation?.truncated === true;
  }

  /**
   * Interpolation params for ANALYSES.V2.ERROR.TRUNCATION_BANNER
   * ("Showing top {{n}} of {{total}}"). `n` = rows shown after the cap;
   * `total` = the cap that was applied. Locale-formatted so large counts read
   * with thousands separators. Guarded to 0 when the flag is malformed.
   */
  get truncationParams(): { n: string; total: string } {
    const t = this.visual?.truncation;
    const shown = t && Number.isFinite(t.shown) ? t.shown : 0;
    const cap = t && Number.isFinite(t.cap) ? t.cap : 0;
    return { n: shown.toLocaleString(), total: cap.toLocaleString() };
  }

  /**
   * PNG data URL of the currently-rendered ECharts chart, or null when
   * this visual isn't ECharts-backed (table / card) or the chart hasn't
   * initialised. Delegates to the inner echart-visual's getPngDataUrl().
   * Used by the edit canvas's per-visual "Export PNG" action.
   */
  getPngDataUrl(): string | null {
    return this.echartVisual?.getPngDataUrl() ?? null;
  }
}
