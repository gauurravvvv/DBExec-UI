import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { CONNECTIONS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * ConnectionService — list/view/CUD for per-user DB connections that
 * live under a datasource.
 *
 * Loading-state follows the rollout convention: `loading` for reads,
 * `saving` for writes, `_deleting` as a per-id record so each row's
 * delete button can spin independently. Every signal-based call
 * passes `{ skipLoader: true }` so the legacy global blocker stays
 * out of this module — templates render skeleton placeholders +
 * button-level spinners while the signals are true.
 *
 * Legacy `listConnection` / `viewConnection` methods stay on the
 * blocker for external callers (access manager, etc.) until each
 * consumer gets its own pass.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private _connections = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _deleting = signal<Record<string, boolean>>({});

  // Reads pipe through this Subject so callers (view/edit/list/add
  // connection ngOnDestroy) can cancel in-flight GETs.
  private _cancelReads$ = new Subject<void>();

  readonly connections = this._connections.asReadonly();
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
          .apiGet(CONNECTIONS.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._connections.set(res.data.connections ?? []);
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
          .apiGet(CONNECTIONS.GET + id, { skipLoader: true })
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
      const { datasource, name, description, dbUsername, dbPassword } =
        form.value;
      return await lastValueFrom(
        this.http.apiPost(
          CONNECTIONS.ADD,
          {
            datasource,
            name,
            description,
            dbUsername,
            dbPassword,
          },
          { skipLoader: true },
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async update(form: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      const {
        id,
        name,
        description,
        datasource,
        status,
        dbUsername,
        dbPassword,
      } = form.getRawValue();
      return await lastValueFrom(
        this.http.apiPut(
          CONNECTIONS.UPDATE + id,
          {
            id,
            name,
            description,
            datasource,
            status: status ? 1 : 0,
            dbUsername,
            dbPassword,
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
        this.http.apiDelete(CONNECTIONS.DELETE + id, {
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
          CONNECTIONS.BULK_DELETE,
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

  // Legacy methods for external callers — both pass skipLoader so
  // they don't kick the global blocker. Callers (access manager
  // connection dropdown, etc.) drive their own loading state.
  listConnection(params: any) {
    return lastValueFrom(
      this.http.apiGet(CONNECTIONS.LIST, { params, skipLoader: true }),
    );
  }

  viewConnection(id: string) {
    return lastValueFrom(
      this.http.apiGet(CONNECTIONS.GET + id, { skipLoader: true }),
    );
  }
}
