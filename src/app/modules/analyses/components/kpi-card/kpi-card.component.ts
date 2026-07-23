import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AnalysisAnalyticsService,
  CompareMode,
  ComparisonResult,
  Point,
} from '../../services/analysis-analytics.service';
import { KpiWidgetConfig } from '../../services/analysis-widgets.service';

/**
 * KpiCardComponent (Slice B) — paints an Analyses KPI tile as a proper
 * BI metric:
 *   • the aggregated big number (formatted per config.format),
 *   • an optional sparkline of the measure over a date dimension,
 *   • a comparison-to-prior badge (▲/▼ + % delta, green/red) when a
 *     compare mode is set — or a target badge when only a target is set.
 *
 * All math is client-side over the rows the host already fetched
 * (`data`), via AnalysisAnalyticsService — no extra query is issued.
 * The sparkline reuses the shared <app-echart-visual> line renderer.
 */
@Component({
  selector: 'app-kpi-card',
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiCardComponent implements OnChanges {
  /** KPI configuration (measure / aggregate / label / format / trend). */
  @Input() config: KpiWidgetConfig | Record<string, any> = {};
  /** Rows backing the analysis (post-filter) — the KPI aggregates these. */
  @Input() data: any[] = [];

  // ── computed display state ──────────────────────────────────────────
  label = '';
  valueText = '';
  /** { name, value }[] trend for the sparkline (empty → no sparkline). */
  trend: Point[] = [];
  /** ECharts data for the sparkline (single flat {name,value}[] series). */
  sparkData: Point[] = [];
  /** Minimal line chart config for the sparkline. */
  sparkConfig: any = {};

  comparison: ComparisonResult | null = null;
  /** 'up' | 'down' | 'flat' — drives the badge arrow + colour. */
  badgeState: 'up' | 'down' | 'flat' | null = null;
  badgeText = '';
  /** Target-vs-value badge text (when no compare mode but a target is set). */
  targetText = '';

  constructor(
    private analytics: AnalysisAnalyticsService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(_: SimpleChanges): void {
    this.recompute();
  }

  private recompute(): void {
    const cfg: any = this.config || {};
    const rows = Array.isArray(this.data) ? this.data : [];
    const measure: string = cfg.measure ?? '';
    const aggregate: string = cfg.aggregate ?? 'sum';
    this.label = cfg.label || cfg.measure || '';

    // Big number.
    const raw = this.analytics.aggregate(rows, measure, aggregate);
    this.valueText = this.formatValue(raw, cfg.format);

    // Sparkline trend over the date dimension (when configured).
    const dateColumn: string | null = cfg.dateColumn ?? null;
    if (dateColumn && rows.length > 0) {
      this.trend = this.analytics.buildTrend(
        rows,
        measure,
        aggregate,
        dateColumn,
      );
    } else {
      this.trend = [];
    }
    this.sparkData = this.trend.length > 1 ? this.trend : [];
    this.sparkConfig = this.sparkData.length ? this.buildSparkConfig() : {};

    // Comparison-to-prior badge (period-over-period) OR target badge.
    const compareMode: CompareMode = (cfg.compareMode as CompareMode) ?? null;
    if (compareMode && dateColumn) {
      this.comparison = this.analytics.computeKpiComparison(
        rows,
        measure,
        aggregate,
        dateColumn,
        compareMode,
      );
      this.applyComparisonBadge(cfg.format);
    } else {
      this.comparison = null;
      this.badgeState = null;
      this.badgeText = '';
    }

    // Target badge (independent of compare) — matches prior inline behaviour.
    const target = typeof cfg.targetValue === 'number' ? cfg.targetValue : null;
    if (target !== null) {
      const pct = target !== 0 ? ((raw - target) / Math.abs(target)) * 100 : 0;
      this.targetText = `${this.translate.instant('ANALYSES.KPI.TARGET')}: ${this.formatValue(
        target,
        cfg.format,
      )} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
    } else {
      this.targetText = '';
    }

    this.cdr.markForCheck();
  }

  private applyComparisonBadge(format: any): void {
    const c = this.comparison;
    if (!c || c.previous === null || c.delta === null) {
      this.badgeState = null;
      this.badgeText = '';
      return;
    }
    if (c.delta > 0) this.badgeState = 'up';
    else if (c.delta < 0) this.badgeState = 'down';
    else this.badgeState = 'flat';
    const pctPart =
      c.percentDelta === null
        ? ''
        : ` (${c.percentDelta >= 0 ? '+' : ''}${c.percentDelta.toFixed(1)}%)`;
    const sign = c.delta >= 0 ? '+' : '';
    this.badgeText = `${sign}${this.formatValue(c.delta, format)}${pctPart}`;
  }

  /** Arrow glyph for the badge state. */
  get badgeArrow(): string {
    if (this.badgeState === 'up') return '▲';
    if (this.badgeState === 'down') return '▼';
    return '▬';
  }

  /**
   * String-format the KPI value per the editor's format choice
   * ('number' | 'currency' | 'percent'). Numbers get comma grouping and
   * up to 2 decimals.
   */
  private formatValue(value: number, format: string | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const grouped = value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    switch (format) {
      case 'currency':
        return `$${grouped}`;
      case 'percent':
        return `${grouped}%`;
      case 'number':
      default:
        return grouped;
    }
  }

  /**
   * Minimal, chrome-less line config for the sparkline. Uses the real
   * echarts-option-builder config keys:
   *   - legend / tooltip / axes / grid lines all suppressed,
   *   - xAxis:false / yAxis:false hide both physical axes entirely,
   *   - rangeFillOpacity gives the subtle area fill,
   *   - smooth via lineSmooth, no symbols for a clean sparkline.
   * The shared option builder consumes single-series {name,value}[].
   */
  private buildSparkConfig(): any {
    return {
      colorScheme: 'default',
      legend: false,
      tooltipDisabled: false,
      showXAxisLabel: false,
      showYAxisLabel: false,
      xAxis: false,
      yAxis: false,
      showGridLines: false,
      lineSmooth: true,
      rangeFillOpacity: 0.15,
      showSymbol: false,
      lineWidth: 2,
      animations: false,
    };
  }
}
