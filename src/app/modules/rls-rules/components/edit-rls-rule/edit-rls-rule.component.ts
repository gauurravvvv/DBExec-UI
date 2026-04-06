import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RLS_RULE } from 'src/app/constants/routes';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-edit-rls-rule',
  templateUrl: './edit-rls-rule.component.html',
  styleUrls: ['./edit-rls-rule.component.scss'],
})
export class EditRlsRuleComponent implements OnInit, HasUnsavedChanges {
  rlsForm!: FormGroup;
  scopeTargets: any[] = [];
  isFormDirty = false;
  showSaveConfirm = false;
  saveJustification = '';
  ruleId!: string;
  orgId!: string;
  originalFormValue: any;
  datasetName = '';

  scopeOptions = [
    { label: 'User', value: 'user' },
    { label: 'Group', value: 'group' },
  ];

  operatorOptions = [
    { label: 'IN', value: 'IN' },
    { label: 'NOT IN', value: 'NOT_IN' },
    { label: 'EQUALS', value: 'EQUALS' },
    { label: 'BETWEEN', value: 'BETWEEN' },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    private userService: UserService,
    private groupService: GroupService,
    private rlsRulesService: RlsRulesService,
  ) {}

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  ngOnInit(): void {
    this.initForm();
    this.ruleId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];
    if (this.ruleId) {
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
        ],
      ],
      description: [''],
      organisation: ['', Validators.required],
      datasetId: ['', Validators.required],
      scope: ['', Validators.required],
      scopeId: ['', Validators.required],
      columnName: ['', [Validators.required, Validators.maxLength(255)]],
      operator: ['IN', Validators.required],
      values: ['', Validators.required],
      isEnabled: [true],
    });

    this.rlsForm.valueChanges.subscribe(() => {
      this.checkFormDirty();
    });

    // When scope changes, reload scope targets
    this.rlsForm.get('scope')?.valueChanges.subscribe(value => {
      if (value && this.orgId) {
        this.loadScopeTargets();
        // Only clear scopeId if user actively changed it (not during initial load)
        if (this.originalFormValue) {
          this.rlsForm.patchValue({ scopeId: '' }, { emitEvent: false });
        }
      }
    });
  }

  loadRuleData(): void {
    this.rlsRulesService
      .viewRule(this.orgId, this.ruleId)
      .then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          const rule = response.data;
          this.datasetName = rule.datasetName || '';

          // Load scope targets before patching form
          this.loadScopeTargetsForScope(rule.scope, () => {
            this.rlsForm.patchValue({
              id: rule.id,
              name: rule.name,
              description: rule.description || '',
              organisation: rule.organisationId,
              datasetId: rule.datasetId,
              scope: rule.scope,
              scopeId: rule.scopeId,
              columnName: rule.columnName,
              operator: rule.operator,
              values: Array.isArray(rule.values)
                ? rule.values.join(', ')
                : rule.values || '',
              isEnabled: rule.isEnabled,
            });

            this.originalFormValue = this.rlsForm.value;
            this.isFormDirty = false;
            this.rlsForm.markAsPristine();
          });
        }
      });
  }

  loadScopeTargets(): void {
    const scope = this.rlsForm.get('scope')?.value;
    this.loadScopeTargetsForScope(scope);
  }

  loadScopeTargetsForScope(scope: string, callback?: () => void): void {
    if (!this.orgId || !scope) return;
    const params = { orgId: this.orgId, page: DEFAULT_PAGE, limit: MAX_LIMIT };

    if (scope === 'user') {
      this.userService.listUser(params).then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.scopeTargets = (response.data.users || []).map((u: any) => ({
            label: `${u.firstName} ${u.lastName}`,
            value: u.id,
          }));
        }
        if (callback) callback();
      });
    } else if (scope === 'group') {
      this.groupService.listGroupps(params).then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.scopeTargets = (response.data.groups || []).map((g: any) => ({
            label: g.name,
            value: g.id,
          }));
        }
        if (callback) callback();
      });
    } else {
      if (callback) callback();
    }
  }

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.rlsForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }

  onSubmit(): void {
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
        values:
          typeof formVal.values === 'string'
            ? formVal.values
                .split(',')
                .map((v: string) => v.trim())
                .filter((v: string) => v)
            : formVal.values,
        justification: this.saveJustification.trim(),
      };

      this.rlsRulesService.updateRule(payload).then((response: any) => {
        if (this.globalService.handleSuccessService(response)) {
          this.showSaveConfirm = false;
          this.saveJustification = '';
          this.isFormDirty = false;
          this.rlsForm.markAsPristine();
          this.router.navigate([RLS_RULE.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.rlsForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.rlsForm.markAsPristine();
    } else {
      this.router.navigate([RLS_RULE.LIST]);
    }
  }

  getNameError(): string {
    const control = this.rlsForm.get('name');
    if (control?.errors?.['required']) return 'Rule name is required';
    if (control?.errors?.['minlength'])
      return `Name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    return '';
  }
}
