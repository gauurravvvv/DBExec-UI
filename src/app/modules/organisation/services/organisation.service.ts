import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DATASOURCE, ORGANISATION } from 'src/app/core/constants/api.constant';
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
        this.http.apiGet(ORGANISATION.GET + id),
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
        adminLocale,
      } = orgForm.value;

      const payload: any = {
        name,
        description,
        dbHost,
        dbPort,
        dbName,
        dbUsername,
        dbPassword,
        adminEmail,
        adminLocale,
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

      return await lastValueFrom(
        this.http.apiPut(ORGANISATION.UPDATE + payload.id, payload),
      );
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
      // POST /orgs/bulk-delete — subresource for the bulk action.
      return await lastValueFrom(
        this.http.apiPost(ORGANISATION.BULK_DELETE, { ids, justification }),
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

    // Encryption: per-org key generated server-side; the FE doesn't
    // send anything related to algorithm or pepper.
    const payload: any = {
      name,
      description,
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

    return lastValueFrom(
      this.http.apiPut(ORGANISATION.UPDATE + payload.id, payload),
    );
  }

  bulkDeleteOrganisation(ids: string[], justification?: string) {
    return lastValueFrom(
      this.http.apiPost(ORGANISATION.BULK_DELETE, { ids, justification }),
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
    return lastValueFrom(this.http.apiGet(ORGANISATION.GET + `${id}`));
  }

  refreshMasterDb(orgId: string) {
    // POST /orgs/:id/refresh-master-db — id-first, action-suffix.
    return lastValueFrom(
      this.http.apiPost(
        ORGANISATION.REFRESH_MASTER_DB_PREFIX +
          orgId +
          ORGANISATION.REFRESH_MASTER_DB_SUFFIX,
        {},
      ),
    );
  }

  validateDatasource(payload: {
    type: string;
    database: string;
    username: string;
    password: string;
    // TypeORM-engine params (Postgres/MySQL/MariaDB/MSSQL/Oracle)
    host?: string;
    port?: number;
    // Snowflake-only params
    account?: string;
    warehouse?: string;
    role?: string;
    schemaName?: string;
  }) {
    return lastValueFrom(this.http.apiPost(DATASOURCE.VALIDATE, payload));
  }

  /**
   * validateMasterDb — tests Postgres connectivity for an org's master
   * DB before saving the organisation. Gated server-side by the
   * `orgManagement` permission (System Admin only). Distinct from
   * validateDatasource() which is gated by `setupDB` and is not
   * available to the System Admin under the V2 permission set.
   */
  validateMasterDb(payload: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) {
    return lastValueFrom(
      this.http.apiPost(ORGANISATION.VALIDATE_MASTER_DB, payload),
    );
  }
}
