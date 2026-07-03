import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * DbUsersComponent — login roles (canLogin === true). List with status
 * pill (active / no-login / expired), expiry, connection limit, attribute
 * flag chips, and member-of. Create/edit via the confirmation-popup
 * attribute form (with optional attach-to-app-user/group), deactivate,
 * and a delete-wizard that surfaces owned-object counts + reassign-vs-drop
 * choice before the SQL-preview → confirm gate.
 */
@Component({
  selector: 'app-db-users',
  templateUrl: './db-users.component.html',
  styleUrls: ['./db-users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbUsersComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  users: any[] = [];

  // ── Create / edit dialog ──────────────────────────────────────────────
  showForm = false;
  editing = false;
  editingName = '';
  userForm!: FormGroup;

  // ── Change-summary confirm gate (plain-language, never SQL) ───────────
  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

  // ── Delete wizard ─────────────────────────────────────────────────────
  showDelete = false;
  deleteTarget: any = null;
  ownedLoading = false;
  ownedSummary: any = null;
  deleteMode: 'reassign' | 'drop' = 'reassign';
  reassignTo = '';

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.load();
  }

  private buildForm(): void {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)]],
      password: [''],
      connectionLimit: [null],
      validUntil: [null],
      superuser: [false],
      createdb: [false],
      createrole: [false],
      replication: [false],
      bypassrls: [false],
      inherit: [true],
      // optional attach to app user/group
      attachType: [null], // 'user' | 'group' | null
      attachId: [''],
    });
  }

  load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.users = all.filter(r => r.canLogin || r.attributes?.login);
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get groupRoleNames(): string[] {
    return (this.dbAccess.roles() ?? [])
      .filter(r => !(r.canLogin || r.attributes?.login))
      .map(r => r.name);
  }

  flagsOf(user: any): string[] {
    const a = user.attributes ?? user;
    const flags: string[] = [];
    if (a.superuser) flags.push('SUPERUSER');
    if (a.createdb) flags.push('CREATEDB');
    if (a.createrole) flags.push('CREATEROLE');
    if (a.replication) flags.push('REPLICATION');
    if (a.bypassrls) flags.push('BYPASSRLS');
    return flags;
  }

  statusOf(user: any): 'active' | 'no-login' | 'expired' {
    const a = user.attributes ?? user;
    if (!(user.canLogin || a.login)) return 'no-login';
    const validUntil = a.validUntil ?? user.validUntil;
    if (validUntil && new Date(validUntil).getTime() < Date.now()) return 'expired';
    return 'active';
  }

  // ── Create / edit ──────────────────────────────────────────────────────

  openCreate(): void {
    this.editing = false;
    this.editingName = '';
    this.userForm.reset({ inherit: true });
    this.userForm.get('name')?.enable();
    this.showForm = true;
  }

  openEdit(user: any): void {
    this.editing = true;
    this.editingName = user.name;
    const a = user.attributes ?? user;
    this.userForm.reset({
      name: user.name,
      password: '',
      connectionLimit: a.connectionLimit ?? null,
      validUntil: a.validUntil ? new Date(a.validUntil) : null,
      superuser: !!a.superuser,
      createdb: !!a.createdb,
      createrole: !!a.createrole,
      replication: !!a.replication,
      bypassrls: !!a.bypassrls,
      inherit: a.inherit !== false,
      attachType: null,
      attachId: '',
    });
    // Name is immutable in-place; renaming is a separate operation.
    this.userForm.get('name')?.disable();
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
  }

  private buildAttributes(): any {
    const v = this.userForm.getRawValue();
    const attributes: any = {
      login: true,
      superuser: v.superuser,
      createdb: v.createdb,
      createrole: v.createrole,
      replication: v.replication,
      bypassrls: v.bypassrls,
      inherit: v.inherit,
    };
    if (v.connectionLimit !== null && v.connectionLimit !== undefined)
      attributes.connectionLimit = v.connectionLimit;
    if (v.validUntil)
      attributes.validUntil = new Date(v.validUntil).toISOString();
    if (v.password) attributes.password = v.password;
    return attributes;
  }

  private buildAttachMapping(): any {
    const v = this.userForm.getRawValue();
    if (!v.attachType || !v.attachId) return undefined;
    return v.attachType === 'group'
      ? { appGroupId: v.attachId, mappingType: 'group' }
      : { appUserId: v.attachId, mappingType: 'user' };
  }

  submitForm(): void {
    if (this.userForm.invalid) return;
    const v = this.userForm.getRawValue();
    const attributes = this.buildAttributes();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    this.previewTitle = this.editing
      ? this.translate.instant('DB_ACCESS.PREVIEW_ALTER_USER')
      : this.translate.instant('DB_ACCESS.PREVIEW_CREATE_USER');
    this.previewDestructive = needsSuperuserConfirm;
    this.confirmPhrase = null;

    if (this.editing) {
      const intent: ChangeIntent = { kind: 'alterRole', name: this.editingName, attributes };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.updateRole(this.datasourceId, this.editingName, {
          attributes,
          previewOnly: true,
        }),
        () => this.dbAccess.updateRole(this.datasourceId, this.editingName, {
          attributes,
          confirm: needsSuperuserConfirm ? true : undefined,
        }),
      );
    } else {
      const body: any = { name: v.name, attributes };
      const attach = this.buildAttachMapping();
      if (attach) body.attachMapping = attach;
      const intent: ChangeIntent = { kind: 'createRole', name: v.name, attributes, attachMapping: attach };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.createRole(this.datasourceId, { ...body, previewOnly: true }),
        () => this.dbAccess.createRole(this.datasourceId, {
          ...body,
          confirm: needsSuperuserConfirm ? true : undefined,
        }),
      );
    }
  }

  // ── Deactivate ───────────────────────────────────────────────────────────

  deactivate(user: any): void {
    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DEACTIVATE');
    this.previewDestructive = false;
    this.confirmPhrase = null;
    const body = { attributes: { login: false } };
    const intent: ChangeIntent = { kind: 'deactivate', name: user.name };
    this.runPreviewAndArm(
      [intent],
      () => this.dbAccess.updateRole(this.datasourceId, user.name, { ...body, previewOnly: true }),
      () => this.dbAccess.updateRole(this.datasourceId, user.name, body),
    );
  }

  // ── Delete wizard ──────────────────────────────────────────────────────

  openDelete(user: any): void {
    this.deleteTarget = user;
    this.deleteMode = 'reassign';
    this.reassignTo = '';
    this.ownedSummary = null;
    this.showDelete = true;
    this.ownedLoading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadOwned(this.datasourceId, user.name)
      .then(res => {
        if (res?.status) this.ownedSummary = res.data;
      })
      .catch(() => {})
      .finally(() => {
        this.ownedLoading = false;
        this.cdr.markForCheck();
      });
  }

  cancelDelete(): void {
    this.showDelete = false;
    this.deleteTarget = null;
  }

  proceedDelete(): void {
    if (!this.deleteTarget) return;
    const name = this.deleteTarget.name;
    const base: any = { confirm: true };
    if (this.deleteMode === 'reassign' && this.reassignTo) base.reassignTo = this.reassignTo;
    if (this.deleteMode === 'drop') base.dropOwned = true;

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DELETE_USER');
    this.previewDestructive = true;
    // Dropping a login role is high-impact — require typing its name.
    this.confirmPhrase = name;
    this.showDelete = false;
    const intent: ChangeIntent = {
      kind: 'deleteRole',
      name,
      reassignTo: this.deleteMode === 'reassign' ? this.reassignTo : undefined,
      dropOwned: this.deleteMode === 'drop',
    };
    this.runPreviewAndArm(
      [intent],
      () => this.dbAccess.deleteRole(this.datasourceId, name, { ...base, previewOnly: true }),
      () => this.dbAccess.deleteRole(this.datasourceId, name, base),
    );
  }

  get ownedCount(): number {
    return this.ownedSummary?.count ?? this.ownedSummary?.objects?.length ?? 0;
  }

  // ── Shared confirm flow ─────────────────────────────────────────────────
  //
  // Builds the plain-language summary FE-side from the structured intent
  // (describeChange). The backend previewOnly call still runs to validate /
  // dry-run, but its returned SQL is NEVER surfaced — only success is used.

  private runPreviewAndArm(
    intents: ChangeIntent[],
    preview: () => Promise<any>,
    execute: () => Promise<any>,
  ): void {
    this.showForm = false;
    this.showPreview = true;
    this.previewLoading = true;
    this.summaries = intents.map(i => describeChange(i, this.translate));
    this.pendingExecute = execute;
    this.cdr.markForCheck();

    preview()
      .then(res => {
        // Only surface validation success/failure — never the masked SQL.
        if (!res?.status) {
          this.globalService.handleSuccessService(res);
          this.showPreview = false;
        }
      })
      .catch(() => {
        this.showPreview = false;
      })
      .finally(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      });
  }

  confirmPreview(): void {
    if (!this.pendingExecute) return;
    this.pendingExecute()
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.showPreview = false;
          this.load();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  cancelPreview(): void {
    this.showPreview = false;
    this.pendingExecute = null;
  }
}
