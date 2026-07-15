import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ANALYSIS_TAB } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * A named page inside an analysis. Mirrors the BE `analysis_tab` entity's
 * projected shape (id / analysisId / name / sequence / icon). The canvas
 * filters its visuals by `id` and the tab strip renders these in
 * `sequence` order.
 */
export interface AnalysisTab {
  id: string;
  analysisId: string;
  name: string;
  sequence: number;
  icon?: string | null;
}

/**
 * AnalysisTabsService — thin CRUD + reorder wrapper over the
 * `/api/v1/analysis-tabs` API (Track A4). Follows the same
 * skipLoader + lastValueFrom convention as the parameter / filter
 * helpers on AnalysesService so tab edits never trip the global
 * blocking loader (the tab strip manages its own inline pending
 * state). Every call is org-scoped server-side from the auth context;
 * the FE only ever sends the analysisId / tabId it owns.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisTabsService {
  constructor(private http: HttpClientService) {}

  /**
   * List an analysis's tabs (ordered by sequence).
   * GET /analysis-tabs/:analysisId → { data: { tabs: AnalysisTab[] } | AnalysisTab[] }
   */
  list(analysisId: string) {
    return lastValueFrom(
      this.http.apiGet(ANALYSIS_TAB.LIST + analysisId, { skipLoader: true }),
    );
  }

  /**
   * Create a tab on an analysis. The BE re-derives org fields from the
   * auth context; `sequence` defaults to append-at-end server-side when
   * omitted, but we pass it so the new tab lands where the strip expects.
   * POST /analysis-tabs
   */
  add(payload: {
    analysisId: string;
    name: string;
    icon?: string | null;
    sequence?: number;
  }) {
    return lastValueFrom(
      this.http.apiPost(ANALYSIS_TAB.ADD, payload, { skipLoader: true }),
    );
  }

  /**
   * Rename / re-icon a tab (PATCH semantics — only present keys apply).
   * PUT /analysis-tabs/:tabId
   */
  update(
    tabId: string,
    payload: { name?: string; icon?: string | null; sequence?: number },
  ) {
    return lastValueFrom(
      this.http.apiPut(ANALYSIS_TAB.UPDATE + tabId, payload, {
        skipLoader: true,
      }),
    );
  }

  /**
   * Delete a tab. The BE reassigns the tab's visuals to the first
   * remaining tab (or null) before deleting. Justification flows to the
   * audit log via the request body.
   * DELETE /analysis-tabs/:tabId
   */
  delete(tabId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ANALYSIS_TAB.DELETE + tabId, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }

  /**
   * Persist a new tab ordering after a drag / move. Sends the full
   * ordered id list; the BE verifies every id belongs to the analysis
   * and rewrites `sequence` in one transaction.
   * PUT /analysis-tabs/reorder
   */
  reorder(analysisId: string, orderedIds: string[]) {
    return lastValueFrom(
      this.http.apiPut(
        ANALYSIS_TAB.REORDER,
        { analysisId, orderedIds },
        { skipLoader: true },
      ),
    );
  }
}
