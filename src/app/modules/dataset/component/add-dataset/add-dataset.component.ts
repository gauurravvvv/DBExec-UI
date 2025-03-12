import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { DatabaseService } from 'src/app/modules/database/services/database.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';

@Component({
  selector: 'app-add-dataset',
  templateUrl: './add-dataset.component.html',
  styleUrls: ['./add-dataset.component.scss'],
})
export class AddDatasetComponent implements OnInit {
  datasetForm!: FormGroup;
  organisations: any[] = [];
  schemas: any[] = [];
  tables: any[] = [];
  databases: any[] = [];
  isFormDirty: boolean = false;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;

  constructor(
    private fb: FormBuilder,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private databaseService: DatabaseService
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
      this.loadDatabases();
    }
  }

  private initForm() {
    this.datasetForm = this.fb.group({
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      database: ['', Validators.required],
      schema: ['', Validators.required],
      table: ['', Validators.required],
    });

    // Track form changes including dropdown selections
    this.datasetForm.valueChanges.subscribe(() => {
      this.updateFormDirtyState();
    });
  }

  getCredentialsFormArray(set: AbstractControl): FormArray {
    return set.get('credentials') as FormArray;
  }

  createCredentialSet(): FormGroup {
    return this.fb.group({
      credentials: this.fb.array([]),
    });
  }

  createCredentialField(fieldName: string, sequence: number): FormGroup {
    return this.fb.group({
      fieldName: [fieldName],
      value: ['', Validators.required],
      sequence: [sequence],
      showPassword: [false],
    });
  }

  togglePasswordVisibility(field: AbstractControl) {
    const showPassword = field.get('showPassword');
    if (showPassword) {
      showPassword.setValue(!showPassword.value);
    }
  }

  private loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadDatabases();
        }
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  private loadDatabases() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.databaseService.listDatabase(params).subscribe({
      next: (response: any) => {
        this.databases = response.data;
      },
      error: error => {
        this.databases = [];
        console.error('Error loading databases:', error);
      },
    });
  }

  onOrganisationChange(event: any) {
    // Reset category related data
    this.datasetForm.get('database')?.reset();
    this.datasetForm.get('schema')?.reset();

    // Update selected org and load categories
    this.selectedOrg = {
      id: event.value,
    };
    this.loadDatabases();
    this.updateFormDirtyState();
  }

  onDatabaseChange(event: any) {
    //call list schema api
    const params = {
      orgId: this.selectedOrg.id,
      databaseId: event.value,
    };
    this.databaseService.listDatabaseSchemas(params).subscribe({
      next: (response: any) => {
        this.schemas = response.data;
      },
      error: error => {
        this.schemas = [];
        console.error('Error loading schemas:', error);
      },
    });
  }

  onSchemaChange(event: any) {
    console.log('event', event);
    //call list tables api
  }

  onTableChange(event: any) {
    console.log('event', event);
  }

  onSubmit() {
    console.log('datasetForm', this.datasetForm.value);
  }

  onCancel() {
    if (this.isFormDirty) {
      this.datasetForm.reset();
      this.isFormDirty = false;
    }
  }

  // Add new method to track form state
  private updateFormDirtyState() {
    this.isFormDirty =
      this.datasetForm.dirty ||
      this.datasetForm.get('organisation')?.value !== '' ||
      this.datasetForm.get('database')?.value !== '' ||
      this.datasetForm.get('schema')?.value !== '';
  }
}
