import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { CREDENTIAL } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { CategoryService } from 'src/app/modules/categories/services/category.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { CredentialService } from '../../services/credential.service';

@Component({
  selector: 'app-add-credentials',
  templateUrl: './add-credentials.component.html',
  styleUrls: ['./add-credentials.component.scss'],
})
export class AddCredentialsComponent implements OnInit {
  credentialForm!: FormGroup;
  organisations: any[] = [];
  categories: any[] = [];
  isFormDirty: boolean = false;
  userRole = this.globalService.getTokenDetails('role');
  showOrganisationDropdown = this.userRole === ROLES.SUPER_ADMIN;
  selectedOrg: any = null;
  categoryData: any = null;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private categoryService: CategoryService,
    private globalService: GlobalService,
    private credentialService: CredentialService
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
      this.loadCategories();
    }
  }

  private initForm() {
    this.credentialForm = this.fb.group({
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      category: ['', Validators.required],
      credentialSets: this.fb.array([]),
    });

    // Track form changes including dropdown selections
    this.credentialForm.valueChanges.subscribe(() => {
      this.updateFormDirtyState();
    });

    // Add initial credential set
    this.addCredentialSet();
  }

  get credentialSets(): FormArray {
    return this.credentialForm.get('credentialSets') as FormArray;
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

    this.organisationService.listOrganisation(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.organisations = response.data.orgs;
        if (this.organisations.length > 0) {
          this.selectedOrg = this.organisations[0];
          this.loadCategories();
        }
      }
    });
  }

  private loadCategories() {
    if (!this.selectedOrg) return;
    const params = {
      orgId: this.selectedOrg.id,
      pageNumber: 1,
      limit: 100,
    };

    this.categoryService.listCategories(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.categories = response.data.categories;
      }
    });
  }

  onOrganisationChange(event: any) {
    // Reset category related data
    this.categories = [];
    this.categoryData = null;
    this.credentialForm.get('category')?.reset();
    this.credentialSets.clear();

    // Update selected org and load categories
    this.selectedOrg = {
      id: event.value,
    };
    this.loadCategories();
    this.updateFormDirtyState();
  }

  onCategoryChange(event: any) {
    // Reset previous category data
    this.categoryData = null;
    this.credentialSets.clear();

    if (event.value) {
      this.loadCategoryDetails(event.value);
    }
    this.updateFormDirtyState();
  }

  loadCategoryDetails(categoryId: any) {
    this.categoryService
      .viewCategory(this.selectedOrg.id, categoryId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          this.categoryData = response.data;
          this.initializeCredentialFields();
        }
      });
  }

  private initializeCredentialFields() {
    // Clear existing sets
    while (this.credentialSets.length) {
      this.credentialSets.removeAt(0);
    }

    // Add initial set of fields
    if (this.categoryData?.configurations?.length) {
      this.addCredentialSet();
      this.updateFormDirtyState();
    }
  }

  addCredentialSet() {
    if (this.categoryData?.configurations?.length) {
      const newSet = this.createCredentialSet();
      const credentialsArray = newSet.get('credentials') as FormArray;

      this.categoryData.configurations
        .sort((a: any, b: any) => a.sequence - b.sequence)
        .forEach((config: any) => {
          credentialsArray.push(
            this.fb.group({
              fieldName: [config.fieldName],
              configId: [config.id],
              value: ['', Validators.required],
              sequence: [config.sequence],
              showPassword: [false],
            })
          );
        });

      this.credentialSets.push(newSet);
      this.credentialForm.markAsDirty();
      this.isFormDirty = true;
    }
  }

  removeCredentialSet(index: number) {
    if (this.credentialSets.length > 1) {
      this.credentialSets.removeAt(index);
      this.credentialForm.markAsDirty();
      this.isFormDirty = true;
    }
  }

  getFieldErrorMessage(field: any): string {
    if (field.get('value')?.errors) {
      if (field.get('value')?.errors?.['required']) {
        return `${field.get('fieldName')?.value} is required`;
      }
    }
    return '';
  }

  onSubmit() {
    if (this.credentialForm.valid && this.validateAllSets()) {
      const formData = this.credentialForm.value;
      const transformedData = {
        organisation: formData.organisation,
        categoryId: formData.category,
        credentials: formData.credentialSets.map((set: any) => ({
          values: set.credentials.map((cred: any) => ({
            configId: this.categoryData.configurations.find(
              (config: any) => config.fieldName === cred.fieldName
            )?.id,
            value: cred.value,
          })),
        })),
      };

      this.credentialService.addCredential(transformedData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([CREDENTIAL.LIST]);
        }
      });
    } else {
      this.markAllFieldsAsTouched();
    }
  }

  private validateAllSets(): boolean {
    return this.credentialSets.controls.every(set => {
      const credentials = this.getCredentialsFormArray(set);
      return credentials.controls.every(
        control =>
          control.get('value')?.valid && control.get('value')?.value !== ''
      );
    });
  }

  private markAllFieldsAsTouched() {
    this.credentialForm.markAllAsTouched();
    this.credentialSets.controls.forEach(set => {
      const credentials = this.getCredentialsFormArray(set);
      credentials.controls.forEach(control => {
        control.get('value')?.markAsTouched();
      });
    });
  }

  onCancel() {
    if (this.isFormDirty) {
      this.credentialForm.reset();
      this.credentialSets.clear();
      this.categoryData = null;
      this.isFormDirty = false;
    }
  }

  // Add new method to track form state
  private updateFormDirtyState() {
    this.isFormDirty =
      this.credentialForm.dirty ||
      this.credentialForm.get('organisation')?.value !== '' ||
      this.credentialForm.get('category')?.value !== '' ||
      this.credentialSets.length > 0;
  }
}
