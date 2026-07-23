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

  // Default the "Can log in" toggle from ?login= (list passes '0' for the
  // Group filter, '1'/absent otherwise). Login is the common default.
  private defaultCanLogin = true;

  ngOnInit(): void {
    // Datasource is chosen INSIDE the form (via <app-datasource-picker>), by
    // the user — nothing pre-selected, no ?ds= / ?login= route params. The
    // form body stays hidden until a datasource is picked.
    this.datasourceId = '';
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
    const changed = next !== this.datasourceId;
    this.datasourceId = next;

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
    if (next) this.loadCloneOptions(next);
    this.cdr.markForCheck();
  }

  private loadCloneOptions(datasourceId: string): void {
    this.dbAccess
      .loadRoles(datasourceId)
      .then(() => {
        this.allRoleOptions = (this.dbAccess.roles() ?? []).map(r => ({
          label: r.name,
          value: r.name,
        }));
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

  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes = this.buildAttributes(!!v.canLogin);
    const needsSuperuserConfirm = !!(
      attributes.superuser || attributes.bypassrls
    );

    const body: any = { name: v.name, attributes };
    if (this.createMode === 'clone' && v.cloneFrom)
      body.cloneFrom = v.cloneFrom;
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
    // Datasource is carried by the shared context (not the URL).
    this.router.navigate([DB_ACCESS.ROLES_LIST]);
  }
}
