import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { DEFAULT_PAGE } from 'src/app/core/constants';
import { REGEX } from 'src/app/core/constants/regex.constant';
import { RLS_RULE } from 'src/app/core/constants/routes.constant';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { RlsRulesService } from '../../services/rls-rules.service';

function nonEmptyArray(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value || !Array.isArray(value) || value.length === 0) {
    return { required: true };
  }
  return null;
}

@Component({
  selector: 'app-add-rls-rule',
  templateUrl: './add-rls-rule.component.html',
  styleUrls: ['./add-rls-rule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRlsRuleComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  // Signal ref
  saving = this.rlsRulesService.saving;

  rlsForm!: FormGroup;

  datasources: any[] = [];
  preloadedDatasources: any[] | null = null;
  preloadedDatasourcesTotal: number | null = null;
  datasets: any[] = [];
  preloadedDatasets: any[] | null = null;
  preloadedDatasetsTotal: number | null = null;
  datasetColumns: any[] = [];
  columnValuesCache: {
    [columnName: string]: { label: string; value: string }[];
  } = {};
  isLoadingColumnValues: { [columnName: string]: boolean } = {};

  selectedDatasource: string = '';

  operatorOptions = [
    { label: 'IN', value: 'IN' },
    { label: 'NOT IN', value: 'NOT_IN' },
    { label: 'EQUALS', value: 'EQUALS' },
    { label: 'BETWEEN', value: 'BETWEEN' },
  ];

  get conditions(): FormArray {
    return this.rlsForm.get('conditions') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private datasetService: DatasetService,
    private rlsRulesService: RlsRulesService,
    private translate: TranslateService,
  ) {
    this.initForm();
  }

  get isFormDirty(): boolean {
    return this.rlsForm.dirty;
  }

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit() {
    this.loadDatasources();
  }

  initForm() {
    this.rlsForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(100),
          Validators.pattern(REGEX.orgName),
        ],
      ],
      description: [''],
      datasetId: ['', Validators.required],
      conditions: this.fb.array([this.createCondition()]),
      isEnabled: [true],
    });

    // Dataset changes → load columns, reset conditions
    this.rlsForm
      .get('datasetId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.datasetColumns = [];
        this.columnValuesCache = {};
        this.isLoadingColumnValues = {};
        this.resetConditions();
        if (value) {
          this.loadDatasetColumns();
        }
      });
  }

  createCondition(): FormGroup {
    return this.fb.group({
      columnName: ['', Validators.required],
      operator: ['IN', Validators.required],
      values: [[], nonEmptyArray],
    });
  }

  addCondition() {
    this.conditions.push(this.createCondition());
    this.rlsForm.markAsDirty();
  }

  removeCondition(index: number) {
    if (this.conditions.length > 1) {
      this.conditions.removeAt(index);
      this.rlsForm.markAsDirty();
    }
  }

  resetConditions(): void {
    this.conditions.clear();
    this.conditions.push(this.createCondition());
  }

  loadDatasources() {
    const params = { page: DEFAULT_PAGE, limit: 10 };
    this.datasourceService
      .listDatasource(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasources ?? [];
          this.preloadedDatasources = items;
          this.preloadedDatasourcesTotal =
            response?.data?.count ?? items.length;
          this.datasources = items;
          this.selectedDatasource = '';
          this.datasets = [];
          this.rlsForm.patchValue({ datasetId: '' }, { emitEvent: false });
        } else {
          this.datasources = [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
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

  onDatasourceChange(datasourceId: string) {
    this.selectedDatasource = datasourceId;
    this.datasets = [];
    // Dataset dropdown is datasource-scoped — clear preload so the next open
    // re-fetches under the new datasource.
    this.preloadedDatasets = null;
    this.preloadedDatasetsTotal = null;
    this.datasetColumns = [];
    this.columnValuesCache = {};
    this.isLoadingColumnValues = {};
    this.resetConditions();
    this.rlsForm.patchValue({ datasetId: '' }, { emitEvent: false });
    if (datasourceId) {
      this.loadDatasets();
    }
  }

  /**
   * Fetcher for the server-mode dataset dropdown. Gated on org + datasource.
   */
  loadDatasetsPage = async ({
    search,
    page,
    limit,
  }: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ items: any[]; total: number }> => {
    if (!this.selectedDatasource) return { items: [], total: 0 };
    const params: any = {
      datasourceId: this.selectedDatasource,
      page,
      limit,
    };
    if (search) params.filter = JSON.stringify({ name: search });
    try {
      const res: any = await this.datasetService.listDatasets(params);
      if (this.globalService.handleSuccessService(res, false)) {
        return {
          items: res?.data?.datasets ?? [],
          total: res?.data?.count ?? 0,
        };
      }
      return { items: [], total: 0 };
    } catch {
      return { items: [], total: 0 };
    }
  };

  loadDatasets() {
    if (!this.selectedDatasource) return;

    const params = {
      datasourceId: this.selectedDatasource,
      page: DEFAULT_PAGE,
      limit: 10,
    };

    this.datasetService
      .listDatasets(params)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          const items = response?.data?.datasets ?? [];
          this.datasets = items;
          this.preloadedDatasets = items;
          this.preloadedDatasetsTotal = response?.data?.count ?? items.length;
        } else {
          this.datasets = [];
        }
        this.cdr.markForCheck();
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadDatasetColumns(): void {
    const datasetId = this.rlsForm.get('datasetId')?.value;
    if (!datasetId) return;

    this.datasetService
      .getDataset(datasetId)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetColumns = (response.data.datasetFields || []).map(
            (f: any) => ({
              ...f,
              columnToView: f.columnToView || f.columnToUse,
            }),
          );
          this.cdr.markForCheck();
        }
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  async loadDistinctValuesForColumn(columnName: string): Promise<void> {
    if (!columnName) return;
    if (this.columnValuesCache[columnName]) return;

    const datasetId = this.rlsForm.get('datasetId')?.value;
    if (!datasetId) return;

    this.isLoadingColumnValues[columnName] = true;

    try {
      const res: any = await this.datasetService.getDistinctColumnValues(
        datasetId,
        columnName,
      );
      if (res?.status && res.data) {
        this.columnValuesCache[columnName] = (res.data || []).map((v: any) => ({
          label: String(v),
          value: String(v),
        }));
      }
    } catch (err) {
      console.error(
        'Failed to load distinct values for column',
        columnName,
        err,
      );
    } finally {
      this.isLoadingColumnValues[columnName] = false;
      this.cdr.markForCheck();
    }
  }

  onColumnChange(index: number, selectedValue?: string): void {
    if (selectedValue) {
      this.conditions.at(index)?.get('values')?.setValue([]);
      this.loadDistinctValuesForColumn(selectedValue);
    }
  }

  getColumnValues(index: number): { label: string; value: string }[] {
    const columnName = this.conditions.at(index)?.get('columnName')?.value;
    return columnName ? this.columnValuesCache[columnName] || [] : [];
  }

  onSubmit() {
    this.rlsForm.markAllAsTouched();
    if (this.rlsForm.valid) {
      const formVal = this.rlsForm.value;
      const payload = {
        ...formVal,
        conditions: formVal.conditions.map((c: any) => ({
          columnName: c.columnName,
          operator: c.operator,
          values: Array.isArray(c.values) ? c.values : [c.values],
        })),
      };

      this.rlsRulesService
        .add(payload)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.rlsForm.markAsPristine();
            this.router.navigate([RLS_RULE.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.cdr.markForCheck();
        });
    }
  }

  onCancel() {
    this.router.navigate([RLS_RULE.LIST]);
  }

  trackByIndex(index: number): number {
    return index;
  }

  getNameError(): string {
    const control = this.rlsForm.get('name');
    if (control?.errors?.['required'])
      return this.translate.instant('RLS.NAME_REQUIRED');
    if (control?.errors?.['minlength'])
      return this.translate.instant('RLS.NAME_MIN', {
        min: control.errors['minlength'].requiredLength,
      });
    if (control?.errors?.['maxlength'])
      return this.translate.instant('RLS.NAME_MAX', {
        max: control.errors['maxlength'].requiredLength,
      });
    if (control?.errors?.['pattern'])
      return this.translate.instant('RLS.NAME_PATTERN');
    return '';
  }
}
