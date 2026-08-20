import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * EditDbRoleComponent — full-page edit for a PostgreSQL role (login user or
 * group role). Loads by name, pins the name read-only. A role's login-type
 * is intrinsic, so `canLogin` is derived from the loaded row (a "Can log in"
 * toggle lets you promote a group role to a login user / demote a user).
 * When login is on, the credential + login-only attribute fields are
 * editable. Datasource carried by ?ds=. Saves directly.
 */
@Component({
  selector: 'app-edit-db-role',
  templateUrl: './edit-db-role.component.html',
  styleUrls: ['./edit-db-role.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDbRoleComponent implements OnInit, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  connectorId = '';
  roleName = '';
  loadingRole = true;
  roleForm!: FormGroup;
  saving = this.dbAccess.saving;

  // ── Change-summary / Review-SQL confirm gate (BUG-01) ───────────────────
  // Save routes through the shared read-only SQL-preview dialog: PUT with
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
  private pendingExecute: ((confirmPhrase: string) => Promise<any>) | null =
    null;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    // Datasource comes from the shared context (never the URL). A cold
    // deep-link with no context falls through to the redirect below.
    this.connectorId = this.ctx.connectorId() || '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    if (!this.connectorId) {
      this.router.navigate([DB_ACCESS.ROLES_LIST]);
      return;
    }
    this.ctx.setDatasource(this.connectorId);
    this.roleForm = this.fb.group({
      name: [{ value: '', disabled: true }],
      canLogin: [false],
      password: [''],
      connectionLimit: [null],
      validUntil: [null],
      inherit: [true],
      createdb: [false],
      createrole: [false],
      replication: [false],
      superuser: [false],
      bypassrls: [false],
    });
    this.loadRole();
  }

  get canLogin(): boolean {
    return !!this.roleForm?.get('canLogin')?.value;
  }

  private loadRole(): void {
    this.dbAccess
      .loadRoles(this.connectorId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        const role = all.find(r => r.name === this.roleName);
        if (!role) {
          this.goBack();
          return;
        }
        const a = role.attributes ?? role;
        const login = !!(role.canLogin || a.login);
        this.roleForm.reset({
          name: role.name,
          canLogin: login,
          password: '',
          connectionLimit: a.connectionLimit ?? null,
          validUntil: a.validUntil ? new Date(a.validUntil) : null,
          inherit: a.inherit !== false,
          createdb: !!a.createdb,
          createrole: !!a.createrole,
          replication: !!a.replication,
          superuser: !!a.superuser,
          bypassrls: !!a.bypassrls,
        });
        this.roleForm.get('name')?.disable();
      })
      .catch(() => this.goBack())
      .finally(() => {
        this.loadingRole = false;
        this.cdr.markForCheck();
      });
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  private buildAttributes(): any {
    const v = this.roleForm.getRawValue();
    const login = !!v.canLogin;
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
   * Save (BUG-01): NEVER execute the alter in one click. First fetch the
   * read-only SQL preview (previewOnly:true), open the shared Review-SQL
   * dialog with the BE-built SQL + danger badges, and only execute after the
   * user confirms — critical attributes (SUPERUSER / BYPASSRLS) force a
   * typed-phrase confirm that the BE re-checks server-side.
   */
  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const attributes = this.buildAttributes();

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_ALTER_ROLE', {
      name: this.roleName,
    });
    this.previewDestructive = false;
    this.confirmPhrase = null;

    const intent: ChangeIntent = {
      kind: 'alterRole',
      name: this.roleName,
      attributes,
    };

    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.updateRole(this.connectorId, this.roleName, {
          attributes,
          previewOnly: true,
        }),
      confirmPhrase =>
        this.dbAccess.updateRole(this.connectorId, this.roleName, {
          attributes,
          confirmPhrase,
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

  onCancel(): void {
    this.roleForm.markAsPristine();
    this.goBack();
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.ROLES_LIST]);
  }
}
