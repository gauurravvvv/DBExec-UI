import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { DATASOURCE, ORGANISATION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class OrganisationService {
  // Signal state
  private _orgs = signal<any[]>([]);
  private _total = signal<number>(0);
  private _current = signal<any>(null);
  private _loading = signal<boolean>(false);
  private _saving = signal<boolean>(false);

  // Readonly public signals
  readonly orgs = this._orgs.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  // ── Signal-based methods (used by own components) ───────────────────────

  async load(params: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(ORGANISATION.LIST, { params }),
      );
      if (res?.status) {
        this._orgs.set(res.data.orgs ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(ORGANISATION.VIEW + id),
      );
      if (res?.status) this._current.set(res.data);
    } finally {
      this._loading.set(false);
    }
  }

  async add(orgForm: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
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

      return await lastValueFrom(this.http.apiPost(ORGANISATION.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async edit(orgForm: FormGroup, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
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

      return await lastValueFrom(this.http.apiPut(ORGANISATION.EDIT, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async delete(orgId: string, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ORGANISATION.DELETE + `${orgId}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ORGANISATION.BULK_DELETE, {
          body: { ids, justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent() {
    this._current.set(null);
  }

  // ── Legacy methods — kept for external callers (27+ other modules) ───────

  listOrganisation(params: any) {
    return lastValueFrom(this.http.apiGet(ORGANISATION.LIST, { params }));
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

    return lastValueFrom(this.http.apiPost(ORGANISATION.ADD, payload));
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

    return lastValueFrom(this.http.apiPut(ORGANISATION.EDIT, payload));
  }

  bulkDeleteOrganisation(ids: string[], justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ORGANISATION.BULK_DELETE, {
        body: { ids, justification },
      }),
    );
  }

  deleteOrganisation(orgId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ORGANISATION.DELETE + `${orgId}`, {
        body: { justification },
      }),
    );
  }

  viewOrganisation(id: string) {
    return lastValueFrom(this.http.apiGet(ORGANISATION.VIEW + `${id}`));
  }

  refreshMasterDb(orgId: string) {
    return lastValueFrom(
      this.http.apiPost(ORGANISATION.REFRESH_MASTER_DB + `${orgId}`, {}),
    );
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
