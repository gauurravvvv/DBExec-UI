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

  datasourceId = '';
  roleName = '';
  loadingRole = true;
  roleForm!: FormGroup;
  saving = this.dbAccess.saving;

  constructor(
    private dbAccess: DbAccessService,
    private ctx: DbAccessContextService,
    private globalService: GlobalService,
    private translate: TranslateService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.datasourceId =
      this.route.snapshot.queryParamMap.get('ds') || this.ctx.datasourceId() || '';
    this.roleName = this.route.snapshot.paramMap.get('roleName') ?? '';
    if (!this.datasourceId) {
      this.router.navigate([DB_ACCESS.ROLES_LIST]);
      return;
    }
    this.ctx.setDatasource(this.datasourceId);
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
      .loadRoles(this.datasourceId)
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
      if (v.validUntil) attributes.validUntil = new Date(v.validUntil).toISOString();
      if (v.password) attributes.password = v.password;
    }
    return attributes;
  }

  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const attributes = this.buildAttributes();
    const needsSuperuserConfirm = !!(attributes.superuser || attributes.bypassrls);

    this.dbAccess
      .updateRole(this.datasourceId, this.roleName, {
        attributes,
        confirm: needsSuperuserConfirm ? true : undefined,
      })
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.roleForm.markAsPristine();
          this.goBack();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  onCancel(): void {
    this.roleForm.markAsPristine();
    this.goBack();
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.ROLES_LIST], { queryParams: { ds: this.datasourceId } });
  }
}
