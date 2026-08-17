import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
} from '@angular/core';
import type { EChartsOption } from 'echarts';

export type StatFormat = 'number' | 'currency' | 'percent' | 'compact';
export type StatTone = 'blue' | 'green' | 'amber' | 'purple' | 'red';

/**
 * app-stat-tile — a KPI tile for the landing dashboards.
 *
 * Renders a large tabular-nums value, an optional secondary total
 * ("68 / 92"), a ▲/▼ delta pill versus the previous period, and an
 * optional sparkline. Purpose-built for the landing dashboards and
 * kept independent of the analyses `app-kpi-card` (which stays as-is).
 *
 * The delta direction drives the pill colour: an increase is not
 * always "good" (e.g. failed logins), so callers pass `deltaGood`
 * to say whether up is positive. Default: up = good.
 *
 * USAGE:
 *   <app-stat-tile
 *     [label]="'DASHBOARD.KPI.QUERIES' | translate"
 *     [value]="14208" format="compact" tone="blue" icon="pi pi-database"
 *     [delta]="12.4" deltaUnit="%" [sparkData]="spark"
 *     [caption]="'DASHBOARD.KPI.VS_PREV' | translate">
 *   </app-stat-tile>
 */
@Component({
  selector: 'app-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stat-tile.component.html',
  styleUrls: ['./stat-tile.component.scss'],
})
export class StatTileComponent implements OnChanges {
  @Input() label = '';
  @Input() value: number | null = null;
  @Input() format: StatFormat = 'number';
  /** Optional secondary "of N" total, e.g. active users out of total. */
  @Input() secondary: number | null = null;
  @Input() icon = '';
  @Input() tone: StatTone = 'blue';

  /** Signed delta versus the previous period. Null hides the pill. */
  @Input() delta: number | null = null;
  /** Unit suffix for the delta pill, e.g. '%' or '' (absolute). */
  @Input() deltaUnit = '%';
  /** Whether an increase should read as positive (green). */
  @Input() deltaGood = true;

  /** Small caption under the delta, e.g. "vs previous 30 days". */
  @Input() caption = '';

  /** Sparkline series. Empty array hides the sparkline. */
  @Input() sparkData: number[] = [];

  sparkOption: EChartsOption | null = null;

  ngOnChanges(): void {
    this.buildSpark();
  }

  get displayValue(): string {
    if (this.value === null || this.value === undefined) return '—';
    return this.formatNumber(this.value, this.format);
  }

  get deltaClass(): 'up' | 'down' | 'flat' {
    if (this.delta === null || this.delta === 0) return 'flat';
    return this.delta > 0 ? 'up' : 'down';
  }

  /** Colour intent: an "up" delta is green only when deltaGood. */
  get deltaPositive(): boolean {
    if (this.delta === null || this.delta === 0) return false;
    const up = this.delta > 0;
    return this.deltaGood ? up : !up;
  }

  get deltaLabel(): string {
    if (this.delta === null) return '';
    const arrow = this.delta > 0 ? '▲' : this.delta < 0 ? '▼' : '—';
    const mag = Math.abs(this.delta);
    return `${arrow} ${this.formatNumber(mag, 'number')}${this.deltaUnit}`;
  }

  private formatNumber(n: number, fmt: StatFormat): string {
    switch (fmt) {
      case 'currency':
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(n);
      case 'percent':
        return `${n.toFixed(1)}%`;
      case 'compact':
        return new Intl.NumberFormat(undefined, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(n);
      default:
        return new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 1,
        }).format(n);
    }
  }

  /** Resolve the tile's accent to a real colour off the theme tokens. */
  private toneColor(): string {
    const map: Record<StatTone, string> = {
      blue: '--primary-color',
      green: '--success-color',
      amber: '--warning-color',
      purple: '--info-color',
      red: '--error-color',
    };
    const varName = map[this.tone] ?? '--primary-color';
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
    return v || '#2196f3';
  }

  private buildSpark(): void {
    if (!this.sparkData || this.sparkData.length < 2) {
      this.sparkOption = null;
      return;
    }
    const color = this.toneColor();
    this.sparkOption = {
      grid: { left: 0, right: 0, top: 2, bottom: 0 },
      xAxis: {
        type: 'category',
        show: false,
        data: this.sparkData.map((_, i) => i),
      },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { show: false },
      // Charts animate in on data arrival — reinforces the "loading →
      // data" transition the dashboards lean on.
      animationDuration: 700,
      series: [
        {
          type: 'line',
          data: this.sparkData,
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: color + '55' },
                { offset: 1, color: color + '00' },
              ],
            },
          },
        },
      ],
    };
  }
}
