import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { QUERY_RUNNER } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * QueryRunnerService — thin HTTP client for the Query Runner module.
 *
 * Connection CRUD is owner-scoped server-side (a user only ever sees
 * their own). The executor calls (catalog / execute / cancel) run
 * against the target datasource AS the connection's login. Nothing here
 * ever handles a plaintext stored password — the password field is
 * write-only on create/edit and never returned.
 */
export interface QueryConnection {
  id: string;
  name: string;
  datasourceId: string;
  datasourceName?: string | null;
  engine?: string | null;
  host?: string | null;
  database?: string | null;
  username: string;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  createdOn?: string | null;
}

export interface ConnectionPayload {
  name: string;
  datasourceId: string;
  username: string;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class QueryRunnerService {
  constructor(private http: HttpClientService) {}

  private base(id: string): string {
    return QUERY_RUNNER.CONNECTION + encodeURIComponent(id);
  }

  /** List my connections; optionally filtered to one datasource. */
  listConnections(datasourceId?: string): Promise<any> {
    const params: Record<string, string> = {};
    if (datasourceId) params['datasourceId'] = datasourceId;
    return lastValueFrom(
      this.http.apiGet(QUERY_RUNNER.CONNECTIONS, { params, skipLoader: true }),
    );
  }

  getConnection(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id), { skipLoader: true }),
    );
  }

  addConnection(payload: ConnectionPayload): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(QUERY_RUNNER.CONNECTIONS, payload, { skipLoader: true }),
    );
  }

  updateConnection(id: string, payload: Partial<ConnectionPayload>): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(this.base(id), payload, { skipLoader: true }),
    );
  }

  deleteConnection(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(this.base(id), { skipLoader: true }),
    );
  }

  /** Verify stored credentials against the datasource host. */
  testConnection(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        this.base(id) + QUERY_RUNNER.TEST_SUFFIX,
        {},
        { skipLoader: true },
      ),
    );
  }

  // ── executor ────────────────────────────────────────────────────

  /** Schema catalog for IntelliSense (schemas/tables/columns/FKs). */
  getCatalog(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id) + QUERY_RUNNER.CATALOG_SUFFIX, {
        skipLoader: true,
      }),
    );
  }

  /** Run a SQL script; write=true commits, else read-only. */
  execute(
    id: string,
    sql: string,
    write: boolean,
    executionId: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        this.base(id) + QUERY_RUNNER.EXECUTE_SUFFIX,
        { sql, write, executionId },
        { skipLoader: true },
      ),
    );
  }

  /** Cancel a running execution by its client-generated executionId. */
  cancel(id: string, executionId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        this.base(id) + QUERY_RUNNER.CANCEL_SUFFIX,
        { executionId },
        { skipLoader: true },
      ),
    );
  }
}
