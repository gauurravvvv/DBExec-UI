import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SharedChartsModule } from 'src/app/shared/modules/shared-charts.module';
import { Visual } from '../analyses/models/visual.model';
import { ChartDataTransformerService } from '../analyses/services/chart-data-transformer.service';
import { isCardChartType } from '../analyses/constants/charts.constants';
import { DashboardService } from '../dashboard/services/dashboard.service';

/**
 * EmbedDashboardComponent — the PUBLIC, read-only dashboard viewer that a
 * share link opens. Standalone + hosted OUTSIDE the /app shell (no
 * sidebar/topbar, no auth). It:
 *   1. reads the opaque :token from the route,
 *   2. renders the snapshot layout via the public render endpoint,
 *   3. runs the snapshot SQL via the public run endpoint (RLS-hardened
 *      for the anonymous viewer on the BE),
 *   4. draws each visual with the SAME shared echart-visual / table-visual
 *      components + ChartDataTransformerService the authed dashboard uses,
 *      so charts look identical.
 *
 * Deliberately view-only: no filters, no share/export chrome, no edit. A
 * bad/expired/revoked token surfaces a friendly error state (the BE
 * returns an opaque 403). The grid layout mirrors view-dashboard's
 * ratio → CSS-grid mapping so a snapshot lays out the same way here.
 */
@Component({
  selector: 'app-embed-dashboard',
  standalone: true,
  imports: [CommonModule, TranslateModule, SharedChartsModule],
  templateUrl: './embed-dashboard.component.html',
  styleUrls: ['./embed-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLDivElement>;

  token = '';
  dashboardName = '';
  visuals: Visual[] = [];
  rawData: any[] = [];

  loading = true;
  error = false;

  canvasWidth = 1000;
  canvasHeight = 600;

  private readonly GRID_COLUMNS = 24;
  private readonly GRID_ROWS = 12;
  private resizeObserver: ResizeObserver | null = null;

  isCardChartType = isCardChartType;

  constructor(
    private route: ActivatedRoute,
    private _dashboardService: DashboardService,
    private chartDataTransformer: ChartDataTransformerService,
    private translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) {
      this.loading = false;
      this.error = true;
      return;
    }
    void this.load();
  }

  ngAfterViewInit(): void {
    this.setupResize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private async load(): Promise<void> {
    try {
      const res: any = await this._dashboardService.renderPublic(this.token);
      const data = res?.data ?? res;
      if (!data || res?.status === false) {
        this.fail();
        return;
      }
      this.dashboardName = data.name || '';
      this.mapVisuals(data.visuals || []);

      const runRes: any = await this._dashboardService.runPublicQuery(
        this.token,
        { limit: -1 },
      );
      this.rawData = runRes?.data ?? [];
      this.transformAll();
      this.loading = false;
      this.cdr.markForCheck();
      setTimeout(() => this.setupResize(), 0);
    } catch {
      this.fail();
    }
  }

  private fail(): void {
    this.loading = false;
    this.error = true;
    this.cdr.markForCheck();
  }

  /** Ratio → CSS-grid span, mirroring view-dashboard.mapVisualsFromResponse. */
  private mapVisuals(apiVisuals: any[]): void {
    this.visuals = apiVisuals.map((v: any) => {
      const widthRatio = parseFloat(v.widthRatio) || 0.5;
      const heightRatio = parseFloat(v.heightRatio) || 0.45;
      const xRatio = parseFloat(v.xRatio) || 0;
      const yRatio = parseFloat(v.yRatio) || 0;
      const colSpan = Math.max(1, Math.round(widthRatio * this.GRID_COLUMNS));
      const rowSpan = Math.max(1, Math.round(heightRatio * this.GRID_ROWS));
      const gridCol = Math.min(
        this.GRID_COLUMNS - 1,
        Math.round(xRatio * this.GRID_COLUMNS),
      );
      const gridRow = Math.round(yRatio * this.GRID_ROWS);
      return {
        id: v.id,
        title: v.title || this.translate.instant('DASHBOARD.UNTITLED_VISUAL'),
        width: 400,
        height: 350,
        widthRatio,
        heightRatio,
        x: 0,
        y: 0,
        xRatio,
        yRatio,
        colSpan,
        rowSpan,
        gridCol,
        gridRow,
        chartType: v.visualConfig?.chartType || null,
        xAxisColumn: v.visualConfig?.xAxisColumn || null,
        yAxisColumn: v.visualConfig?.yAxisColumn || null,
        zAxisColumn: v.visualConfig?.config?.zAxisColumn || null,
        chartData: [],
        config: v.visualConfig?.config || {},
        loading: false,
        loaded: false,
        error: false,
      } as Visual;
    });
  }

  private transformAll(): void {
    this.visuals.forEach(visual => {
      if (visual.chartType && visual.xAxisColumn && visual.yAxisColumn) {
        visual.chartData = this.chartDataTransformer.transformData(
          visual.chartType,
          this.rawData,
          this.chartDataTransformer.buildMapping(visual),
        ) as any[];
      } else {
        visual.chartData = [];
      }
      visual.loaded = true;
    });
  }

  private setupResize(): void {
    if (!this.canvas?.nativeElement || this.resizeObserver) return;
    this.updateDimensions();
    this.resizeObserver = new ResizeObserver(() => {
      this.updateDimensions();
      this.cdr.markForCheck();
    });
    this.resizeObserver.observe(this.canvas.nativeElement);
  }

  private updateDimensions(): void {
    const rect = this.canvas?.nativeElement?.getBoundingClientRect();
    if (rect) {
      this.canvasWidth = rect.width || 1000;
      this.canvasHeight = rect.height || 600;
    }
  }

  getDisplayData(visual: Visual): any[] {
    return visual?.chartData ?? [];
  }

  trackByVisualId = (_: number, v: Visual): string => v.id as string;
}
