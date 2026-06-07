import { Injectable, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
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
  // `loading` covers READ traffic (list / get one). Components watch
  // it to decide between rendering the data view vs the skeleton.
  private _loading = signal<boolean>(false);
  // `saving` covers WRITE traffic (add / edit) — drives the Save /
  // Update button's spinner so the rest of the form stays interactive
  // while the request is in flight.
  private _saving = signal<boolean>(false);
  // `deleting` is per-row: maps org id → in-flight delete. Components
  // hand the row id to `isDeleting(id)` to know whether THAT row's
  // delete button should spin. A single boolean would block every
  // row's UI when one is being deleted, which feels wrong on lists.
  private _deleting = signal<Record<string, boolean>>({});
  // `validating` — drives the "Test Connection" button on add/edit.
  // Kept separate from `saving` so a user can validate without their
  // Save button thinking the form is being submitted.
  private _validating = signal<boolean>(false);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // organisation ngOnDestroy) can cancel in-flight GETs. Mutations +
  // validateDatasource + validateMasterDb don't pipe through.
  private _cancelReads$ = new Subject<void>();

  // Readonly public signals
  readonly orgs = this._orgs.asReadonly();
  readonly total = this._total.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly deleting = this._deleting.asReadonly();
  readonly validating = this._validating.asReadonly();

  isDeleting(id: string): boolean {
    return !!this._deleting()[id];
  }
  private setDeleting(id: string, on: boolean): void {
    const map = { ...this._deleting() };
    if (on) map[id] = true;
    else delete map[id];
    this._deleting.set(map);
  }

  constructor(private http: HttpClientService) {}

  // ── Signal-based methods (used by own components) ───────────────────────

  async load(params: any) {
    // `skipLoader: true` opts this call out of the legacy global blocker
    // — the list component shows its own skeleton rows while loading()
    // is true, and the rest of the app stays interactive.
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ORGANISATION.LIST, { params, skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        this._orgs.set(res.data.orgs ?? []);
        this._total.set(res.data.count ?? 0);
      }
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(id: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(ORGANISATION.GET + id, { skipLoader: true })
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (!(err instanceof EmptyError)) throw err;
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

  async add(orgForm: FormGroup): Promise<any> {
    this._saving.set(true);
    try {
      const {
        name,
        description,
        dbHost,
        dbPort,
        dbName,
        dbSchema,
        dbUsername,
        dbPassword,
        adminEmail,
        adminLocale,
      } = orgForm.value;

      // Security + email config are owned by the per-org OrgPolicy
      // entity and configured by the Org Admin under App Settings —
      // the System Admin's "Add Organisation" form no longer collects
      // them.
      const payload: any = {
        name,
        description,
        dbHost,
        dbPort,
        dbName,
        dbSchema,
        dbUsername,
        dbPassword,
        adminEmail,
        adminLocale,
      };

      // Mutations opt out of the global loader — the Save button shows
      // its own spinner via `saving()`, leaving the rest of the form
      // (and the surrounding app) interactive while the request runs.
      return await lastValueFrom(
        this.http.apiPost(ORGANISATION.ADD, payload, { skipLoader: true }),
      );
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

      return await lastValueFrom(
        this.http.apiPut(ORGANISATION.UPDATE + payload.id, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(orgId: string, justification?: string): Promise<any> {
    // Per-row delete: track this id in `_deleting` so the listing's
    // delete-row button can show its own spinner without freezing the
    // rest of the row or the rest of the list.
    this.setDeleting(orgId, true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(ORGANISATION.DELETE + `${orgId}`, {
          body: { justification },
          skipLoader: true,
        }),
      );
    } finally {
      this.setDeleting(orgId, false);
    }
  }

  async bulkDelete(ids: string[], justification?: string): Promise<any> {
    // Bulk: stamp every selected id into `_deleting` so each selected
    // row's spinner lights up while the single batched POST runs.
    ids.forEach(id => this.setDeleting(id, true));
    try {
      // POST /orgs/bulk-delete — subresource for the bulk action.
      return await lastValueFrom(
        this.http.apiPost(
          ORGANISATION.BULK_DELETE,
          { ids, justification },
          { skipLoader: true },
        ),
      );
    } finally {
      ids.forEach(id => this.setDeleting(id, false));
    }
  }

  resetCurrent() {
    this._current.set(null);
  }

  // ── Legacy methods — kept for external callers (27+ other modules) ───────

  listOrganisation(params: any) {
    return lastValueFrom(
      this.http.apiGet(ORGANISATION.LIST, { params, skipLoader: true }),
    );
  }

  addOrganisation(orgForm: FormGroup) {
    const {
      name,
      description,
      dbHost,
      dbPort,
      dbName,
      dbSchema,
      dbUsername,
      dbPassword,
      adminEmail,
      adminLocale,
    } = orgForm.value;

    // Encryption: per-org key generated server-side; the FE doesn't
    // send anything related to algorithm or pepper. Security + email
    // policy are owned by per-org OrgPolicy (managed by Org Admin)
    // and are not sent from the System Admin's create-org form.
    const payload: any = {
      name,
      description,
      dbHost,
      dbPort,
      dbName,
      dbSchema,
      dbUsername,
      dbPassword,
      adminEmail,
      adminLocale,
    };

    return lastValueFrom(
      this.http.apiPost(ORGANISATION.ADD, payload, { skipLoader: true }),
    );
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

    return lastValueFrom(
      this.http.apiPut(ORGANISATION.UPDATE + payload.id, payload, {
        skipLoader: true,
      }),
    );
  }

  bulkDeleteOrganisation(ids: string[], justification?: string) {
    return lastValueFrom(
      this.http.apiPost(
        ORGANISATION.BULK_DELETE,
        { ids, justification },
        { skipLoader: true },
      ),
    );
  }

  deleteOrganisation(orgId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(ORGANISATION.DELETE + `${orgId}`, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }

  viewOrganisation(id: string) {
    return lastValueFrom(
      this.http.apiGet(ORGANISATION.GET + `${id}`, { skipLoader: true }),
    );
  }

  refreshMasterDb(orgId: string) {
    // POST /orgs/:id/refresh-master-db — id-first, action-suffix.
    return lastValueFrom(
      this.http.apiPost(
        ORGANISATION.REFRESH_MASTER_DB_PREFIX +
          orgId +
          ORGANISATION.REFRESH_MASTER_DB_SUFFIX,
        {},
        { skipLoader: true },
      ),
    );
  }

  async validateDatasource(payload: {
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
    // The Test Connection button on add/edit drives `validating()`;
    // skipLoader keeps the global blocker out of it so users can keep
    // editing the rest of the form while we wait for the BE handshake.
    this._validating.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(DATASOURCE.VALIDATE, payload, { skipLoader: true }),
      );
    } finally {
      this._validating.set(false);
    }
  }

  /**
   * validateMasterDb — tests Postgres connectivity for an org's master
   * DB before saving the organisation. Gated server-side by the
   * `orgManagement` permission (System Admin only). Distinct from
   * validateDatasource() which is gated by `setupDB` and is not
   * available to the System Admin under the V2 permission set.
   */
  async validateMasterDb(payload: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  }) {
    this._validating.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(ORGANISATION.VALIDATE_MASTER_DB, payload, {
          skipLoader: true,
        }),
      );
    } finally {
      this._validating.set(false);
    }
  }
}
