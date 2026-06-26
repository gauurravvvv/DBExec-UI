import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { DATASOURCE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DatasourceService — list/view/CUD for datasources + schema/table/
 * column listings used by the dataset editor.
 *
 * Loading-state follows the rollout convention: `loading` for reads,
 * `saving` for writes, `_deleting` as a per-id record so each row's
 * delete button can spin independently. Every signal-based call passes
 * `{ skipLoader: true }` so the legacy global blocker stays out of
 * this module — templates render skeleton placeholders + button-level
 * spinners while the signals are true. Test-Connection lives in
 * OrganisationService.validateDatasource (already skipLoader-clean
 * from Phase 1).
 */
@Injectable({ providedIn: 'root' })
export class DatasourceService {
  private _datasources = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _schemas = signal<any[]>([]);
  private _queryLoading = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/edit/list/add
  // datasource ngOnDestroy) can cancel in-flight GETs when the user
  // navigates away. Mutations + runQuery don't pipe through this.
  private _cancelReads$ = new Subject<void>();

  readonly datasources = this._datasources.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly schemas = this._schemas.asReadonly();
  readonly queryLoading = this._queryLoading.asReadonly();
  readonly deleting = this._deleting.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }

  constructor(private http: HttpClientService) {}

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DATASOURCE.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._datasources.set(res.data.datasources ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DATASOURCE.GET + id, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Build the engine-shaped payload the BE expects.
   *
   * The BE Zod schema is a discriminated union on `type`:
   *   - TypeORM engines (postgres / mysql / mariadb / mssql / oracle)
   *     use host + port + database.
   *   - Snowflake uses account + warehouse + role + schemaName + database
   *     (no host/port; the SDK derives the URL from `account`).
   *
   * Selecting the right keys here keeps us in sync with the schema
   * and avoids the BE silently dropping unknown fields.
   */
  private buildEnginePayload(payload: any): any {
    const {
      name,
      description,
      type,
      database,
      username,
      password,
    } = payload;
    const body: any = { name, description, type, database, username, password };
    if (type === 'snowflake') {
      body.account = payload.account;
      body.warehouse = payload.warehouse;
      body.role = payload.role;
      body.schemaName = payload.schemaName;
    } else {
      body.host = payload.host;
      body.port = payload.port;
    }
    return body;
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASOURCE.ADD, this.buildEnginePayload(payload), {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const body = {
        id: payload.id,
        ...this.buildEnginePayload(payload),
        status: payload.status,
        justification,
      };
      return await lastValueFrom(
        // PUT /datasources/:id
        this.http.apiPut(DATASOURCE.UPDATE + payload.id, body, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Test a connection without persisting. Used by the add/edit
   * forms. Same payload shape as `add` — discriminated on `type`.
   * Returns the raw BE response so callers can react to
   * `status: false` (connection failed) vs network error.
   */
  async testConnection(payload: any): Promise<any> {
    return await lastValueFrom(
      this.http.apiPost(DATASOURCE.VALIDATE, this.buildEnginePayload(payload), {
        skipLoader: true,
      }),
    );
  }

  async delete(id: string, justification?: string): Promise<any> {
    // DELETE /datasources/:id — body carries justification.
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DATASOURCE.DELETE + id, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(id, false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    // POST /datasources/bulk-delete
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          DATASOURCE.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }


  resetCurrent() {
    this._current.set(null);
  }

  async loadSchemas(datasourceId: string) {
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(
            DATASOURCE.LIST_SCHEMAS_PREFIX +
              datasourceId +
              DATASOURCE.LIST_SCHEMAS_SUFFIX,
            { skipLoader: true },
          )
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._schemas.set(res.data ?? []);
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._schemas.set([]);
    }
  }

  /**
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  /**
   * The three intro endpoints below take an optional `skipLoader`
   * flag. When the add-dataset editor opens, we pre-warm the schema
   * tree (schemas → tables for every schema) in the background so
   * IntelliSense has data without the user having to click every
   * row. Those background fetches pass `skipLoader: true` so the
   * blocking global loader stays out of the way; the sidebar's
   * per-row inline spinners (driven by tablesStatus) are enough
   * feedback. User-initiated expansion (or anything that wants the
   * loader) leaves the flag off.
   */
  listDatasourceSchemas(params: any, skipLoader = false) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.LIST_SCHEMAS_SUFFIX,
        skipLoader ? { skipLoader: true } : undefined,
      ),
    );
  }

  listSchemaTables(params: any, skipLoader = false) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT.replace(/\/$/, ''),
        skipLoader ? { skipLoader: true } : undefined,
      ),
    );
  }

  listTableColumns(params: any, skipLoader = false) {
    return lastValueFrom(
      this.http.apiGet(
        DATASOURCE.LIST_SCHEMAS_PREFIX +
          params.datasourceId +
          DATASOURCE.SCHEMAS_SEGMENT +
          params.schemaName +
          DATASOURCE.TABLES_SEGMENT +
          params.tableName +
          DATASOURCE.COLUMNS_SEGMENT,
        skipLoader ? { skipLoader: true } : undefined,
      ),
    );
  }

  async runQuery(params: any): Promise<any> {
    this._queryLoading.set(true);
    try {
      // POST /datasources/:datasourceId/query
      return await lastValueFrom(
        this.http.apiPost(
          DATASOURCE.RUN_QUERY_PREFIX +
            params.datasourceId +
            DATASOURCE.RUN_QUERY_SUFFIX,
          {
            datasourceId: params.datasourceId,
            query: params.query,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._queryLoading.set(false);
    }
  }

  // Legacy methods for external callers — all pass skipLoader so
  // they don't kick the global blocker. Callers (access manager
  // dropdowns, dashboard filter dropdown, etc.) drive their own
  // loading state.
  listDatasource(params: any) {
    return lastValueFrom(
      this.http.apiGet(DATASOURCE.LIST, { params, skipLoader: true }),
    );
  }

  viewDatasource(id: string) {
    return lastValueFrom(
      this.http.apiGet(DATASOURCE.GET + id, { skipLoader: true }),
    );
  }
}
