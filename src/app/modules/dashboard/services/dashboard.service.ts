import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DASHBOARD } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private _dashboards = signal<any[]>([]);
  private _total = signal(0);
  private _current = signal<any>(null);
  private _rendered = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  readonly dashboards = this._dashboards.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly rendered = this._rendered.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(params: any): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DASHBOARD.LIST, { params }),
      );
      if (res?.status) {
        this._dashboards.set(res.data.dashboards ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch {
      this._dashboards.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DASHBOARD.GET + `${orgId}/${id}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async render(orgId: string, id: string): Promise<void> {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(DASHBOARD.RENDER + `${orgId}/${id}`),
      );
      if (res?.status) this._rendered.set(res.data);
    } catch {
      this._rendered.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(DASHBOARD.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async delete(orgId: string, id: string, justification: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DASHBOARD.DELETE + `${orgId}/${id}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDelete(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(DASHBOARD.BULK_DELETE + orgId, {
          body: { ids, justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent(): void {
    this._current.set(null);
    this._rendered.set(null);
  }

  // ── Legacy aliases (kept for backward compatibility) ──

  addDashboard(payload: any): Promise<any> {
    return this.add(payload);
  }

  getDashboard(orgId: string, id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(DASHBOARD.GET + `${orgId}/${id}`));
  }

  listDashboards(params: any): Promise<any> {
    return lastValueFrom(this.http.apiGet(DASHBOARD.LIST, { params }));
  }

  renderDashboard(orgId: string, id: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(DASHBOARD.RENDER + `${orgId}/${id}`));
  }

  async deleteDashboard(
    orgId: string,
    id: string,
    justification: string,
  ): Promise<any> {
    return this.delete(orgId, id, justification);
  }

  async bulkDeleteDashboard(
    ids: string[],
    justification: string | undefined,
    orgId: string,
  ): Promise<any> {
    return this.bulkDelete(ids, justification, orgId);
  }
}
