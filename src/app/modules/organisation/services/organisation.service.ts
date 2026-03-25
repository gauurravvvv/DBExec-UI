import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ANNOUNCEMENT, DATABASE, ORGANISATION } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class OrganisationService {
  constructor(private http: HttpClient) {}

  listOrganisation(params: any) {
    return this.http
      .get(ORGANISATION.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addOrganisation(orgForm: FormGroup) {
    const {
      name,
      description,
      encryptionAlgorithm,
      pepperKey,
      dbHost,
      dbPort,
      dbName,
      dbUsername,
      dbPassword,
      adminEmail,
    } = orgForm.value;
    return this.http
      .post(ORGANISATION.ADD, {
        name,
        description,
        encryptionAlgorithm,
        pepperKey,
        dbHost,
        dbPort,
        dbName,
        dbUsername,
        dbPassword,
        adminEmail,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editOrganisation(orgForm: FormGroup) {
    const {
      id,
      name,
      status,
      description,
      dbHost,
      dbPort,
      dbName,
      dbUsername,
      dbPassword,
    } = orgForm.getRawValue();

    const payload: any = {
      id,
      name,
      status: status ? 1 : 0,
      description,
    };

    // Only include DB fields if they have values
    if (dbHost) payload.dbHost = dbHost;
    if (dbPort) payload.dbPort = dbPort;
    if (dbName) payload.dbName = dbName;
    if (dbUsername) payload.dbUsername = dbUsername;
    if (dbPassword) payload.dbPassword = dbPassword;

    return this.http
      .put(ORGANISATION.EDIT, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteOrganisation(orgId: string) {
    return this.http
      .delete(ORGANISATION.DELETE + `${orgId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewOrganisation(id: string) {
    return this.http
      .get(ORGANISATION.VIEW + `${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

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
    const { name, description, startTime, endTime, organisation } =
      announcement;
    return this.http
      .post(ANNOUNCEMENT.CONFIGURE, {
        name,
        description,
        startTime,
        endTime,
        organisation,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  refreshMasterDb(orgId: string) {
    return this.http
      .post(ORGANISATION.REFRESH_MASTER_DB + `${orgId}`, {})
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  validateDatabase(payload: {
    type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) {
    return this.http
      .post(DATABASE.VALIDATE, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
