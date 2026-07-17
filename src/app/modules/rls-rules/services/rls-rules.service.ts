import { Injectable, signal } from '@angular/core';
import { EmptyError, Subject, lastValueFrom, takeUntil } from 'rxjs';
import { RLS_RULE } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * RLS-rules service. Backed by the snapshot BE routes:
 *
 *  POST   /rls-rules                              create
 *  GET    /rls-rules/datasets/:datasetId          list for a dataset
 *  GET    /rls-rules/:ruleId                      read one
 *  PUT    /rls-rules/:ruleId                      update
 *  DELETE /rls-rules/:ruleId                      delete
 *
 * Assignments (which users/groups a rule applies to) are stored ON the
 * rule as an `assignments[]` array — there is no separate assignments
 * endpoint. The manage-assignments panel therefore loads the rule,
 * mutates `assignments[]`, and PUTs the whole rule back through the
 * existing update route. This keeps the subject list transactional with
 * the rest of the rule and needs no extra BE surface.
 */
@Injectable({ providedIn: 'root' })
export class RlsRulesService {
  private _rules = signal<any[]>([]);
  private _assignments = signal<any[]>([]);
  private _current = signal<any>(null);
  private _loading = signal(false);
  private _saving = signal(false);
  private _total = signal(0);

  // Reads pipe through this Subject so callers (view/edit/list/add
  // rls-rule ngOnDestroy) can cancel in-flight GETs.
  private _cancelReads$ = new Subject<void>();

  readonly rules = this._rules.asReadonly();
  readonly assignments = this._assignments.asReadonly();
  readonly current = this._current.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly total = this._total.asReadonly();

  constructor(private http: HttpClientService) {}

  async load(datasetId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(RLS_RULE.LIST_FOR_DATASET_PREFIX + datasetId)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) {
        const rules = res.data?.rules ?? res.data ?? [];
        this._rules.set(rules);
        this._total.set(res.data?.count ?? rules.length);
      }
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._rules.set([]);
    } finally {
      this._loading.set(false);
    }
  }

  async loadOne(ruleId: string) {
    this._loading.set(true);
    try {
      const res: any = await lastValueFrom(
        this.http
          .apiGet(RLS_RULE.GET + ruleId)
          .pipe(takeUntil(this._cancelReads$)),
      );
      if (res?.status) this._current.set(res.data);
    } catch (err) {
      if (err instanceof EmptyError) return;
      this._current.set(null);
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
      // PUT /rls-rules/:ruleId — id moves to path.
      return await lastValueFrom(
        this.http.apiPut(RLS_RULE.UPDATE + payload.id, payload),
      );
    } finally {
      this._saving.set(false);
    }
  }

  async delete(ruleId: string, justification?: string): Promise<any> {
    this._saving.set(true);
    try {
      return await lastValueFrom(
        this.http.apiDelete(RLS_RULE.DELETE + ruleId, {
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

  // ── Assignment methods (rule-embedded) ─────────────────────────
  // Assignments live on the rule as `assignments[]`. These helpers read
  // and mutate that array in the `_assignments` signal, persisting via
  // the rule update route. `_assignmentsRuleId` tracks which rule the
  // signal currently holds so add/remove can PUT the right record.
  private _assignmentsRuleId: string | null = null;

  async loadAssignments(ruleId: string): Promise<any> {
    this._assignmentsRuleId = ruleId;
    const res: any = await lastValueFrom(
      this.http.apiGet(RLS_RULE.GET + ruleId),
    );
    if (res?.status) {
      const list = Array.isArray(res.data?.assignments)
        ? res.data.assignments
        : [];
      this._assignments.set(list);
    } else {
      this._assignments.set([]);
    }
    return res;
  }

  /** Append a subject and persist the rule. `payload` = { ruleId, scope, scopeId }. */
  async addAssignment(payload: {
    ruleId: string;
    scope: string;
    scopeId: string;
  }): Promise<any> {
    const current = this._assignments();
    // Ignore exact duplicates so the same subject isn't added twice.
    const exists = current.some(
      (a: any) => a.scope === payload.scope && a.scopeId === payload.scopeId,
    );
    const next = exists
      ? current
      : [...current, { scope: payload.scope, scopeId: payload.scopeId }];
    const res = await this.update({
      id: payload.ruleId,
      assignments: next.map((a: any) => ({
        scope: a.scope,
        scopeId: a.scopeId,
      })),
      justification: 'Update RLS rule assignments',
    });
    if ((res as any)?.status) this._assignments.set(next);
    return res;
  }

  /** Remove a subject by scope+scopeId and persist the rule. */
  async deleteAssignment(target: {
    scope: string;
    scopeId: string;
  }): Promise<any> {
    if (!this._assignmentsRuleId) return { status: false };
    const next = this._assignments().filter(
      (a: any) => !(a.scope === target.scope && a.scopeId === target.scopeId),
    );
    const res = await this.update({
      id: this._assignmentsRuleId,
      assignments: next.map((a: any) => ({
        scope: a.scope,
        scopeId: a.scopeId,
      })),
      justification: 'Update RLS rule assignments',
    });
    if ((res as any)?.status) this._assignments.set(next);
    return res;
  }

  // ── Legacy promise-based methods (kept for backward compat) ────────────

  /**
   * List ALL org RLS rules via `GET /rls-rules`. Each row is enriched by the
   * BE with `datasetName` + `datasourceName`, so the list can show both the
   * dataset and datasource context without a per-datasource gate. An optional
   * params object (e.g. `{ datasourceId, page, limit, filter, sort }`) is
   * forwarded as query params — the list passes `datasourceId` when the
   * optional toolbar filter narrows the rows server-side.
   */
  listAllRules(params?: Record<string, any>) {
    return lastValueFrom(
      this.http.apiGet(RLS_RULE.LIST_ALL, {
        ...(params ? { params } : {}),
        skipLoader: true,
      }),
    );
  }

  listRules(datasetId: string) {
    return lastValueFrom(
      this.http.apiGet(RLS_RULE.LIST_FOR_DATASET_PREFIX + datasetId),
    );
  }

  viewRule(ruleId: string) {
    return lastValueFrom(this.http.apiGet(RLS_RULE.GET + ruleId));
  }

  addRule(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD, payload));
  }

  updateRule(payload: any) {
    return lastValueFrom(
      this.http.apiPut(RLS_RULE.UPDATE + payload.id, payload),
    );
  }

  deleteRule(ruleId: string, justification?: string) {
    return lastValueFrom(
      this.http.apiDelete(RLS_RULE.DELETE + ruleId, {
        body: { justification },
      }),
    );
  }
}
