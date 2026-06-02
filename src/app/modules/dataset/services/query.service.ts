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

  /** POST /api/v1/queries/execute — run an ad-hoc SQL query. */
  executeQuery(queryData: {
    datasourceId: string;
    query: string;
    page?: number;
    limit?: number;
    filter?: string;
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
