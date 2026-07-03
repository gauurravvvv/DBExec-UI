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
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * EditDbUserComponent — full-page edit screen for a login role. Loads the
 * role by name (from the roles list), pins the name read-only (rename is a
 * separate op), and lets the admin alter attributes / password / limit /
 * expiry. Attach-to-app lives only on the create screen and Mappings tab.
 * Alter flows through the plain-language confirm gate (never SQL).
 */
@Component({
  selector: 'app-edit-db-user',
  templateUrl: './edit-db-user.component.html',
  styleUrls: ['./edit-db-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDbUserComponent implements OnInit, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  roleName = '';
  loadingRole = true;
  userForm!: FormGroup;
  saving = this.dbAccess.saving;

  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

  constructor(
    private dbAccess: DbAccessService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    this.buildForm();
    this.loadRole();
  }

  private buildForm(): void {
    this.userForm = this.fb.group({
      name: [{ value: '', disabled: true }],
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
  }

  private loadRole(): void {
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        const all = this.dbAccess.roles() ?? [];
        const user = all.find(r => r.name === this.roleName);
        if (!user) {
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
          return;
        }
        const a = user.attributes ?? user;
        this.userForm.reset({
          name: user.name,
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
        this.userForm.get('name')?.disable();
      })
      .catch(() => this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]))
      .finally(() => {
        this.loadingRole = false;
        this.cdr.markForCheck();
      });
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
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

  onSubmit(): void {
    if (this.userForm.invalid) return;
    const attributes = this.buildAttributes();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_ALTER_USER');
    this.previewDestructive = needsSuperuserConfirm;
    this.confirmPhrase = null;

    const intent: ChangeIntent = {
      kind: 'alterRole',
      name: this.roleName,
      attributes,
    };
    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.updateRole(this.datasourceId, this.roleName, {
          attributes,
          previewOnly: true,
        }),
      () =>
        this.dbAccess.updateRole(this.datasourceId, this.roleName, {
          attributes,
          confirm: needsSuperuserConfirm ? true : undefined,
        }),
    );
  }

  onCancel(): void {
    this.userForm.markAsPristine();
    this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
  }

  private runPreviewAndArm(
    intents: ChangeIntent[],
    preview: () => Promise<any>,
    execute: () => Promise<any>,
  ): void {
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
          this.userForm.markAsPristine();
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
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
