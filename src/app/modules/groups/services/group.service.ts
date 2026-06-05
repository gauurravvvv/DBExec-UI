import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { GROUP } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * GroupService — list/view/CUD for org groups.
 *
 * Loading-state follows the rollout convention (see OrganisationService
 * docblock for the full story): `loading` for reads, `saving` for
 * writes, `_deleting` as a per-id record so each row's delete button
 * can spin independently. Every call passes `{ skipLoader: true }` so
 * the legacy global blocker stays out of this module — the templates
 * render skeleton placeholders while the signals are true.
 */
@Injectable({ providedIn: 'root' })
export class GroupService {
  private _groups = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/edit/list/add
  // group ngOnDestroy) can cancel in-flight GETs. Mutations don't.
  private _cancelReads$ = new Subject<void>();

  readonly groups = this._groups.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
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
          .apiGet(GROUP.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._groups.set(res.data.groups ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(groupId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(GROUP.GET + groupId, { skipLoader: true })
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
   * Cancel any in-flight read GETs. Components call this from
   * ngOnDestroy so the XHR is aborted when the user navigates away.
   */
  cancelReads() {
    this._cancelReads$.next();
  }

  async add(form: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const { name, description, roleId, users } = form.value;
      return await lastValueFrom(
        this.http.apiPost(
          GROUP.ADD,
          { name, description, roleId, users },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  /**
   * Update an existing group.
   *
   * `usersOverride` lets the caller bypass the form's `users`
   * control and send a precomputed full member list. The edit-group
   * component uses this to reassemble locked members (bootstrap
   * admin, logged-in user) with the manageable picker selections —
   * the BE requires the COMPLETE membership set per save, and the
   * picker only exposes the manageable subset.
   */
  async edit(
    form: FormGroup,
    justification?: string,
    usersOverride?: string[],
  ): Promise<any> {
    this._saving.set(true);
    try {
      const { id, name, description, status, users, roleId } =
        form.getRawValue();
      const finalUsers = usersOverride ?? users;
      return await lastValueFrom(
        this.http.apiPut(
          GROUP.UPDATE + id,
          {
            id,
            name,
            description,
            status: status ? 1 : 0,
            users: finalUsers,
            roleId,
            justification,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string, justification?: string): Promise<any> {
    this.setDeleting(id, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(GROUP.DELETE + id, {
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
          GROUP.BULK_DELETE,
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

  // Legacy methods kept for external module compatibility. Both pass
  // skipLoader so they don't kick the global blocker — the callers
  // (list-user filter dropdown, access manager dropdowns, etc.)
  // already drive their own loading state.
  listGroups(params: any) {
    return lastValueFrom(
      this.http.apiGet(GROUP.LIST, { params, skipLoader: true }),
    );
  }

  viewGroup(groupId: string) {
    return lastValueFrom(
      this.http.apiGet(GROUP.GET + groupId, { skipLoader: true }),
    );
  }
}
