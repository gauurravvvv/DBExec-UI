import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
} from '@angular/core';
import type { EChartsOption } from 'echarts';

/** One plotted series on a trend/category chart. */
export interface TrendSeries {
  name: string;
  data: number[];
  /** line | bar — mixed charts can combine both. */
  type?: 'line' | 'bar';
  /** Token name for the colour, e.g. '--primary-color'. Optional. */
  colorVar?: string;
}

/** A slice on the donut variant. */
export interface DonutSlice {
  name: string;
  value: number;
}

/**
 * app-trend-chart — a small, animated ECharts wrapper for the landing
 * dashboards. Supports category trend charts (line/bar/mixed) and a
 * donut. Colours resolve off the theme tokens so every chart matches
 * the org/user palette; charts animate in when their data arrives.
 *
 * This is intentionally lighter than the analyses `app-echart-visual`
 * (which handles 35+ chart types, GL, geo). For the dashboard we only
 * need trends + a donut, so we keep the option-building local and
 * predictable.
 *
 * USAGE (trend):
 *   <app-trend-chart
 *     [categories]="['W1','W2',...]"
 *     [series]="[{name:'Queries',data:[...],type:'line'},
 *                {name:'Logins',data:[...],type:'line',colorVar:'--success-color'}]"
 *     [height]="260">
 *   </app-trend-chart>
 *
 * USAGE (donut):
 *   <app-trend-chart variant="donut" [slices]="[{name:'SQL',value:12}]"></app-trend-chart>
 */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trend-chart.component.html',
  styleUrls: ['./trend-chart.component.scss'],
})
export class TrendChartComponent implements OnChanges {
  @Input() variant: 'trend' | 'donut' = 'trend';

  /** X-axis category labels for the trend variant. */
  @Input() categories: string[] = [];
  @Input() series: TrendSeries[] = [];

  /** Donut slices for the donut variant. */
  @Input() slices: DonutSlice[] = [];

  @Input() height = 260;
  /** Whether to show the legend. */
  @Input() legend = true;
  /** Stack all bar series into one bar (for success/failed splits). */
  @Input() stacked = false;

  option: EChartsOption | null = null;

  /** Default categorical palette resolved off tokens. */
  private readonly paletteVars = [
    '--primary-color',
    '--success-color',
    '--warning-color',
    '--info-color',
    '--error-color',
  ];

  ngOnChanges(): void {
    this.option = this.variant === 'donut' ? this.buildDonut() : this.buildTrend();
  }

  private cssVar(name: string, fallback = '#2196f3'): string {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  }

  private gridColor(): string {
    return this.cssVar('--chart-grid', this.cssVar('--border-color', '#eef1f5'));
  }
  private textMuted(): string {
    return this.cssVar('--text-muted', '#757575');
  }

  private buildTrend(): EChartsOption {
    const grid = this.gridColor();
    const muted = this.textMuted();
    const border = this.cssVar('--border-color', '#e0e0e0');
    const card = this.cssVar('--card-background', '#ffffff');

    return {
      grid: { left: 46, right: 16, top: this.legend ? 30 : 14, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: card,
        borderColor: border,
        textStyle: { color: this.cssVar('--text-color', '#333') },
      },
      legend: this.legend
        ? {
            top: 0,
            right: 0,
            icon: 'roundRect',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: { color: muted, fontSize: 11 },
          }
        : { show: false },
      xAxis: {
        type: 'category',
        boundaryGap: this.series.some(s => s.type === 'bar'),
        data: this.categories,
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: grid } },
        axisLabel: { color: muted, fontSize: 11 },
      },
      animationDuration: 800,
      animationEasing: 'cubicOut',
      series: this.series.map((s, i) => {
        const color = this.cssVar(
          s.colorVar ?? this.paletteVars[i % this.paletteVars.length],
        );
        if (s.type === 'bar') {
          return {
            name: s.name,
            type: 'bar',
            data: s.data,
            stack: this.stacked ? 'total' : undefined,
            itemStyle: { color, borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 28,
          };
        }
        return {
          name: s.name,
          type: 'line',
          data: s.data,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          showSymbol: false,
          lineStyle: { width: 2.5, color },
          itemStyle: { color },
          areaStyle:
            this.series.length === 1 || i === 0
              ? {
                  color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: color + '33' },
                      { offset: 1, color: color + '00' },
                    ],
                  },
                }
              : undefined,
        };
      }),
    };
  }

  private buildDonut(): EChartsOption {
    const card = this.cssVar('--card-background', '#ffffff');
    const muted = this.textMuted();
    const colors = this.paletteVars.map(v => this.cssVar(v));
    return {
      tooltip: { trigger: 'item' },
      legend: this.legend
        ? {
            bottom: 0,
            icon: 'circle',
            textStyle: { color: muted, fontSize: 11 },
          }
        : { show: false },
      animationDuration: 800,
      series: [
        {
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', this.legend ? '44%' : '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: card, borderWidth: 2 },
          label: { show: false },
          data: this.slices.map((s, i) => ({
            name: s.name,
            value: s.value,
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    };
  }
}
