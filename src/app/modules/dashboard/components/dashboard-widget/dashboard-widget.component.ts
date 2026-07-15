import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { renderSimpleMarkdown } from './simple-markdown.util';

/** A dashboard widget as returned by render `widgets[]`. */
export interface DashboardWidget {
  id: string;
  widgetType: 'text' | 'kpi';
  /** text: { markdown }; kpi: { measure, aggregate, label, format, comparePeriod?, targetValue? } */
  config: any;
  tabId?: string | null;
  // grid placement (same ratios as visuals)
  widthRatio?: number | string;
  heightRatio?: number | string;
  xRatio?: number | string;
  yRatio?: number | string;
}

type KpiAggregate = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'count_distinct';

/**
 * DashboardWidgetRenderer — renders the two non-chart tiles on a
 * dashboard/embed grid (Dashboard & Analysis v2, Track E3):
 *
 *   - text : sanitized markdown (headings/bold/italic/code/links/lists).
 *   - kpi  : a single aggregated big-number value + label + optional
 *            compare arrow vs a target value.
 *
 * The KPI value is aggregated client-side over the dashboard rows the
 * host already fetched (`data`) — the run path is shared with the
 * visuals, so no extra query is issued. `config.format` applies a light
 * numeric format (comma grouping, optional prefix/suffix, decimals).
 */
@Component({
  selector: 'app-dashboard-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard-widget.component.html',
  styleUrls: ['./dashboard-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardWidgetComponent implements OnChanges {
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  @Input() widget!: DashboardWidget;
  /** Rows backing the dashboard (post-filter) — the KPI aggregates these. */
  @Input() data: any[] = [];

  /** Rendered, sanitized markdown for a text widget. */
  safeHtml: SafeHtml = '';
  /** Computed KPI display value + comparison state. */
  kpiValue = '';
  kpiRaw: number | null = null;
  kpiLabel = '';
  compareState: 'up' | 'down' | 'flat' | null = null;
  compareText = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['widget'] || changes['data']) {
      this.recompute();
    }
  }

  get widgetType(): 'text' | 'kpi' {
    return this.widget?.widgetType ?? 'text';
  }

  private recompute(): void {
    if (!this.widget) return;
    if (this.widget.widgetType === 'text') {
      const md = this.widget.config?.markdown ?? '';
      this.safeHtml = this.sanitizer.bypassSecurityTrustHtml(
        renderSimpleMarkdown(md),
      );
    } else {
      this.computeKpi();
    }
    this.cdr.markForCheck();
  }

  private computeKpi(): void {
    const cfg = this.widget.config || {};
    this.kpiLabel = cfg.label ?? cfg.measure ?? '';
    const measure: string | undefined = cfg.measure;
    const aggregate: KpiAggregate = (cfg.aggregate as KpiAggregate) || 'sum';

    const raw = this.aggregate(this.data || [], measure, aggregate);
    this.kpiRaw = raw;
    this.kpiValue = raw === null ? '—' : this.formatValue(raw, cfg.format);

    // Optional comparison vs a fixed target value.
    const target =
      typeof cfg.targetValue === 'number' ? cfg.targetValue : null;
    if (raw !== null && target !== null) {
      if (raw > target) this.compareState = 'up';
      else if (raw < target) this.compareState = 'down';
      else this.compareState = 'flat';
      const delta = raw - target;
      const pct = target !== 0 ? (delta / Math.abs(target)) * 100 : 0;
      this.compareText = `${delta >= 0 ? '+' : ''}${this.formatValue(
        delta,
        cfg.format,
      )} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
    } else {
      this.compareState = null;
      this.compareText = '';
    }
  }

  /** Aggregate one numeric column over the row set. */
  private aggregate(
    rows: any[],
    column: string | undefined,
    fn: KpiAggregate,
  ): number | null {
    if (!rows.length) return fn === 'count' ? 0 : null;
    if (fn === 'count') return rows.length;
    if (!column) return null;

    if (fn === 'count_distinct') {
      const set = new Set<any>();
      for (const r of rows) {
        const v = r?.[column];
        if (v !== null && v !== undefined) set.add(v);
      }
      return set.size;
    }

    const nums: number[] = [];
    for (const r of rows) {
      const v = Number(r?.[column]);
      if (!isNaN(v)) nums.push(v);
    }
    if (!nums.length) return null;

    switch (fn) {
      case 'sum':
        return nums.reduce((a, b) => a + b, 0);
      case 'avg':
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      case 'min':
        return Math.min(...nums);
      case 'max':
        return Math.max(...nums);
      default:
        return null;
    }
  }

  /**
   * Light numeric formatting from `config.format`:
   *   { decimals?: number, prefix?: string, suffix?: string, grouping?: boolean }
   * Falls back to comma grouping with up to 2 decimals.
   */
  private formatValue(value: number, format: any): string {
    const decimals =
      typeof format?.decimals === 'number' ? format.decimals : undefined;
    const grouping = format?.grouping !== false;
    let out = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals ?? 0,
      maximumFractionDigits: decimals ?? 2,
      useGrouping: grouping,
    });
    if (format?.prefix) out = `${format.prefix}${out}`;
    if (format?.suffix) out = `${out}${format.suffix}`;
    return out;
  }
}
