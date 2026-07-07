import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DB_ACCESS } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DbAccessContextService } from '../../services/db-access-context.service';
import { DbAccessService } from '../../services/db-access.service';

/**
 * AddDbRoleComponent — full-page create for a PostgreSQL role.
 *
 * A "user" and a "role" are the same pg_roles object; they differ only by
 * canLogin. This one form creates both: a "Can log in" toggle switches
 * between a login user (reveals password / connection-limit / expiry /
 * login-only attributes) and a group role (attributes only). The toggle
 * defaults from the ?login= query param the list passes based on its active
 * Type filter. From-scratch / clone modes remain. Datasource carried by ?ds=.
 * Saves directly (no SQL shown).
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

  datasourceId = '';
  roleForm!: FormGroup;
  createMode: 'scratch' | 'clone' = 'scratch';
  allRoleOptions: { label: string; value: string }[] = [];
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
    if (!this.datasourceId) {
      this.router.navigate([DB_ACCESS.ROLES_LIST]);
      return;
    }
    this.ctx.setDatasource(this.datasourceId);
    // Default the login toggle from ?login= (list passes '0' for the Group
    // filter, '1'/absent otherwise). Login is the common default.
    const canLogin = this.route.snapshot.queryParamMap.get('login') !== '0';
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)]],
      canLogin: [canLogin],
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
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        this.allRoleOptions = (this.dbAccess.roles() ?? []).map(r => ({ label: r.name, value: r.name }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
  }

  get canLogin(): boolean {
    return !!this.roleForm?.get('canLogin')?.value;
  }

  get isFormDirty(): boolean {
    return this.roleForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.roleForm.get(fieldName);
    if (control?.errors?.['required']) return this.translate.instant('COMMON.REQUIRED');
    if (control?.errors?.['pattern']) return this.translate.instant('DB_ACCESS.ROLE_NAME_INVALID');
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
      if (v.validUntil) attributes.validUntil = new Date(v.validUntil).toISOString();
      if (v.password) attributes.password = v.password;
    }
    return attributes;
  }

  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes = this.buildAttributes(!!v.canLogin);
    const needsSuperuserConfirm = !!(attributes.superuser || attributes.bypassrls);

    const body: any = { name: v.name, attributes };
    if (this.createMode === 'clone' && v.cloneFrom) body.cloneFrom = v.cloneFrom;
    if (needsSuperuserConfirm) body.confirm = true;

    this.dbAccess
      .createRole(this.datasourceId, body)
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
