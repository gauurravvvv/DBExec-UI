import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { EnvironmentService } from 'src/app/modules/environment/services/environment.service';
import { CategoryService } from '../../services/category.service';
import { CATEGORY } from 'src/app/constants/routes';
import { GlobalService } from 'src/app/core/services/global.service';
import { ROLES } from 'src/app/constants/user.constant';

@Component({
  selector: 'app-edit-category',
  templateUrl: './edit-category.component.html',
  styleUrls: ['./edit-category.component.scss'],
})
export class EditCategoryComponent implements OnInit {
  categoryForm!: FormGroup;
  environments: any[] = [];
  isFormDirty = false;
  showOrganisationDropdown =
    this.globalService.getTokenDetails('role') === ROLES.SUPER_ADMIN;
  categoryId!: string;
  orgId!: string;
  selectedOrgName: string = '';
  originalFormValue: any;
  isNewlyAdded: boolean = false;
  lastAddedFieldIndex: number = -1;

  constructor(
    private fb: FormBuilder,
    private categoryService: CategoryService,
    private environmentService: EnvironmentService,
    private messageService: MessageService,
    private router: Router,
    private globalService: GlobalService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.categoryId = this.route.snapshot.params['id'];
    this.orgId = this.route.snapshot.params['orgId'];

    if (this.categoryId) {
      this.loadCategoryData();
    }
  }

  initForm(): void {
    this.categoryForm = this.fb.group({
      id: [''],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s-]+$')]],
      description: [''],
      organisation: [''],
      environments: [[], Validators.required],
      status: [1],
      config: this.fb.array([this.createField()]),
    });

    this.categoryForm.valueChanges.subscribe(() => {
      this.checkFormDirty();
    });
  }

  loadCategoryData(): void {
    this.categoryService
      .viewCategory(this.orgId, this.categoryId)
      .then(response => {
        if (this.globalService.handleSuccessService(response, false)) {
          const categoryData = response.data;

          // First patch the basic form data
          this.categoryForm.patchValue({
            id: categoryData.id,
            name: categoryData.name,
            description: categoryData.description,
            organisation: categoryData.organisationId,
            environments: categoryData.categoryMappings.map(
              (mapping: any) => mapping.environmentId
            ),
            status: categoryData.status,
          });

          this.selectedOrgName = categoryData.organisationName || '';

          // Load environments
          this.loadEnvironments({
            orgId: categoryData.organisationId,
            pageNumber: 1,
            limit: 100,
          });

          // Handle config FormArray
          const configArray = this.categoryForm.get('config') as FormArray;

          // Clear existing fields
          while (configArray.length !== 0) {
            configArray.removeAt(0);
          }

          // Add fields from configurations array
          if (
            categoryData.configurations &&
            Array.isArray(categoryData.configurations)
          ) {
            // Sort by sequence if needed
            const sortedConfigs = [...categoryData.configurations].sort(
              (a, b) => a.sequence - b.sequence
            );

            sortedConfigs.forEach((config: any) => {
              configArray.push(
                this.fb.group({
                  name: [
                    config.fieldName, // Use fieldName instead of name
                    [
                      Validators.required,
                      Validators.pattern('^[a-zA-Z][a-zA-Z0-9_]*$'),
                    ],
                  ],
                })
              );
            });
          } else {
            // Add one empty field if no configurations exist
            configArray.push(this.createField());
          }

          // Store original form value and reset dirty state
          this.originalFormValue = this.categoryForm.value;
          this.isFormDirty = false;
          this.categoryForm.markAsPristine();
        }
      });
  }

  loadEnvironments(params: any): void {
    this.environmentService.listEnvironments(params).then(response => {
      if (this.globalService.handleSuccessService(response, false)) {
        this.environments = [...response.data.envs];
      }
    });
  }

  getFieldErrorMessage(field: any): string {
    if (field.get('name')?.errors?.['required']) {
      return 'Field name is required';
    }
    if (field.get('name')?.errors?.['pattern']) {
      return 'Field name can only contain letters and spaces';
    }
    return '';
  }

  onSubmit(): void {
    if (this.categoryForm.valid) {
      const formValue = this.categoryForm.value;

      const submitData = {
        ...formValue,
      };

      this.categoryService.editCategory(submitData).then(response => {
        if (this.globalService.handleSuccessService(response)) {
          this.router.navigate([CATEGORY.LIST]);
        }
      });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      this.categoryForm.patchValue(this.originalFormValue);
      this.isFormDirty = false;
      this.categoryForm.markAsPristine();
    } else {
      this.router.navigate([CATEGORY.LIST]);
    }
  }

  checkFormDirty(): void {
    if (!this.originalFormValue) return;
    const currentValue = this.categoryForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }

  addField() {
    const field = this.fb.group({
      name: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z][a-zA-Z0-9_]*$')],
      ],
    });

    this.config.push(field);
    this.lastAddedFieldIndex = this.config.length - 1;

    this.scrollToNewField();
    setTimeout(() => {
      this.isNewlyAdded = true;
      setTimeout(() => {
        this.isNewlyAdded = false;
        this.lastAddedFieldIndex = -1;
      }, 500);
    }, 300);
  }

  scrollToNewField(): void {
    setTimeout(() => {
      const formElement = document.querySelector('.admin-form');
      const newField = document.getElementById(
        `field-${this.config.length - 1}`
      );

      if (formElement && newField) {
        const formRect = formElement.getBoundingClientRect();
        const newFieldRect = newField.getBoundingClientRect();

        formElement.scrollTo({
          top: formElement.scrollTop + (newFieldRect.top - formRect.top) - 100,
          behavior: 'smooth',
        });
      }
    }, 100);
  }

  get config(): FormArray {
    return this.categoryForm?.get('config') as FormArray;
  }

  createField(): FormGroup {
    return this.fb.group({
      name: [
        '',
        [Validators.required, Validators.pattern('^[a-zA-Z][a-zA-Z0-9_]*$')],
      ],
    });
  }

  removeField(index: number) {
    if (this.config.length > 1) {
      this.config.removeAt(index);
      this.categoryForm.markAsDirty();
    }
  }
}
