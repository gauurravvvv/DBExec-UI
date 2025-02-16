import { Component, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators, FormArray } from '@angular/forms';
import { Router } from '@angular/router';
import { CATEGORY, ENVIRONMENT } from 'src/app/constants/routes';
import { ROLES } from 'src/app/constants/user.constant';
import { GlobalService } from 'src/app/core/services/global.service';
import { EnvironmentService } from 'src/app/modules/environment/services/environment.service';
import { OrganisationService } from 'src/app/modules/organisation/services/organisation.service';
import { CategoryService } from '../../services/category.service';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
})
export class AddCategoryComponent implements OnInit {
  categoryForm!: FormGroup;
  showPassword = false;
  organisations: any[] = [];
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  environments: any[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private organisationService: OrganisationService,
    private globalService: GlobalService,
    private environmentService: EnvironmentService,
    private categoryService: CategoryService
  ) {
    this.initForm();
  }

  // Add getter for form dirty state
  get isFormDirty(): boolean {
    return this.categoryForm.dirty;
  }

  get config() {
    return this.categoryForm.get('config') as FormArray;
  }

  ngOnInit() {
    if (this.showOrganisationDropdown) {
      this.loadOrganisations();
    } else {
      // Load environments for non-super admin users
      this.loadEnvironments();
    }
  }

  initForm() {
    this.categoryForm = this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
      description: [''],
      organisation: [
        this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN
          ? ''
          : this.globalService.getTokenDetails('organisationId'),
        Validators.required,
      ],
      environments: [[], Validators.required],
      config: this.fb.array([this.createField()]), // Initialize with one field
    });

    // Subscribe to organisation changes
    this.categoryForm.get('organisation')?.valueChanges.subscribe(value => {
      if (value) {
        this.loadEnvironments();
        // Reset environments when organisation changes
        this.categoryForm.patchValue(
          { environments: [] },
          { emitEvent: false }
        );
      } else {
        this.environments = [];
      }
    });
  }

  createField(): FormGroup {
    return this.fb.group({
      name: [
        '',
        [
          Validators.required,
          Validators.minLength(4),
          Validators.maxLength(20),
          Validators.pattern('^[a-zA-Z]+([ -][a-zA-Z]+)*$'),
        ],
      ],
    });
  }

  addField() {
    this.config.push(this.createField());
  }

  removeField(index: number) {
    if (this.config.length > 1) {
      // Keep at least one field
      this.config.removeAt(index);
    }
  }

  loadOrganisations() {
    const params = {
      pageNumber: 1,
      limit: 100,
    };

    this.organisationService.listOrganisation(params).subscribe({
      next: (response: any) => {
        this.organisations = response.data.orgs;
      },
      error: error => {
        console.error('Error loading organisations:', error);
      },
    });
  }

  loadEnvironments() {
    const orgId = this.categoryForm.get('organisation')?.value;
    if (!orgId) return;

    const params = {
      orgId,
      pageNumber: 1,
      limit: 100,
    };

    this.environmentService.listEnvironments(params).subscribe({
      next: (response: any) => {
        this.environments = response.data.envs;
      },
      error: error => {
        console.error('Error loading environments:', error);
        this.environments = [];
      },
    });
  }

  togglePassword(event: Event) {
    event.preventDefault();
    this.showPassword = !this.showPassword;
  }

  onSubmit() {
    console.log(this.categoryForm.value);
    if (this.categoryForm.valid) {
      this.categoryService.addCategory(this.categoryForm).subscribe({
        next: () => {
          this.router.navigate([CATEGORY.LIST]);
        },
        error: error => {
          console.error('Error adding environment:', error);
        },
      });
    } else {
      Object.keys(this.categoryForm.controls).forEach(key => {
        const control = this.categoryForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });
    }
  }

  onCancel() {
    this.categoryForm.reset();
    // Reset specific form controls to empty strings
    Object.keys(this.categoryForm.controls).forEach(key => {
      this.categoryForm.get(key)?.setValue('');
    });
  }

  onPhoneInput(event: any) {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    input.value = value.replace(/\D/g, ''); // Remove non-digit characters
    this.categoryForm.patchValue({ mobile: input.value });
  }

  // Add a helper method to get error message
  getFieldErrorMessage(field: any): string {
    if (field.get('name')?.errors) {
      const errors = field.get('name')?.errors;

      if (errors?.['required']) {
        return 'Field name is required';
      }
      if (errors?.['minlength']) {
        return 'Field name must be at least 6 characters';
      }
      if (errors?.['maxlength']) {
        return 'Field name cannot exceed 20 characters';
      }
      if (errors?.['pattern']) {
        return 'Field name can only contain letters, spaces and hyphens';
      }
    }
    return '';
  }
}
