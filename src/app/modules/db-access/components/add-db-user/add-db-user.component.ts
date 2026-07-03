import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { DbAccessService } from '../../services/db-access.service';
import { ChangeIntent, describeChange } from '../../services/describe-change';

/**
 * AddDbUserComponent — full-page create screen for a login role (a DB
 * "user"). Mirrors add-datasource's shell: page-header (back + title +
 * cancel/save) and a vertical .form-grid, one field per row. Attribute
 * flags are toggles, connection limit a number, expiry a calendar.
 *
 * Attach-to-app happens via TWO multiselects (app users + app groups)
 * populated from UserService / GroupService — no free-text id. Each
 * selected user/group becomes an attachMapping call after the role is
 * created. Every mutation still flows through the plain-language
 * change-summary confirm gate (never SQL).
 */
@Component({
  selector: 'app-add-db-user',
  templateUrl: './add-db-user.component.html',
  styleUrls: ['./add-db-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddDbUserComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  userForm!: FormGroup;
  saving = this.dbAccess.saving;

  // App user / group pickers (id + label options).
  appUserOptions: { label: string; value: string }[] = [];
  appGroupOptions: { label: string; value: string }[] = [];

  // ── Change-summary confirm gate (plain-language, never SQL) ───────────
  showPreview = false;
  previewLoading = false;
  summaries: string[] = [];
  previewDestructive = false;
  previewTitle = '';
  confirmPhrase: string | null = null;
  private pendingExecute: (() => Promise<any>) | null = null;

  constructor(
    private dbAccess: DbAccessService,
    private userService: UserService,
    private groupService: GroupService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId = this.route.snapshot.paramMap.get('datasourceId') ?? '';
    this.buildForm();
    this.loadAppEntities();
  }

  ngOnDestroy(): void {
    this.userService.cancelReads?.();
    this.groupService.cancelReads?.();
  }

  private buildForm(): void {
    this.userForm = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)],
      ],
      password: [''],
      connectionLimit: [null],
      validUntil: [null],
      inherit: [true],
      createdb: [false],
      createrole: [false],
      replication: [false],
      superuser: [false],
      bypassrls: [false],
      // Attach — arrays of app user ids / group ids.
      appUserIds: [[]],
      appGroupIds: [[]],
    });
  }

  private loadAppEntities(): void {
    this.userService
      .listUser({ page: 1, limit: 1000 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const users = res?.data?.users ?? [];
          this.appUserOptions = users.map((u: any) => ({
            value: u.id,
            label: this.userLabel(u),
          }));
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());

    this.groupService
      .listGroups({ page: 1, limit: 1000 })
      .then((res: any) => {
        if (this.globalService.handleSuccessService(res, false)) {
          const groups = res?.data?.groups ?? [];
          this.appGroupOptions = groups.map((g: any) => ({
            value: g.id,
            label: g.name,
          }));
        }
        this.cdr.markForCheck();
      })
      .catch(() => this.cdr.markForCheck());
  }

  private userLabel(u: any): string {
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return full || u.username || u.email || u.id;
  }

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (control?.errors?.['required'])
      return this.translate.instant('COMMON.REQUIRED');
    if (control?.errors?.['pattern'])
      return this.translate.instant('DB_ACCESS.ROLE_NAME_INVALID');
    return '';
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

  /** Selected users + groups → { appUserId | appGroupId, mappingType }[]. */
  private buildAttachMappings(): any[] {
    const v = this.userForm.getRawValue();
    const mappings: any[] = [];
    (v.appUserIds ?? []).forEach((id: string) =>
      mappings.push({ appUserId: id, mappingType: 'user' }),
    );
    (v.appGroupIds ?? []).forEach((id: string) =>
      mappings.push({ appGroupId: id, mappingType: 'group' }),
    );
    return mappings;
  }

  onSubmit(): void {
    if (this.userForm.invalid) return;
    const v = this.userForm.getRawValue();
    const attributes = this.buildAttributes();
    const attachMappings = this.buildAttachMappings();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    const body: any = { name: v.name, attributes };
    // Pass the first mapping inline for describeChange + createRole; the
    // rest (and the create-time attach) are wired via the mappings endpoint
    // after the role exists.
    if (attachMappings.length) body.attachMapping = attachMappings[0];

    this.previewTitle = this.translate.instant('DB_ACCESS.PREVIEW_CREATE_USER');
    this.previewDestructive = needsSuperuserConfirm;
    this.confirmPhrase = null;

    const intent: ChangeIntent = {
      kind: 'createRole',
      name: v.name,
      attributes,
      attachMapping: attachMappings[0],
    };

    this.runPreviewAndArm(
      [intent],
      () =>
        this.dbAccess.createRole(this.datasourceId, {
          ...body,
          previewOnly: true,
        }),
      async () => {
        const res = await this.dbAccess.createRole(this.datasourceId, {
          ...body,
          confirm: needsSuperuserConfirm ? true : undefined,
        });
        // After the role exists, attach every selected app user / group.
        if (res?.status) await this.attachAll(v.name, attachMappings);
        return res;
      },
    );
  }

  private async attachAll(roleName: string, mappings: any[]): Promise<void> {
    for (const m of mappings) {
      try {
        await this.dbAccess.attachMapping(this.datasourceId, {
          ...m,
          dbRoleName: roleName,
        });
      } catch {
        // Non-fatal — the role was created; a failed mapping is surfaced
        // by the global error handler on its own call.
      }
    }
  }

  onCancel(): void {
    this.userForm.markAsPristine();
    this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
  }

  // ── Shared confirm flow (plain-language summary; never SQL) ────────────

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
