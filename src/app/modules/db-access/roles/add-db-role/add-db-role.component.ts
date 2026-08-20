import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { DbTemplateService } from '../../services/db-template.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * AddDbRoleComponent — full-page create for a PostgreSQL role.
 *
 * A "user" and a "role" are the same pg_roles object; they differ only by
 * canLogin. This one form creates both: a "Can log in" toggle switches
 * between a login user (reveals password / connection-limit / expiry /
 * login-only attributes) and a group role (attributes only). From-scratch /
 * clone modes remain. The datasource is chosen inside the form (nothing is
 * carried in the URL). Saves directly (no SQL shown).
 */
@Component({
  selector: 'app-add-db-role',
  templateUrl: './add-db-role.component.html',
  styleUrls: ['./add-db-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddDbRoleComponent implements OnInit, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  connectorId = '';
  roleForm!: FormGroup;
  createMode: 'scratch' | 'clone' = 'scratch';
  allRoleOptions: { label: string; value: string }[] = [];
  saving = this.dbAccess.saving;

  // Template apply (PDM D10) — pick a recipe to prefill attributes. The
  // template's privilege RULES are surfaced as an info hint (the concrete
  // grants are composed in the Privileges screen after the role exists).
  templateOptions: { label: string; value: string; raw: any }[] = [];
  selectedTemplateId: string | null = null;
  appliedTemplateName = '';

  // Clone: also copy the source role's object grants (PDM D1). When on,
  // after the new role is created we fetch the source's direct grants and
  // apply them as a change-set to the new role.
  copyPrivileges = false;
  cloningPrivileges = false;

  // ── Change-summary / Review-SQL confirm gate (BUG-01) ───────────────────
  // Save routes through the shared read-only SQL-preview dialog: POST with
  // previewOnly:true → open <app-change-summary-dialog> with the BE-built SQL
  // + danger badges → on confirm, execute with the typed phrase threaded in.
  // NO SQL is ever composed on the FE.
  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewStatements: any[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  // Execute takes the typed confirm phrase (empty when not a critical op) so
  // the BE can re-check it server-side.
  private pendingExecute: ((confirmPhrase: string) => Promise<any>) | null =
    null;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private templates: DbTemplateService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  // Default the "Can log in" toggle from ?login= (list passes '0' for the
  // Group filter, '1'/absent otherwise). Login is the common default.
  private defaultCanLogin = true;

  ngOnInit(): void {
    // Datasource is chosen INSIDE the form (via <app-datasource-picker>), by
    // the user — nothing pre-selected, no ?ds= / ?login= route params. The
    // form body stays hidden until a datasource is picked.
    this.connectorId = '';
    this.roleForm = this.buildForm();
    // Password is required ONLY for a login user. Keep its validator in sync
    // with the Can-log-in toggle (and apply it for the initial default).
    this.syncPasswordValidator(this.defaultCanLogin);
    this.roleForm
      .get('canLogin')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((login: boolean) => this.syncPasswordValidator(login));
    this.initialised = true;
  }

  /** Password required when Can-log-in is ON; cleared (+ reset) when OFF. */
  private syncPasswordValidator(login: boolean): void {
    const pw = this.roleForm.get('password');
    if (!pw) return;
    if (login) {
      pw.setValidators([Validators.required]);
    } else {
      pw.clearValidators();
      pw.setValue('', { emitEvent: false });
    }
    pw.updateValueAndValidity({ emitEvent: false });
  }

  /** True once ngOnInit has run — lets onDatasourceChange skip the reset for
   *  the picker's initial hydration emit (which matches the pre-set ds). */
  private initialised = false;

  private buildForm(): FormGroup {
    return this.fb.group({
      name: [
        '',
        [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)],
      ],
      canLogin: [this.defaultCanLogin],
      // login-only
      password: [''],
      connectionLimit: [null],
      validUntil: [null],
      // attributes shared / login-only
      inherit: [true],
      createdb: [false],
      createrole: [false],
      replication: [false],
      superuser: [false],
      bypassrls: [false],
      cloneFrom: [null],
    });
  }

  /**
   * Datasource chosen / changed inside the form. On a genuine change (not the
   * picker's initial hydration for a pre-set ds) reset ALL fields back to
   * defaults except the datasource itself, keeping the create mode, and
   * reload the clone-source options for the new datasource.
   */
  onDatasourceChange(id: string): void {
    const next = id || '';
    const changed = next !== this.connectorId;
    this.connectorId = next;

    if (changed && this.initialised) {
      // Reset everything except the datasource; keep createMode + the default
      // canLogin/inherit. Clears name/password/limit/expiry/attrs/cloneFrom.
      this.roleForm.reset({
        name: '',
        canLogin: this.defaultCanLogin,
        password: '',
        connectionLimit: null,
        validUntil: null,
        inherit: true,
        createdb: false,
        createrole: false,
        replication: false,
        superuser: false,
        bypassrls: false,
        cloneFrom: null,
      });
      this.roleForm.markAsPristine();
    }

    this.allRoleOptions = [];
    this.templateOptions = [];
    this.selectedTemplateId = null;
    this.appliedTemplateName = '';
    if (next) {
      this.loadCloneOptions(next);
      this.loadTemplates(next);
    }
    this.cdr.markForCheck();
  }

  private loadCloneOptions(connectorId: string): void {
    this.dbAccess
      .loadRoles(connectorId)
      .then(() => {
        this.allRoleOptions = (this.dbAccess.roles() ?? []).map(r => ({
          label: r.name,
          value: r.name,
        }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  /** Load org-wide + datasource-pinned templates for the apply picker. */
  private loadTemplates(connectorId: string): void {
    this.templates
      .list({ connectorId, limit: 200 })
      .then(res => {
        const items = res?.status ? (res.data?.items ?? []) : [];
        this.templateOptions = items.map((t: any) => ({
          label: t.isBuiltIn
            ? `${t.name} (${this.translate.instant('DB_ACCESS.BUILT_IN')})`
            : t.name,
          value: t.id,
          raw: t,
        }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  /**
   * Apply a template: prefill the attribute toggles from its definition.
   * The privilege RULES are informational here (composed later on the
   * Privileges screen against a chosen schema), surfaced via the hint.
   */
  applyTemplate(id: string | null): void {
    this.selectedTemplateId = id;
    const opt = this.templateOptions.find(o => o.value === id);
    if (!opt) {
      this.appliedTemplateName = '';
      return;
    }
    const def = opt.raw?.definition ?? {};
    const a = def.attributes ?? {};
    // Patch ONLY the attributes the template explicitly sets — leave any
    // toggle the user already changed untouched (a template that omits a
    // flag shouldn't silently reset it).
    const patch: Record<string, unknown> = {};
    for (const key of [
      'login',
      'inherit',
      'createdb',
      'createrole',
      'superuser',
      'replication',
      'bypassrls',
    ] as const) {
      if (a[key] !== undefined) {
        const formKey = key === 'login' ? 'canLogin' : key;
        patch[formKey] = a[key];
      }
    }
    this.roleForm.patchValue(patch);
    this.roleForm.markAsDirty();
    this.appliedTemplateName = opt.raw?.name ?? '';
    this.cdr.markForCheck();
  }

  /** Rule-count hint for the applied template (privileges applied later). */
  get appliedTemplateRuleCount(): number {
    const opt = this.templateOptions.find(o => o.value === this.selectedTemplateId);
    return opt?.raw?.definition?.rules?.length ?? 0;
  }

  get canLogin(): boolean {
    return !!this.roleForm?.get('canLogin')?.value;
  }

  /**
   * Save is allowed only when a datasource is chosen, the reactive form is
   * valid, we're not mid-save, AND — in clone mode — a source role is
   * selected. Drives the primary button's disabled state (button-state
   * handling per the shared-component convention).
   */
  get canSave(): boolean {
    if (!this.connectorId || this.saving() || this.roleForm.invalid)
      return false;
    if (this.createMode === 'clone' && !this.roleForm.get('cloneFrom')?.value)
      return false;
    return true;
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.roleForm.get(fieldName);
    if (control?.errors?.['required'])
      return this.translate.instant('COMMON.REQUIRED');
    if (control?.errors?.['pattern'])
      return this.translate.instant('DB_ACCESS.ROLE_NAME_INVALID');
    return '';
  }

  setMode(mode: 'scratch' | 'clone'): void {
    this.createMode = mode;
  }

  private buildAttributes(login: boolean): any {
    const v = this.roleForm.getRawValue();
    const attributes: any = {
      login,
      inherit: v.inherit,
      createdb: v.createdb,
      createrole: v.createrole,
    };
    if (login) {
      attributes.superuser = v.superuser;
      attributes.replication = v.replication;
      attributes.bypassrls = v.bypassrls;
      if (v.connectionLimit !== null && v.connectionLimit !== undefined)
        attributes.connectionLimit = v.connectionLimit;
      if (v.validUntil)
        attributes.validUntil = new Date(v.validUntil).toISOString();
      if (v.password) attributes.password = v.password;
    }
    return attributes;
  }

  /**
   * Save (BUG-01): NEVER execute the create in one click. First fetch the
   * read-only SQL preview (previewOnly:true), open the shared Review-SQL
   * dialog with the BE-built SQL + danger badges, and only execute after the
   * user confirms — critical attributes (SUPERUSER / BYPASSRLS) force a
   * typed-phrase confirm that the BE re-checks server-side.
   */
  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes = this.buildAttributes(!!v.canLogin);

    // Base body sent on BOTH the preview and execute calls (no `confirm`
    // flag / no SQL built here — the BE composes and classifies the SQL).
    const base: any = { name: v.name, attributes };
    if (this.createMode === 'clone' && v.cloneFrom) base.cloneFrom = v.cloneFrom;

    const wantCopy =
      this.createMode === 'clone' && !!v.cloneFrom && this.copyPrivileges;

    this.previewTitle = this.translate.instant(
      v.canLogin ? 'DB_ACCESS.PREVIEW_CREATE_USER' : 'DB_ACCESS.PREVIEW_CREATE_ROLE',
    );
    this.previewDestructive = false;
    this.confirmPhrase = null;

    const intent: ChangeIntent = {
      kind: 'createRole',
      name: v.name,
      attributes,
    };

    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.createRole(this.connectorId, {
          ...base,
          previewOnly: true,
        }),
      confirmPhrase =>
        this.dbAccess
          .createRole(this.connectorId, { ...base, confirmPhrase })
          .then(async res => {
            // On success, optionally copy the source role's object grants onto
            // the new role BEFORE confirmPreview navigates away (best-effort,
            // unchanged behaviour). The success toast fires once in
            // confirmPreview — don't toast here.
            if (res?.status && wantCopy) {
              await this.cloneGrants(v.cloneFrom as string, v.name);
            }
            return res;
          }),
    );
  }

  // ── Shared Review-SQL confirm flow (mirrors list-db-roles) ───────────────
  private runPreviewAndArm(
    intents: ChangeIntent[],
    preview: () => Promise<any>,
    execute: (confirmPhrase: string) => Promise<any>,
  ): void {
    this.showPreview = true;
    this.previewLoading = true;
    // Optimistic plain-language lines; the SQL + danger arrive from preview().
    this.summaries = intents.map(i => describeChange(i, this.translate));
    this.previewStatements = [];
    this.pendingExecute = execute;
    this.cdr.markForCheck();
    preview()
      .then(res => {
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showPreview = false;
          return;
        }
        // Bind the real SQL + danger classification returned by the BE.
        const data = res.data ?? {};
        this.previewStatements = data.statements ?? [];
        if (Array.isArray(data.summary) && data.summary.length) {
          this.summaries = data.summary;
        }
        this.previewDestructive = !!data.isDestructive;
        // A critical change-set (SUPERUSER / BYPASSRLS) carries the exact
        // phrase the user must type; only set it when the BE requires one.
        if (data.requiresTypedConfirm && data.confirmPhrase) {
          this.confirmPhrase = data.confirmPhrase;
        }
      })
      .catch(() => (this.showPreview = false))
      .finally(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmPreview(confirmPhrase: string): void {
    if (!this.pendingExecute) return;
    this.pendingExecute(confirmPhrase)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showPreview = false;
          this.roleForm.markAsPristine();
          this.goBack();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelPreview(): void {
    this.showPreview = false;
    this.pendingExecute = null;
    this.previewStatements = [];
  }

  /**
   * Copy the SOURCE role's direct object grants onto the NEW role (PDM D1).
   * Reads the source grants, groups them into per-(schema,table) GRANT
   * statements, and applies them as one change-set. Best-effort: a failure
   * here doesn't undo the created role (the toast surfaces the error).
   */
  private async cloneGrants(sourceRole: string, newRole: string): Promise<void> {
    this.cloningPrivileges = true;
    this.cdr.markForCheck();
    try {
      const res = await this.dbAccess.loadRoleGrants(
        this.connectorId,
        sourceRole,
      );
      const grants: any[] = res?.status ? (res.data ?? []) : [];
      if (!grants.length) return;

      // Group privileges by schema.table → one GRANT statement each.
      const byObj = new Map<string, { schema: string; table: string; privs: Set<string> }>();
      for (const g of grants) {
        const key = `${g.schema}.${g.table}`;
        let e = byObj.get(key);
        if (!e) {
          e = { schema: g.schema, table: g.table, privs: new Set<string>() };
          byObj.set(key, e);
        }
        e.privs.add(g.privilege);
      }
      const statements = Array.from(byObj.values()).map(e => ({
        kind: 'grant',
        objType: 'TABLE',
        privileges: Array.from(e.privs),
        toRole: newRole,
        object: { parts: [e.schema, e.table] },
      }));
      if (!statements.length) return;

      await this.dbAccess.applyChangeSet(this.connectorId, {
        statements,
        confirm: true,
      });
    } catch {
      /* interceptor toasts the error; role already created */
    } finally {
      this.cloningPrivileges = false;
      this.cdr.markForCheck();
    }
  }

  onCancel(): void {
    this.roleForm.markAsPristine();
    this.goBack();
  }

  goBack(): void {
    // Datasource is carried by the shared context (not the URL).
    this.router.navigate([DB_ACCESS.ROLES_LIST]);
  }
}
