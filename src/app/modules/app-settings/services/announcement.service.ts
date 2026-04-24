import { HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ANNOUNCEMENT } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface AnnouncementPayload {
  name: string;
  description: string;
  targetGroupId: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  bgColor?: string;
  textColor?: string;
  status?: number;
  orgId?: string;
}

export interface UpdateAnnouncementPayload extends Partial<AnnouncementPayload> {
  republish?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private _announcements = signal<any[]>([]);
  private _total         = signal(0);
  private _active        = signal<any[]>([]);
  private _current       = signal<any>(null);
  private _loading       = signal(false);
  private _saving        = signal(false);

  readonly announcements = this._announcements.asReadonly();
  readonly total         = this._total.asReadonly();
  readonly active        = this._active.asReadonly();
  readonly current       = this._current.asReadonly();
  readonly loading       = this._loading.asReadonly();
  readonly saving        = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadActive() {
    try {
      const res: any = await lastValueFrom(this.http.apiGet(ANNOUNCEMENT.GET));
      if (res?.status && Array.isArray(res.data)) this._active.set(res.data);
    } catch { this._active.set([]); }
  }

  async load(params: any = {}) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(this.http.apiGet(ANNOUNCEMENT.LIST, { params }));
      if (res?.status) {
        this._announcements.set(res.data?.announcements ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } catch {
      this._announcements.set([]);
      this._total.set(0);
    }
    finally { this._loading.set(false); }
  }

  async loadOne(id: string, orgId?: string) {
    this._loading.set(true);
    try {
      let params = new HttpParams();
      if (orgId) params = params.set('orgId', orgId);
      const res: any = await lastValueFrom(this.http.apiGet(ANNOUNCEMENT.DETAILS + id, { params }));
      if (res?.status) this._current.set(res.data);
    } catch { this._current.set(null); }
    finally { this._loading.set(false); }
  }

  async add(payload: AnnouncementPayload): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPost(ANNOUNCEMENT.ADD, payload)); }
    finally { this._saving.set(false); }
  }

  async update(id: string, payload: UpdateAnnouncementPayload): Promise<any> {
    this._saving.set(true);
    try { return await lastValueFrom(this.http.apiPut(ANNOUNCEMENT.UPDATE + id, payload)); }
    finally { this._saving.set(false); }
  }

  async delete(id: string, orgId?: string): Promise<any> {
    this._saving.set(true);
    try {
      let params = new HttpParams();
      if (orgId) params = params.set('orgId', orgId);
      return await lastValueFrom(this.http.apiDelete(ANNOUNCEMENT.DELETE + id, { params }));
    } finally { this._saving.set(false); }
  }

  /** @deprecated Use loadActive() + active signal. Kept for header compatibility until Task 21. */
  getActive(): Promise<any> {
    return lastValueFrom(this.http.apiGet(ANNOUNCEMENT.GET));
  }

  async dismiss(announcementId: string): Promise<any> {
    return lastValueFrom(this.http.apiPost(ANNOUNCEMENT.DISMISS + announcementId, {}));
  }

  removeActive(id: string) {
    this._active.update(list => list.filter(a => a.id !== id));
  }

  resetCurrent() { this._current.set(null); }
}
