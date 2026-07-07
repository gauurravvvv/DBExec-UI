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
  enabled?: boolean;
  isDefault?: boolean;
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

  /** Mark this connection as the default for its datasource. */
  setDefault(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        this.base(id) + QUERY_RUNNER.DEFAULT_SUFFIX,
        {},
        { skipLoader: true },
      ),
    );
  }

  /** Enable / disable a connection. */
  setEnabled(id: string, enabled: boolean): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        this.base(id) + QUERY_RUNNER.ENABLED_SUFFIX,
        { enabled },
        { skipLoader: true },
      ),
    );
  }

  // ── executor ────────────────────────────────────────────────────

  /** Schema names only — fast first paint of the object browser. */
  getSchemas(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id) + QUERY_RUNNER.CATALOG_SUFFIX, {
        skipLoader: true,
      }),
    );
  }

  /** Full catalog (schemas + tables + columns + FKs) — primes IntelliSense. */
  getFullCatalog(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id) + QUERY_RUNNER.CATALOG_SUFFIX, {
        params: { full: 'true' },
        skipLoader: true,
      }),
    );
  }

  /** Lazy: tables in one schema (fetched when a schema node expands). */
  getTables(id: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id) + QUERY_RUNNER.TABLES_SUFFIX, {
        params: { schema },
        skipLoader: true,
      }),
    );
  }

  /** Lazy: columns of one table (fetched when a table node expands). */
  getColumns(id: string, schema: string, table: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(this.base(id) + QUERY_RUNNER.COLUMNS_SUFFIX, {
        params: { schema, table },
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
