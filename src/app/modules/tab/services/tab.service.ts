import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { TAB } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class TabService {
  private _tabs    = signal<any[]>([]);
  private _total   = signal(0);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving  = signal(false);

  readonly tabs    = this._tabs.asReadonly();
  readonly total   = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving  = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(TAB.LIST, { params }));
      if (res?.status) {
        this._tabs.set(res.data?.tabs ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } finally { this._loading.set(false); }
  }

  async loadOne(orgId: string, tabId: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(TAB.VIEW + `${orgId}/${tabId}`));
      if (res?.status) this._current.set(res.data);
    } finally { this._loading.set(false); }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPost(TAB.ADD, payload)); }
    finally { this._saving.set(false); }
  }

  async update(payload: any): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPut(TAB.UPDATE, payload)); }
    finally { this._saving.set(false); }
  }

  async delete(orgId: string, tabId: string, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiDelete(TAB.DELETE + `${orgId}/${tabId}`, { body: { justification } }));
    } finally { this._saving.set(false); }
  }

  resetCurrent(): void { this._current.set(null); }

  listTab(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.LIST, { params }));
  }

  listAllTabData(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.GET_ALL, { params }));
  }

  deleteTab(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(TAB.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteTab(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(TAB.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  addTab(tabForm: FormGroup) {
    const { organisation, datasource, tabs } = tabForm.value;
    return lastValueFrom(this.http.apiPost(TAB.ADD, { organisation, datasource, tabs }));
  }

  viewTab(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(TAB.VIEW + `${orgId}/${id}`));
  }

  updateTab(tabForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, status } = tabForm.getRawValue();
    return lastValueFrom(this.http.apiPut(TAB.UPDATE, {
      id, name, description, organisation, datasource,
      status: status ? 1 : 0,
      justification,
    }));
  }
}
