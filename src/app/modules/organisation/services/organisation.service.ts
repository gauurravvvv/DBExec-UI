import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ANNOUNCEMENT, DATASOURCE, ORGANISATION } from 'src/app/constants/api';

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
      maxLoginAttempts,
      accountLockDurationHours,
      passwordHistoryLimit,
      sessionInactivityTimeout,
      emailProvider,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpFrom,
      sesRegion,
      sesAccessKeyId,
      sesSecretAccessKey,
      sesFrom,
    } = orgForm.value;

    const payload: any = {
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
      maxLoginAttempts,
      accountLockDurationHours,
      passwordHistoryLimit,
      sessionInactivityTimeout,
      emailProvider,
    };

    if (emailProvider === 'SMTP') {
      payload.smtpHost = smtpHost;
      payload.smtpPort = smtpPort;
      payload.smtpUser = smtpUser;
      if (smtpPassword) payload.smtpPassword = smtpPassword;
      payload.smtpFrom = smtpFrom;
    } else if (emailProvider === 'SES') {
      payload.sesRegion = sesRegion;
      payload.sesAccessKeyId = sesAccessKeyId;
      if (sesSecretAccessKey) payload.sesSecretAccessKey = sesSecretAccessKey;
      payload.sesFrom = sesFrom;
    }

    return this.http
      .post(ORGANISATION.ADD, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  editOrganisation(orgForm: FormGroup, justification?: string) {
    const {
      id,
      status,
      description,
      dbHost,
      dbPort,
      dbName,
      dbUsername,
      dbPassword,
      maxLoginAttempts,
      accountLockDurationHours,
      passwordHistoryLimit,
      sessionInactivityTimeout,
      emailProvider,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      smtpFrom,
      sesRegion,
      sesAccessKeyId,
      sesSecretAccessKey,
      sesFrom,
    } = orgForm.getRawValue();

    const payload: any = {
      id,
      // Organisation name cannot be updated after creation
      status: status ? 1 : 0,
      description,
      justification,
    };

    // Only include DB fields if they have values
    if (dbHost) payload.dbHost = dbHost;
    if (dbPort) payload.dbPort = dbPort;
    if (dbName) payload.dbName = dbName;
    if (dbUsername) payload.dbUsername = dbUsername;
    if (dbPassword) payload.dbPassword = dbPassword;

    // Security config
    payload.maxLoginAttempts = maxLoginAttempts;
    payload.accountLockDurationHours = accountLockDurationHours;
    payload.passwordHistoryLimit = passwordHistoryLimit;
    payload.sessionInactivityTimeout = sessionInactivityTimeout;

    // Email config
    payload.emailProvider = emailProvider;
    if (emailProvider === 'SMTP') {
      payload.smtpHost = smtpHost;
      payload.smtpPort = smtpPort;
      payload.smtpUser = smtpUser;
      if (smtpPassword) payload.smtpPassword = smtpPassword;
      payload.smtpFrom = smtpFrom;
    } else if (emailProvider === 'SES') {
      payload.sesRegion = sesRegion;
      payload.sesAccessKeyId = sesAccessKeyId;
      if (sesSecretAccessKey) payload.sesSecretAccessKey = sesSecretAccessKey;
      payload.sesFrom = sesFrom;
    }

    return this.http
      .put(ORGANISATION.EDIT, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  bulkDeleteOrganisation(ids: string[], justification?: string) {
    return this.http
      .request('DELETE', ORGANISATION.BULK_DELETE, {
        body: { ids, justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteOrganisation(orgId: string, justification?: string) {
    return this.http
      .request('DELETE', ORGANISATION.DELETE + `${orgId}`, {
        body: { justification },
      })
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

  validateDatasource(payload: {
    type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) {
    return this.http
      .post(DATASOURCE.VALIDATE, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
