import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { DATASOURCE, ORGANISATION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class OrganisationService {
  constructor(private http: HttpClientService) {}

  listOrganisation(params: any) {
    return lastValueFrom(this.http.apiGet(ORGANISATION.LIST, { params }));
  }

  addOrganisation(orgForm: FormGroup) {
    const {
      name, description, encryptionAlgorithm, pepperKey,
      dbHost, dbPort, dbName, dbUsername, dbPassword, adminEmail,
      maxLoginAttempts, accountLockDurationHours, passwordHistoryLimit,
      sessionInactivityTimeout, emailProvider,
      smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom,
      sesRegion, sesAccessKeyId, sesSecretAccessKey, sesFrom,
    } = orgForm.value;

    const payload: any = {
      name, description, encryptionAlgorithm, pepperKey,
      dbHost, dbPort, dbName, dbUsername, dbPassword, adminEmail,
      maxLoginAttempts, accountLockDurationHours, passwordHistoryLimit,
      sessionInactivityTimeout, emailProvider,
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

    return lastValueFrom(this.http.apiPost(ORGANISATION.ADD, payload));
  }

  editOrganisation(orgForm: FormGroup, justification?: string) {
    const {
      id, status, description,
      dbHost, dbPort, dbName, dbUsername, dbPassword,
      maxLoginAttempts, accountLockDurationHours, passwordHistoryLimit,
      sessionInactivityTimeout, emailProvider,
      smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom,
      sesRegion, sesAccessKeyId, sesSecretAccessKey, sesFrom,
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

    return lastValueFrom(this.http.apiPut(ORGANISATION.EDIT, payload));
  }

  bulkDeleteOrganisation(ids: string[], justification?: string) {
    return lastValueFrom(this.http.apiDelete(ORGANISATION.BULK_DELETE, { body: { ids, justification } }));
  }

  deleteOrganisation(orgId: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(ORGANISATION.DELETE + `${orgId}`, { body: { justification } }));
  }

  viewOrganisation(id: string) {
    return lastValueFrom(this.http.apiGet(ORGANISATION.VIEW + `${id}`));
  }

  refreshMasterDb(orgId: string) {
    return lastValueFrom(this.http.apiPost(ORGANISATION.REFRESH_MASTER_DB + `${orgId}`, {}));
  }

  validateDatasource(payload: {
    type: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) {
    return lastValueFrom(this.http.apiPost(DATASOURCE.VALIDATE, payload));
  }
}
