import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ANNOUNCEMENT } from 'src/app/constants/api';

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
  constructor(private http: HttpClient) {}

  // Active announcements visible to the logged-in user (header consumption).
  getActive() {
    return this.http
      .get(ANNOUNCEMENT.GET)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  // Admin: list announcements, optionally scoped to orgId (SA) and / or a group.
  list(params: any = {}) {
    return this.http
      .get(ANNOUNCEMENT.LIST, { params })
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  // Admin: get single announcement details. orgId required so SA can target any org.
  details(id: string, orgId?: string) {
    let params = new HttpParams();
    if (orgId) params = params.set('orgId', orgId);
    return this.http
      .get(ANNOUNCEMENT.DETAILS + id, { params })
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  add(payload: AnnouncementPayload) {
    return this.http
      .post(ANNOUNCEMENT.ADD, payload)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  update(id: string, payload: UpdateAnnouncementPayload) {
    return this.http
      .put(ANNOUNCEMENT.UPDATE + id, payload)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  delete(id: string, orgId?: string) {
    let params = new HttpParams();
    if (orgId) params = params.set('orgId', orgId);
    return this.http
      .delete(ANNOUNCEMENT.DELETE + id, { params })
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  dismiss(announcementId: string) {
    return this.http
      .post(ANNOUNCEMENT.DISMISS + announcementId, {})
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }
}
