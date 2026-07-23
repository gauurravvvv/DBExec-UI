import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ANALYSIS_WIDGET } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/** Widget kinds the canvas renders — a rich-text note or a KPI tile. */
export type WidgetType = 'text' | 'kpi';

/** KPI aggregate functions (mirror of WIDGET_AGGREGATE_VALUES). */
export type WidgetAggregate =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';

/** text widget config → a single markdown blob. */
export interface TextWidgetConfig {
  markdown: string;
}

/** kpi widget config → one aggregated metric with display formatting. */
export interface KpiWidgetConfig {
  measure: string;
  aggregate: WidgetAggregate;
  label: string;
  format: string;
  comparePeriod?: string;
  targetValue?: number;
  // ── Trend + delta (Slice B) ────────────────────────────────────────
  /** Date/time column that orders rows into a sparkline trend. */
  dateColumn?: string | null;
  /**
   * Period-over-period comparison mode powering the delta badge. Prior
   * period is derived client-side from the trend series.
   */
  compareMode?: 'previous_period' | 'same_period_last_year' | null;
}

/**
 * A non-visual content block on an analysis canvas (Track E3). Shares
 * the visual grid's ratio-based layout (widthRatio/heightRatio/…) and
 * belongs to a tab via `tabId` (null = default/first tab).
 */
export interface AnalysisWidget {
  id: string;
  analysisId: string;
  widgetType: WidgetType;
  config: TextWidgetConfig | KpiWidgetConfig | Record<string, any>;
  tabId?: string | null;
  widthRatio?: string | null;
  heightRatio?: string | null;
  xRatio?: string | null;
  yRatio?: string | null;
  sequence?: number;
}

/**
 * AnalysisWidgetsService — CRUD wrapper over `/api/v1/analysis-widgets`
 * (Track E3, FE authoring). Same skipLoader + lastValueFrom convention
 * as AnalysisTabsService; the editor manages its own inline pending
 * state. Calls degrade quietly against an older BE that hasn't shipped
 * the widgets module yet (callers guard on handleSuccessService).
 */
@Injectable({ providedIn: 'root' })
export class AnalysisWidgetsService {
  constructor(private http: HttpClientService) {}

  /**
   * List an analysis's widgets (ordered by sequence).
   * GET /analysis-widgets/:analysisId
   */
  list(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSIS_WIDGET.LIST + '/' + analysisId, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Create a widget. `widgetType` discriminates the config shape the BE
   * validates against (text → { markdown }, kpi → KPI config).
   * POST /analysis-widgets
   */
  add(payload: {
    analysisId: string;
    widgetType: WidgetType;
    config: TextWidgetConfig | KpiWidgetConfig;
    tabId?: string | null;
    widthRatio?: string;
    heightRatio?: string;
    xRatio?: string;
    yRatio?: string;
    sequence?: number;
  }) {
    return lastValueFrom(
      this.http.apiPost(ANALYSIS_WIDGET.ADD, payload, { skipLoader: true }),
    );
  }

  /**
   * Update a widget (PATCH — only present keys apply). Config is merged
   * into the existing config server-side.
   * PUT /analysis-widgets/:widgetId
   */
  update(
    widgetId: string,
    payload: {
      widgetType?: WidgetType;
      config?: Record<string, any>;
      tabId?: string | null;
      widthRatio?: string;
      heightRatio?: string;
      xRatio?: string;
      yRatio?: string;
      sequence?: number;
      justification?: string;
    },
  ) {
    return lastValueFrom(
      this.http.apiPut(ANALYSIS_WIDGET.UPDATE + widgetId, payload, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Delete a widget. Justification flows to the audit log.
   * DELETE /analysis-widgets/:widgetId
   */
  delete(widgetId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ANALYSIS_WIDGET.DELETE + widgetId, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }
}
