import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { DB_ACCESS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DbAccessService — UI over the customer datasource's PostgreSQL-native
 * security model (roles / users / grants / memberships). Mirrors
 * DatasourceService's signal + skipLoader conventions: `loading` for
 * reads, `saving` for writes; every call passes `{ skipLoader: true }`
 * so the module drives its own spinners.
 *
 * FULLY STATELESS: the target datasource's PostgreSQL catalog is the
 * ONLY source of truth — nothing is mirrored or persisted to our DB.
 * Every mutating endpoint accepts `previewOnly: true`, which returns
 * `{ masked: string[] }` (a SQL preview) instead of executing.
 * Destructive ops require `confirm: true`.
 */
@Injectable({ providedIn: 'root' })
export class DbAccessService {
  private _capability = signal<any>(null);
  private _roles = signal<any[]>([]);
  private _memberships = signal<any>(null);
  private _schemas = signal<any[]>([]);
  private _loading = signal(false);
  private _saving = signal(false);

  // In-flight reads pipe through this so components can cancel on
  // navigate-away (ngOnDestroy → cancelReads).
  private _cancelReads$ = new Subject<void>();

  readonly capability = this._capability.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly memberships = this._memberships.asReadonly();
  readonly schemas = this._schemas.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  private base(datasourceId: string): string {
    return DB_ACCESS.BASE + datasourceId;
  }

  // ── Capability ──────────────────────────────────────────────────────────

  /**
   * GET /:datasourceId/capability. Non-postgres datasources 400 here —
   * the caller catches and shows "PostgreSQL only in v1". Returns the raw
   * response so the landing banner can read `data.canManage`.
   */
  async loadCapability(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.CAPABILITY_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._capability.set(res.data);
      return res;
    } finally {
      this._loading.set(false);
    }
  }

  // ── Roles / Users (all roles; split FE-side on canLogin) ─────────────────

  async loadRoles(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.ROLES_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._roles.set(res.data ?? []);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      this._roles.set([]);
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Server-paged roles for the list grid: sends page/limit (+ optional
   * sort + JSON filter) so the BE (listRolesPaged) does LIMIT/OFFSET + WHERE
   * + COUNT. Returns `{ roles, count }`. Does NOT touch the shared `_roles`
   * signal (grantee pickers still use the full cached list via loadRoles).
   */
  loadRolesPaged(
    datasourceId: string,
    opts: {
      page: number;
      limit: number;
      sort?: string;
      /** JSON-stringified filter payload ({ name?, type?, status? }). */
      filter?: string;
    },
  ): Promise<any> {
    const params: Record<string, string> = {
      page: String(opts.page),
      limit: String(opts.limit),
    };
    if (opts.sort) params['sort'] = opts.sort;
    if (opts.filter) params['filter'] = opts.filter;
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.ROLES_SUFFIX, {
          skipLoader: true,
          params,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  createRole(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.ROLES_SUFFIX,
        body,
        {
          skipLoader: true,
        },
      ),
    ).finally(() => this._saving.set(false));
  }

  updateRole(datasourceId: string, roleName: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPut(
        this.base(datasourceId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName),
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  renameRole(
    datasourceId: string,
    roleName: string,
    newName: string,
  ): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.RENAME_SUFFIX,
        { newName },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /**
   * POST /:datasourceId/roles/:roleName/delete — dependency wizard.
   * body: { reassignTo?, dropOwned?, confirm: true, previewOnly? }.
   */
  deleteRole(datasourceId: string, roleName: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.DELETE_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /** GET /:datasourceId/roles/:roleName/owned — objects a role owns. */
  loadOwned(datasourceId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(datasourceId) +
            DB_ACCESS.ROLE_SEGMENT +
            encodeURIComponent(roleName) +
            DB_ACCESS.OWNED_SUFFIX,
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * GET /:datasourceId/roles/:roleName/export — full access profile
   * (attributes, granted roles, effective privileges + provenance,
   * owned objects) for one role/user. Caller triggers a JSON/CSV
   * browser download.
   */
  exportRoleAccess(datasourceId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        this.base(datasourceId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.ACCESS_EXPORT_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  // ── Memberships ──────────────────────────────────────────────────────────

  async loadMemberships(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.MEMBERSHIPS_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._memberships.set(res.data ?? null);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * POST /:datasourceId/memberships — grant role. body supports arrays for
   * bulk: { role, toRole, adminOption, previewOnly? }.
   */
  attachRole(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.MEMBERSHIPS_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /** POST /:datasourceId/memberships/remove — revoke ( confirm: true ). */
  detachRole(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.MEMBERSHIPS_REMOVE_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Schemas / Grant matrix data ──────────────────────────────────────────

  async loadSchemas(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.SCHEMAS_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._schemas.set(res.data ?? []);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      this._schemas.set([]);
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  /** GET /:datasourceId/grants/tables?schema= */
  loadTableGrants(datasourceId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.GRANTS_TABLES_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:datasourceId/objects/sequences?schema= → { data: [{ name }] } */
  loadSequences(datasourceId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.OBJECTS_SEQUENCES_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:datasourceId/objects/functions?schema= → { data: [{ name }] } */
  loadFunctions(datasourceId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.OBJECTS_FUNCTIONS_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:datasourceId/grants/columns?schema=&table= */
  loadColumnGrants(
    datasourceId: string,
    schema: string,
    table: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.GRANTS_COLUMNS_SUFFIX, {
          params: { schema, table },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:datasourceId/default-privileges */
  loadDefaultPrivileges(datasourceId: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.DEFAULT_PRIVILEGES_SUFFIX, {
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * POST /:datasourceId/change-set — batches pending grant / revoke /
   * revokePublic / defaultPriv edits. body:
   * { statements: [{ kind, ...intent }], previewOnly?, confirm? }.
   * The grant matrix calls this with previewOnly first (→ masked SQL),
   * then again with confirm to execute.
   */
  applyChangeSet(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.CHANGE_SET_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Effective privileges ──────────────────────────────────────────────────

  /** GET /:datasourceId/effective/:roleName — with `via` provenance. */
  loadEffective(datasourceId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(datasourceId) +
            DB_ACCESS.EFFECTIVE_SEGMENT +
            encodeURIComponent(roleName),
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * GET /:datasourceId/grants/export — returns the full grant snapshot as
   * JSON. Caller triggers a browser download.
   */
  exportGrants(datasourceId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        this.base(datasourceId) + DB_ACCESS.GRANTS_EXPORT_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  // ── Active sessions (live pg_stat_activity viewer) ────────────────────────

  /**
   * GET /:datasourceId/sessions — live pg_stat_activity snapshot.
   * Returns the raw response; data is `{ sessions: [...], selfPid }`.
   * Sessions are volatile (NOT cached BE-side) — call on every refresh.
   */
  loadSessions(datasourceId: string): Promise<any> {
    this._loading.set(true);
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.SESSIONS_SUFFIX, {
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    ).finally(() => this._loading.set(false));
  }

  /**
   * Server-paged sessions for the list grid: page/limit (+ sort + JSON
   * filter { search?, state?, backendType? }) → BE listSessions paged mode
   * (filter/sort/slice server-side). Returns `{ sessions, count, selfPid }`.
   */
  loadSessionsPaged(
    datasourceId: string,
    opts: { page: number; limit: number; sort?: string; filter?: string },
  ): Promise<any> {
    this._loading.set(true);
    const params: Record<string, string> = {
      page: String(opts.page),
      limit: String(opts.limit),
    };
    if (opts.sort) params['sort'] = opts.sort;
    if (opts.filter) params['filter'] = opts.filter;
    return lastValueFrom(
      this.http
        .apiGet(this.base(datasourceId) + DB_ACCESS.SESSIONS_SUFFIX, {
          skipLoader: true,
          params,
        })
        .pipe(takeUntil(this._cancelReads$)),
    ).finally(() => this._loading.set(false));
  }

  /**
   * POST /:datasourceId/sessions/:pid/cancel — pg_cancel_backend (gentle;
   * cancels the running query, connection survives). Requires confirm.
   */
  cancelSession(datasourceId: string, pid: number): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) +
          DB_ACCESS.SESSIONS_SEGMENT +
          pid +
          DB_ACCESS.CANCEL_SUFFIX,
        { confirm: true },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /**
   * POST /:datasourceId/sessions/:pid/terminate — pg_terminate_backend
   * (destructive; drops the whole connection). Requires confirm + FULL.
   */
  terminateSession(datasourceId: string, pid: number): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) +
          DB_ACCESS.SESSIONS_SEGMENT +
          pid +
          DB_ACCESS.TERMINATE_SUFFIX,
        { confirm: true },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  cancelReads(): void {
    this._cancelReads$.next();
  }

  reset(): void {
    this._capability.set(null);
    this._roles.set([]);
    this._memberships.set(null);
    this._schemas.set([]);
  }
}
