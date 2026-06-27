import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
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
  private _running = signal(false);
  private _exporting = signal(false);
  private _loadingStructure = signal(false);

  readonly running = this._running.asReadonly();
  readonly exporting = this._exporting.asReadonly();
  readonly loadingStructure = this._loadingStructure.asReadonly();

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
   */
  executeQuery(queryData: {
    datasourceId: string;
    query: string;
    page?: number;
    limit?: number;
    filter?: string;
    requestId?: string;
  }): Observable<any> {
    this._running.set(true);
    return this.httpClientService
      .queryPost(QUERY.EXECUTE, queryData, { skipLoader: true })
      .pipe(
        tap({
          next: () => this._running.set(false),
          error: () => this._running.set(false),
        }),
      );
  }

  /**
   * POST /api/v1/queries/cancel — interrupt a mid-flight executeQuery.
   *
   * Fire-and-forget from the caller's perspective — the in-flight
   * executeQuery's own response handler picks up the engine's
   * "query cancelled" error and surfaces it via the existing
   * typed-error code path. This call just kicks the engine.
   */
  cancelQuery(payload: { requestId: string; datasourceId: string }): Observable<any> {
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
  explainQuery(payload: { datasourceId: string; query: string }): Observable<any> {
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
    this._loadingStructure.set(true);
    return this.httpClientService
      .queryPost(QUERY.STRUCTURE, { datasourceId }, { skipLoader: true })
      .pipe(
        tap({
          next: () => this._loadingStructure.set(false),
          error: () => this._loadingStructure.set(false),
        }),
      );
  }

  /** POST /api/v1/queries/export — export query results as a blob (CSV/XLSX). */
  exportQueryResults(queryData: {
    datasourceId: string;
    query: string;
    filter?: string;
  }): Observable<Blob> {
    this._exporting.set(true);
    return this.httpClientService
      .queryPost(QUERY.EXPORT, queryData, {
        responseType: 'blob',
        skipLoader: true,
      })
      .pipe(
        tap({
          next: () => this._exporting.set(false),
          error: () => this._exporting.set(false),
        }),
      );
  }
}
