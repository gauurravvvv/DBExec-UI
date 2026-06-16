import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import {
  ACCESS_LEVELS,
  PERMISSIONS,
  ROLE,
} from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  AccessLevelEntry,
  AddRolePayload,
  PermissionModule,
  SelectedPermissionEntry,
  UpdateRolePayload,
} from '../role.types';

/**
 * RoleService — list/view/CUD for roles + permission metadata.
 *
 * Loading state follows the rollout convention: `loading` for reads,
 * `saving` for writes, `_deleting` as a per-id record so each row's
 * delete button can spin independently (bulk delete stamps every
 * selected id). Every call passes `{ skipLoader: true }` so the
 * global blocker stays out of this module — templates render skeleton
 * placeholders while the signals are true.
 *
 * Legacy alias methods (listRoles/addRole/editRole/…) are kept
 * unchanged because the groups module + a couple other consumers
 * still call them and still want the legacy blocker until they get
 * their own pass.
 */
@Injectable({ providedIn: 'root' })
export class RoleService {
  private _roles = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _permissions = signal<any[]>([]);
  private _loading = signal(false);
  private _saving = signal(false);
  private _loadingPermissions = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view-role / edit-role
  // ngOnDestroy) can cancel in-flight GETs when the user navigates
  // away — otherwise the XHR keeps running, the answer comes back
  // after a different component is mounted, and signals get clobbered
  // with stale data. Mutations (add/edit/delete) intentionally don't
  // pipe through this — half-completed writes are worse than no write.
  private _cancelReads$ = new Subject<void>();

  readonly roles = this._roles.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly permissions = this._permissions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly loadingPermissions = this._loadingPermissions.asReadonly();
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
          .apiGet(ROLE.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._roles.set(res.data.roles ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      // EmptyError is thrown when the observable completes without
      // emitting (i.e. we cancelled it). Re-throw real errors.
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(roleId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ROLE.GET + roleId, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadPermissions() {
    this._loadingPermissions.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ROLE.LIST_PERMISSIONS, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._permissions.set(res.data?.permissions ?? []);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loadingPermissions.set(false);
    }
  }

  /**
   * Cancel any in-flight read GETs (list / loadOne / permissions).
   * Components call this from ngOnDestroy so the XHR is aborted when
   * the user navigates away — otherwise the response lands in a
   * destroyed component and clobbers the next page's signals.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  // ── New relational RBAC reads ─────────────────────────────────────
  // The new permission-grid UX needs two metadata feeds:
  //   - listPermissions(): the module/submodule tree. When the caller
  //     passes a roleId, every leaf carries the role's effective level
  //     so the grid can pre-select radios on Edit Role.
  //   - listAccessLevels(): the four canonical rows (None/Read/Write/
  //     Full). The grid renders one radio column per row using the
  //     entry's `value` (0..3) as the radio value.

  /**
   * GET /api/v1/permissions[?scope=&roleId=]
   * Returns the modules[] tree. Callers should ignore `orphans` for
   * now — the role grid only renders modules with leaves.
   */
  async listPermissions(opts?: {
    scope?: 'ORG' | 'SYSTEM' | 'ALL';
    roleId?: string;
  }): Promise<PermissionModule[]> {
    const params: any = {};
    if (opts?.scope) params.scope = opts.scope;
    if (opts?.roleId) params.roleId = opts.roleId;
    const res: any = await lastValueFrom(
      this.http
        .apiGet(PERMISSIONS.LIST, { params, skipLoader: true })
        .pipe(takeUntil(this._cancelReads$)),
    );
    if (res?.status) return (res.data?.modules ?? []) as PermissionModule[];
    return [];
  }

  /**
   * GET /api/v1/access-levels
   * Returns the canonical four rows. Sorted by `sequence` server-side
   * but we don't rely on it — the grid sorts again before rendering.
   */
  async listAccessLevels(): Promise<AccessLevelEntry[]> {
    const res: any = await lastValueFrom(
      this.http
        .apiGet(ACCESS_LEVELS.LIST, { skipLoader: true })
        .pipe(takeUntil(this._cancelReads$)),
    );
    if (res?.status) return (res.data?.levels ?? []) as AccessLevelEntry[];
    return [];
  }

  /**
   * Strip `selectedPermissions` entries with level < 1 (the BE strips
   * too but keeping the wire small helps when a role has hundreds of
   * leaves and only a handful granted).
   */
  private pruneSelected(
    entries: SelectedPermissionEntry[],
  ): SelectedPermissionEntry[] {
    return (entries || []).filter(e => e && e.level >= 1);
  }

  async add(data: AddRolePayload | any): Promise<any> {
    this._saving.set(true);
    try {
      const payload = {
        ...data,
        selectedPermissions: this.pruneSelected(
          data?.selectedPermissions ?? [],
        ),
      };
      return await lastValueFrom(
        this.http.apiPost(ROLE.ADD, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async edit(
    data: UpdateRolePayload | any,
    justification?: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      const payload = {
        ...data,
        selectedPermissions: this.pruneSelected(
          data?.selectedPermissions ?? [],
        ),
        justification,
      };
      return await lastValueFrom(
        this.http.apiPut(ROLE.UPDATE + data.id, payload, { skipLoader: true }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ROLE.DELETE + id, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(id, false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    ids.forEach(id => this.setDeleting(id, true));
    try {
      return await lastValueFrom(
        this.http.apiPost(
          ROLE.BULK_DELETE,
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

  /**
   * Convenience for view/edit screens that need the role record itself
   * (not via the cached signal). Mirrors loadOne but returns the data
   * directly so callers can await it in a Promise.all with the
   * permission feeds.
   */
  async get(roleId: string): Promise<any> {
    const res: any = await lastValueFrom(
      this.http
        .apiGet(ROLE.GET + roleId, { skipLoader: true })
        .pipe(takeUntil(this._cancelReads$)),
    );
    if (res?.status) return res.data;
    return null;
  }

  // ── Legacy aliases kept for external callers (groups module) ──────────────
  // All pass skipLoader so they don't kick the global blocker — the
  // callers (group filter dropdown, group add/edit role picker, etc.)
  // already drive their own loading state.
  listRoles(params?: { page?: number; limit?: number; filter?: any }) {
    const queryParams: any = {};
    if (params?.page) queryParams.page = params.page;
    if (params?.limit) queryParams.limit = params.limit;
    if (params?.filter && Object.keys(params.filter).length > 0) {
      queryParams.filter = JSON.stringify(params.filter);
    }
    return lastValueFrom(
      this.http.apiGet(ROLE.LIST, { params: queryParams, skipLoader: true }),
    );
  }

  viewRole(roleId: string) {
    return lastValueFrom(
      this.http.apiGet(ROLE.GET + roleId, { skipLoader: true }),
    );
  }

  addRole(data: {
    name: string;
    description?: string;
    selectedPermissions: any[];
  }) {
    return lastValueFrom(
      this.http.apiPost(ROLE.ADD, data, { skipLoader: true }),
    );
  }

  editRole(
    data: {
      id: string;
      name: string;
      description?: string;
      selectedPermissions: any[];
      status: number;
    },
    justification?: string,
  ) {
    return lastValueFrom(
      this.http.apiPut(
        ROLE.UPDATE + data.id,
        { ...data, justification },
        { skipLoader: true },
      ),
    );
  }

  deleteRole(id: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ROLE.DELETE + id, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }

  bulkDeleteRole(ids: string[], justification?: string) {
    return lastValueFrom(
      this.http.apiPost(
        ROLE.BULK_DELETE,
        { ids, justification },
        { skipLoader: true },
      ),
    );
  }
}
