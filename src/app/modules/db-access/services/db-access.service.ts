import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { DB_ACCESS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DbAccessService — UI over the customer datasource's PostgreSQL-native
 * security model (roles / users / grants / memberships / templates /
 * mappings / audit). Mirrors DatasourceService's signal + skipLoader
 * conventions: `loading` for reads, `saving` for writes; every call
 * passes `{ skipLoader: true }` so the module drives its own spinners.
 *
 * Source of truth is the DB — nothing here is mirrored. Every mutating
 * endpoint accepts `previewOnly: true`, which returns `{ masked: string[] }`
 * (a SQL preview) instead of executing. Destructive ops require
 * `confirm: true`.
 */
@Injectable({ providedIn: 'root' })
export class DbAccessService {
  private _capability = signal<any>(null);
  private _roles = signal<any[]>([]);
  private _memberships = signal<any>(null);
  private _schemas = signal<any[]>([]);
  private _mappings = signal<any[]>([]);
  private _templates = signal<any[]>([]);
  private _audit = signal<any[]>([]);
  private _loading = signal(false);
  private _saving = signal(false);

  // In-flight reads pipe through this so components can cancel on
  // navigate-away (ngOnDestroy → cancelReads).
  private _cancelReads$ = new Subject<void>();

  readonly capability = this._capability.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly memberships = this._memberships.asReadonly();
  readonly schemas = this._schemas.asReadonly();
  readonly mappings = this._mappings.asReadonly();
  readonly templates = this._templates.asReadonly();
  readonly audit = this._audit.asReadonly();
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

  createRole(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(this.base(datasourceId) + DB_ACCESS.ROLES_SUFFIX, body, {
        skipLoader: true,
      }),
    ).finally(() => this._saving.set(false));
  }

  updateRole(datasourceId: string, roleName: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPut(
        this.base(datasourceId) + DB_ACCESS.ROLE_SEGMENT + encodeURIComponent(roleName),
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  renameRole(datasourceId: string, roleName: string, newName: string): Promise<any> {
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
  loadColumnGrants(datasourceId: string, schema: string, table: string): Promise<any> {
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

  // ── Mappings (app user/group ↔ DB role) ──────────────────────────────────

  async loadMappings(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.MAPPINGS_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._mappings.set(res.data ?? []);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      this._mappings.set([]);
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

  attachMapping(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.MAPPINGS_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  detachMapping(datasourceId: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        this.base(datasourceId) + DB_ACCESS.MAPPINGS_REMOVE_SUFFIX,
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Templates (org-wide, not datasource-scoped) ──────────────────────────

  async loadTemplates(): Promise<any> {
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(DB_ACCESS.TEMPLATES, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._templates.set(res.data ?? []);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      this._templates.set([]);
      throw err;
    }
  }

  saveTemplate(body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(DB_ACCESS.TEMPLATES, body, { skipLoader: true }),
    ).finally(() => this._saving.set(false));
  }

  deleteTemplate(id: string): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        DB_ACCESS.TEMPLATE_DELETE_PREFIX + id + DB_ACCESS.TEMPLATE_DELETE_SUFFIX,
        { confirm: true },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  // ── Audit + export ────────────────────────────────────────────────────────

  async loadAudit(datasourceId: string): Promise<any> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(this.base(datasourceId) + DB_ACCESS.AUDIT_SUFFIX, {
            skipLoader: true,
          })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._audit.set(res.data ?? []);
      return res;
    } catch (err) {
      if (err instanceof EmptyError) return null;
      this._audit.set([]);
      throw err;
    } finally {
      this._loading.set(false);
    }
  }

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

  cancelReads(): void {
    this._cancelReads$.next();
  }

  reset(): void {
    this._capability.set(null);
    this._roles.set([]);
    this._memberships.set(null);
    this._schemas.set([]);
    this._mappings.set([]);
    this._audit.set([]);
  }
}
