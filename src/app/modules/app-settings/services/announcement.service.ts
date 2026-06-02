import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { ANNOUNCEMENT } from 'src/app/core/constants/api.constant';
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
}

export interface UpdateAnnouncementPayload extends Partial<AnnouncementPayload> {
  republish?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private _announcements = signal<any[]>([]);
  private _total = signal(0);
  private _active = signal<any[]>([]);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // announcement ngOnDestroy) can cancel in-flight GETs. Mutations
  // and dismiss don't pipe through. loadActive is fired by the header
  // (long-lived), so it doesn't pipe through either — only navigation-
  // tied reads (load, loadOne) cancel.
  private _cancelReads$ = new Subject<void>();

  readonly announcements = this._announcements.asReadonly();
  readonly total = this._total.asReadonly();
  readonly active = this._active.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  async loadActive() {
    try {
      const res: any = await lastValueFrom(this.http.apiGet(ANNOUNCEMENT.GET));
      if (res?.status && Array.isArray(res.data)) this._active.set(res.data);
    } catch {
      this._active.set([]);
    }
  }

  async load(params: any = {}) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ANNOUNCEMENT.LIST, { params })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._announcements.set(res.data?.announcements ?? []);
        this._total.set(res.data?.count ?? 0);
      }
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._announcements.set([]);
      this._total.set(0);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        // GET /announcements/:id — single read.
        this.http
          .apiGet(ANNOUNCEMENT.GET + id)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._current.set(null);
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

  async add(payload: AnnouncementPayload): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(ANNOUNCEMENT.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async update(id: string, payload: UpdateAnnouncementPayload): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPut(ANNOUNCEMENT.UPDATE + id, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(id: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiDelete(ANNOUNCEMENT.DELETE + id));
    } finally {
      this._saving.set(false);
    }
  }

  /** @deprecated Use loadActive() + active signal. Kept for header compatibility until Task 21. */
  getActive(): Promise<any> {
    return lastValueFrom(this.http.apiGet(ANNOUNCEMENT.CURRENT));
  }

  async dismiss(announcementId: string): Promise<any> {
    // POST /announcements/:id/dismiss
    return lastValueFrom(
      this.http.apiPost(
        ANNOUNCEMENT.DISMISS_PREFIX +
          announcementId +
          ANNOUNCEMENT.DISMISS_SUFFIX,
        {},
      ),
    );
  }

  removeActive(id: string) {
    this._active.update(list => list.filter(a => a.id !== id));
  }

  resetCurrent() {
    this._current.set(null);
  }
}
