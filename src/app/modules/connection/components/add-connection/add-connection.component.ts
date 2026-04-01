import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CONNECTION } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { HasUnsavedChanges } from 'src/app/core/interfaces/has-unsaved-changes';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatasourceService } from 'src/app/modules/datasource/services/datasource.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { ConnectionService } from '../../services/connection.service';
import { REGEX } from 'src/app/constants/regex.constant';
import { DEFAULT_PAGE, MAX_LIMIT } from 'src/app/constants';

@Component({
  selector: 'app-add-connection',
  templateUrl: './add-connection.component.html',
  styleUrls: ['./add-connection.component.scss'],
})
export class AddConnectionComponent implements OnInit, HasUnsavedChanges {
  connectionForm!: FormGroup;
  organisations: any[] = [];
  showPassword = false;
  datasources: any[] = [];
  isFormDirty: boolean = false;

  hasUnsavedChanges(): boolean {
    return this.isFormDirty;
  }

  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  selectedDatasource: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private datasourceService: DatasourceService,
    private connectionService: ConnectionService,
  ) {
    this.initForm();
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

  private initForm() {
    this.connectionForm = this.fb.group({
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
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      datasource: ['', Validators.required],
      dbUsername: ['', Validators.required],
      dbPassword: ['', Validators.required],
    });

    this.connectionForm.valueChanges.subscribe(() => {
      this.updateFormDirtyState();
    });
  }

  private loadOrganisations() {
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

  private loadDatasources() {
    const orgId = this.connectionForm.get('organisation')?.value;
    if (!orgId) return;
    const params = {
      orgId: orgId,
      page: DEFAULT_PAGE,
      limit: MAX_LIMIT,
    };

    this.datasourceService.listDatasource(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.datasources = [...(response.data.datasources || [])];
      }
    });
  }

  onOrganisationChange(orgId: any) {
    this.connectionForm.get('datasource')?.reset();
    this.datasources = [];
    this.loadDatasources();
    this.updateFormDirtyState();
  }

  onSubmit() {
    if (this.connectionForm.valid) {
      this.connectionService
        .addConnection(this.connectionForm)
        .then(response => {
          if (this.globalService.handleSuccessService(response)) {
            this.isFormDirty = false;
            this.router.navigate([CONNECTION.LIST]);
          }
        });
    }
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onCancel() {
    if (this.isFormDirty) {
      this.connectionForm.reset();
      this.isFormDirty = false;
    }
  }

  private updateFormDirtyState() {
    this.isFormDirty =
      this.connectionForm.dirty ||
      this.connectionForm.get('organisation')?.value !== '' ||
      this.connectionForm.get('datasource')?.value !== '';
  }

  getNameError(): string {
    const control = this.connectionForm.get('name');
    if (control?.errors?.['required']) return 'Connection name is required';
    if (control?.errors?.['minlength'])
      return `Connection name must be at least ${control.errors['minlength'].requiredLength} characters`;
    if (control?.errors?.['maxlength'])
      return `Connection name must not exceed ${control.errors['maxlength'].requiredLength} characters`;
    if (control?.errors?.['pattern'])
      return 'Connection name must start with a letter or number and can only contain letters, numbers, spaces, dots, underscores and hyphens';
    return '';
  }
}
