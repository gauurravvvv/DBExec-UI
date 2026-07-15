import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import {
  AnalysisWidget,
  AnalysisWidgetsService,
  KpiWidgetConfig,
  TextWidgetConfig,
  WidgetType,
} from '../../services/analysis-widgets.service';

/**
 * AnalysisWidgetEditorComponent (Track E3) — a dialog to author a
 * non-visual canvas block: a rich-text/markdown note or a KPI tile.
 * Emits `saved` with the persisted widget so the canvas can add / patch
 * it. Reuses the house custom-* form controls + the confirmation-popup
 * chrome via its own dialog shell.
 */
@Component({
  selector: 'app-analysis-widget-editor',
  templateUrl: './analysis-widget-editor.component.html',
  styleUrls: ['./analysis-widget-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisWidgetEditorComponent implements OnChanges {
  @Input() visible = false;
  @Input() analysisId = '';
  /** Active tab id — new widgets default to it (null = default tab). */
  @Input() activeTabId: string | null = null;
  /** When set, the dialog edits this widget; otherwise it creates one. */
  @Input() editingWidget: AnalysisWidget | null = null;
  /** Numeric fields for the KPI measure dropdown ({ label, value }). */
  @Input() measureOptions: { label: string; value: string }[] = [];

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saved = new EventEmitter<AnalysisWidget>();

  // ── Form state ─────────────────────────────────────────────────────
  widgetType: WidgetType = 'text';
  markdown = '';
  kpiMeasure = '';
  kpiAggregate: KpiWidgetConfig['aggregate'] = 'sum';
  kpiLabel = '';
  kpiFormat = 'number';
  kpiComparePeriod = '';
  kpiTargetValue: number | null = null;
  isSaving = false;

  readonly widgetTypeOptions: { label: string; value: WidgetType }[] = [
    { label: 'DASHBOARD.WIDGET.TYPE_TEXT', value: 'text' },
    { label: 'DASHBOARD.WIDGET.TYPE_KPI', value: 'kpi' },
  ];

  readonly aggregateOptions: {
    label: string;
    value: KpiWidgetConfig['aggregate'];
  }[] = [
    { label: 'ANALYSES.AGG.SUM', value: 'sum' },
    { label: 'ANALYSES.AGG.AVG', value: 'avg' },
    { label: 'ANALYSES.AGG.MIN', value: 'min' },
    { label: 'ANALYSES.AGG.MAX', value: 'max' },
    { label: 'ANALYSES.AGG.COUNT', value: 'count' },
    { label: 'ANALYSES.AGG.COUNT_DISTINCT', value: 'count_distinct' },
  ];

  readonly formatOptions: { label: string; value: string }[] = [
    { label: 'DASHBOARD.WIDGET.FORMAT_NUMBER', value: 'number' },
    { label: 'DASHBOARD.WIDGET.FORMAT_CURRENCY', value: 'currency' },
    { label: 'DASHBOARD.WIDGET.FORMAT_PERCENT', value: 'percent' },
  ];

  constructor(
    private widgetsService: AnalysisWidgetsService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      if (this.editingWidget) this.populate(this.editingWidget);
      else this.reset();
    }
  }

  private reset(): void {
    this.widgetType = 'text';
    this.markdown = '';
    this.kpiMeasure = '';
    this.kpiAggregate = 'sum';
    this.kpiLabel = '';
    this.kpiFormat = 'number';
    this.kpiComparePeriod = '';
    this.kpiTargetValue = null;
  }

  private populate(w: AnalysisWidget): void {
    this.widgetType = w.widgetType;
    const cfg: any = w.config || {};
    if (w.widgetType === 'text') {
      this.markdown = (cfg as TextWidgetConfig).markdown || '';
    } else {
      const k = cfg as KpiWidgetConfig;
      this.kpiMeasure = k.measure || '';
      this.kpiAggregate = k.aggregate || 'sum';
      this.kpiLabel = k.label || '';
      this.kpiFormat = k.format || 'number';
      this.kpiComparePeriod = k.comparePeriod || '';
      this.kpiTargetValue = typeof k.targetValue === 'number' ? k.targetValue : null;
    }
  }

  get isSaveDisabled(): boolean {
    if (this.isSaving) return true;
    if (this.widgetType === 'text') return !this.markdown.trim();
    return !this.kpiMeasure || !this.kpiLabel || !this.kpiFormat;
  }

  cancel(): void {
    this.visibleChange.emit(false);
  }

  onHide(): void {
    this.visibleChange.emit(false);
  }

  private buildConfig(): TextWidgetConfig | KpiWidgetConfig {
    if (this.widgetType === 'text') {
      return { markdown: this.markdown.trim() };
    }
    const cfg: KpiWidgetConfig = {
      measure: this.kpiMeasure,
      aggregate: this.kpiAggregate,
      label: this.kpiLabel.trim(),
      format: this.kpiFormat,
    };
    if (this.kpiComparePeriod.trim()) cfg.comparePeriod = this.kpiComparePeriod.trim();
    if (typeof this.kpiTargetValue === 'number') cfg.targetValue = this.kpiTargetValue;
    return cfg;
  }

  async save(): Promise<void> {
    if (this.isSaveDisabled) return;
    this.isSaving = true;
    try {
      const config = this.buildConfig();
      let res: any;
      if (this.editingWidget) {
        res = await this.widgetsService.update(this.editingWidget.id, {
          widgetType: this.widgetType,
          config: config as Record<string, any>,
        });
      } else {
        res = await this.widgetsService.add({
          analysisId: this.analysisId,
          widgetType: this.widgetType,
          config,
          tabId: this.activeTabId,
        });
      }
      if (this.globalService.handleSuccessService(res, true)) {
        const saved: AnalysisWidget =
          res?.data?.widget ?? res?.data ?? {
            id: this.editingWidget?.id ?? '',
            analysisId: this.analysisId,
            widgetType: this.widgetType,
            config,
            tabId: this.activeTabId,
          };
        this.visibleChange.emit(false);
        this.saved.emit(saved);
      }
    } catch (err) {
      this.globalService.handleErrorService(err);
    } finally {
      this.isSaving = false;
    }
  }
}
