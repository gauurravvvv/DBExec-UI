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
 * DbRolesComponent — group roles (canLogin === false). List with member
 * count + memberOf. Create from scratch / from template / by cloning an
 * existing role, edit, delete-wizard. A membership section attaches or
 * detaches role↔role (single or bulk). Every mutation flows through the
 * shared SQL-preview → confirm gate.
 */
@Component({
  selector: 'app-db-roles',
  templateUrl: './db-roles.component.html',
  styleUrls: ['./db-roles.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DbRolesComponent implements OnInit {
  @Input() datasourceId = '';
  @Input() canManage = false;

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  loading = this.dbAccess.loading;
  saving = this.dbAccess.saving;

  roles: any[] = [];
  templates: any[] = [];

  // ── Create / edit dialog ──────────────────────────────────────────────
  showForm = false;
  editing = false;
  editingName = '';
  roleForm!: FormGroup;
  createMode: 'scratch' | 'template' | 'clone' = 'scratch';

  // ── Membership dialog ─────────────────────────────────────────────────
  showMembership = false;
  membershipMode: 'attach' | 'detach' = 'attach';
  membershipRoles: string[] = []; // member role(s) — supports bulk
  membershipTarget = '';
  membershipAdminOption = false;

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
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)]],
      inherit: [true],
      createdb: [false],
      createrole: [false],
      templateId: [null],
      cloneFrom: [null],
    });
    this.load();
    this.dbAccess.loadTemplates().then(() => {
      this.templates = this.dbAccess.templates() ?? [];
      this.cdr.markForCheck();
    }).catch(() => {});
  }

  load(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        this.roles = all.filter(r => !(r.canLogin || r.attributes?.login));
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  get allRoleNames(): string[] {
    return (this.dbAccess.roles() ?? []).map(r => r.name);
  }

  memberCount(role: any): number {
    return role.memberCount ?? role.members?.length ?? 0;
  }

  // ── Create / edit ──────────────────────────────────────────────────────

  openCreate(): void {
    this.editing = false;
    this.editingName = '';
    this.createMode = 'scratch';
    this.roleForm.reset({ inherit: true });
    this.roleForm.get('name')?.enable();
    this.showForm = true;
  }

  openEdit(role: any): void {
    this.editing = true;
    this.editingName = role.name;
    const a = role.attributes ?? role;
    this.roleForm.reset({
      name: role.name,
      inherit: a.inherit !== false,
      createdb: !!a.createdb,
      createrole: !!a.createrole,
      templateId: null,
      cloneFrom: null,
    });
    this.roleForm.get('name')?.disable();
    this.showForm = true;
  }

  cancelForm(): void {
    this.showForm = false;
  }

  submitForm(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes: any = {
      login: false,
      inherit: v.inherit,
      createdb: v.createdb,
      createrole: v.createrole,
    };

    this.confirmPhrase = null;

    if (this.editing) {
      this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_ALTER_ROLE');
      this.previewDestructive = false;
      const intent: ChangeIntent = { kind: 'alterRole', name: this.editingName, attributes };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.updateRole(this.datasourceId, this.editingName, { attributes, previewOnly: true }),
        () => this.dbAccess.updateRole(this.datasourceId, this.editingName, { attributes }),
      );
      return;
    }

    const body: any = { name: v.name, attributes };
    if (this.createMode === 'template' && v.templateId) body.templateId = v.templateId;
    if (this.createMode === 'clone' && v.cloneFrom) body.cloneFrom = v.cloneFrom;

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_CREATE_ROLE');
    this.previewDestructive = false;
    const intent: ChangeIntent = { kind: 'createRole', name: v.name, attributes };
    this.runPreviewAndArm(
      [intent],
      () => this.dbAccess.createRole(this.datasourceId, { ...body, previewOnly: true }),
      () => this.dbAccess.createRole(this.datasourceId, body),
    );
  }

  // ── Membership ───────────────────────────────────────────────────────────

  openMembership(mode: 'attach' | 'detach', role?: any): void {
    this.membershipMode = mode;
    this.membershipRoles = role ? [role.name] : [];
    this.membershipTarget = '';
    this.membershipAdminOption = false;
    this.showMembership = true;
  }

  submitMembership(): void {
    if (!this.membershipRoles.length || !this.membershipTarget) return;
    const roleArg = this.membershipRoles.length === 1 ? this.membershipRoles[0] : this.membershipRoles;

    this.confirmPhrase = null;

    if (this.membershipMode === 'attach') {
      const body: any = { role: roleArg, toRole: this.membershipTarget, adminOption: this.membershipAdminOption };
      this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_GRANT_MEMBERSHIP');
      this.previewDestructive = false;
      this.showMembership = false;
      const intent: ChangeIntent = { kind: 'grantMembership', role: roleArg, toRole: this.membershipTarget };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.attachRole(this.datasourceId, { ...body, previewOnly: true }),
        () => this.dbAccess.attachRole(this.datasourceId, body),
      );
    } else {
      const body: any = { role: roleArg, toRole: this.membershipTarget, confirm: true };
      this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_REVOKE_MEMBERSHIP');
      this.previewDestructive = true;
      this.showMembership = false;
      const intent: ChangeIntent = { kind: 'revokeMembership', role: roleArg, toRole: this.membershipTarget };
      this.runPreviewAndArm(
        [intent],
        () => this.dbAccess.detachRole(this.datasourceId, { ...body, previewOnly: true }),
        () => this.dbAccess.detachRole(this.datasourceId, body),
      );
    }
  }

  cancelMembership(): void {
    this.showMembership = false;
  }

  // ── Delete wizard ──────────────────────────────────────────────────────

  openDelete(role: any): void {
    this.deleteTarget = role;
    this.deleteMode = 'reassign';
    this.reassignTo = '';
    this.ownedSummary = null;
    this.showDelete = true;
    this.ownedLoading = true;
    this.cdr.markForCheck();
    this.dbAccess
      .loadOwned(this.datasourceId, role.name)
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

  get ownedCount(): number {
    return this.ownedSummary?.count ?? this.ownedSummary?.objects?.length ?? 0;
  }

  proceedDelete(): void {
    if (!this.deleteTarget) return;
    const name = this.deleteTarget.name;
    const base: any = { confirm: true };
    if (this.deleteMode === 'reassign' && this.reassignTo) base.reassignTo = this.reassignTo;
    if (this.deleteMode === 'drop') base.dropOwned = true;

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_DELETE_ROLE');
    this.previewDestructive = true;
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

  // ── Shared confirm flow (plain-language summary; never SQL) ────────────

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
