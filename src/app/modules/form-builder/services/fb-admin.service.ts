/**
 * FbAdminService — the design-time HTTP client for the Form Builder.
 *
 * Modelled on QbAdminService (promise-returning wrappers over HttpClientService).
 * Covers form-family CRUD, the resolved version tree (getFormVersion), tab /
 * section / field create+patch+delete, the single reorder endpoint, and the
 * publish/retire/fork lifecycle. All paths come from the FORM_BUILDER api group
 * (/forms…); the prompt palette reuses PROMPT.LIST.
 *
 * The BE routes are PATCH for partial updates; HttpClientService exposes
 * apiPatch, so no verb mapping is needed.
 */
import { Injectable, inject, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FORM_BUILDER, PROMPT } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';
import {
  CreateRuleBody,
  FbFormRule,
  ReorderBody,
  ValidateRulesData,
} from './fb-types';

@Injectable({ providedIn: 'root' })
export class FbAdminService {
  private readonly http = inject(HttpClientService);

  private _loading = signal(false);
  private _saving = signal(false);
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();

  private get(path: string): Promise<any> {
    return lastValueFrom(this.http.apiGet(path, { skipLoader: true }));
  }
  private post(path: string, body: any): Promise<any> {
    return lastValueFrom(this.http.apiPost(path, body));
  }
  private patch(path: string, body: any): Promise<any> {
    return lastValueFrom(this.http.apiPatch(path, body));
  }
  private del(path: string): Promise<any> {
    return lastValueFrom(this.http.apiDelete(path));
  }

  // ── Form family CRUD ──────────────────────────────────────────────────
  listForms(params: Record<string, any> = {}): Promise<any> {
    return lastValueFrom(
      this.http.apiGet(FORM_BUILDER.BASE, { params, skipLoader: true }),
    );
  }
  createForm(body: any): Promise<any> {
    this._saving.set(true);
    return this.post(FORM_BUILDER.BASE, body).finally(() =>
      this._saving.set(false),
    );
  }
  getForm(id: string): Promise<any> {
    return this.get(FORM_BUILDER.GET + id);
  }
  updateForm(id: string, patch: any): Promise<any> {
    return this.patch(FORM_BUILDER.GET + id, patch);
  }
  deleteForm(id: string): Promise<any> {
    return this.del(FORM_BUILDER.GET + id);
  }

  // ── Resolved design tree for a version ────────────────────────────────
  // asRole (designer-only, WRITE-guarded server-side) re-projects the tree
  // through that role's effectiveAccess — `none` fields omitted, `read`
  // forced read-only — so the designer can preview the form as any role.
  getFormVersion(id: string, version: number, asRole?: string | null): Promise<any> {
    if (asRole) {
      return lastValueFrom(
        this.http.apiGet(FORM_BUILDER.version(id, version), {
          params: { asRole },
          skipLoader: true,
        }),
      );
    }
    return this.get(FORM_BUILDER.version(id, version));
  }

  // ── Tabs ──────────────────────────────────────────────────────────────
  createTab(id: string, v: number, body: any): Promise<any> {
    return this.post(FORM_BUILDER.tabs(id, v), body);
  }
  updateTab(id: string, v: number, tabId: string, patch: any): Promise<any> {
    return this.patch(`${FORM_BUILDER.tabs(id, v)}/${tabId}`, patch);
  }
  deleteTab(id: string, v: number, tabId: string): Promise<any> {
    return this.del(`${FORM_BUILDER.tabs(id, v)}/${tabId}`);
  }

  // ── Sections ──────────────────────────────────────────────────────────
  createSection(id: string, v: number, body: any): Promise<any> {
    return this.post(FORM_BUILDER.sections(id, v), body);
  }
  updateSection(
    id: string,
    v: number,
    sectionId: string,
    patch: any,
  ): Promise<any> {
    return this.patch(`${FORM_BUILDER.sections(id, v)}/${sectionId}`, patch);
  }
  deleteSection(id: string, v: number, sectionId: string): Promise<any> {
    return this.del(`${FORM_BUILDER.sections(id, v)}/${sectionId}`);
  }

  // ── Fields (placements) ───────────────────────────────────────────────
  createField(id: string, v: number, body: any): Promise<any> {
    return this.post(FORM_BUILDER.fields(id, v), body);
  }
  updateField(
    id: string,
    v: number,
    formFieldId: string,
    patch: any,
  ): Promise<any> {
    return this.patch(`${FORM_BUILDER.fields(id, v)}/${formFieldId}`, patch);
  }
  deleteField(id: string, v: number, formFieldId: string): Promise<any> {
    return this.del(`${FORM_BUILDER.fields(id, v)}/${formFieldId}`);
  }

  // ── Reorder (single permutation endpoint) ─────────────────────────────
  reorder(id: string, v: number, body: ReorderBody): Promise<any> {
    return this.patch(FORM_BUILDER.reorder(id, v), body);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  publish(id: string, v: number): Promise<any> {
    return this.post(FORM_BUILDER.publish(id, v), {});
  }
  retire(id: string, v: number): Promise<any> {
    return this.post(FORM_BUILDER.retire(id, v), {});
  }
  fork(id: string, v: number): Promise<any> {
    return this.post(FORM_BUILDER.fork(id, v), {});
  }

  // ── Rules (Phase 5 — version-scoped; CUD draft-only) ──────────────────
  async listRules(id: string, v: number): Promise<FbFormRule[]> {
    const res = await this.get(FORM_BUILDER.rules(id, v));
    return (res?.data ?? []) as FbFormRule[];
  }
  async createRule(
    id: string,
    v: number,
    body: CreateRuleBody,
  ): Promise<FbFormRule> {
    this._saving.set(true);
    try {
      const res = await this.post(FORM_BUILDER.rules(id, v), body);
      return res?.data as FbFormRule;
    } finally {
      this._saving.set(false);
    }
  }
  async updateRule(
    id: string,
    v: number,
    ruleId: string,
    body: Partial<CreateRuleBody>,
  ): Promise<FbFormRule> {
    this._saving.set(true);
    try {
      const res = await this.patch(`${FORM_BUILDER.rules(id, v)}/${ruleId}`, body);
      return res?.data as FbFormRule;
    } finally {
      this._saving.set(false);
    }
  }
  deleteRule(id: string, v: number, ruleId: string): Promise<any> {
    return this.del(`${FORM_BUILDER.rules(id, v)}/${ruleId}`);
  }
  async validateRules(
    id: string,
    v: number,
    values: Record<string, unknown>,
    asRole?: string,
  ): Promise<ValidateRulesData> {
    const body: Record<string, unknown> = { values };
    if (asRole) body['asRole'] = asRole;
    const res = await this.post(`${FORM_BUILDER.rules(id, v)}/validate`, body);
    return res?.data as ValidateRulesData;
  }

  // ── Field-level RBAC (Phase 6 — version-scoped; CUD draft-only) ───────
  // The full role×access grid is returned after every mutation, so the editor
  // stays server-authoritative. A blank access on setFieldPermission deletes
  // the grant (revert to permissive default); the editor uses the explicit
  // DELETE when a row is reset to default.
  listFieldPermissions(
    id: string,
    v: number,
    formFieldId: string,
  ): Promise<any> {
    return this.get(FORM_BUILDER.fieldPerms(id, v, formFieldId));
  }
  setFieldPermission(
    id: string,
    v: number,
    formFieldId: string,
    body: { roleId: string; access: '' | 'none' | 'read' | 'write' },
  ): Promise<any> {
    return this.post(FORM_BUILDER.fieldPerms(id, v, formFieldId), body);
  }
  deleteFieldPermission(
    id: string,
    v: number,
    formFieldId: string,
    roleId: string,
  ): Promise<any> {
    return this.del(`${FORM_BUILDER.fieldPerms(id, v, formFieldId)}/${roleId}`);
  }

  // ── Prompt library (palette source — read only) ───────────────────────
  listPrompts(datasourceId: string, search = ''): Promise<any> {
    const params: Record<string, any> = { datasourceId, page: 1, pageSize: 500 };
    if (search) params['filter'] = JSON.stringify({ name: search });
    return lastValueFrom(
      this.http.apiGet(PROMPT.LIST, { params, skipLoader: true }),
    );
  }
}
