import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { RLS_RULE } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { DatasetService } from 'src/app/modules/dataset/services/dataset.service';
import { UserService } from 'src/app/modules/users/services/user.service';
import { GroupService } from 'src/app/modules/groups/services/group.service';
import { RlsRulesService } from '../../services/rls-rules.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-rls-rule',
  templateUrl: './add-rls-rule.component.html',
  styleUrls: ['./add-rls-rule.component.scss'],
})
export class AddRlsRuleComponent implements OnInit, HasUnsavedChanges {
  rlsForm!: FormGroup;
  organisations: any[] = [];
  datasets: any[] = [];
  scopeTargets: any[] = []; // users or groups depending on scope
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;

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
    private globalService: GlobalService,
    private organisationService: OrganisationService,
    private datasetService: DatasetService,
    private userService: UserService,
    private groupService: GroupService,
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
      this.loadDatasets();
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
      scope: ['', Validators.required],
      scopeId: ['', Validators.required],
      columnName: ['', [Validators.required, Validators.maxLength(255)]],
      operator: ['IN', Validators.required],
      values: ['', Validators.required], // comma-separated string, converted to array on submit
      isEnabled: [true],
    });

    // When organisation changes, reload datasets and clear dependent fields
    this.rlsForm.get('organisation')?.valueChanges.subscribe(value => {
      if (value) {
        this.loadDatasets();
        this.rlsForm.patchValue(
          { datasetId: '', scope: '', scopeId: '' },
          { emitEvent: false },
        );
        this.scopeTargets = [];
      }
    });

    // When scope changes, reload scope targets (users or groups)
    this.rlsForm.get('scope')?.valueChanges.subscribe(value => {
      if (value) {
        this.loadScopeTargets();
        this.rlsForm.patchValue({ scopeId: '' }, { emitEvent: false });
      }
    });
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
      }
    });
  }

  loadDatasets() {
    const orgId = this.rlsForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasetService.listDatasets(params).then((response: any) => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasets = response.data.datasets || response.data || [];
      }
    });
  }

  loadScopeTargets() {
    const orgId = this.rlsForm.get('organisation')?.value;
    const scope = this.rlsForm.get('scope')?.value;
    if (!orgId || !scope) return;

    const params = {
      orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    if (scope === 'user') {
      this.userService.listUser(params).then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.scopeTargets = (response.data.users || []).map((u: any) => ({
            label: `${u.firstName} ${u.lastName}`,
            value: u.id,
          }));
        }
      });
    } else if (scope === 'group') {
      this.groupService.listGroupps(params).then((response: any) => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.scopeTargets = (response.data.groups || []).map((g: any) => ({
            label: g.name,
            value: g.id,
          }));
        }
      });
    }
  }

  onSubmit() {
    if (this.rlsForm.valid) {
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
