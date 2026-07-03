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

/**
 * AddDbUserComponent — full-page create screen for a login role (a DB
 * "user"). Mirrors add-datasource's shell: page-header (back + title +
 * cancel/save) and a vertical .form-grid, one field per row. Attribute
 * flags are toggles, connection limit a number, expiry a calendar.
 *
 * Attach-to-app happens via TWO multiselects (app users + app groups)
 * populated from UserService / GroupService — no free-text id. Each
 * selected user/group becomes an attachMapping call after the role is
 * created. The primary button saves directly (NO SQL is ever shown).
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

  /**
   * Create the user directly (no SQL-preview dialog — per UX the primary
   * button is a plain Create). SUPERUSER / BYPASSRLS still pass confirm:true
   * to the BE silently. Selected app users / groups are attached after the
   * role exists.
   */
  onSubmit(): void {
    if (this.userForm.invalid) return;
    const v = this.userForm.getRawValue();
    const attributes = this.buildAttributes();
    const attachMappings = this.buildAttachMappings();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    const body: any = { name: v.name, attributes };
    if (attachMappings.length) body.attachMapping = attachMappings[0];
    if (needsSuperuserConfirm) body.confirm = true;

    this.dbAccess
      .createRole(this.datasourceId, body)
      .then(async res => {
        if (this.globalService.handleSuccessService(res)) {
          if (res?.status) await this.attachAll(v.name, attachMappings);
          this.userForm.markAsPristine();
          this.router.navigate([DB_ACCESS.workspace(this.datasourceId)]);
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
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
}
