import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { RLS_RULE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

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

  // ── Signal-based methods ────────────────────────────────────────────────

  async load(orgId: string, datasourceId: string, params?: any) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(RLS_RULE.LIST, {
          params: { orgId, datasourceId, ...params },
        }),
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
        this.http.apiGet(RLS_RULE.VIEW + `${orgId}/${ruleId}`),
      );
      if (res?.status) this._current.set(res.data);
    } catch {
      this._current.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  async loadAssignments(orgId: string, ruleId: string) {
    try {
      const res: any = await lastValueFrom(
        this.http.apiGet(RLS_RULE.LIST_ASSIGNMENTS + `${orgId}/${ruleId}`),
      );
      if (res?.status)
        this._assignments.set(res.data?.assignments ?? res.data ?? []);
    } catch {
      this._assignments.set([]);
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
      return await lastValueFrom(this.http.apiPut(RLS_RULE.UPDATE, payload));
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

  async addAssignment(payload: any): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiPost(RLS_RULE.ADD_ASSIGNMENT, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async deleteAssignment(orgId: string, assignmentId: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(
          RLS_RULE.DELETE_ASSIGNMENT + `${orgId}/${assignmentId}`,
          { body: {} },
        ),
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

  // ── Legacy promise-based methods (kept for backward compat) ────────────

  listRules(orgId: string, datasourceId: string, params?: any) {
    return lastValueFrom(
      this.http.apiGet(RLS_RULE.LIST, {
        params: { orgId, datasourceId, ...params },
      }),
    );
  }

  viewRule(orgId: string, ruleId: string) {
    return lastValueFrom(
      this.http.apiGet(RLS_RULE.VIEW + `${orgId}/${ruleId}`),
    );
  }

  addRule(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD, payload));
  }

  updateRule(payload: any) {
    return lastValueFrom(this.http.apiPut(RLS_RULE.UPDATE, payload));
  }

  deleteRule(orgId: string, ruleId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(RLS_RULE.DELETE + `${orgId}/${ruleId}`, {
        body: { justification },
      }),
    );
  }

  listAssignments(orgId: string, ruleId: string) {
    return lastValueFrom(
      this.http.apiGet(RLS_RULE.LIST_ASSIGNMENTS + `${orgId}/${ruleId}`),
    );
  }

  addAssignmentLegacy(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD_ASSIGNMENT, payload));
  }

  deleteAssignmentLegacy(orgId: string, assignmentId: string) {
    return lastValueFrom(
      this.http.apiDelete(
        RLS_RULE.DELETE_ASSIGNMENT + `${orgId}/${assignmentId}`,
        { body: {} },
      ),
    );
  }
}
