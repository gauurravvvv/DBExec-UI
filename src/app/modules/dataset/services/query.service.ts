import { Injectable, computed, signal } from '@angular/core';
import { Observable, finalize } from 'rxjs';
import { QUERY } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * Thin client over the BE `queries` module. Every URL is sourced from
 * the QUERY constant so this file stays in lockstep with the canonical
 * REST routes — no string literals scattered across services.
 *
 * Loading-state convention matches the rest of the rollout:
 *   - `running`          → Run Query button (executeQuery)
 *   - `exporting`        → Export Results button (exportQueryResults)
 *   - `loadingStructure` → silent schema-tree refresh
 *
 * All three endpoints pass `{ skipLoader: true }` so the global
 * blocker is off; the editor wires these signals onto its own
 * Run/Export buttons. `running` in particular replaces the multi-
 * minute screen freeze the editor used to show on big queries.
 */
@Injectable({ providedIn: 'root' })
export class QueryService {
  // Reference-counted in-flight counters. The previous boolean-flag
  // design was a footgun: when two callers fired executeQuery
  // concurrently (e.g. an editor tab + the column-distinct dropdown
  // probe), the second response's `next` flipped `_running` to
  // false while the first call was still pending — Run buttons in
  // OTHER components would re-enable mid-query.
  //
  // Counters increment on subscribe, decrement on finalize (success
  // / error / unsubscribe). The exposed signals are computed > 0 so
  // every existing consumer reads them as a boolean without any
  // change.
  private _runningCount = signal(0);
  private _exportingCount = signal(0);
  private _loadingStructureCount = signal(0);

  readonly running = computed(() => this._runningCount() > 0);
  readonly exporting = computed(() => this._exportingCount() > 0);
  readonly loadingStructure = computed(() => this._loadingStructureCount() > 0);

  constructor(private httpClientService: HttpClientService) {}

  /**
   * POST /api/v1/queries/execute — run an ad-hoc SQL query.
   *
   * `requestId` is FE-minted (caller-supplied) so the Cancel button
   * has the id available immediately, before the BE responds. The
   * BE accepts it on the request body, registers it in the in-process
   * cancel registry, and returns the same id on the response. If the
   * caller doesn't supply one we accept that (BE falls back to its
   * own UUID) — keeps the contract backward compatible.
   *
   * `finalize` (vs `tap`) handles the unsubscribe path too — when
   * the caller's component is destroyed mid-query and the
   * subscription is torn down, the counter still gets decremented.
   */
  executeQuery(queryData: {
    datasourceId: string;
    query: string;
    page?: number;
    limit?: number;
    filter?: string;
    requestId?: string;
  }): Observable<any> {
    this._runningCount.update(n => n + 1);
    return this.httpClientService
      .queryPost(QUERY.EXECUTE, queryData, { skipLoader: true })
      .pipe(finalize(() => this._runningCount.update(n => Math.max(0, n - 1))));
  }

  /**
   * POST /api/v1/queries/cancel — interrupt a mid-flight executeQuery.
   *
   * Fire-and-forget from the caller's perspective — the in-flight
   * executeQuery's own response handler picks up the engine's
   * "query cancelled" error and surfaces it via the existing
   * typed-error code path. This call just kicks the engine.
   */
  cancelQuery(payload: {
    requestId: string;
    datasourceId: string;
  }): Observable<any> {
    return this.httpClientService.queryPost(QUERY.CANCEL, payload, {
      skipLoader: true,
    });
  }

  /**
   * POST /api/v1/queries/explain — parse + plan the user SQL
   * without executing it. Engine-aware: PG / MySQL / Snowflake
   * return JSON; Oracle returns text. Caller gets back
   * { engine, plan, raw, durationMs }.
   */
  explainQuery(payload: {
    datasourceId: string;
    query: string;
  }): Observable<any> {
    return this.httpClientService.queryPost(QUERY.EXPLAIN, payload, {
      skipLoader: true,
    });
  }

  /**
   * POST /api/v1/queries/structure — fetch the datasource's schema tree
   * (schemas → tables → columns). Driven by `loadingStructure` so the
   * editor's per-section spinner can show progress.
   */
  getDatasourceStructure(datasourceId: string): Observable<any> {
    this._loadingStructureCount.update(n => n + 1);
    return this.httpClientService
      .queryPost(QUERY.STRUCTURE, { datasourceId }, { skipLoader: true })
      .pipe(
        finalize(() =>
          this._loadingStructureCount.update(n => Math.max(0, n - 1)),
        ),
      );
  }

  /** POST /api/v1/queries/export — export query results as a blob (CSV/XLSX). */
  exportQueryResults(queryData: {
    datasourceId: string;
    query: string;
    filter?: string;
  }): Observable<Blob> {
    this._exportingCount.update(n => n + 1);
    return this.httpClientService
      .queryPost(QUERY.EXPORT, queryData, {
        responseType: 'blob',
        skipLoader: true,
      })
      .pipe(
        finalize(() => this._exportingCount.update(n => Math.max(0, n - 1))),
      );
  }
}
