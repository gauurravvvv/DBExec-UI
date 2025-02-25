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
      config: this.fb.array([]),
    });

    this.categoryForm.valueChanges.subscribe(() => {
      this.checkFormDirty();
    });
  }

  get config(): FormArray {
    return this.categoryForm.get('config') as FormArray;
  }

  createFieldGroup(sequence: number = this.getNextSequence()): FormGroup {
    return this.fb.group({
      id: [null],
      name: ['', [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')]],
      sequence: [sequence],
    });
  }

  getNextSequence(): number {
    return this.config.length + 1;
  }

  loadCategoryData(): void {
    this.categoryService.viewCategory(this.orgId, this.categoryId).subscribe({
      next: response => {
        const categoryData = response.data;

        this.categoryForm.patchValue({
          organisation: categoryData.organisationId,
        });
        this.selectedOrgName = categoryData.organisationName || '';

        this.loadEnvironments({
          orgId: categoryData.organisationId,
          pageNumber: 1,
          limit: 100,
        });

        while (this.config.length) {
          this.config.removeAt(0);
        }

        if (
          categoryData.configurations &&
          categoryData.configurations.length > 0
        ) {
          categoryData.configurations.forEach((config: any, index: number) => {
            this.config.push(
              this.fb.group({
                id: [config.id],
                name: [
                  config.fieldName,
                  [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')],
                ],
                sequence: [index + 1],
              })
            );
          });
        }

        const environmentIds = categoryData.categoryMappings.map(
          (mapping: any) => mapping.environmentId
        );

        this.categoryForm.patchValue({
          id: categoryData.id,
          name: categoryData.name,
          description: categoryData.description,
          environments: environmentIds,
          status: categoryData.status,
        });

        this.originalFormValue = this.categoryForm.value;
        this.isFormDirty = false;
        this.categoryForm.markAsPristine();
      },
      error: () => {
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
      error: () => {
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
    this.resequenceFields();
    this.categoryForm.markAsDirty();
  }

  removeField(index: number): void {
    if (this.config.length > 1) {
      this.config.removeAt(index);
      this.resequenceFields();
      this.categoryForm.markAsDirty();
    }
  }

  private resequenceFields() {
    this.config.controls.forEach((control, index) => {
      control.patchValue({ sequence: index + 1 }, { emitEvent: false });
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

      const configData = formValue.config.map((item: any) => ({
        id: item.id,
        fieldName: item.name,
        sequence: item.sequence,
      }));

      const submitData = {
        ...formValue,
        config: configData,
      };

      this.categoryService.editCategory(submitData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Category updated successfully',
          });
          this.router.navigate([CATEGORY.LIST]);
        },
        error: () => {
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
      while (this.config.length) {
        this.config.removeAt(0);
      }

      this.originalFormValue.config.forEach((config: any) => {
        this.config.push(
          this.fb.group({
            id: [config.id],
            name: [
              config.name,
              [Validators.required, Validators.pattern('^[a-zA-Z\\s]+$')],
            ],
            sequence: [config.sequence],
          })
        );
      });

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
}
