import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
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

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  constructor(private http: HttpClientService) {}

  // Active announcements visible to the logged-in user (header consumption).
  getActive() {
    return lastValueFrom(this.http.apiGet(ANNOUNCEMENT.GET));
  }

  // Admin: list announcements, optionally scoped to orgId (SA) and / or a group.
  list(params: any = {}) {
    return lastValueFrom(this.http.apiGet(ANNOUNCEMENT.LIST, { params }));
  }

  // Admin: get single announcement details. orgId required so SA can target any org.
  details(id: string, orgId?: string) {
    let params = new HttpParams();
    if (orgId) params = params.set('orgId', orgId);
    return lastValueFrom(this.http.apiGet(ANNOUNCEMENT.DETAILS + id, { params }));
  }

  add(payload: AnnouncementPayload) {
    return lastValueFrom(this.http.apiPost(ANNOUNCEMENT.ADD, payload));
  }

  update(id: string, payload: UpdateAnnouncementPayload) {
    return lastValueFrom(this.http.apiPut(ANNOUNCEMENT.UPDATE + id, payload));
  }

  delete(id: string, orgId?: string) {
    let params = new HttpParams();
    if (orgId) params = params.set('orgId', orgId);
    return lastValueFrom(this.http.apiDelete(ANNOUNCEMENT.DELETE + id, { params }));
  }

  dismiss(announcementId: string) {
    return lastValueFrom(this.http.apiPost(ANNOUNCEMENT.DISMISS + announcementId, {}));
  }
}
