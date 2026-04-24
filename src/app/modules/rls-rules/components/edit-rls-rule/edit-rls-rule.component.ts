import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RLS_RULE } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { REGEX } from 'src/app/constants/regex.constant';

function nonEmptyArray(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value || !Array.isArray(value) || value.length === 0) {
    return { required: true };
  }
  return null;
}

@Component({
  selector: 'app-edit-rls-rule',
  templateUrl: './edit-rls-rule.component.html',
  styleUrls: ['./edit-rls-rule.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRlsRuleComponent implements OnInit, HasUnsavedChanges {
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  // Signal refs
  saving = this.rlsRulesService.saving;

  rlsForm!: FormGroup;
  isFormDirty = false;
  showSaveConfirm = false;
  saveJustification = '';
  ruleId!: string;
  orgId!: string;
  originalFormValue: any;
  datasetColumns: any[] = [];
  columnValuesCache: { [columnName: string]: { label: string; value: string }[] } = {};
  isLoadingColumnValues: { [columnName: string]: boolean } = {};

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
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private rlsRulesService: RlsRulesService,
    private datasetService: DatasetService,
  ) {}

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.initForm();
    this.ruleId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    if (this.ruleId) {
      this.rlsRulesService.resetCurrent();
      this.loadRuleData();
    }
  }

  initForm(): void {
    this.rlsForm = this.fb.group({
      id: [''],
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
      organisation: ['', Validators.required],
      datasetId: ['', Validators.required],
      conditions: this.fb.array([this.createCondition()]),
      isEnabled: [true],
    });

    this.rlsForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.checkFormDirty();
      });
  }

  createCondition(c?: any): FormGroup {
    return this.fb.group({
      columnName: [c?.columnName || '', Validators.required],
      operator: [c?.operator || 'IN', Validators.required],
      values: [
        Array.isArray(c?.values) ? c.values : (c?.values ? [c.values] : []),
        nonEmptyArray,
      ],
    });
  }

  addCondition() {
    this.conditions.push(this.createCondition());
  }

  removeCondition(index: number) {
    if (this.conditions.length > 1) {
      this.conditions.removeAt(index);
    }
  }

  loadRuleData(): void {
    this.rlsRulesService.loadOne(this.orgId, this.ruleId).then(() => {
      const rule = this.rlsRulesService.current();
      if (!rule) return;

      this.loadDatasetColumns(rule.organisationId, rule.datasetId, () => {
        this.conditions.clear();
        const savedConditions = rule.conditions?.length
          ? rule.conditions
          : [{ columnName: '', operator: 'IN', values: [] }];
        savedConditions.forEach((c: any) => {
          this.conditions.push(this.createCondition(c));
          if (c.columnName) {
            this.loadDistinctValuesForColumn(c.columnName, rule.organisationId, rule.datasetId);
          }
        });

        this.rlsForm.patchValue({
          id: rule.id,
          name: rule.name,
          description: rule.description || '',
          organisation: rule.organisationId,
          datasetId: rule.datasetId,
          isEnabled: rule.isEnabled,
        });

        this.originalFormValue = this.rlsForm.value;
        this.isFormDirty = false;
        this.rlsForm.markAsPristine();
        this.cdr.markForCheck();
      });
    }).catch(() => {
      this.cdr.markForCheck();
    });
  }

  loadDatasetColumns(orgId?: string, datasetId?: string, callback?: () => void): void {
    const org = orgId || this.orgId;
    const dataset = datasetId || this.rlsForm.get('datasetId')?.value;
    if (!org || !dataset) {
      if (callback) callback();
      return;
    }

    this.columnValuesCache = {};
    this.isLoadingColumnValues = {};
    this.datasetService.getDataset(org, dataset).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasetColumns = (response.data.datasetFields || []).map((f: any) => ({
          ...f,
          columnToView: f.columnToView || f.columnToUse,
        }));
      }
      this.cdr.markForCheck();
      if (callback) callback();
    });
  }

  async loadDistinctValuesForColumn(columnName: string, orgId?: string, datasetId?: string): Promise<void> {
    if (!columnName || this.columnValuesCache[columnName]) return;

    const org = orgId || this.orgId;
    const dataset = datasetId || this.rlsForm.get('datasetId')?.value;
    if (!org || !dataset) return;

    this.isLoadingColumnValues[columnName] = true;
    try {
      const res: any = await this.datasetService.getDistinctColumnValues(org, dataset, columnName);
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

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.rlsForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }

  onSubmit(): void {
    this.rlsForm.markAllAsTouched();
    if (this.rlsForm.valid && this.isFormDirty) {
      this.showSaveConfirm = true;
    }
  }

  cancelSave(): void {
    this.showSaveConfirm = false;
    this.saveJustification = '';
  }

  proceedSave(): void {
    if (this.saveJustification.trim()) {
      const formVal = this.rlsForm.value;
      const payload = {
        ...formVal,
        conditions: formVal.conditions.map((c: any) => ({
          columnName: c.columnName,
          operator: c.operator,
          values: Array.isArray(c.values) ? c.values : [c.values],
        })),
        justification: this.saveJustification.trim(),
      };

      this.rlsRulesService.update(payload)
        .then((response: any) => {
          if (this.globalService.handleSuccessService(response)) {
            this.showSaveConfirm = false;
            this.saveJustification = '';
            this.isFormDirty = false;
            this.rlsForm.markAsPristine();
            this.router.navigate([RLS_RULE.LIST]);
          }
          this.cdr.markForCheck();
        })
        .catch(() => {
          this.showSaveConfirm = false;
          this.cdr.markForCheck();
        });
    }
  }

  onCancel(): void {
    if (!this.rlsForm) return;
    if (this.isFormDirty) {
      this.rlsForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.rlsForm.markAsPristine();
    } else {
      this.router.navigate([RLS_RULE.LIST]);
    }
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
}
