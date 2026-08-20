import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { QUERY_RUNNER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * SavedQueriesService — thin HTTP client for the Query Executor's
 * "Saved Queries". A saved query is a named, owner-private SQL snippet
 * bound to a datasource + connection. All calls are owner-scoped
 * server-side (a user only ever sees their own).
 *
 * Mirrors query-runner.service.ts style: lastValueFrom around the shared
 * HttpClientService (which rides the app's x-auth-token interceptor), and
 * `{ params, skipLoader: true }` so the module drives its own spinners.
 */
export interface SavedQuery {
  id: string;
  name: string;
  description?: string | null;
  sql: string;
  connectorId: string;
  datasourceName?: string | null;
  connectionId: string;
  connectionName?: string | null;
  rowLimit?: number | null;
  lastRunAt?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
}

export interface SavedQueryPayload {
  name: string;
  description?: string;
  sql: string;
  connectorId: string;
  connectionId: string;
  rowLimit?: number;
}

@Injectable({ providedIn: 'root' })
export class SavedQueriesService {
  constructor(private http: HttpClientService) {}

  private base(id: string): string {
    return QUERY_RUNNER.SAVED_QUERY + encodeURIComponent(id);
  }

  /**
   * List my saved queries. When `paging` is supplied the BE paginates +
   * filters + sorts server-side and returns `{ count, queries }`; without
   * it the full list is returned.
   */
  listSavedQueries(paging?: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }): Promise<any> {
    const params: Record<string, string> = {};
    if (paging) {
      if (paging.page != null) params['page'] = String(paging.page);
      if (paging.limit != null) params['limit'] = String(paging.limit);
      if (paging.sort) params['sort'] = paging.sort;
      if (paging.filter) params['filter'] = paging.filter;
    }
    return lastValueFrom(
      this.http.apiGet(QUERY_RUNNER.SAVED_QUERIES, {
        params,
        skipLoader: true,
      }),
    );
  }

  /** One saved query — enriched with datasourceName + connectionName. */
  getSavedQuery(id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(this.base(id), { skipLoader: true }));
  }

  addSavedQuery(payload: SavedQueryPayload): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(QUERY_RUNNER.SAVED_QUERIES, payload, {
        skipLoader: true,
      }),
    );
  }

  updateSavedQuery(id: string, payload: SavedQueryPayload): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(this.base(id), payload, { skipLoader: true }),
    );
  }

  deleteSavedQuery(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(this.base(id), {
        body: { justification },
        skipLoader: true,
      }),
    );
  }
}
