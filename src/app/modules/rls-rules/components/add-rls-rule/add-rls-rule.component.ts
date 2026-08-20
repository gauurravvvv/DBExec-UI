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
import { RLS_RULE } from 'src/app/core/constants/routes.constant';
import {
  analysisDatasetSchema,
  analysisDescriptionSchema,
  rlsRuleNameSchema,
} from 'src/app/shared/validators/analyses';
import { zodValidator } from 'src/app/shared/validators/zod-validator';
import { HasUnsavedChanges } from 'src/app/core/models/has-unsaved-changes.model';
import { GlobalService } from 'src/app/core/services/global.service';
import { ReferenceDataService } from 'src/app/core/services/reference-data.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { ConnectorService } from 'src/app/modules/connector/services/connector.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { UserService } from 'src/app/modules/users/services/user.service';
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

  // RLS condition operators are DB-driven (family: rls_operator). Seeded
  // with the known codes as a fallback so the dropdown is never empty on a
  // failed fetch; overwritten with DB rows (label + order) in ngOnInit.
  operatorOptions: { label: string; value: string }[] = [
    { label: 'IN', value: 'IN' },
    { label: 'NOT IN', value: 'NOT_IN' },
    { label: 'EQUALS', value: 'EQUALS' },
    { label: 'BETWEEN', value: 'BETWEEN' },
  ];

  // Row vs column security. Row → conditions[]; column → maskedColumns[].
  securityTypeOptions = [
    { label: this.translate.instant('RLS.SECURITY_TYPE_ROW'), value: 'row' },
    {
      label: this.translate.instant('RLS.SECURITY_TYPE_COLUMN'),
      value: 'column',
    },
  ];

  scopeOptions = [
    { label: this.translate.instant('RLS.USER'), value: 'user' },
    { label: this.translate.instant('RLS.GROUP'), value: 'group' },
  ];

  maskStrategyOptions = [
    { label: this.translate.instant('RLS.MASK_HIDE'), value: 'hide' },
    { label: this.translate.instant('RLS.MASK_NULL'), value: 'null' },
    { label: this.translate.instant('RLS.MASK_REDACT'), value: 'redact' },
  ];

  // Per-assignment-row scope-target options, keyed by row index. Users
  // and groups are fetched lazily when a row's scope is chosen.
  scopeTargetsByRow: { [index: number]: { label: string; value: string }[] } =
    {};
  isLoadingScopeTargets: { [index: number]: boolean } = {};

  get conditions(): FormArray {
    return this.rlsForm.get('conditions') as FormArray;
  }

  get assignments(): FormArray {
    return this.rlsForm.get('assignments') as FormArray;
  }

  get maskedColumns(): FormArray {
    return this.rlsForm.get('maskedColumns') as FormArray;
  }

  get securityType(): string {
    return this.rlsForm.get('securityType')?.value ?? 'row';
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private globalService: GlobalService,
    private datasourceService: ConnectorService,
    private datasetService: DatasetService,
    private rlsRulesService: RlsRulesService,
    private userService: UserService,
    private groupService: GroupService,
    private translate: TranslateService,
    private referenceData: ReferenceDataService,
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
    this.loadOperatorOptions();
    this.loadDatasources();
    // Seed the first assignment row's target dropdown.
    this.loadScopeTargets(0, 'user');
  }

  /**
   * DB-driven RLS operator options (family: rls_operator). Falls back to
   * the hardcoded seed above when the family is absent / the fetch failed.
   */
  private loadOperatorOptions(): void {
    this.referenceData
      .getFamily('rls_operator')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(rows => {
        if (rows.length) {
          this.operatorOptions = rows.map(r => ({
            label: r.label,
            value: r.code,
          }));
          this.cdr.markForCheck();
        }
      });
  }

  initForm() {
    // Field validators sourced from the SHARED Zod schema.
    this.rlsForm = this.fb.group({
      name: ['', [zodValidator(rlsRuleNameSchema)]],
      description: ['', [zodValidator(analysisDescriptionSchema)]],
      datasetId: ['', [zodValidator(analysisDatasetSchema)]],
      securityType: ['row', Validators.required],
      conditions: this.fb.array([this.createCondition()]),
      maskedColumns: this.fb.array([] as FormGroup[]),
      assignments: this.fb.array([this.createAssignment()]),
      isEnabled: [true],
    });

    // Dataset changes → load columns, reset conditions + masked columns
    this.rlsForm
      .get('datasetId')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.datasetColumns = [];
        this.columnValuesCache = {};
        this.isLoadingColumnValues = {};
        this.resetConditions();
        this.maskedColumns.clear();
        // Keep the column-security section showing one empty row when it
        // is the active mode, so switching datasets doesn't blank it out.
        if (this.securityType === 'column') {
          this.maskedColumns.push(this.createMaskedColumn());
        }
        if (value) {
          this.loadDatasetColumns();
        }
      });

    // Security type changes → flip which section is authoritative.
    this.rlsForm
      .get('securityType')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type: string) => {
        if (type === 'column') {
          if (this.maskedColumns.length === 0)
            this.maskedColumns.push(this.createMaskedColumn());
        } else {
          if (this.conditions.length === 0)
            this.conditions.push(this.createCondition());
        }
        this.rlsForm.markAsDirty();
      });
  }

  createCondition(): FormGroup {
    return this.fb.group({
      columnName: ['', Validators.required],
      operator: ['IN', Validators.required],
      values: [[], nonEmptyArray],
    });
  }

  createMaskedColumn(): FormGroup {
    return this.fb.group({
      columnName: ['', Validators.required],
      strategy: ['hide', Validators.required],
      maskValue: [''],
    });
  }

  createAssignment(): FormGroup {
    return this.fb.group({
      scope: ['user', Validators.required],
      scopeId: ['', Validators.required],
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

  addMaskedColumn() {
    this.maskedColumns.push(this.createMaskedColumn());
    this.rlsForm.markAsDirty();
  }

  removeMaskedColumn(index: number) {
    if (this.maskedColumns.length > 1) {
      this.maskedColumns.removeAt(index);
      this.rlsForm.markAsDirty();
    }
  }

  addAssignment() {
    const idx = this.assignments.length;
    this.assignments.push(this.createAssignment());
    this.loadScopeTargets(idx, 'user');
    this.rlsForm.markAsDirty();
  }

  removeAssignment(index: number) {
    if (this.assignments.length > 1) {
      this.assignments.removeAt(index);
      delete this.scopeTargetsByRow[index];
      delete this.isLoadingScopeTargets[index];
      this.rlsForm.markAsDirty();
    }
  }

  /** A row's scope flipped user↔group — clear its target + refetch. */
  onAssignmentScopeChange(index: number, scope: string): void {
    this.assignments.at(index)?.get('scopeId')?.setValue('');
    this.scopeTargetsByRow[index] = [];
    if (scope) this.loadScopeTargets(index, scope);
  }

  /** Fetch users or groups for an assignment row's target dropdown. */
  loadScopeTargets(index: number, scope: string): void {
    this.isLoadingScopeTargets[index] = true;
    const params = { page: DEFAULT_PAGE, limit: 50 };
    const done = (items: { label: string; value: string }[]) => {
      this.scopeTargetsByRow[index] = items;
      this.isLoadingScopeTargets[index] = false;
      this.cdr.markForCheck();
    };
    if (scope === 'user') {
      this.userService
        .listUser({ ...params })
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res, false)) {
            done(
              (res?.data?.users ?? []).map((u: any) => ({
                label: u.fullName,
                value: u.id,
              })),
            );
          } else done([]);
        })
        .catch(() => done([]));
    } else {
      this.groupService
        .listGroups(params)
        .then((res: any) => {
          if (this.globalService.handleSuccessService(res, false)) {
            done(
              (res?.data?.groups ?? []).map((g: any) => ({
                label: g.name,
                value: g.id,
              })),
            );
          } else done([]);
        })
        .catch(() => done([]));
    }
  }

  getScopeTargets(index: number): { label: string; value: string }[] {
    return this.scopeTargetsByRow[index] ?? [];
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

  onDatasourceChange(connectorId: string) {
    this.selectedDatasource = connectorId;
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
    if (connectorId) {
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
      connectorId: this.selectedDatasource,
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
      connectorId: this.selectedDatasource,
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
    // Drop a double-fire while a save is already in flight (the button is
    // disabled on saving(), this backstops a same-frame Enter+click).
    if (this.saving()) return;
    this.rlsForm.markAllAsTouched();
    if (!this.rlsForm.valid) return;

    const formVal = this.rlsForm.value;
    const type = formVal.securityType === 'column' ? 'column' : 'row';

    const payload: any = {
      name: formVal.name,
      description: formVal.description,
      datasetId: formVal.datasetId,
      securityType: type,
      isEnabled: formVal.isEnabled,
      assignments: (formVal.assignments || []).map((a: any) => ({
        scope: a.scope,
        scopeId: a.scopeId,
      })),
    };

    if (type === 'column') {
      payload.maskedColumns = (formVal.maskedColumns || []).map((m: any) => ({
        columnName: m.columnName,
        strategy: m.strategy || 'hide',
        // Only carry maskValue for redact — the BE ignores it otherwise.
        ...(m.strategy === 'redact' && m.maskValue
          ? { maskValue: m.maskValue }
          : {}),
      }));
    } else {
      payload.conditions = (formVal.conditions || []).map((c: any) => ({
        columnName: c.columnName,
        operator: c.operator,
        values: Array.isArray(c.values) ? c.values : [c.values],
      }));
    }

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

  goBack(): void {
    this.router.navigate([RLS_RULE.LIST]);
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
