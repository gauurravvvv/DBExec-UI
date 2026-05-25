import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { QUERY_BUILDER } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { QueryBuilderService } from '../../services/query-builder.service';

@Component({
  selector: 'app-add-query-builder',
  templateUrl: './add-query-builder.component.html',
  styleUrls: ['./add-query-builder.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddQueryBuilderComponent implements OnInit, HasUnsavedChanges {
  saving = inject(QueryBuilderService).saving;

  queryBuilderForm!: FormGroup;
  selectedDatasource: any = null;
  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.queryBuilderForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    this.loadDatasources();
  }

  initForm() {
    this.queryBuilderForm = this.fb.group({
      datasource: ['', Validators.required],
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(64),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [''],
    });
  }

  getNameError(): string {
    const control = this.queryBuilderForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('QUERY_BUILDER_MODULE.NAME_PATTERN');
    return '';
  }

  onSubmit() {
    if (this.queryBuilderForm.valid) {
      this.queryBuilderService
        .addQueryBuilder(this.queryBuilderForm)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.queryBuilderForm.markAsPristine();
            this.router.navigate([QUERY_BUILDER.LIST]);
          }
        })
        .catch(() => {});
    }
  }

  onCancel() {
    this.queryBuilderForm.reset();
    Object.keys(this.queryBuilderForm.controls).forEach(key => {
      this.queryBuilderForm.get(key)?.setValue('');
    });
  }

  /**
   * Fetcher for the server-mode datasource dropdown.
   */
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
      if (this.globalService.handleSuccessService(res, false)) {
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

  private loadDatasources() {
    const params = {
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasourceService
      .listDatasource(params)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.datasources = [...items];
        }
      })
      .catch(() => {});
  }
}
