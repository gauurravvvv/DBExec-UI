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
 * AddDbUserComponent — full-page create screen for a login role (a DB
 * "user"). Mirrors add-datasource's shell: page-header (back + title +
 * Cancel/Create) and a vertical .form-grid, one field per row. The
 * datasource id is carried by the ?ds= query param (shared context). NO
 * SQL is shown — the primary button creates directly.
 *
 * STATELESS: creating a DB user only creates the PostgreSQL role
 * (name + attributes). No app-user/group mapping is persisted.
 */
@Component({
  selector: 'app-add-db-user',
  templateUrl: './add-db-user.component.html',
  styleUrls: ['./add-db-user.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddDbUserComponent implements OnInit, HasUnsavedChanges {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  datasourceId = '';
  userForm!: FormGroup;
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
      this.router.navigate([DB_ACCESS.USERS_LIST]);
      return;
    }
    this.ctx.setDatasource(this.datasourceId);
    this.buildForm();
  }

  private buildForm(): void {
    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)]],
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

  get isFormDirty(): boolean {
    return this.userForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  getErrorMessage(fieldName: string): string {
    const control = this.userForm.get(fieldName);
    if (control?.errors?.['required']) return this.translate.instant('COMMON.REQUIRED');
    if (control?.errors?.['pattern']) return this.translate.instant('DB_ACCESS.ROLE_NAME_INVALID');
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
    if (v.validUntil) attributes.validUntil = new Date(v.validUntil).toISOString();
    if (v.password) attributes.password = v.password;
    return attributes;
  }

  onSubmit(): void {
    if (this.userForm.invalid) return;
    const v = this.userForm.getRawValue();
    const attributes = this.buildAttributes();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    const body: any = { name: v.name, attributes };
    if (needsSuperuserConfirm) body.confirm = true;

    this.dbAccess
      .createRole(this.datasourceId, body)
      .then(res => {
        if (this.globalService.handleSuccessService(res)) {
          this.userForm.markAsPristine();
          this.goBack();
        }
      })
      .catch(() => {})
      .finally(() => this.cdr.markForCheck());
  }

  onCancel(): void {
    this.userForm.markAsPristine();
    this.goBack();
  }

  goBack(): void {
    this.router.navigate([DB_ACCESS.USERS_LIST], { queryParams: { ds: this.datasourceId } });
  }
}
