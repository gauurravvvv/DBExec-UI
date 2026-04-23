import {ChangeDetectionStrategy, Component, OnInit, OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { RLS_RULE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';
import { REGEX } from 'src/app/constants/regex.constant';

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
  private destroy$ = new Subject<void>();

  rlsForm!: FormGroup;

  organisations: any[] = [];
  datasources: any[] = [];
  datasets: any[] = [];
  datasetColumns: any[] = [];
  columnValuesCache: { [columnName: string]: { label: string; value: string }[] } = {};
  isLoadingColumnValues: { [columnName: string]: boolean } = {};

  selectedDatasource: string = '';

  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

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
    private organisationService: OrganisationService,
    private datasourceService: DatasourceService,
    private datasetService: DatasetService,
    private rlsRulesService: RlsRulesService,
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
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.rlsForm
        .get('organisation')
        ?.setValue(this.globalService.getTokenDetails('organisationId'), {
          emitEvent: false,
        });
      this.loadDatasources();
    }
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      datasetId: ['', Validators.required],
      conditions: this.fb.array([this.createCondition()]),
      isEnabled: [true],
    });

    // Org changes → reload datasources, clear downstream
    this.rlsForm.get('organisation')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (value) {
        this.selectedDatasource = '';
        this.datasources = [];
        this.datasets = [];
        this.datasetColumns = [];
        this.columnValuesCache = {};
        this.isLoadingColumnValues = {};
        this.resetConditions();
        this.rlsForm.patchValue(
          { datasetId: '' },
          { emitEvent: false },
        );
        this.loadDatasources();
      }
    });

    // Dataset changes → load columns, reset conditions
    this.rlsForm.get('datasetId')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
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

  loadOrganisations() {
    const params = { page: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs || [];
      }
    });
  }

  loadDatasources() {
    const orgId = this.rlsForm.get('organisation')?.value;
    if (!orgId) return;

    const params = { orgId, pageNumber: DEFAULT_PAGE, limit: MAX_LIMIT };
    this.datasourceService.listDatasource(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasources = response.data.datasources || [];
        this.selectedDatasource = '';
        this.datasets = [];
        this.rlsForm.patchValue(
          { datasetId: '' },
          { emitEvent: false },
        );
      } else {
        this.datasources = [];
      }
    });
  }

  onDatasourceChange(datasourceId: string) {
    this.selectedDatasource = datasourceId;
    this.datasets = [];
    this.datasetColumns = [];
    this.columnValuesCache = {};
    this.isLoadingColumnValues = {};
    this.resetConditions();
    this.rlsForm.patchValue(
      { datasetId: '' },
      { emitEvent: false },
    );
    if (datasourceId) {
      this.loadDatasets();
    }
  }

  loadDatasets() {
    const orgId = this.rlsForm.get('organisation')?.value;
    if (!orgId || !this.selectedDatasource) return;

    const params = {
      orgId,
      datasourceId: this.selectedDatasource,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasetService.listDatasets(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = response.data.datasets || [];
      } else {
        this.datasets = [];
      }
    });
  }

  loadDatasetColumns(): void {
    const orgId = this.rlsForm.get('organisation')?.value;
    const datasetId = this.rlsForm.get('datasetId')?.value;
    if (!orgId || !datasetId) return;

    this.datasetService.getDataset(orgId, datasetId).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasetColumns = (response.data.datasetFields || []).map((f: any) => ({
          ...f,
          columnToView: f.columnToView || f.columnToUse,
        }));
      }
    });
  }

  async loadDistinctValuesForColumn(columnName: string): Promise<void> {
    if (!columnName) return;

    // Return from cache if available
    if (this.columnValuesCache[columnName]) return;

    const orgId = this.rlsForm.get('organisation')?.value;
    const datasetId = this.rlsForm.get('datasetId')?.value;
    if (!orgId || !datasetId) return;

    this.isLoadingColumnValues[columnName] = true;

    try {
      const res: any = await this.datasetService.getDistinctColumnValues(orgId, datasetId, columnName);
      if (res?.status && res.data) {
        this.columnValuesCache[columnName] = (res.data || []).map((v: any) => ({
          label: String(v),
          value: String(v),
        }));
      }
    } catch (err) {
      console.error('Failed to load distinct values for column', columnName, err);
    } finally {
      this.isLoadingColumnValues[columnName] = false;
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

      this.rlsRulesService.addRule(payload).then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.rlsForm.markAsPristine();
          this.router.navigate([RLS_RULE.LIST]);
        }
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
    if (control?.errors?.['required']) return 'Rule name is required';
    if (control?.errors?.['minlength'])
      return `Name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}