import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { FORM_BUILDER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { FbAdminService } from '../../services/fb-admin.service';

/**
 * Create-form screen: name + datasource + optional description → POST create →
 * redirect straight to the design shell. Modelled on add-query-builder.
 */
@Component({
  selector: 'app-add-form',
  templateUrl: './add-form.component.html',
  styleUrls: ['./add-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddFormComponent implements OnInit, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly global = inject(GlobalService);
  private readonly datasourceService = inject(DatasourceService);
  private readonly translate = inject(TranslateService);
  private readonly admin = inject(FbAdminService);

  readonly saving = this.admin.saving;

  form!: FormGroup;
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  constructor() {
    this.form = this.fb.group({
      datasource: ['', Validators.required],
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(160),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [''],
    });
  }

  get isFormDirty(): boolean {
    return this.form.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.loadDatasources();
  }

  getNameError(): string {
    const c = this.form.get('name');
    if (c?.errors?.['required'])
      return this.translate.instant('FORM_BUILDER.NAME_REQUIRED');
    if (c?.errors?.['minlength'])
      return this.translate.instant('FORM_BUILDER.NAME_MIN', {
        min: c.errors['minlength'].requiredLength,
      });
    if (c?.errors?.['maxlength'])
      return this.translate.instant('FORM_BUILDER.NAME_MAX', {
        max: c.errors['maxlength'].requiredLength,
      });
    if (c?.errors?.['pattern'])
      return this.translate.instant('FORM_BUILDER.NAME_PATTERN');
    return '';
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    const { name, datasource, description } = this.form.value;
    this.admin
      .createForm({ name, datasourceId: datasource, description })
      .then(res => {
        if (this.global.handleSuccessService(res)) {
          this.form.markAsPristine();
          this.router.navigate([FORM_BUILDER.design(res.data.id)]);
        }
      })
      .catch(() => {});
  }

  onCancel(): void {
    this.router.navigate([FORM_BUILDER.LIST]);
  }

  loadDatasourcesPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    const params: any = { page, limit };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasourceService.listDatasource(params);
      if (this.global.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasources ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  private loadDatasources(): void {
    const params = { page: DEFAULT_PAGE, limit: 10 };
    this.datasourceService
      .listDatasource(params)
      .then(res => {
        if (this.global.handleSuccessService(res, false)) {
          const items = res?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal = res?.data?.count ?? items.length;
        }
      })
      .catch(() => {});
  }
}
