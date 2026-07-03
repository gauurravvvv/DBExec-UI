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
 * AddDbRoleComponent — full-page create for a group role (canLogin ===
 * false). From-scratch / from-template / clone modes with attribute
 * toggles. Datasource carried by ?ds=. Saves directly (no SQL shown).
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
  createMode: 'scratch' | 'template' | 'clone' = 'scratch';
  templates: any[] = [];
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
    this.roleForm = this.fb.group({
      name: ['', [Validators.required, Validators.pattern(/^[A-Za-z_][A-Za-z0-9_$]*$/)]],
      inherit: [true],
      createdb: [false],
      createrole: [false],
      templateId: [null],
      cloneFrom: [null],
    });
    this.dbAccess
      .loadRoles(this.datasourceId)
      .then(() => {
        this.allRoleOptions = (this.dbAccess.roles() ?? []).map(r => ({ label: r.name, value: r.name }));
        this.cdr.markForCheck();
      })
      .catch(() => {});
    this.dbAccess
      .loadTemplates()
      .then(() => {
        this.templates = this.dbAccess.templates() ?? [];
        this.cdr.markForCheck();
      })
      .catch(() => {});
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

  setMode(mode: 'scratch' | 'template' | 'clone'): void {
    this.createMode = mode;
  }

  onSubmit(): void {
    if (this.roleForm.invalid) return;
    const v = this.roleForm.getRawValue();
    const attributes: any = {
      login: false,
      inherit: v.inherit,
      createdb: v.createdb,
      createrole: v.createrole,
    };
    const body: any = { name: v.name, attributes };
    if (this.createMode === 'template' && v.templateId) body.templateId = v.templateId;
    if (this.createMode === 'clone' && v.cloneFrom) body.cloneFrom = v.cloneFrom;

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
