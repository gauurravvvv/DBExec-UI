import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subscription } from 'rxjs';
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
export class AnalysisWidgetEditorComponent
  implements OnChanges, OnInit, OnDestroy
{
  @Input() visible = false;
  @Input() analysisId = '';
  /** Active tab id — new widgets default to it (null = default tab). */
  @Input() activeTabId: string | null = null;
  /** When set, the dialog edits this widget; otherwise it creates one. */
  @Input() editingWidget: AnalysisWidget | null = null;
  /** Numeric fields for the KPI measure dropdown ({ label, value }). */
  @Input() measureOptions: { label: string; value: string }[] = [];
  /**
   * All fields for the KPI date-column dropdown ({ label, value }). Used
   * to order the trend sparkline + derive the period-over-period delta.
   * Falls back to measureOptions when not supplied.
   */
  @Input() dimensionOptions: { label: string; value: string }[] = [];

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
  // Slice B — trend + delta.
  kpiDateColumn = '';
  kpiCompareMode = '';
  isSaving = false;

  // Dropdown option sources hold i18n KEYS; the bound arrays below are the
  // LOCALIZED copies (resolved in the constructor + on language change) so the
  // Add-/Edit-widget dialog never shows raw keys like "DASHBOARD.WIDGET.TYPE_KPI".
  private static readonly RAW_WIDGET_TYPE_OPTIONS: {
    label: string;
    value: WidgetType;
  }[] = [
    { label: 'DASHBOARD.WIDGET.TYPE_TEXT', value: 'text' },
    { label: 'DASHBOARD.WIDGET.TYPE_KPI', value: 'kpi' },
  ];
  widgetTypeOptions: { label: string; value: WidgetType }[] = [];

  private static readonly RAW_AGGREGATE_OPTIONS: {
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
  aggregateOptions: {
    label: string;
    value: KpiWidgetConfig['aggregate'];
  }[] = [];

  private static readonly RAW_FORMAT_OPTIONS: {
    label: string;
    value: string;
  }[] = [
    { label: 'DASHBOARD.WIDGET.FORMAT_NUMBER', value: 'number' },
    { label: 'DASHBOARD.WIDGET.FORMAT_CURRENCY', value: 'currency' },
    { label: 'DASHBOARD.WIDGET.FORMAT_PERCENT', value: 'percent' },
  ];
  formatOptions: { label: string; value: string }[] = [];

  /** Period-over-period compare-mode options for the KPI (Slice B). */
  private static readonly RAW_COMPARE_MODE_OPTIONS: {
    label: string;
    value: string;
  }[] = [
    { label: 'ANALYSES.KPI.COMPARE_NONE', value: '' },
    { label: 'ANALYSES.KPI.COMPARE_PREVIOUS_PERIOD', value: 'previous_period' },
    {
      label: 'ANALYSES.KPI.COMPARE_SAME_PERIOD_LAST_YEAR',
      value: 'same_period_last_year',
    },
  ];
  compareModeOptions: { label: string; value: string }[] = [];

  /** Date-column options — dimensionOptions when set, else measureOptions. */
  get dateColumnOptions(): { label: string; value: string }[] {
    return this.dimensionOptions.length
      ? this.dimensionOptions
      : this.measureOptions;
  }

  private langSub?: Subscription;

  constructor(
    private widgetsService: AnalysisWidgetsService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.localizeOptions();
    this.langSub = this.translate.onLangChange.subscribe(() =>
      this.localizeOptions(),
    );
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
  }

  /** Resolve every option array's i18n KEY label against the active locale. */
  private localizeOptions(): void {
    const loc = <T extends { label: string; value: unknown }>(arr: T[]): T[] =>
      arr.map(o => ({ ...o, label: this.translate.instant(o.label) }) as T);
    this.widgetTypeOptions = loc(
      AnalysisWidgetEditorComponent.RAW_WIDGET_TYPE_OPTIONS,
    );
    this.aggregateOptions = loc(
      AnalysisWidgetEditorComponent.RAW_AGGREGATE_OPTIONS,
    );
    this.formatOptions = loc(AnalysisWidgetEditorComponent.RAW_FORMAT_OPTIONS);
    this.compareModeOptions = loc(
      AnalysisWidgetEditorComponent.RAW_COMPARE_MODE_OPTIONS,
    );
  }

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
    this.kpiDateColumn = '';
    this.kpiCompareMode = '';
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
      this.kpiTargetValue =
        typeof k.targetValue === 'number' ? k.targetValue : null;
      this.kpiDateColumn = k.dateColumn || '';
      this.kpiCompareMode = k.compareMode || '';
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
    if (this.kpiComparePeriod.trim())
      cfg.comparePeriod = this.kpiComparePeriod.trim();
    if (typeof this.kpiTargetValue === 'number')
      cfg.targetValue = this.kpiTargetValue;
    if (this.kpiDateColumn) cfg.dateColumn = this.kpiDateColumn;
    if (this.kpiCompareMode) {
      cfg.compareMode = this.kpiCompareMode as KpiWidgetConfig['compareMode'];
    }
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
        const saved: AnalysisWidget = res?.data?.widget ??
          res?.data ?? {
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
