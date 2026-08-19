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
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
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
  originalFormValue: any;
  datasetColumns: any[] = [];
  columnValuesCache: {
    [columnName: string]: { label: string; value: string }[];
  } = {};
  isLoadingColumnValues: { [columnName: string]: boolean } = {};

  // RLS condition operators are DB-driven (family: rls_operator). Seeded
  // with the known codes as a fallback so the dropdown is never empty on a
  // failed fetch; overwritten with DB rows (label + order) in ngOnInit.
  operatorOptions: { label: string; value: string }[] = [
    { label: 'IN', value: 'IN' },
    { label: 'NOT IN', value: 'NOT_IN' },
    { label: 'EQUALS', value: 'EQUALS' },
    { label: 'BETWEEN', value: 'BETWEEN' },
  ];

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

  scopeTargetsByRow: { [index: number]: { label: string; value: string }[] } =
    {};
  isLoadingScopeTargets: { [index: number]: boolean } = {};

  get conditions(): FormArray {
    return this.rlsForm.get('conditions') as FormArray;
  }

  get maskedColumns(): FormArray {
    return this.rlsForm.get('maskedColumns') as FormArray;
  }

  get assignments(): FormArray {
    return this.rlsForm.get('assignments') as FormArray;
  }

  get securityType(): string {
    return this.rlsForm.get('securityType')?.value ?? 'row';
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private rlsRulesService: RlsRulesService,
    private datasetService: DatasetService,
    private userService: UserService,
    private groupService: GroupService,
    private translate: TranslateService,
    private referenceData: ReferenceDataService,
  ) {}

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.loadOperatorOptions();
    this.initForm();
    this.ruleId = this.route.snapshot.params['id'];
    if (this.ruleId) {
      this.rlsRulesService.resetCurrent();
      this.loadRuleData();
    }
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

  initForm(): void {
    // Field validators sourced from the SHARED Zod schema.
    this.rlsForm = this.fb.group({
      id: [''],
      name: ['', [zodValidator(rlsRuleNameSchema)]],
      description: ['', [zodValidator(analysisDescriptionSchema)]],
      datasetId: ['', [zodValidator(analysisDatasetSchema)]],
      securityType: ['row', Validators.required],
      conditions: this.fb.array([this.createCondition()]),
      maskedColumns: this.fb.array([] as FormGroup[]),
      assignments: this.fb.array([this.createAssignment()]),
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
        Array.isArray(c?.values) ? c.values : c?.values ? [c.values] : [],
        nonEmptyArray,
      ],
    });
  }

  createMaskedColumn(m?: any): FormGroup {
    return this.fb.group({
      columnName: [m?.columnName || '', Validators.required],
      strategy: [m?.strategy || 'hide', Validators.required],
      maskValue: [m?.maskValue || ''],
    });
  }

  createAssignment(a?: any): FormGroup {
    return this.fb.group({
      scope: [a?.scope || 'user', Validators.required],
      scopeId: [a?.scopeId || '', Validators.required],
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

  addMaskedColumn() {
    this.maskedColumns.push(this.createMaskedColumn());
  }

  removeMaskedColumn(index: number) {
    if (this.maskedColumns.length > 1) {
      this.maskedColumns.removeAt(index);
    }
  }

  onSecurityTypeChange(type: string): void {
    if (type === 'column') {
      if (this.maskedColumns.length === 0)
        this.maskedColumns.push(this.createMaskedColumn());
    } else if (this.conditions.length === 0) {
      this.conditions.push(this.createCondition());
    }
  }

  addAssignment() {
    const idx = this.assignments.length;
    this.assignments.push(this.createAssignment());
    this.loadScopeTargets(idx, 'user');
  }

  removeAssignment(index: number) {
    if (this.assignments.length > 1) {
      this.assignments.removeAt(index);
      delete this.scopeTargetsByRow[index];
      delete this.isLoadingScopeTargets[index];
    }
  }

  onAssignmentScopeChange(index: number, scope: string): void {
    this.assignments.at(index)?.get('scopeId')?.setValue('');
    this.scopeTargetsByRow[index] = [];
    if (scope) this.loadScopeTargets(index, scope);
  }

  loadScopeTargets(index: number, scope: string): void {
    this.isLoadingScopeTargets[index] = true;
    const params = { page: 1, limit: 50 };
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

  loadRuleData(): void {
    this.rlsRulesService
      .loadOne(this.ruleId)
      .then(() => {
        const rule = this.rlsRulesService.current();
        if (!rule) return;

        const type = rule.securityType === 'column' ? 'column' : 'row';

        this.loadDatasetColumns(rule.datasetId, () => {
          // Row conditions.
          this.conditions.clear();
          const savedConditions = rule.conditions?.length
            ? rule.conditions
            : [{ columnName: '', operator: 'IN', values: [] }];
          savedConditions.forEach((c: any) => {
            this.conditions.push(this.createCondition(c));
            if (c.columnName) {
              this.loadDistinctValuesForColumn(c.columnName, rule.datasetId);
            }
          });

          // Masked columns (column security).
          this.maskedColumns.clear();
          const savedMasked = rule.maskedColumns?.length
            ? rule.maskedColumns
            : [];
          savedMasked.forEach((m: any) => {
            this.maskedColumns.push(this.createMaskedColumn(m));
          });
          if (type === 'column' && this.maskedColumns.length === 0) {
            this.maskedColumns.push(this.createMaskedColumn());
          }

          // Assignments (subjects).
          this.assignments.clear();
          const savedAssignments = rule.assignments?.length
            ? rule.assignments
            : rule.scope && rule.scopeId
              ? [{ scope: rule.scope, scopeId: rule.scopeId }]
              : [{ scope: 'user', scopeId: '' }];
          savedAssignments.forEach((a: any, idx: number) => {
            this.assignments.push(this.createAssignment(a));
            this.loadScopeTargets(idx, a.scope || 'user');
          });

          this.rlsForm.patchValue({
            id: rule.id,
            name: rule.name,
            description: rule.description || '',
            datasetId: rule.datasetId,
            securityType: type,
            isEnabled: rule.isEnabled,
          });

          this.originalFormValue = this.rlsForm.value;
          this.isFormDirty = false;
          this.rlsForm.markAsPristine();
          this.cdr.markForCheck();
        });
      })
      .catch(() => {
        this.cdr.markForCheck();
      });
  }

  loadDatasetColumns(datasetId?: string, callback?: () => void): void {
    const dataset = datasetId || this.rlsForm.get('datasetId')?.value;
    if (!dataset) {
      if (callback) callback();
      return;
    }

    this.columnValuesCache = {};
    this.isLoadingColumnValues = {};
    this.datasetService
      .getDataset(dataset)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.datasetColumns = (response.data.datasetFields || []).map(
            (f: any) => ({
              ...f,
              columnToView: f.columnToView || f.columnToUse,
            }),
          );
        }
        this.cdr.markForCheck();
        if (callback) callback();
      })
      .catch(() => {
        this.cdr.markForCheck();
        if (callback) callback();
      });
  }

  async loadDistinctValuesForColumn(
    columnName: string,
    datasetId?: string,
  ): Promise<void> {
    if (!columnName || this.columnValuesCache[columnName]) return;

    const dataset = datasetId || this.rlsForm.get('datasetId')?.value;
    if (!dataset) return;

    this.isLoadingColumnValues[columnName] = true;
    try {
      const res: any = await this.datasetService.getDistinctColumnValues(
        dataset,
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
    // Drop a double-fire while the update is already in flight.
    if (this.saving()) return;
    if (this.saveJustification.trim()) {
      const formVal = this.rlsForm.value;
      const type = formVal.securityType === 'column' ? 'column' : 'row';

      const payload: any = {
        id: formVal.id,
        name: formVal.name,
        description: formVal.description,
        securityType: type,
        isEnabled: formVal.isEnabled,
        assignments: (formVal.assignments || []).map((a: any) => ({
          scope: a.scope,
          scopeId: a.scopeId,
        })),
        justification: this.saveJustification.trim(),
      };

      if (type === 'column') {
        payload.maskedColumns = (formVal.maskedColumns || []).map((m: any) => ({
          columnName: m.columnName,
          strategy: m.strategy || 'hide',
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
        .update(payload)
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
          this.saveJustification = '';
          this.cdr.markForCheck();
        });
    }
  }

  goBack(): void {
    this.router.navigate([RLS_RULE.LIST]);
  }

  onCancel(): void {
    if (!this.rlsForm) return;
    if (this.isFormDirty && this.originalFormValue) {
      const conditionsArray = this.rlsForm.get('conditions') as FormArray;
      conditionsArray.clear();
      (this.originalFormValue.conditions ?? []).forEach((cond: any) => {
        conditionsArray.push(this.createCondition(cond));
      });

      this.maskedColumns.clear();
      (this.originalFormValue.maskedColumns ?? []).forEach((m: any) => {
        this.maskedColumns.push(this.createMaskedColumn(m));
      });

      this.assignments.clear();
      (this.originalFormValue.assignments ?? []).forEach((a: any) => {
        this.assignments.push(this.createAssignment(a));
      });

      this.rlsForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.rlsForm.markAsPristine();
      this.cdr.markForCheck();
    } else {
      this.router.navigate([RLS_RULE.LIST]);
    }
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
