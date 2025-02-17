import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { EnvironmentService } from 'src/app/modules/environment/services/environment.service';
import { CategoryService } from '../../services/category.service';
import { CATEGORY } from 'src/app/constants/routes';

@Component({
  selector: 'app-edit-category',
  templateUrl: './edit-category.component.html',
  styleUrls: ['./edit-category.component.scss'],
})
export class EditCategoryComponent implements OnInit {
  categoryForm!: FormGroup;
  environments: any[] = [];
  isFormDirty = false;
  showOrganisationDropdown = true;
  categoryId!: string;
  selectedOrgName: string = '';
  originalFormValue: any;

  constructor(
    private fb: FormBuilder,
    private categoryService: CategoryService,
    private environmentService: EnvironmentService,
    private messageService: MessageService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.initForm();

    this.categoryId = this.route.snapshot.params['id'];
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
      config: this.fb.array([]),
    });
  }

  get config(): FormArray {
    return this.categoryForm.get('config') as FormArray;
  }

  createFieldGroup(): FormGroup {
    return this.fb.group({
      id: [null],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      categoryId: [null],
    });
  }

  loadCategoryData(): void {
    this.categoryService
      .viewCategory(this.categoryId)
      .pipe()
      .subscribe({
        next: response => {
          const categoryData = response.data;

          // First patch the organisation ID and set name
          this.categoryForm.patchValue({
            organisation: categoryData.organisationId,
          });
          this.selectedOrgName = categoryData.organisation?.name || '';

          // Load environments with orgId from response
          const params = {
            orgId: categoryData.organisationId,
            pageNumber: 1,
            limit: 100,
          };
          this.loadEnvironments(params);

          // Clear existing config fields
          while (this.config.length) {
            this.config.removeAt(0);
          }

          // Add configuration fields
          if (
            categoryData.configurations &&
            categoryData.configurations.length > 0
          ) {
            categoryData.configurations.forEach((config: any) => {
              this.config.push(
                this.fb.group({
                  id: [config.id],
                  name: [
                    config.fieldName,
                    [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')],
                  ],
                  categoryId: [config.categoryId],
                })
              );
            });
          }

          // Get environment IDs from mappings
          const environmentIds = categoryData.categoryMappings.map(
            (mapping: any) => mapping.environmentId
          );

          // Finally patch all remaining form values
          this.categoryForm.patchValue({
            id: categoryData.id,
            name: categoryData.name,
            description: categoryData.description,
            environments: environmentIds,
            status: categoryData.status,
          });

          // Store original form value after all patches
          this.originalFormValue = this.categoryForm.value;

          // Reset form dirty state
          this.isFormDirty = false;
          this.categoryForm.markAsPristine();

          // Watch for form changes
          this.categoryForm.valueChanges.subscribe(() => {
            this.checkFormDirty();
          });
        },
        error: error => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load category data',
          });
        },
      });
  }

  loadEnvironments(params: any): void {
    this.environmentService.listEnvironments(params).subscribe({
      next: response => {
        this.environments = response.data.envs;
      },
      error: error => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load environments',
        });
      },
    });
  }

  addField(): void {
    this.config.push(this.createFieldGroup());
  }

  removeField(index: number): void {
    this.config.removeAt(index);
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

      // Transform config array to match API expectations
      const configData = formValue.config.map((item: any) => ({
        id: item.id,
        fieldName: item.name,
        categoryId: item.categoryId,
      }));

      const submitData = {
        ...formValue,
        config: configData,
      };

      this.categoryService
        .editCategory(submitData)
        .pipe()
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Category updated successfully',
            });
            this.router.navigate([CATEGORY.LIST]);
          },
          error: error => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Failed to update category',
            });
          },
        });
    }
  }

  onCancel(): void {
    if (this.isFormDirty) {
      // Clear existing config fields
      while (this.config.length) {
        this.config.removeAt(0);
      }

      // Recreate config form groups
      this.originalFormValue.config.forEach((config: any) => {
        this.config.push(
          this.fb.group({
            id: [config.id],
            name: [
              config.name,
              [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')],
            ],
            categoryId: [config.categoryId],
          })
        );
      });

      // Restore all form values
      this.categoryForm.patchValue(this.originalFormValue);

      // Reset form state
      this.isFormDirty = false;
      this.categoryForm.markAsPristine();
    } else {
      this.router.navigate([CATEGORY.LIST]);
    }
  }

  // Add new method to check if form is dirty
  checkFormDirty(): void {
    if (!this.originalFormValue) return;

    const currentValue = this.categoryForm.value;
    this.isFormDirty =
      JSON.stringify(this.originalFormValue) !== JSON.stringify(currentValue);
  }
}
