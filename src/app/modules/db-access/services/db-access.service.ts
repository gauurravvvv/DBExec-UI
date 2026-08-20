import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { DB_ACCESS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DbAccessService — UI over the customer datasource's PostgreSQL-native
 * security model (roles / users / grants / memberships). Mirrors
 * ConnectorService's signal + skipLoader conventions: `loading` for
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

  private base(connectorId: string): string {
    return DB_ACCESS.BASE + connectorId;
  }

  // ── Capability ──────────────────────────────────────────────────────────

  /**
   * GET /:connectorId/capability. Non-postgres datasources 400 here —
   * the caller catches and shows "PostgreSQL only in v1". Returns the raw
   * response so the landing banner can read `data.canManage`.
   */
  async loadCapability(connectorId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(connectorId) + DB_ACCESS.CAPABILITY_SUFFIX, {
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

  async loadRoles(connectorId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(connectorId) + DB_ACCESS.ROLES_SUFFIX, {
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
    connectorId: string,
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
        .apiGet(this.base(connectorId) + DB_ACCESS.ROLES_SUFFIX, {
          skipLoader: true,
          params,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  createRole(connectorId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) + DB_ACCESS.ROLES_SUFFIX,
        body,
        {
          skipLoader: true,
        },
      ),
    ).finally(() => this._saving.set(false));
  }

  updateRole(connectorId: string, roleName: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPut(
        this.base(connectorId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName),
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  renameRole(
    connectorId: string,
    roleName: string,
    newName: string,
  ): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.RENAME_SUFFIX,
        { newName },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /**
   * POST /:connectorId/roles/:roleName/delete — dependency wizard.
   * body: { reassignTo?, dropOwned?, confirm: true, previewOnly? }.
   */
  deleteRole(connectorId: string, roleName: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.DELETE_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /** GET /:connectorId/roles/:roleName/owned — objects a role owns. */
  loadOwned(connectorId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(connectorId) +
            DB_ACCESS.ROLE_SEGMENT +
            encodeURIComponent(roleName) +
            DB_ACCESS.OWNED_SUFFIX,
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * GET /:connectorId/roles/:roleName/export — full access profile
   * (attributes, granted roles, effective privileges + provenance,
   * owned objects) for one role/user. Caller triggers a JSON/CSV
   * browser download.
   */
  exportRoleAccess(connectorId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        this.base(connectorId) +
          DB_ACCESS.ROLE_SEGMENT +
          encodeURIComponent(roleName) +
          DB_ACCESS.ACCESS_EXPORT_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  // ── Memberships ──────────────────────────────────────────────────────────

  async loadMemberships(connectorId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(connectorId) + DB_ACCESS.MEMBERSHIPS_SUFFIX, {
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
   * POST /:connectorId/memberships — grant role. body supports arrays for
   * bulk: { role, toRole, adminOption, previewOnly? }.
   */
  attachRole(connectorId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) + DB_ACCESS.MEMBERSHIPS_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /** POST /:connectorId/memberships/remove — revoke ( confirm: true ). */
  detachRole(connectorId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) + DB_ACCESS.MEMBERSHIPS_REMOVE_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Schemas / Grant matrix data ──────────────────────────────────────────

  async loadSchemas(connectorId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(connectorId) + DB_ACCESS.SCHEMAS_SUFFIX, {
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

  /** GET /:connectorId/grants/tables?schema= */
  loadTableGrants(connectorId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.GRANTS_TABLES_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:connectorId/objects/sequences?schema= → { data: [{ name }] } */
  loadSequences(connectorId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.OBJECTS_SEQUENCES_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:connectorId/objects/functions?schema= → { data: [{ name }] } */
  loadFunctions(connectorId: string, schema: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.OBJECTS_FUNCTIONS_SUFFIX, {
          params: { schema },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:connectorId/grants/columns?schema=&table= */
  loadColumnGrants(
    connectorId: string,
    schema: string,
    table: string,
  ): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.GRANTS_COLUMNS_SUFFIX, {
          params: { schema, table },
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /** GET /:connectorId/default-privileges */
  loadDefaultPrivileges(connectorId: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.DEFAULT_PRIVILEGES_SUFFIX, {
          skipLoader: true,
        })
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * POST /:connectorId/change-set — batches pending grant / revoke /
   * revokePublic / defaultPriv edits. body:
   * { statements: [{ kind, ...intent }], previewOnly?, confirm? }.
   * The grant matrix calls this with previewOnly first (→ masked SQL),
   * then again with confirm to execute.
   */
  applyChangeSet(connectorId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) + DB_ACCESS.CHANGE_SET_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Effective privileges ──────────────────────────────────────────────────

  /** GET /:connectorId/effective/:roleName — with `via` provenance. */
  loadEffective(connectorId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(connectorId) +
            DB_ACCESS.EFFECTIVE_SEGMENT +
            encodeURIComponent(roleName),
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * GET /:connectorId/effective/:roleName/tree — lazy privilege tree.
   * level 'schema' → schema roots; level 'table' (+schema) → tables;
   * level 'table' (+schema+table) → one table's privilege chips.
   * Server-paged + searchable. Returns `{ nodes, count }`.
   */
  loadEffectiveTree(
    connectorId: string,
    roleName: string,
    opts: {
      level: 'schema' | 'table';
      schema?: string;
      table?: string;
      page?: number;
      limit?: number;
      search?: string;
      provenance?: 'all' | 'direct' | 'inherited';
      includeSystem?: boolean;
    },
  ): Promise<any> {
    const params: Record<string, string> = { level: opts.level };
    if (opts.schema) params['schema'] = opts.schema;
    if (opts.table) params['table'] = opts.table;
    if (opts.page) params['page'] = String(opts.page);
    if (opts.limit) params['limit'] = String(opts.limit);
    if (opts.search) params['search'] = opts.search;
    if (opts.provenance && opts.provenance !== 'all')
      params['provenance'] = opts.provenance;
    if (opts.includeSystem) params['includeSystem'] = 'true';
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(connectorId) +
            DB_ACCESS.EFFECTIVE_SEGMENT +
            encodeURIComponent(roleName) +
            DB_ACCESS.EFFECTIVE_TREE_SUFFIX,
          { skipLoader: true, params },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * GET /:connectorId/effective/:roleName/summary — counts for the tree
   * header + the Direct/Inherited/All split + the "Show system schemas (N)"
   * toggle. One cheap call; the tree itself pages in on demand.
   */
  loadEffectiveSummary(connectorId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(connectorId) +
            DB_ACCESS.EFFECTIVE_SEGMENT +
            encodeURIComponent(roleName) +
            DB_ACCESS.EFFECTIVE_SUMMARY_SUFFIX,
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  /**
   * GET /:connectorId/roles/:roleName/grants — a role's DIRECT object
   * grants. Pre-loads the privilege composer (diff-apply) + clone source.
   */
  loadRoleGrants(connectorId: string, roleName: string): Promise<any> {
    return lastValueFrom(
      this.http
        .apiGet(
          this.base(connectorId) +
            DB_ACCESS.ROLE_SEGMENT +
            encodeURIComponent(roleName) +
            DB_ACCESS.ROLE_GRANTS_SUFFIX,
          { skipLoader: true },
        )
        .pipe(takeUntil(this._cancelReads$)),
    );
  }

  // ── PUBLIC grants (hardening panel) ───────────────────────────────────────

  // ── Export ────────────────────────────────────────────────────────────────

  /**
   * GET /:connectorId/grants/export — returns the full grant snapshot as
   * JSON. Caller triggers a browser download.
   */
  exportGrants(connectorId: string): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(
        this.base(connectorId) + DB_ACCESS.GRANTS_EXPORT_SUFFIX,
        { skipLoader: true },
      ),
    );
  }

  // ── Active sessions (live pg_stat_activity viewer) ────────────────────────

  /**
   * GET /:connectorId/sessions — live pg_stat_activity snapshot.
   * Returns the raw response; data is `{ sessions: [...], selfPid }`.
   * Sessions are volatile (NOT cached BE-side) — call on every refresh.
   */
  loadSessions(connectorId: string): Promise<any> {
    this._loading.set(true);
    return lastValueFrom(
      this.http
        .apiGet(this.base(connectorId) + DB_ACCESS.SESSIONS_SUFFIX, {
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
    connectorId: string,
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
        .apiGet(this.base(connectorId) + DB_ACCESS.SESSIONS_SUFFIX, {
          skipLoader: true,
          params,
        })
        .pipe(takeUntil(this._cancelReads$)),
    ).finally(() => this._loading.set(false));
  }

  /**
   * POST /:connectorId/sessions/:pid/cancel — pg_cancel_backend (gentle;
   * cancels the running query, connection survives). Requires confirm.
   */
  cancelSession(connectorId: string, pid: number): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) +
          DB_ACCESS.SESSIONS_SEGMENT +
          pid +
          DB_ACCESS.CANCEL_SUFFIX,
        { confirm: true },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /**
   * POST /:connectorId/sessions/:pid/terminate — pg_terminate_backend
   * (destructive; drops the whole connection). Requires confirm + FULL.
   */
  terminateSession(connectorId: string, pid: number): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(connectorId) +
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
