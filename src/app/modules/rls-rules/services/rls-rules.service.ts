import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { RLS_RULE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * RLS-rules service. Backed by the snapshot BE routes:
 *
 *  POST   /rls-rules                                  create
 *  GET    /rls-rules/:orgId/datasets/:datasetId       list for a dataset
 *  GET    /rls-rules/:orgId/:ruleId                   read one
 *  PUT    /rls-rules/:orgId/:ruleId                   update
 *  DELETE /rls-rules/:orgId/:ruleId                   delete
 *
 * Assignments (FE → user/group rule binding) used to live here. Those
 * endpoints never existed on the BE, so the methods were dead — they
 * have been removed. If the assignments UI is ever brought back, both
 * the BE routes and these methods need to be added together.
 */
@Injectable({ providedIn: 'root' })
export class RlsRulesService {
  private _rules = signal<any[]>([]);
  private _assignments = signal<any[]>([]);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _total = signal(0);

  readonly rules = this._rules.asReadonly();
  readonly assignments = this._assignments.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly total = this._total.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(orgId: string, datasetId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(
          RLS_RULE.LIST_FOR_DATASET_PREFIX +
            orgId +
            RLS_RULE.LIST_FOR_DATASET_INFIX +
            datasetId,
        ),
      );
      if (res?.status) {
        const rules = res.data?.rules ?? res.data ?? [];
        this._rules.set(rules);
        this._total.set(res.data?.count ?? rules.length);
      }
    } catch {
      this._rules.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(orgId: string, ruleId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(RLS_RULE.GET + `${orgId}/${ruleId}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async add(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(this.http.apiPost(RLS_RULE.ADD, payload));
    } finally {
      this._saving.set(false);
    }
  }

  async update(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      // PUT /rls-rules/:orgId/:ruleId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(
          RLS_RULE.UPDATE + `${payload.organisation}/${payload.id}`,
          payload,
        ),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(
    orgId: string,
    ruleId: string,
    justification?: string,
  ): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(RLS_RULE.DELETE + `${orgId}/${ruleId}`, {
          body: { justification },
        }),
      );
    } finally {
      this._saving.set(false);
    }
  }

  resetCurrent() {
    this._current.set(null);
  }
  resetAssignments() {
    this._assignments.set([]);
  }

  // ── Assignment methods (stubs) ─────────────────────────────────
  // The BE has no /rls-rules/.../assignments routes. The
  // manage-rls-assignments component calls these — keeping them as
  // throwing stubs so tsc passes and any accidental call surfaces a
  // clear runtime error instead of a misleading 404. Re-implement
  // alongside the matching BE routes if the assignments UI ships.
  private notImplemented(): never {
    throw new Error('RLS rule assignments are not implemented yet');
  }
  loadAssignments(_orgId: string, _ruleId: string): Promise<any> {
    return this.notImplemented();
  }
  addAssignment(_payload: any): Promise<any> {
    return this.notImplemented();
  }
  deleteAssignment(_orgId: string, _assignmentId: string): Promise<any> {
    return this.notImplemented();
  }

  // ── Legacy promise-based methods (kept for backward compat) ────────────

  listRules(orgId: string, datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(
        RLS_RULE.LIST_FOR_DATASET_PREFIX +
          orgId +
          RLS_RULE.LIST_FOR_DATASET_INFIX +
          datasetId,
      ),
    );
  }

  viewRule(orgId: string, ruleId: string) {
    return lastValueFrom(this.http.apiGet(RLS_RULE.GET + `${orgId}/${ruleId}`));
  }

  addRule(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD, payload));
  }

  updateRule(payload: any) {
    return lastValueFrom(
      this.http.apiPut(
        RLS_RULE.UPDATE + `${payload.organisation}/${payload.id}`,
        payload,
      ),
    );
  }

  deleteRule(orgId: string, ruleId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(RLS_RULE.DELETE + `${orgId}/${ruleId}`, {
        body: { justification },
      }),
    );
  }
}
