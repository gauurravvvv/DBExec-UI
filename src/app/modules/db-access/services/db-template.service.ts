import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DB_ACCESS } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * DbTemplateService — CRUD over the org's DB Access role/privilege
 * TEMPLATES (PDM D10). Unlike DbAccessService (which talks to the target
 * datasource's PG catalog), these endpoints read/write DBExec's own org DB
 * (db_role_template). Signal-based, `{ skipLoader: true }` so the screens
 * drive their own spinners.
 *
 * A template is a reusable recipe: role attributes + structured privilege
 * rules. Applying one just prefills the create-role form / composer.
 */
@Injectable({ providedIn: 'root' })
export class DbTemplateService {
  private _loading = signal(false);
  private _saving = signal(false);
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  constructor(private http: HttpClientService) {}

  /**
   * GET /db-access/templates — org-wide + (optionally) datasource-pinned,
   * server-paged + searchable. Returns the raw response ({ items, count }).
   */
  list(opts: {
    datasourceId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    this._loading.set(true);
    const params: Record<string, string> = {};
    if (opts.datasourceId) params['datasourceId'] = opts.datasourceId;
    if (opts.search) params['search'] = opts.search;
    if (opts.page) params['page'] = String(opts.page);
    if (opts.limit) params['limit'] = String(opts.limit);
    return lastValueFrom(
      this.http.apiGet(DB_ACCESS.TEMPLATES_BASE, { skipLoader: true, params }),
    ).finally(() => this._loading.set(false));
  }

  /** GET /db-access/templates/:id. */
  get(id: string): Promise<any> {
    this._loading.set(true);
    return lastValueFrom(
      this.http.apiGet(DB_ACCESS.TEMPLATES_BASE + '/' + encodeURIComponent(id), {
        skipLoader: true,
      }),
    ).finally(() => this._loading.set(false));
  }

  /** POST /db-access/templates. */
  create(body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(DB_ACCESS.TEMPLATES_BASE, body, { skipLoader: true }),
    ).finally(() => this._saving.set(false));
  }

  /** PUT /db-access/templates/:id (refused server-side for built-ins). */
  update(id: string, body: any): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPut(
        DB_ACCESS.TEMPLATES_BASE + '/' + encodeURIComponent(id),
        body,
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }

  /** POST /db-access/templates/bulk-delete (skips built-ins server-side). */
  bulkDelete(ids: string[]): Promise<any> {
    this._saving.set(true);
    return lastValueFrom(
      this.http.apiPost(
        DB_ACCESS.TEMPLATES_BULK_DELETE,
        { ids },
        { skipLoader: true },
      ),
    ).finally(() => this._saving.set(false));
  }
}
