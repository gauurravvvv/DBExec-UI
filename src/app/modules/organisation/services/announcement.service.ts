import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ANNOUNCEMENT } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  constructor(private http: HttpClient) {}

  getAnnouncement(orgId: string, type?: number) {
    let url = ANNOUNCEMENT.GET + `${orgId}`;
    if (type) url += `?type=${type}`;
    return this.http
      .get(url)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  getAnnouncementDetails(orgId: string, type?: number) {
    let url = ANNOUNCEMENT.DETAILS + `${orgId}`;
    if (type) url += `?type=${type}`;
    return this.http
      .get(url)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  dismissAnnouncement(orgId: string) {
    return this.http
      .post(ANNOUNCEMENT.DISMISS + orgId, {})
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  addAnnouncement(announcement: any) {
    const {
      name,
      description,
      startTime,
      endTime,
      organisation,
      bgColor,
      textColor,
      type,
      status,
    } = announcement;
    return this.http
      .post(ANNOUNCEMENT.CONFIGURE, {
        name,
        description,
        startTime,
        endTime,
        organisation,
        bgColor,
        textColor,
        type,
        status,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
