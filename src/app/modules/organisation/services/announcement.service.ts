import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ANNOUNCEMENT } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class AnnouncementService {
  constructor(private http: HttpClient) {}

  getAnnouncement(orgId: string) {
    return this.http
      .get(ANNOUNCEMENT.GET + `${orgId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
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
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
