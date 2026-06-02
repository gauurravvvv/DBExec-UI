import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { TAB } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class TabService {
  private _tabs = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // tab ngOnDestroy) can cancel in-flight GETs.
  private _cancelReads$ = new Subject<void>();

  readonly tabs = this._tabs.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(TAB.LIST, { params })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._tabs.set(res.data?.tabs ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(tabId: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(TAB.GET + tabId)
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

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(TAB.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(TAB.UPDATE + payload.id, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(tabId: string, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(TAB.DELETE + tabId, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent(): void {
    this._current.set(null);
  }

  listTab(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.LIST, { params }));
  }

  listAllTabData(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.TREE, { params }));
  }

  deleteTab(id: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(TAB.DELETE + id, {
        body: { justification },
      }),
    );
  }

  bulkDeleteTab(ids: string[], justification?: string) {
    return lastValueFrom(
      this.http.apiPost(TAB.BULK_DELETE, { ids, justification }),
    );
  }

  addTab(tabForm: FormGroup) {
    const { datasource, tabs } = tabForm.value;
    return lastValueFrom(this.http.apiPost(TAB.ADD, { datasource, tabs }));
  }

  viewTab(id: string) {
    return lastValueFrom(this.http.apiGet(TAB.GET + id));
  }

  updateTab(tabForm: FormGroup, justification?: string) {
    const { id, name, description, datasource, status } = tabForm.getRawValue();
    return lastValueFrom(
      this.http.apiPut(TAB.UPDATE + id, {
        id,
        name,
        description,
        datasource,
        status: status ? 1 : 0,
        justification,
      }),
    );
  }
}
