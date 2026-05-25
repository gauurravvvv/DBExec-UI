import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { QUERY } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * Thin client over the BE `queries` module. Every URL is sourced from
 * the QUERY constant so this file stays in lockstep with the canonical
 * REST routes — no string literals scattered across services.
 *
 * Only the three endpoints the BE actually exposes live here. Earlier
 * iterations of this service shipped methods for /query/save,
 * /query/history, /query/validate, /datasource/schema/:id, etc. —
 * those BE routes were never implemented, the FE never called the
 * methods, and they're gone.
 */
@Injectable({ providedIn: 'root' })
export class QueryService {
  constructor(private httpClientService: HttpClientService) {}

  /** POST /api/v1/queries/execute — run an ad-hoc SQL query. */
  executeQuery(queryData: {
    datasourceId: string;
    query: string;
    page?: number;
    limit?: number;
    filter?: string;
  }): Observable<any> {
    return this.httpClientService.queryPost(QUERY.EXECUTE, queryData);
  }

  /**
   * POST /api/v1/queries/structure — fetch the datasource's schema tree
   * (schemas → tables → columns). Uses the no-loader variant so the
   * dataset editor's quiet refreshes don't trigger the global spinner.
   */
  getDatasourceStructure(datasourceId: string): Observable<any> {
    return this.httpClientService.queryPostNoLoader(QUERY.STRUCTURE, {
      datasourceId,
    });
  }

  /** POST /api/v1/queries/export — export query results as a blob (CSV/XLSX). */
  exportQueryResults(queryData: {
    datasourceId: string;
    query: string;
    filter?: string;
  }): Observable<Blob> {
    return this.httpClientService.queryPost(QUERY.EXPORT, queryData, {
      responseType: 'blob',
    });
  }
}
