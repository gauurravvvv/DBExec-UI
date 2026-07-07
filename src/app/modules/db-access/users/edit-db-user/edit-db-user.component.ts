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
 * EditDbUserComponent — full-page edit for a login role. Loads by name,
 * pins the name read-only (rename is a separate op), and edits attributes /
 * password / limit / expiry. Datasource carried by ?ds=. Saves directly.
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
      this.router.navigate([DB_ACCESS.USERS_LIST]);
      return;
    }
    this.ctx.setDatasource(this.datasourceId);
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
          this.goBack();
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
      .catch(() => this.goBack())
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
    if (v.validUntil) attributes.validUntil = new Date(v.validUntil).toISOString();
    if (v.password) attributes.password = v.password;
    return attributes;
  }

  onSubmit(): void {
    if (this.userForm.invalid) return;
    const attributes = this.buildAttributes();
    const needsSuperuserConfirm = attributes.superuser || attributes.bypassrls;

    this.dbAccess
      .updateRole(this.datasourceId, this.roleName, {
        attributes,
        confirm: needsSuperuserConfirm ? true : undefined,
      })
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
