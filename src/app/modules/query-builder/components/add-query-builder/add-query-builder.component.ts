import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { REGEX } from 'src/app/constants/regex.constant';
import { QUERY_BUILDER } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { QueryBuilderService } from '../../services/query-builder.service';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-query-builder',
  templateUrl: './add-query-builder.component.html',
  styleUrls: ['./add-query-builder.component.scss'],
})
export class AddQueryBuilderComponent implements OnInit, HasUnsavedChanges {
  queryBuilderForm!: FormGroup;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatasource: any = null;
  datasources: any[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private queryBuilderService: QueryBuilderService,
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
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      this.selectedOrg = {
        id: this.globalService.getTokenDetails('organisationId'),
      };
      this.loadDatasources();
    }
  }

  initForm() {
    this.queryBuilderForm = this.fb.group({
      organisation: [
        {
          value:
            this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
              ? ''
              : this.globalService.getTokenDetails('organisationId'),
          disabled: false,
        },
        Validators.required,
      ],
      datasource: [{ value: '', disabled: true }, Validators.required],
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

    if (!this.showOrganisationDropdown) {
      this.queryBuilderForm.get('datasource')?.enable();
    }
  }

  loadOrganisations() {
    const params = {
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = [...response.data.orgs];
      }
    });
  }

  getNameError(): string {
    const control = this.queryBuilderForm.get('name');
    if (control?.errors?.['required']) return 'Query builder name is required';
    if (control?.errors?.['minlength'])
      return `Query builder name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Query builder name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Query builder name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
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
        });
    }
  }

  onCancel() {
    this.queryBuilderForm.reset();
    Object.keys(this.queryBuilderForm.controls).forEach(key => {
      this.queryBuilderForm.get(key)?.setValue('');
    });
  }

  onOrganisationChange(event: any) {
    this.selectedOrg = {
      id: event.value,
    };
    this.selectedDatasource = null;

    const datasourceControl = this.queryBuilderForm.get('datasource');
    datasourceControl?.enable();
    datasourceControl?.setValue('');

    this.loadDatasources();
  }

  private loadDatasources() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasources = [...(response.data.databases || [])];
      }
    });
  }
}
